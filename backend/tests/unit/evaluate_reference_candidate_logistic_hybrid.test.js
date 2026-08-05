"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
  parseArguments,
  getModelPayload,
  compareOrderedArrays,
  validateReconstructedProbabilities,
  buildPartitionHybridResult,
  buildComparisonSummary,
  formatDecimal,
} = require("../../scripts/evaluate_reference_candidate_logistic_hybrid");

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

function createMetrics({
  truePositive,
  trueNegative,
  falsePositive,
  falseNegative,
}) {
  const positiveCount = truePositive + falseNegative;

  const negativeCount = trueNegative + falsePositive;

  const rowCount = positiveCount + negativeCount;

  const predictedPositiveCount = truePositive + falsePositive;

  return {
    truePositive,
    trueNegative,
    falsePositive,
    falseNegative,
    rowCount,
    positiveCount,
    negativeCount,
    predictedPositiveCount,
    predictedNegativeCount: trueNegative + falseNegative,
    accuracy: rowCount === 0 ? null : (truePositive + trueNegative) / rowCount,
    recall: positiveCount === 0 ? null : truePositive / positiveCount,
    specificity: negativeCount === 0 ? null : trueNegative / negativeCount,
    precision:
      predictedPositiveCount === 0
        ? null
        : truePositive / predictedPositiveCount,
    falseNegativeRate:
      positiveCount === 0 ? null : falseNegative / positiveCount,
    falsePositiveRate:
      negativeCount === 0 ? null : falsePositive / negativeCount,
  };
}

test("parseArguments reads hybrid paths", () => {
  const options = parseArguments([
    "--dataset",
    "./custom/dataset.jsonl",
    "--split",
    "./custom/split.json",
    "--model",
    "./custom/model.json",
    "--threshold-report",
    "./custom/threshold.json",
    "--out",
    "./custom/hybrid.json",
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
    options.thresholdReportPath,
    path.resolve(process.cwd(), "custom", "threshold.json"),
  );

  assert.equal(
    options.outputPath,
    path.resolve(process.cwd(), "custom", "hybrid.json"),
  );
});

test("getModelPayload returns the executable model", () => {
  assert.deepEqual(
    getModelPayload({
      model: {
        bias: 0.2,
        weights: [0.1, -0.4],
        modelPayloadSha256: "ignored",
      },
    }),
    {
      bias: 0.2,
      weights: [0.1, -0.4],
    },
  );
});

test("compareOrderedArrays requires the same order", () => {
  assert.equal(compareOrderedArrays(["a", "b"], ["a", "b"]), true);

  assert.equal(compareOrderedArrays(["a", "b"], ["b", "a"]), false);

  assert.equal(compareOrderedArrays(["a"], ["a", "b"]), false);
});

test("validateReconstructedProbabilities accepts matching metrics", () => {
  const trainingMetrics = createMetrics({
    truePositive: 2,
    trueNegative: 2,
    falsePositive: 0,
    falseNegative: 0,
  });

  const validationMetrics = createMetrics({
    truePositive: 1,
    trueNegative: 1,
    falsePositive: 0,
    falseNegative: 0,
  });

  const result = validateReconstructedProbabilities({
    modelArtifact: {
      evaluationAtInitialThreshold: {
        training: {
          metrics: trainingMetrics,
        },
        validation: {
          metrics: validationMetrics,
        },
      },
    },
    trainingEvaluation: {
      metrics: trainingMetrics,
    },
    validationEvaluation: {
      metrics: validationMetrics,
    },
  });

  assert.equal(result.passed, true);

  assert.deepEqual(result.errors, []);
});

test("validateReconstructedProbabilities detects mismatches", () => {
  const result = validateReconstructedProbabilities({
    modelArtifact: {
      evaluationAtInitialThreshold: {
        training: {
          metrics: createMetrics({
            truePositive: 2,
            trueNegative: 2,
            falsePositive: 0,
            falseNegative: 0,
          }),
        },
        validation: {
          metrics: createMetrics({
            truePositive: 1,
            trueNegative: 1,
            falsePositive: 0,
            falseNegative: 0,
          }),
        },
      },
    },
    trainingEvaluation: {
      metrics: createMetrics({
        truePositive: 1,
        trueNegative: 2,
        falsePositive: 0,
        falseNegative: 1,
      }),
    },
    validationEvaluation: {
      metrics: createMetrics({
        truePositive: 1,
        trueNegative: 1,
        falsePositive: 0,
        falseNegative: 0,
      }),
    },
  });

  assert.equal(result.passed, false);

  assert.ok(
    result.errors.some((error) =>
      error.includes("Reconstructed training metric mismatch"),
    ),
  );
});

test("buildPartitionHybridResult evaluates a safe FP reduction", () => {
  const datasetEntries = [
    createDatasetEntry({
      recognitionId: "tp",
      label: 1,
      classification: "truePositive",
    }),
    createDatasetEntry({
      recognitionId: "fp-rejected",
      label: 0,
      classification: "falsePositive",
    }),
    createDatasetEntry({
      recognitionId: "tn",
      label: 0,
      classification: "trueNegative",
    }),
  ];

  const result = buildPartitionHybridResult({
    datasetEntries,
    probabilityRows: [
      {
        recognitionId: "tp",
        targetKanji: "木",
        label: 1,
        probability: 0.8,
      },
      {
        recognitionId: "fp-rejected",
        targetKanji: "木",
        label: 0,
        probability: 0.2,
      },
      {
        recognitionId: "tn",
        targetKanji: "木",
        label: 0,
        probability: 0.9,
      },
    ],
    threshold: 0.5,
    requireFalseNegativeSafe: true,
  });

  assert.equal(result.descriptorMetrics.falsePositive, 1);

  assert.equal(result.hybridEvaluation.metrics.falsePositive, 0);

  assert.equal(result.hybridEvaluation.metrics.falseNegative, 0);

  assert.equal(result.changeSummary.descriptorFalsePositiveRejectedCount, 1);

  assert.equal(result.validation.passed, true);
});

test("buildPartitionHybridResult reports an unsafe rejected positive", () => {
  const result = buildPartitionHybridResult({
    datasetEntries: [
      createDatasetEntry({
        recognitionId: "tp",
        label: 1,
        classification: "truePositive",
      }),
      createDatasetEntry({
        recognitionId: "tn",
        label: 0,
        classification: "trueNegative",
      }),
    ],
    probabilityRows: [
      {
        recognitionId: "tp",
        targetKanji: "木",
        label: 1,
        probability: 0.1,
      },
      {
        recognitionId: "tn",
        targetKanji: "木",
        label: 0,
        probability: 0.9,
      },
    ],
    threshold: 0.5,
    requireFalseNegativeSafe: true,
  });

  assert.equal(result.hybridEvaluation.metrics.falseNegative, 1);

  assert.equal(result.validation.passed, false);
});

test("buildComparisonSummary compares hybrid to both baselines", () => {
  const result = buildComparisonSummary({
    descriptorMetrics: createMetrics({
      truePositive: 10,
      trueNegative: 6,
      falsePositive: 4,
      falseNegative: 0,
    }),
    pureMlMetrics: createMetrics({
      truePositive: 10,
      trueNegative: 5,
      falsePositive: 5,
      falseNegative: 0,
    }),
    hybridMetrics: createMetrics({
      truePositive: 10,
      trueNegative: 8,
      falsePositive: 2,
      falseNegative: 0,
    }),
  });

  assert.equal(result.hybridVsDescriptor.trueNegative, 2);

  assert.equal(result.hybridVsDescriptor.falsePositive, -2);

  assert.equal(result.hybridVsPureMl.trueNegative, 3);

  assert.equal(result.hybridVsPureMl.falsePositive, -3);
});

test("formatDecimal keeps threshold precision", () => {
  assert.equal(formatDecimal(0.029109293774331055), "0.029109294");

  assert.equal(formatDecimal(null), "n/a");
});
