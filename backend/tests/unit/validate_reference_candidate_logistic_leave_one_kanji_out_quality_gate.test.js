"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
  parseArguments,
  validateOptions,
  calculateConfusionMatrixRowCount,
  validateMetricObject,
  validateMetricRowCount,
  sumFoldMetrics,
  compareConfusionMatrices,
  getKanjiWithHybridFalseNegatives,
  getKanjiWithFpImprovement,
  validateFold,
  evaluateLoocvQualityGate,
  formatMetrics,
} = require("../../scripts/validate_reference_candidate_logistic_leave_one_kanji_out_quality_gate");

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

function createFold({
  heldOutKanji,
  descriptorFalsePositive = 2,
  hybridFalsePositive = 1,
  hybridFalseNegative = 0,
}) {
  const evaluationPositiveCount = 6;
  const evaluationNegativeCount = 4;
  const evaluationRowCount = 10;
  const trainingRowCount = 20;

  return {
    foldId: `fold-${heldOutKanji}`,
    heldOutKanji,
    thresholdCalibrationScope: "outer_fold_training_partition",
    trainingRowCount,
    evaluationRowCount,
    trainingKanjiCount: 18,
    trainingFeatureCount: 3,
    evaluationFeatureCount: 3,
    dimensionCount: 6,
    unseenEvaluationFeatureCount: 0,
    unseenEvaluationFeatures: [],
    trainingLabelCounts: {
      positiveCount: 12,
      negativeCount: 8,
    },
    evaluationLabelCounts: {
      positiveCount: evaluationPositiveCount,
      negativeCount: evaluationNegativeCount,
    },
    selectedThreshold: 0.1,
    trainingMetrics: createMetrics({
      truePositive: 12,
      trueNegative: 3,
      falsePositive: 5,
      falseNegative: 0,
    }),
    descriptorMetrics: createMetrics({
      truePositive: 6,
      trueNegative: evaluationNegativeCount - descriptorFalsePositive,
      falsePositive: descriptorFalsePositive,
      falseNegative: 0,
    }),
    pureMlMetrics: createMetrics({
      truePositive: evaluationPositiveCount - hybridFalseNegative,
      trueNegative: evaluationNegativeCount - hybridFalsePositive,
      falsePositive: hybridFalsePositive,
      falseNegative: hybridFalseNegative,
    }),
    hybridMetrics: createMetrics({
      truePositive: evaluationPositiveCount - hybridFalseNegative,
      trueNegative: evaluationNegativeCount - hybridFalsePositive,
      falsePositive: hybridFalsePositive,
      falseNegative: hybridFalseNegative,
    }),
    integrity: {
      passed: true,
      errors: [],
    },
  };
}

function configureTenRowTraining(fold) {
  fold.trainingRowCount = 10;

  fold.trainingLabelCounts = {
    positiveCount: 6,
    negativeCount: 4,
  };

  fold.trainingMetrics = createMetrics({
    truePositive: 6,
    trueNegative: 2,
    falsePositive: 2,
    falseNegative: 0,
  });

  return fold;
}

function buildReport({ folds, expectedSourceRowCount = 30 }) {
  const descriptorMetrics = sumFoldMetrics(folds, "descriptorMetrics");

  const pureMlMetrics = sumFoldMetrics(folds, "pureMlMetrics");

  const hybridMetrics = sumFoldMetrics(folds, "hybridMetrics");

  const fpReduction =
    descriptorMetrics.falsePositive - hybridMetrics.falsePositive;

  return {
    schemaVersion: 1,
    strategy: "leave_one_target_kanji_out",
    dataset: {
      rowCount: expectedSourceRowCount,
    },
    executedFoldCount: folds.length,
    partialExecution: false,
    folds,
    aggregate: {
      descriptorMetrics,
      pureMlMetrics,
      hybridMetrics,
    },
    assessment: {
      aggregateHybridFalseNegativeSafe: hybridMetrics.falseNegative === 0,
      aggregateHybridFpImprovement: fpReduction > 0,
      aggregateHybridFpReduction: fpReduction,
    },
    integrity: {
      passed: true,
      errors: [],
    },
  };
}

test("parseArguments reads LOOCV gate configuration", () => {
  const options = parseArguments([
    "--report",
    "./custom/report.json",
    "--expected-fold-count",
    "20",
    "--expected-row-count",
    "600",
    "--minimum-fp-reduction",
    "2",
  ]);

  assert.equal(
    options.reportPath,
    path.resolve(process.cwd(), "custom", "report.json"),
  );

  assert.equal(options.expectedFoldCount, 20);

  assert.equal(options.expectedRowCount, 600);

  assert.equal(options.minimumFpReduction, 2);
});

test("validateOptions accepts valid values", () => {
  assert.doesNotThrow(() =>
    validateOptions({
      expectedFoldCount: 19,
      expectedRowCount: 565,
      minimumFpReduction: 0,
    }),
  );
});

test("validateOptions rejects invalid values", () => {
  assert.throws(
    () =>
      validateOptions({
        expectedFoldCount: 0,
        expectedRowCount: 565,
        minimumFpReduction: 1,
      }),
    /expectedFoldCount must be a positive integer/,
  );

  assert.throws(
    () =>
      validateOptions({
        expectedFoldCount: 19,
        expectedRowCount: 0,
        minimumFpReduction: 1,
      }),
    /expectedRowCount must be a positive integer/,
  );

  assert.throws(
    () =>
      validateOptions({
        expectedFoldCount: 19,
        expectedRowCount: 565,
        minimumFpReduction: -1,
      }),
    /minimumFpReduction must be a non-negative integer/,
  );
});

test("calculateConfusionMatrixRowCount does not require rowCount", () => {
  assert.equal(
    calculateConfusionMatrixRowCount({
      truePositive: 59,
      trueNegative: 4,
      falsePositive: 6,
      falseNegative: 0,
    }),
    69,
  );
});

test("validateMetricObject accepts valid counts", () => {
  assert.deepEqual(
    validateMetricObject({
      metrics: createMetrics({
        truePositive: 2,
        trueNegative: 3,
        falsePositive: 1,
        falseNegative: 0,
      }),
      location: "test.metrics",
    }),
    [],
  );
});

test("validateMetricObject rejects invalid counts", () => {
  const failures = validateMetricObject({
    metrics: {
      truePositive: 2,
      trueNegative: -1,
      falsePositive: 1,
      falseNegative: 0,
    },
    location: "test.metrics",
  });

  assert.ok(
    failures.some((failure) => failure.code === "invalid_metric_count"),
  );
});

test("validateMetricRowCount accepts metrics without stored rowCount", () => {
  const failures = validateMetricRowCount({
    metrics: {
      truePositive: 6,
      trueNegative: 3,
      falsePositive: 1,
      falseNegative: 0,
    },
    expectedRowCount: 10,
    location: "fold.descriptorMetrics",
  });

  assert.deepEqual(failures, []);
});

test("validateMetricRowCount detects mismatches", () => {
  const failures = validateMetricRowCount({
    metrics: createMetrics({
      truePositive: 6,
      trueNegative: 2,
      falsePositive: 1,
      falseNegative: 0,
    }),
    expectedRowCount: 10,
    location: "fold.descriptorMetrics",
  });

  assert.ok(
    failures.some((failure) => failure.code === "metric_row_count_mismatch"),
  );
});

test("sumFoldMetrics aggregates fold matrices", () => {
  const folds = [
    createFold({
      heldOutKanji: "木",
      descriptorFalsePositive: 2,
      hybridFalsePositive: 1,
    }),
    createFold({
      heldOutKanji: "本",
      descriptorFalsePositive: 3,
      hybridFalsePositive: 2,
    }),
  ];

  const metrics = sumFoldMetrics(folds, "descriptorMetrics");

  assert.equal(metrics.truePositive, 12);

  assert.equal(metrics.falsePositive, 5);

  assert.equal(metrics.rowCount, 20);
});

test("compareConfusionMatrices detects aggregate mismatch", () => {
  const failures = compareConfusionMatrices({
    actual: createMetrics({
      truePositive: 10,
      trueNegative: 5,
      falsePositive: 2,
      falseNegative: 0,
    }),
    expected: createMetrics({
      truePositive: 10,
      trueNegative: 6,
      falsePositive: 1,
      falseNegative: 0,
    }),
    location: "aggregate.hybridMetrics",
  });

  assert.ok(
    failures.some((failure) => failure.code === "aggregate_metric_mismatch"),
  );
});

test("getKanjiWithHybridFalseNegatives identifies affected folds", () => {
  const result = getKanjiWithHybridFalseNegatives([
    createFold({
      heldOutKanji: "本",
      hybridFalseNegative: 1,
    }),
    createFold({
      heldOutKanji: "木",
      hybridFalseNegative: 2,
    }),
    createFold({
      heldOutKanji: "山",
      hybridFalseNegative: 0,
    }),
  ]);

  assert.deepEqual(
    result.map((fold) => ({
      heldOutKanji: fold.heldOutKanji,
      falseNegative: fold.falseNegative,
    })),
    [
      {
        heldOutKanji: "本",
        falseNegative: 1,
      },
      {
        heldOutKanji: "木",
        falseNegative: 2,
      },
    ],
  );
});

test("getKanjiWithFpImprovement identifies improving folds", () => {
  const result = getKanjiWithFpImprovement([
    createFold({
      heldOutKanji: "一",
      descriptorFalsePositive: 2,
      hybridFalsePositive: 0,
    }),
    createFold({
      heldOutKanji: "回",
      descriptorFalsePositive: 1,
      hybridFalsePositive: 1,
    }),
  ]);

  assert.deepEqual(result, [
    {
      heldOutKanji: "一",
      descriptorFalsePositive: 2,
      hybridFalsePositive: 0,
      falsePositiveReduction: 2,
    },
  ]);
});

test("validateFold accepts a coherent fold", () => {
  const failures = validateFold({
    fold: createFold({
      heldOutKanji: "木",
    }),
    expectedSourceRowCount: 30,
  });

  assert.deepEqual(failures, []);
});

test("validateFold allows held-out false negatives as experimental results", () => {
  const failures = validateFold({
    fold: createFold({
      heldOutKanji: "木",
      hybridFalseNegative: 2,
    }),
    expectedSourceRowCount: 30,
  });

  assert.equal(
    failures.some(
      (failure) => failure.code === "training_threshold_not_fn_safe",
    ),
    false,
  );
});

test("validateFold rejects training false negatives", () => {
  const fold = createFold({
    heldOutKanji: "木",
  });

  fold.trainingMetrics = createMetrics({
    truePositive: 11,
    trueNegative: 3,
    falsePositive: 5,
    falseNegative: 1,
  });

  const failures = validateFold({
    fold,
    expectedSourceRowCount: 30,
  });

  assert.ok(
    failures.some(
      (failure) => failure.code === "training_threshold_not_fn_safe",
    ),
  );
});

test("evaluateLoocvQualityGate passes a technically valid safe candidate", () => {
  const folds = [
    createFold({
      heldOutKanji: "木",
      descriptorFalsePositive: 2,
      hybridFalsePositive: 1,
    }),
    createFold({
      heldOutKanji: "本",
      descriptorFalsePositive: 2,
      hybridFalsePositive: 1,
    }),
  ];

  const report = buildReport({
    folds,
    expectedSourceRowCount: 30,
  });

  const result = evaluateLoocvQualityGate({
    report,
    expectedFoldCount: 2,
    expectedRowCount: 20,
    minimumFpReduction: 1,
  });

  assert.equal(result.technicalGatePassed, false);

  assert.ok(
    result.technicalFailures.some(
      (failure) => failure.code === "fold_source_row_count_mismatch",
    ),
  );
});

test("evaluateLoocvQualityGate separates technical and candidate failures", () => {
  const folds = [
    createFold({
      heldOutKanji: "本",
      descriptorFalsePositive: 2,
      hybridFalsePositive: 1,
      hybridFalseNegative: 1,
    }),
    createFold({
      heldOutKanji: "木",
      descriptorFalsePositive: 2,
      hybridFalsePositive: 1,
      hybridFalseNegative: 2,
    }),
  ];

  for (const fold of folds) {
    configureTenRowTraining(fold);
  }

  const report = buildReport({
    folds,
    expectedSourceRowCount: 20,
  });

  const result = evaluateLoocvQualityGate({
    report,
    expectedFoldCount: 2,
    expectedRowCount: 20,
    minimumFpReduction: 1,
  });

  assert.equal(result.technicalGatePassed, true);

  assert.equal(result.candidateGatePassed, false);

  assert.equal(result.productionPromotionReady, false);

  assert.equal(result.observed.hybridMetrics.falseNegative, 3);

  assert.deepEqual(
    result.observed.kanjiWithHybridFalseNegatives.map(
      (fold) => fold.heldOutKanji,
    ),
    ["本", "木"],
  );

  assert.ok(
    result.candidateFailures.some(
      (failure) => failure.code === "aggregate_hybrid_not_fn_safe",
    ),
  );
});

test("evaluateLoocvQualityGate passes both gates for a safe improvement", () => {
  const folds = [
    createFold({
      heldOutKanji: "一",
      descriptorFalsePositive: 2,
      hybridFalsePositive: 0,
    }),
    createFold({
      heldOutKanji: "山",
      descriptorFalsePositive: 2,
      hybridFalsePositive: 1,
    }),
  ];

  for (const fold of folds) {
    configureTenRowTraining(fold);
  }

  const report = buildReport({
    folds,
    expectedSourceRowCount: 20,
  });

  const result = evaluateLoocvQualityGate({
    report,
    expectedFoldCount: 2,
    expectedRowCount: 20,
    minimumFpReduction: 1,
  });

  assert.equal(result.technicalGatePassed, true);

  assert.equal(result.candidateGatePassed, true);

  assert.equal(result.productionPromotionReady, true);

  assert.deepEqual(result.technicalFailures, []);

  assert.deepEqual(result.candidateFailures, []);
});

test("evaluateLoocvQualityGate rejects incomplete execution", () => {
  const fold = createFold({
    heldOutKanji: "木",
  });

  configureTenRowTraining(fold);

  const report = buildReport({
    folds: [fold],
    expectedSourceRowCount: 20,
  });

  report.partialExecution = true;

  const result = evaluateLoocvQualityGate({
    report,
    expectedFoldCount: 1,
    expectedRowCount: 10,
    minimumFpReduction: 0,
  });

  assert.equal(result.technicalGatePassed, false);

  assert.ok(
    result.technicalFailures.some(
      (failure) => failure.code === "partial_execution",
    ),
  );
});

test("evaluateLoocvQualityGate detects aggregate tampering", () => {
  const fold = createFold({
    heldOutKanji: "木",
  });

  configureTenRowTraining(fold);

  const report = buildReport({
    folds: [fold],
    expectedSourceRowCount: 20,
  });

  report.aggregate.hybridMetrics.falsePositive = 99;

  const result = evaluateLoocvQualityGate({
    report,
    expectedFoldCount: 1,
    expectedRowCount: 10,
    minimumFpReduction: 0,
  });

  assert.equal(result.technicalGatePassed, false);

  assert.ok(
    result.technicalFailures.some(
      (failure) => failure.code === "aggregate_metric_mismatch",
    ),
  );
});

test("formatMetrics formats a confusion matrix", () => {
  assert.equal(
    formatMetrics({
      truePositive: 383,
      trueNegative: 126,
      falsePositive: 56,
      falseNegative: 0,
    }),
    "TP=383, TN=126, FP=56, FN=0",
  );
});
