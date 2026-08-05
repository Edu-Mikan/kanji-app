"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
  parseArguments,
  validateOptions,
  validateMetricObject,
  validateConfusionMatrix,
  evaluateHybridQualityGate,
} = require("../../scripts/validate_reference_candidate_logistic_hybrid_quality_gate");

function createMetrics({
  truePositive,
  trueNegative,
  falsePositive,
  falseNegative,
}) {
  const rowCount = truePositive + trueNegative + falsePositive + falseNegative;

  return {
    truePositive,
    trueNegative,
    falsePositive,
    falseNegative,
    rowCount,
  };
}

function createValidReport() {
  return {
    schemaVersion: 1,
    decisionRule: {
      name: "descriptor_and_logistic_fn_safe",
      threshold: 0.029109293774331055,
    },
    partitions: {
      trainingRowCount: 10,
      validationRowCount: 6,
    },
    training: {
      descriptorMetrics: createMetrics({
        truePositive: 6,
        trueNegative: 2,
        falsePositive: 2,
        falseNegative: 0,
      }),
      pureMlMetrics: createMetrics({
        truePositive: 6,
        trueNegative: 1,
        falsePositive: 3,
        falseNegative: 0,
      }),
      hybridMetrics: createMetrics({
        truePositive: 6,
        trueNegative: 3,
        falsePositive: 1,
        falseNegative: 0,
      }),
    },
    validation: {
      descriptorMetrics: createMetrics({
        truePositive: 4,
        trueNegative: 1,
        falsePositive: 1,
        falseNegative: 0,
      }),
      pureMlMetrics: createMetrics({
        truePositive: 4,
        trueNegative: 0,
        falsePositive: 2,
        falseNegative: 0,
      }),
      hybridMetrics: createMetrics({
        truePositive: 4,
        trueNegative: 2,
        falsePositive: 0,
        falseNegative: 0,
      }),
    },
    assessment: {
      validationFalseNegativeSafe: true,
      validationFalsePositiveNonRegression: true,
      validationFalsePositiveImprovement: true,
      validationFalsePositiveReduction: 1,
      trainingFalseNegativeSafe: true,
    },
    integrity: {
      passed: true,
      errors: [],
    },
  };
}

test("parseArguments reads quality gate options", () => {
  const options = parseArguments([
    "--report",
    "./custom/report.json",
    "--minimum-fp-reduction",
    "2",
    "--allow-training-fn",
    "--allow-no-validation-improvement",
  ]);

  assert.equal(
    options.reportPath,
    path.resolve(process.cwd(), "custom", "report.json"),
  );

  assert.equal(options.minimumFpReduction, 2);

  assert.equal(options.requireTrainingFnSafe, false);

  assert.equal(options.requireValidationImprovement, false);
});

test("validateOptions accepts a non-negative FP reduction", () => {
  assert.doesNotThrow(() =>
    validateOptions({
      minimumFpReduction: 0,
    }),
  );

  assert.doesNotThrow(() =>
    validateOptions({
      minimumFpReduction: 2,
    }),
  );
});

test("validateOptions rejects invalid FP reduction", () => {
  assert.throws(
    () =>
      validateOptions({
        minimumFpReduction: -1,
      }),
    /non-negative integer/,
  );

  assert.throws(
    () =>
      validateOptions({
        minimumFpReduction: 1.5,
      }),
    /non-negative integer/,
  );
});

test("validateMetricObject accepts non-negative counts", () => {
  const failures = validateMetricObject({
    metrics: createMetrics({
      truePositive: 1,
      trueNegative: 1,
      falsePositive: 0,
      falseNegative: 0,
    }),
    partitionName: "validation",
    evaluatorName: "hybrid",
  });

  assert.deepEqual(failures, []);
});

test("validateMetricObject rejects missing metrics", () => {
  const failures = validateMetricObject({
    metrics: null,
    partitionName: "validation",
    evaluatorName: "hybrid",
  });

  assert.ok(failures.some((failure) => failure.code === "missing_metrics"));
});

test("validateConfusionMatrix detects row count mismatch", () => {
  const failures = validateConfusionMatrix({
    metrics: createMetrics({
      truePositive: 2,
      trueNegative: 2,
      falsePositive: 0,
      falseNegative: 0,
    }),
    expectedRowCount: 5,
    partitionName: "validation",
    evaluatorName: "hybrid",
  });

  assert.ok(
    failures.some(
      (failure) => failure.code === "confusion_matrix_row_count_mismatch",
    ),
  );
});

test("evaluateHybridQualityGate passes a safe improvement", () => {
  const result = evaluateHybridQualityGate({
    report: createValidReport(),
    minimumFpReduction: 1,
    requireTrainingFnSafe: true,
    requireValidationImprovement: true,
  });

  assert.equal(result.passed, true);

  assert.deepEqual(result.failures, []);

  assert.equal(result.observed.validationFpReduction, 1);

  assert.equal(result.productionPromotionReady, false);

  assert.ok(
    result.warnings.some(
      (warning) => warning.code === "unseen_kanji_evaluation_missing",
    ),
  );
});

test("evaluateHybridQualityGate rejects validation FN", () => {
  const report = createValidReport();

  report.validation.hybridMetrics = createMetrics({
    truePositive: 3,
    trueNegative: 2,
    falsePositive: 0,
    falseNegative: 1,
  });

  report.assessment.validationFalseNegativeSafe = false;

  const result = evaluateHybridQualityGate({
    report,
    minimumFpReduction: 1,
    requireTrainingFnSafe: true,
    requireValidationImprovement: true,
  });

  assert.equal(result.passed, false);

  assert.ok(
    result.failures.some(
      (failure) => failure.code === "validation_false_negative_regression",
    ),
  );
});

test("evaluateHybridQualityGate rejects FP regression", () => {
  const report = createValidReport();

  report.validation.hybridMetrics = createMetrics({
    truePositive: 4,
    trueNegative: 0,
    falsePositive: 2,
    falseNegative: 0,
  });

  report.assessment.validationFalsePositiveReduction = -1;

  report.assessment.validationFalsePositiveImprovement = false;

  report.assessment.validationFalsePositiveNonRegression = false;

  const result = evaluateHybridQualityGate({
    report,
    minimumFpReduction: 0,
    requireTrainingFnSafe: true,
    requireValidationImprovement: false,
  });

  assert.equal(result.passed, false);

  assert.ok(
    result.failures.some(
      (failure) => failure.code === "validation_false_positive_regression",
    ),
  );
});

test("evaluateHybridQualityGate enforces minimum FP reduction", () => {
  const result = evaluateHybridQualityGate({
    report: createValidReport(),
    minimumFpReduction: 2,
    requireTrainingFnSafe: true,
    requireValidationImprovement: true,
  });

  assert.equal(result.passed, false);

  assert.ok(
    result.failures.some(
      (failure) => failure.code === "validation_fp_reduction_below_minimum",
    ),
  );
});

test("evaluateHybridQualityGate detects inconsistent assessment", () => {
  const report = createValidReport();

  report.assessment.validationFalsePositiveReduction = 99;

  const result = evaluateHybridQualityGate({
    report,
    minimumFpReduction: 1,
    requireTrainingFnSafe: true,
    requireValidationImprovement: true,
  });

  assert.equal(result.passed, false);

  assert.ok(
    result.failures.some(
      (failure) => failure.code === "assessment_fp_reduction_mismatch",
    ),
  );
});

test("evaluateHybridQualityGate rejects failed source integrity", () => {
  const report = createValidReport();

  report.integrity.passed = false;

  const result = evaluateHybridQualityGate({
    report,
    minimumFpReduction: 1,
    requireTrainingFnSafe: true,
    requireValidationImprovement: true,
  });

  assert.equal(result.passed, false);

  assert.ok(
    result.failures.some(
      (failure) => failure.code === "source_integrity_failed",
    ),
  );
});
