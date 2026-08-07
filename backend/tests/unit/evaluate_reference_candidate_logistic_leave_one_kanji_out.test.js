"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
  parseArguments,
  validateOptions,
  findUnseenEvaluationFeatures,
  sumMetrics,
  summarizeFoldOutcomes,
  calculateConfusionMatrixRowCount,
  validateFoldResult,
  buildFoldDiagnosticEvidence,
  buildAggregateResult,
  formatDecimal,
  formatMetrics,
} = require("../../scripts/evaluate_reference_candidate_logistic_leave_one_kanji_out");

function createEntry({ recognitionId, targetKanji, label, features }) {
  return {
    lineNumber: 1,
    row: {
      recognitionId,
      targetKanji,
      expectedKanji: targetKanji,
      sampleIsCorrect: label === 1,
      classification: label === 1 ? "truePositive" : "trueNegative",
      label,
      features,
    },
  };
}

function createMetrics({
  truePositive,
  trueNegative,
  falsePositive,
  falseNegative,
}) {
  return {
    truePositive,
    trueNegative,
    falsePositive,
    falseNegative,
    rowCount: truePositive + trueNegative + falsePositive + falseNegative,
  };
}

function createFoldResult({
  heldOutKanji,
  descriptorFalsePositive,
  hybridFalsePositive,
  hybridFalseNegative = 0,
  unseenEvaluationFeatureCount = 0,
}) {
  return {
    heldOutKanji,
    evaluationRowCount: 10,
    unseenEvaluationFeatureCount,
    descriptorMetrics: createMetrics({
      truePositive: 6,
      trueNegative: 4 - descriptorFalsePositive,
      falsePositive: descriptorFalsePositive,
      falseNegative: 0,
    }),
    pureMlMetrics: createMetrics({
      truePositive: 6,
      trueNegative: 2,
      falsePositive: 2,
      falseNegative: 0,
    }),
    hybridMetrics: createMetrics({
      truePositive: 6 - hybridFalseNegative,
      trueNegative: 4 - hybridFalsePositive,
      falsePositive: hybridFalsePositive,
      falseNegative: hybridFalseNegative,
    }),
  };
}

function createHybridPrediction({
  recognitionId,
  targetKanji = "木",
  label,
  classification,
  descriptorPrediction,
  mlProbability,
  mlPrediction,
  hybridPrediction,
}) {
  return {
    recognitionId,
    targetKanji,
    label,
    classification,
    descriptorPrediction,
    mlProbability,
    mlPrediction,
    hybridPrediction,
  };
}

test("parseArguments reads LOOCV configuration", () => {
  const options = parseArguments([
    "--dataset",
    "./custom/dataset.jsonl",
    "--folds",
    "./custom/folds.json",
    "--out",
    "./custom/report.json",
    "--epochs",
    "500",
    "--learning-rate",
    "0.02",
    "--l2-strength",
    "0.005",
    "--report-every",
    "25",
    "--only-kanji",
    "木",
  ]);

  assert.equal(
    options.datasetPath,
    path.resolve(process.cwd(), "custom", "dataset.jsonl"),
  );

  assert.equal(
    options.foldsPath,
    path.resolve(process.cwd(), "custom", "folds.json"),
  );

  assert.equal(
    options.outputPath,
    path.resolve(process.cwd(), "custom", "report.json"),
  );

  assert.equal(options.epochs, 500);
  assert.equal(options.learningRate, 0.02);
  assert.equal(options.l2Strength, 0.005);
  assert.equal(options.reportEvery, 25);
  assert.equal(options.onlyKanji, "木");
});

test("validateOptions accepts valid configuration", () => {
  assert.doesNotThrow(() =>
    validateOptions({
      epochs: 100,
      learningRate: 0.01,
      l2Strength: 0.001,
      reportEvery: 10,
      onlyKanji: null,
    }),
  );
});

test("validateOptions rejects invalid epochs", () => {
  assert.throws(
    () =>
      validateOptions({
        epochs: 0,
        learningRate: 0.01,
        l2Strength: 0.001,
        reportEvery: 10,
        onlyKanji: null,
      }),
    /epochs must be a positive integer/,
  );
});

test("findUnseenEvaluationFeatures reports training-unknown features", () => {
  const evaluationEntries = [
    createEntry({
      recognitionId: "evaluation-1",
      targetKanji: "木",
      label: 1,
      features: {
        "feature.shared": 1,
        "feature.unseen": 2,
      },
    }),
  ];

  const result = findUnseenEvaluationFeatures({
    trainingFeatureNames: ["feature.shared"],
    evaluationEntries,
  });

  assert.deepEqual(result, ["feature.unseen"]);
});

test("sumMetrics aggregates confusion matrices", () => {
  const result = sumMetrics([
    createMetrics({
      truePositive: 2,
      trueNegative: 3,
      falsePositive: 1,
      falseNegative: 0,
    }),
    createMetrics({
      truePositive: 4,
      trueNegative: 2,
      falsePositive: 2,
      falseNegative: 1,
    }),
  ]);

  assert.equal(result.truePositive, 6);

  assert.equal(result.trueNegative, 5);

  assert.equal(result.falsePositive, 3);

  assert.equal(result.falseNegative, 1);

  assert.equal(result.rowCount, 15);
});

test("summarizeFoldOutcomes classifies fold results", () => {
  const folds = [
    createFoldResult({
      heldOutKanji: "木",
      descriptorFalsePositive: 3,
      hybridFalsePositive: 2,
    }),
    createFoldResult({
      heldOutKanji: "本",
      descriptorFalsePositive: 2,
      hybridFalsePositive: 2,
    }),
    createFoldResult({
      heldOutKanji: "未",
      descriptorFalsePositive: 1,
      hybridFalsePositive: 2,
      hybridFalseNegative: 1,
      unseenEvaluationFeatureCount: 3,
    }),
  ];

  const result = summarizeFoldOutcomes(folds);

  assert.deepEqual(result.foldsWithHybridFpImprovement, ["木"]);

  assert.deepEqual(result.foldsWithHybridFpEquality, ["本"]);

  assert.deepEqual(result.foldsWithHybridFpRegression, ["未"]);

  assert.deepEqual(result.foldsWithHybridFalseNegatives, ["未"]);

  assert.deepEqual(result.foldsWithUnseenEvaluationFeatures, [
    {
      heldOutKanji: "未",
      count: 3,
    },
  ]);
});

test("calculateConfusionMatrixRowCount works without stored rowCount", () => {
  const rowCount = calculateConfusionMatrixRowCount({
    truePositive: 59,
    trueNegative: 4,
    falsePositive: 6,
    falseNegative: 0,
  });

  assert.equal(rowCount, 69);
});

test("validateFoldResult accepts a coherent fold", () => {
  const result = validateFoldResult({
    sourceRowCount: 100,
    foldResult: {
      heldOutKanji: "木",
      trainingRowCount: 90,
      evaluationRowCount: 10,
      trainingKanjiCount: 18,
      trainingMetrics: createMetrics({
        truePositive: 60,
        trueNegative: 30,
        falsePositive: 0,
        falseNegative: 0,
      }),
      descriptorMetrics: createMetrics({
        truePositive: 6,
        trueNegative: 3,
        falsePositive: 1,
        falseNegative: 0,
      }),
      pureMlMetrics: createMetrics({
        truePositive: 6,
        trueNegative: 2,
        falsePositive: 2,
        falseNegative: 0,
      }),
      hybridMetrics: createMetrics({
        truePositive: 6,
        trueNegative: 4,
        falsePositive: 0,
        falseNegative: 0,
      }),
      diagnosticEvidence: {
        hybridFalseNegativeCount: 0,
        hybridFalseNegativePredictions: [],
        descriptorFalsePositiveRejectedCount: 1,
        descriptorFalsePositivesRejected: [
          {
            recognitionId: "descriptor-fp-rejected",
          },
        ],
      },
    },
  });

  assert.equal(result.passed, true);
  assert.deepEqual(result.errors, []);
});

test("buildFoldDiagnosticEvidence records hybrid false negatives", () => {
  const selectedThreshold = 0.1;

  const evidence = buildFoldDiagnosticEvidence({
    selectedThreshold,
    hybridEvaluation: {
      predictions: [
        createHybridPrediction({
          recognitionId: "positive-rejected",
          targetKanji: "木",
          label: 1,
          classification: "truePositive",
          descriptorPrediction: 1,
          mlProbability: 0.08,
          mlPrediction: 0,
          hybridPrediction: 0,
        }),
        createHybridPrediction({
          recognitionId: "positive-accepted",
          targetKanji: "木",
          label: 1,
          classification: "truePositive",
          descriptorPrediction: 1,
          mlProbability: 0.8,
          mlPrediction: 1,
          hybridPrediction: 1,
        }),
      ],
    },
  });

  assert.equal(evidence.hybridFalseNegativeCount, 1);

  assert.equal(evidence.hybridFalseNegativePredictions.length, 1);

  assert.equal(
    evidence.hybridFalseNegativePredictions[0].recognitionId,
    "positive-rejected",
  );

  assert.ok(
    Math.abs(
      evidence.hybridFalseNegativePredictions[0].thresholdMargin - -0.02,
    ) < 1e-12,
  );
});

test("buildFoldDiagnosticEvidence records rejected descriptor false positives", () => {
  const evidence = buildFoldDiagnosticEvidence({
    selectedThreshold: 0.1,
    hybridEvaluation: {
      predictions: [
        createHybridPrediction({
          recognitionId: "descriptor-fp-rejected",
          targetKanji: "山",
          label: 0,
          classification: "falsePositive",
          descriptorPrediction: 1,
          mlProbability: 0.05,
          mlPrediction: 0,
          hybridPrediction: 0,
        }),
        createHybridPrediction({
          recognitionId: "descriptor-fp-kept",
          targetKanji: "山",
          label: 0,
          classification: "falsePositive",
          descriptorPrediction: 1,
          mlProbability: 0.4,
          mlPrediction: 1,
          hybridPrediction: 1,
        }),
      ],
    },
  });

  assert.equal(evidence.descriptorFalsePositiveRejectedCount, 1);

  assert.equal(
    evidence.descriptorFalsePositivesRejected[0].recognitionId,
    "descriptor-fp-rejected",
  );

  assert.equal(
    evidence.descriptorFalsePositivesRejected[0].thresholdMargin,
    -0.05,
  );
});

test("buildFoldDiagnosticEvidence ignores descriptor true negatives", () => {
  const evidence = buildFoldDiagnosticEvidence({
    selectedThreshold: 0.1,
    hybridEvaluation: {
      predictions: [
        createHybridPrediction({
          recognitionId: "descriptor-true-negative",
          targetKanji: "木",
          label: 0,
          classification: "trueNegative",
          descriptorPrediction: 0,
          mlProbability: 0.01,
          mlPrediction: 0,
          hybridPrediction: 0,
        }),
      ],
    },
  });

  assert.equal(evidence.descriptorFalsePositiveRejectedCount, 0);

  assert.deepEqual(evidence.descriptorFalsePositivesRejected, []);
});

test("validateFoldResult rejects an evaluation confusion matrix mismatch", () => {
  const result = validateFoldResult({
    sourceRowCount: 100,
    foldResult: {
      heldOutKanji: "木",
      trainingRowCount: 90,
      evaluationRowCount: 10,
      trainingKanjiCount: 18,
      trainingMetrics: createMetrics({
        truePositive: 60,
        trueNegative: 30,
        falsePositive: 0,
        falseNegative: 0,
      }),
      descriptorMetrics: {
        truePositive: 6,
        trueNegative: 2,
        falsePositive: 1,
        falseNegative: 0,
      },
      pureMlMetrics: createMetrics({
        truePositive: 6,
        trueNegative: 2,
        falsePositive: 2,
        falseNegative: 0,
      }),
      hybridMetrics: createMetrics({
        truePositive: 6,
        trueNegative: 4,
        falsePositive: 0,
        falseNegative: 0,
      }),
      diagnosticEvidence: {
        hybridFalseNegativeCount: 0,
        hybridFalseNegativePredictions: [],
        descriptorFalsePositiveRejectedCount: 1,
        descriptorFalsePositivesRejected: [
          {
            recognitionId: "descriptor-fp-rejected",
          },
        ],
      },
    },
  });

  assert.equal(result.passed, false);

  assert.ok(
    result.errors.some((error) =>
      error.includes("descriptorMetrics row count mismatch"),
    ),
  );
});

test("validateFoldResult rejects a training FN", () => {
  const result = validateFoldResult({
    sourceRowCount: 100,
    foldResult: {
      heldOutKanji: "木",
      trainingRowCount: 90,
      evaluationRowCount: 10,
      trainingKanjiCount: 18,
      trainingMetrics: createMetrics({
        truePositive: 59,
        trueNegative: 30,
        falsePositive: 0,
        falseNegative: 1,
      }),
      descriptorMetrics: createMetrics({
        truePositive: 6,
        trueNegative: 3,
        falsePositive: 1,
        falseNegative: 0,
      }),
      pureMlMetrics: createMetrics({
        truePositive: 6,
        trueNegative: 2,
        falsePositive: 2,
        falseNegative: 0,
      }),
      hybridMetrics: createMetrics({
        truePositive: 6,
        trueNegative: 4,
        falsePositive: 0,
        falseNegative: 0,
      }),
      diagnosticEvidence: {
        hybridFalseNegativeCount: 0,
        hybridFalseNegativePredictions: [],
        descriptorFalsePositiveRejectedCount: 1,
        descriptorFalsePositivesRejected: [
          {
            recognitionId: "descriptor-fp-rejected",
          },
        ],
      },
    },
  });

  assert.equal(result.passed, false);

  assert.ok(
    result.errors.some((error) => error.includes("not FN-safe on training")),
  );
});

test("buildAggregateResult aggregates all evaluators", () => {
  const folds = [
    createFoldResult({
      heldOutKanji: "木",
      descriptorFalsePositive: 3,
      hybridFalsePositive: 2,
    }),
    createFoldResult({
      heldOutKanji: "本",
      descriptorFalsePositive: 2,
      hybridFalsePositive: 1,
    }),
  ];

  const aggregate = buildAggregateResult(folds);

  assert.equal(aggregate.descriptorMetrics.falsePositive, 5);

  assert.equal(aggregate.hybridMetrics.falsePositive, 3);

  assert.equal(aggregate.comparisons.hybridVsDescriptor.falsePositive, -2);

  assert.equal(aggregate.outcomes.foldCount, 2);
});

test("formatDecimal preserves threshold precision", () => {
  assert.equal(formatDecimal(0.029109293774331055), "0.029109294");

  assert.equal(formatDecimal(null), "n/a");
});

test("formatMetrics formats a confusion matrix", () => {
  assert.equal(
    formatMetrics({
      truePositive: 10,
      trueNegative: 8,
      falsePositive: 2,
      falseNegative: 1,
    }),
    "TP=10, TN=8, FP=2, FN=1",
  );
});

test("validateFoldResult rejects diagnostic false negative count mismatch", () => {
  const result = validateFoldResult({
    sourceRowCount: 100,
    foldResult: {
      heldOutKanji: "木",
      trainingRowCount: 90,
      evaluationRowCount: 10,
      trainingKanjiCount: 18,
      trainingMetrics: createMetrics({
        truePositive: 60,
        trueNegative: 30,
        falsePositive: 0,
        falseNegative: 0,
      }),
      descriptorMetrics: createMetrics({
        truePositive: 6,
        trueNegative: 3,
        falsePositive: 1,
        falseNegative: 0,
      }),
      pureMlMetrics: createMetrics({
        truePositive: 5,
        trueNegative: 3,
        falsePositive: 1,
        falseNegative: 1,
      }),
      hybridMetrics: createMetrics({
        truePositive: 5,
        trueNegative: 4,
        falsePositive: 0,
        falseNegative: 1,
      }),
      diagnosticEvidence: {
        hybridFalseNegativeCount: 0,
        hybridFalseNegativePredictions: [],
        descriptorFalsePositiveRejectedCount: 1,
        descriptorFalsePositivesRejected: [
          {
            recognitionId: "descriptor-fp-rejected",
          },
        ],
      },
    },
  });

  assert.equal(result.passed, false);

  assert.ok(
    result.errors.some((error) =>
      error.includes("diagnostic FN count mismatch"),
    ),
  );
});
