"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  validateProbability,
  getDescriptorPredictionFromClassification,
  buildHybridEvaluationRows,
  evaluateHybridRows,
  summarizeHybridChanges,
  validateHybridEvaluation,
} = require("../../scripts/reference_candidate_hybrid_evaluation");

function createDatasetEntry({
  recognitionId,
  label,
  classification,
  targetKanji = "木",
}) {
  return {
    lineNumber: 1,
    row: {
      recognitionId,
      targetKanji,
      expectedKanji: targetKanji,
      sampleIsCorrect: label === 1,
      classification,
      label,
      features: {
        "referenceComparison.comparisonCost": 0.1,
      },
    },
  };
}

function createHybridRows() {
  return [
    {
      recognitionId: "tp-kept",
      targetKanji: "木",
      label: 1,
      classification: "truePositive",
      descriptorPrediction: 1,
      mlProbability: 0.8,
    },
    {
      recognitionId: "fp-rejected",
      targetKanji: "木",
      label: 0,
      classification: "falsePositive",
      descriptorPrediction: 1,
      mlProbability: 0.2,
    },
    {
      recognitionId: "fp-kept",
      targetKanji: "木",
      label: 0,
      classification: "falsePositive",
      descriptorPrediction: 1,
      mlProbability: 0.7,
    },
    {
      recognitionId: "tn-kept",
      targetKanji: "木",
      label: 0,
      classification: "trueNegative",
      descriptorPrediction: 0,
      mlProbability: 0.9,
    },
  ];
}

test("validateProbability accepts boundaries", () => {
  assert.doesNotThrow(() => validateProbability(0));

  assert.doesNotThrow(() => validateProbability(1));

  assert.throws(() => validateProbability(-0.1), /must be between 0 and 1/);

  assert.throws(() => validateProbability(1.1), /must be between 0 and 1/);

  assert.throws(
    () => validateProbability(Number.NaN),
    /must be between 0 and 1/,
  );
});

test("descriptor classifications map to binary predictions", () => {
  assert.equal(getDescriptorPredictionFromClassification("truePositive"), 1);

  assert.equal(getDescriptorPredictionFromClassification("falsePositive"), 1);

  assert.equal(getDescriptorPredictionFromClassification("trueNegative"), 0);

  assert.equal(getDescriptorPredictionFromClassification("falseNegative"), 0);

  assert.throws(
    () => getDescriptorPredictionFromClassification("unsupported"),
    /Unsupported descriptor classification/,
  );
});

test("buildHybridEvaluationRows joins by recognitionId", () => {
  const datasetEntries = [
    createDatasetEntry({
      recognitionId: "positive",
      label: 1,
      classification: "truePositive",
    }),
    createDatasetEntry({
      recognitionId: "negative",
      label: 0,
      classification: "falsePositive",
    }),
  ];

  const result = buildHybridEvaluationRows({
    datasetEntries,
    probabilityRows: [
      {
        recognitionId: "negative",
        label: 0,
        probability: 0.2,
      },
      {
        recognitionId: "positive",
        label: 1,
        probability: 0.8,
      },
    ],
  });

  assert.equal(result.length, 2);

  assert.deepEqual(
    result.map((row) => row.recognitionId),
    ["negative", "positive"],
  );

  assert.equal(result[0].descriptorPrediction, 1);

  assert.equal(result[1].descriptorPrediction, 1);
});

test("buildHybridEvaluationRows rejects label mismatches", () => {
  assert.throws(
    () =>
      buildHybridEvaluationRows({
        datasetEntries: [
          createDatasetEntry({
            recognitionId: "positive",
            label: 1,
            classification: "truePositive",
          }),
        ],
        probabilityRows: [
          {
            recognitionId: "positive",
            label: 0,
            probability: 0.8,
          },
        ],
      }),
    /Label mismatch/,
  );
});

test("buildHybridEvaluationRows rejects unknown IDs", () => {
  assert.throws(
    () =>
      buildHybridEvaluationRows({
        datasetEntries: [
          createDatasetEntry({
            recognitionId: "known",
            label: 1,
            classification: "truePositive",
          }),
        ],
        probabilityRows: [
          {
            recognitionId: "unknown",
            label: 1,
            probability: 0.8,
          },
        ],
      }),
    /not found in dataset/,
  );
});

test("evaluateHybridRows applies descriptor AND ML", () => {
  const evaluation = evaluateHybridRows({
    hybridRows: createHybridRows(),
    threshold: 0.5,
  });

  assert.equal(evaluation.metrics.truePositive, 1);

  assert.equal(evaluation.metrics.trueNegative, 2);

  assert.equal(evaluation.metrics.falsePositive, 1);

  assert.equal(evaluation.metrics.falseNegative, 0);

  const descriptorNegative = evaluation.predictions.find(
    (prediction) => prediction.recognitionId === "tn-kept",
  );

  assert.equal(descriptorNegative.mlPrediction, 1);

  assert.equal(descriptorNegative.hybridPrediction, 0);
});

test("hybrid cannot introduce an FP from a descriptor TN", () => {
  const evaluation = evaluateHybridRows({
    hybridRows: [
      {
        recognitionId: "descriptor-negative",
        targetKanji: "木",
        label: 0,
        classification: "trueNegative",
        descriptorPrediction: 0,
        mlProbability: 1,
      },
    ],
    threshold: 0,
  });

  assert.equal(evaluation.metrics.trueNegative, 1);

  assert.equal(evaluation.metrics.falsePositive, 0);
});

test("summarizeHybridChanges identifies rejected descriptor FP", () => {
  const evaluation = evaluateHybridRows({
    hybridRows: createHybridRows(),
    threshold: 0.5,
  });

  const summary = summarizeHybridChanges({
    hybridEvaluation: evaluation,
  });

  assert.equal(summary.descriptorFalsePositiveRejectedCount, 1);

  assert.equal(summary.descriptorTruePositiveRejectedCount, 0);

  assert.equal(summary.remainingDescriptorFalsePositiveCount, 1);

  assert.equal(
    summary.descriptorFalsePositivesRejected[0].recognitionId,
    "fp-rejected",
  );
});

test("summarizeHybridChanges identifies rejected positives", () => {
  const evaluation = evaluateHybridRows({
    hybridRows: [
      {
        recognitionId: "positive-rejected",
        targetKanji: "木",
        label: 1,
        classification: "truePositive",
        descriptorPrediction: 1,
        mlProbability: 0.1,
      },
    ],
    threshold: 0.5,
  });

  const summary = summarizeHybridChanges({
    hybridEvaluation: evaluation,
  });

  assert.equal(summary.descriptorTruePositiveRejectedCount, 1);
});

test("validateHybridEvaluation accepts an FN-safe FP reduction", () => {
  const result = validateHybridEvaluation({
    hybridEvaluation: {
      metrics: {
        rowCount: 10,
        truePositive: 6,
        trueNegative: 3,
        falsePositive: 1,
        falseNegative: 0,
      },
    },
    descriptorMetrics: {
      truePositive: 6,
      trueNegative: 2,
      falsePositive: 2,
      falseNegative: 0,
    },
    expectedRowCount: 10,
    requireFalseNegativeSafe: true,
  });

  assert.equal(result.passed, true);

  assert.deepEqual(result.errors, []);
});

test("validateHybridEvaluation rejects false negatives", () => {
  const result = validateHybridEvaluation({
    hybridEvaluation: {
      metrics: {
        rowCount: 10,
        truePositive: 5,
        trueNegative: 3,
        falsePositive: 1,
        falseNegative: 1,
      },
    },
    descriptorMetrics: {
      truePositive: 6,
      trueNegative: 2,
      falsePositive: 2,
      falseNegative: 0,
    },
    expectedRowCount: 10,
    requireFalseNegativeSafe: true,
  });

  assert.equal(result.passed, false);

  assert.ok(result.errors.some((error) => error.includes("not FN-safe")));
});

test("validateHybridEvaluation rejects FP regression", () => {
  const result = validateHybridEvaluation({
    hybridEvaluation: {
      metrics: {
        rowCount: 10,
        truePositive: 6,
        trueNegative: 1,
        falsePositive: 3,
        falseNegative: 0,
      },
    },
    descriptorMetrics: {
      truePositive: 6,
      trueNegative: 2,
      falsePositive: 2,
      falseNegative: 0,
    },
    expectedRowCount: 10,
    requireFalseNegativeSafe: true,
  });

  assert.equal(result.passed, false);

  assert.ok(
    result.errors.some((error) =>
      error.includes("exceed descriptor false positives"),
    ),
  );
});
