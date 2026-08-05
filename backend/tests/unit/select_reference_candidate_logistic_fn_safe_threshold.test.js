"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
  parseArguments,
  validateThreshold,
  validateOptions,
  getModelPayload,
  buildProbabilityRows,
  buildCandidateThresholds,
  evaluateProbabilityRows,
  compareSafeThresholdCandidates,
  selectFnSafeThreshold,
  summarizeChangedPredictions,
  calculateMetricDifference,
  validateThresholdSelection,
  formatDecimal,
} = require("../../scripts/select_reference_candidate_logistic_fn_safe_threshold");

function createProbabilityRows() {
  return [
    {
      recognitionId: "positive-high",
      targetKanji: "木",
      label: 1,
      probability: 0.9,
    },
    {
      recognitionId: "positive-low",
      targetKanji: "木",
      label: 1,
      probability: 0.4,
    },
    {
      recognitionId: "negative-high",
      targetKanji: "木",
      label: 0,
      probability: 0.7,
    },
    {
      recognitionId: "negative-low",
      targetKanji: "木",
      label: 0,
      probability: 0.2,
    },
  ];
}

test("parseArguments reads threshold configuration", () => {
  const options = parseArguments([
    "--dataset",
    "./custom/dataset.jsonl",
    "--split",
    "./custom/split.json",
    "--model",
    "./custom/model.json",
    "--out",
    "./custom/report.json",
    "--reference-threshold",
    "0.45",
  ]);

  assert.equal(
    options.datasetPath,
    path.resolve(process.cwd(), "custom", "dataset.jsonl"),
  );

  assert.equal(
    options.splitPath,
    path.resolve(process.cwd(), "custom", "split.json"),
  );

  assert.equal(
    options.modelPath,
    path.resolve(process.cwd(), "custom", "model.json"),
  );

  assert.equal(
    options.outputPath,
    path.resolve(process.cwd(), "custom", "report.json"),
  );

  assert.equal(options.referenceThreshold, 0.45);
});

test("validateThreshold accepts valid boundaries", () => {
  assert.doesNotThrow(() => validateThreshold(0, "threshold"));

  assert.doesNotThrow(() => validateThreshold(1, "threshold"));

  assert.throws(
    () => validateThreshold(-0.1, "threshold"),
    /must be between 0 and 1/,
  );

  assert.throws(
    () => validateThreshold(1.1, "threshold"),
    /must be between 0 and 1/,
  );
});

test("validateOptions validates the reference threshold", () => {
  assert.doesNotThrow(() =>
    validateOptions({
      referenceThreshold: 0.5,
    }),
  );

  assert.throws(
    () =>
      validateOptions({
        referenceThreshold: Number.NaN,
      }),
    /referenceThreshold must be between 0 and 1/,
  );
});

test("getModelPayload returns only bias and weights", () => {
  const payload = getModelPayload({
    model: {
      bias: 0.1,
      weights: [0.2, -0.3],
      modelPayloadSha256: "stored-hash",
      weightCount: 2,
    },
  });

  assert.deepEqual(payload, {
    bias: 0.1,
    weights: [0.2, -0.3],
  });
});

test("buildProbabilityRows preserves example metadata", () => {
  const rows = buildProbabilityRows({
    model: {
      bias: 0,
      weights: [1],
    },
    examples: [
      {
        recognitionId: "recognition-1",
        targetKanji: "木",
        label: 1,
        vector: [1],
      },
    ],
  });

  assert.equal(rows.length, 1);

  assert.equal(rows[0].recognitionId, "recognition-1");

  assert.equal(rows[0].targetKanji, "木");

  assert.equal(rows[0].label, 1);
  assert.ok(rows[0].probability > 0.5);
});

test("buildCandidateThresholds returns unique descending thresholds", () => {
  const thresholds = buildCandidateThresholds([
    {
      probability: 0.4,
    },
    {
      probability: 0.9,
    },
    {
      probability: 0.4,
    },
  ]);

  assert.deepEqual(thresholds, [1, 0.9, 0.4, 0]);
});

test("evaluateProbabilityRows builds the confusion matrix", () => {
  const evaluation = evaluateProbabilityRows({
    probabilityRows: createProbabilityRows(),
    threshold: 0.5,
  });

  assert.equal(evaluation.metrics.truePositive, 1);

  assert.equal(evaluation.metrics.trueNegative, 1);

  assert.equal(evaluation.metrics.falsePositive, 1);

  assert.equal(evaluation.metrics.falseNegative, 1);

  assert.equal(evaluation.metrics.accuracy, 0.5);
});

test("selectFnSafeThreshold selects the minimum positive probability", () => {
  const selection = selectFnSafeThreshold(createProbabilityRows());

  assert.equal(selection.selectedThreshold, 0.4);

  assert.equal(selection.selectedEvaluation.metrics.falseNegative, 0);

  assert.equal(selection.selectedEvaluation.metrics.falsePositive, 1);

  assert.equal(selection.probabilityBoundaries.minimumPositiveProbability, 0.4);

  assert.equal(selection.probabilityBoundaries.maximumNegativeProbability, 0.7);

  assert.ok(selection.probabilityBoundaries.positiveNegativeMargin < 0);
});

test("selectFnSafeThreshold rejects datasets without positives", () => {
  assert.throws(
    () =>
      selectFnSafeThreshold([
        {
          recognitionId: "negative",
          targetKanji: "木",
          label: 0,
          probability: 0.2,
        },
      ]),
    /without positive rows/,
  );
});

test("selectFnSafeThreshold rejects datasets without negatives", () => {
  assert.throws(
    () =>
      selectFnSafeThreshold([
        {
          recognitionId: "positive",
          targetKanji: "木",
          label: 1,
          probability: 0.8,
        },
      ]),
    /without negative rows/,
  );
});

test("compareSafeThresholdCandidates minimizes FP before maximizing threshold", () => {
  const fewerFalsePositives = {
    threshold: 0.3,
    metrics: {
      falsePositive: 1,
    },
  };

  const moreFalsePositives = {
    threshold: 0.6,
    metrics: {
      falsePositive: 2,
    },
  };

  assert.ok(
    compareSafeThresholdCandidates(fewerFalsePositives, moreFalsePositives) < 0,
  );

  const lowerThreshold = {
    threshold: 0.3,
    metrics: {
      falsePositive: 1,
    },
  };

  const higherThreshold = {
    threshold: 0.4,
    metrics: {
      falsePositive: 1,
    },
  };

  assert.ok(
    compareSafeThresholdCandidates(higherThreshold, lowerThreshold) < 0,
  );
});

test("summarizeChangedPredictions reports recovered positives and accepted negatives", () => {
  const referenceEvaluation = {
    predictions: [
      {
        recognitionId: "positive",
        targetKanji: "木",
        label: 1,
        probability: 0.4,
        predictedLabel: 0,
      },
      {
        recognitionId: "negative",
        targetKanji: "木",
        label: 0,
        probability: 0.45,
        predictedLabel: 0,
      },
    ],
  };

  const selectedEvaluation = {
    predictions: [
      {
        recognitionId: "positive",
        targetKanji: "木",
        label: 1,
        probability: 0.4,
        predictedLabel: 1,
      },
      {
        recognitionId: "negative",
        targetKanji: "木",
        label: 0,
        probability: 0.45,
        predictedLabel: 1,
      },
    ],
  };

  const summary = summarizeChangedPredictions({
    referenceEvaluation,
    selectedEvaluation,
  });

  assert.equal(summary.changedPredictionCount, 2);

  assert.equal(summary.recoveredPositiveCount, 1);

  assert.equal(summary.newlyAcceptedNegativeCount, 1);
});

test("calculateMetricDifference compares confusion matrices", () => {
  const difference = calculateMetricDifference({
    candidateMetrics: {
      truePositive: 10,
      trueNegative: 8,
      falsePositive: 2,
      falseNegative: 0,
      accuracy: 0.9,
      recall: 1,
      specificity: 0.8,
      precision: 0.8333333333333334,
    },
    baselineMetrics: {
      truePositive: 10,
      trueNegative: 6,
      falsePositive: 4,
      falseNegative: 0,
      accuracy: 0.8,
      recall: 1,
      specificity: 0.6,
      precision: 0.7142857142857143,
    },
  });

  assert.equal(difference.truePositive, 0);

  assert.equal(difference.trueNegative, 2);

  assert.equal(difference.falsePositive, -2);

  assert.equal(difference.falseNegative, 0);

  assert.ok(Math.abs(difference.specificity - 0.2) < 1e-12);
});

test("validateThresholdSelection accepts an FN-safe result", () => {
  const result = validateThresholdSelection({
    selection: {
      selectedThreshold: 0.4,
      selectedEvaluation: {
        metrics: {
          rowCount: 4,
          falseNegative: 0,
        },
      },
      probabilityBoundaries: {
        minimumPositiveProbability: 0.4,
      },
    },
    validationRowCount: 4,
    descriptorMetrics: {
      falseNegative: 0,
    },
  });

  assert.equal(result.passed, true);
  assert.deepEqual(result.errors, []);
});

test("validateThresholdSelection rejects a non-safe threshold", () => {
  const result = validateThresholdSelection({
    selection: {
      selectedThreshold: 0.5,
      selectedEvaluation: {
        metrics: {
          rowCount: 4,
          falseNegative: 1,
        },
      },
      probabilityBoundaries: {
        minimumPositiveProbability: 0.4,
      },
    },
    validationRowCount: 4,
    descriptorMetrics: {
      falseNegative: 0,
    },
  });

  assert.equal(result.passed, false);

  assert.ok(result.errors.some((error) => error.includes("not FN-safe")));
});

test("formatDecimal uses sufficient threshold precision", () => {
  assert.equal(formatDecimal(0.1234567894), "0.123456789");

  assert.equal(formatDecimal(null), "n/a");
});
