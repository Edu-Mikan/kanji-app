"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const {
  calculateBinaryMetrics,
} = require("./reference_candidate_logistic_regression");

const DEFAULT_REPORT_PATH = path.resolve(
  process.cwd(),
  "ml_models",
  "reference_candidate_logistic_leave_one_kanji_out_report.json",
);

const DEFAULT_EXPECTED_FOLD_COUNT = 19;
const DEFAULT_EXPECTED_ROW_COUNT = 565;
const DEFAULT_MINIMUM_FP_REDUCTION = 1;

function requireArgumentValue(argv, index, argumentName) {
  const value = argv[index + 1];

  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${argumentName} requires a value`);
  }

  return value;
}

function parseArguments(argv) {
  const options = {
    reportPath: DEFAULT_REPORT_PATH,
    expectedFoldCount: DEFAULT_EXPECTED_FOLD_COUNT,
    expectedRowCount: DEFAULT_EXPECTED_ROW_COUNT,
    minimumFpReduction: DEFAULT_MINIMUM_FP_REDUCTION,
    help: false,
  };

  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];

    if (argument === "--report") {
      options.reportPath = path.resolve(
        process.cwd(),
        requireArgumentValue(argv, index, argument),
      );

      index++;
      continue;
    }

    if (argument === "--expected-fold-count") {
      options.expectedFoldCount = Number(
        requireArgumentValue(argv, index, argument),
      );

      index++;
      continue;
    }

    if (argument === "--expected-row-count") {
      options.expectedRowCount = Number(
        requireArgumentValue(argv, index, argument),
      );

      index++;
      continue;
    }

    if (argument === "--minimum-fp-reduction") {
      options.minimumFpReduction = Number(
        requireArgumentValue(argv, index, argument),
      );

      index++;
      continue;
    }

    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return options;
}

function printHelp() {
  console.log(`
REFERENCE CANDIDATE LOGISTIC LOOCV QUALITY GATE

Usage:
  node scripts/validate_reference_candidate_logistic_leave_one_kanji_out_quality_gate.js

Options:
  --report <path>
      Leave-one-kanji-out evaluation report.

      Default:
      ./ml_models/reference_candidate_logistic_leave_one_kanji_out_report.json

  --expected-fold-count <number>
      Expected number of executed folds.

      Default: 19

  --expected-row-count <number>
      Expected total number of evaluated rows.

      Default: 565

  --minimum-fp-reduction <number>
      Minimum aggregate hybrid FP reduction required
      for the candidate gate.

      Default: 1

  --help, -h
      Show this help.

The script produces two separate decisions:

  Technical gate:
    Validates completeness, integrity, aggregation,
    leakage-related metadata and reproducibility evidence.

  Candidate gate:
    Requires aggregate hybrid FN = 0 and a minimum
    FP reduction versus the descriptor.

A technically valid experiment can pass while the candidate
gate remains blocked.
`);
}

function validateOptions(options) {
  if (
    !Number.isInteger(options.expectedFoldCount) ||
    options.expectedFoldCount <= 0
  ) {
    throw new Error("expectedFoldCount must be a positive integer");
  }

  if (
    !Number.isInteger(options.expectedRowCount) ||
    options.expectedRowCount <= 0
  ) {
    throw new Error("expectedRowCount must be a positive integer");
  }

  if (
    !Number.isInteger(options.minimumFpReduction) ||
    options.minimumFpReduction < 0
  ) {
    throw new Error("minimumFpReduction must be a non-negative integer");
  }
}

function assertFileExists(filePath, label) {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error(`${label} not found: ${filePath}`);
  }

  if (!fs.statSync(filePath).isFile()) {
    throw new Error(`${label} is not a file: ${filePath}`);
  }
}

function readJson(filePath, label) {
  assertFileExists(filePath, label);

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`${label} contains invalid JSON: ${error.message}`);
  }
}

function calculateFileSha256(filePath) {
  assertFileExists(filePath, "File");

  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(filePath))
    .digest("hex");
}

function addIssue(issues, code, message, details = null) {
  issues.push({
    code,
    message,
    details,
  });
}

function calculateConfusionMatrixRowCount(metrics) {
  return (
    metrics.truePositive +
    metrics.trueNegative +
    metrics.falsePositive +
    metrics.falseNegative
  );
}

function validateMetricObject({ metrics, location }) {
  const failures = [];

  if (metrics === null || typeof metrics !== "object") {
    addIssue(failures, "missing_metrics", `${location} metrics are missing.`);

    return failures;
  }

  const countNames = [
    "truePositive",
    "trueNegative",
    "falsePositive",
    "falseNegative",
  ];

  for (const countName of countNames) {
    const value = metrics[countName];

    if (!Number.isInteger(value) || value < 0) {
      addIssue(
        failures,
        "invalid_metric_count",
        `${location}.${countName} must be a non-negative integer.`,
        {
          actualValue: value,
        },
      );
    }
  }

  return failures;
}

function validateMetricRowCount({ metrics, expectedRowCount, location }) {
  const failures = validateMetricObject({
    metrics,
    location,
  });

  if (failures.length > 0) {
    return failures;
  }

  const actualRowCount = calculateConfusionMatrixRowCount(metrics);

  if (actualRowCount !== expectedRowCount) {
    addIssue(
      failures,
      "metric_row_count_mismatch",
      `${location} contains ${actualRowCount} rows, ` +
        `expected ${expectedRowCount}.`,
      {
        actualRowCount,
        expectedRowCount,
      },
    );
  }

  if (metrics.rowCount !== undefined && metrics.rowCount !== expectedRowCount) {
    addIssue(
      failures,
      "stored_metric_row_count_mismatch",
      `${location}.rowCount=${metrics.rowCount}, ` +
        `expected ${expectedRowCount}.`,
      {
        storedRowCount: metrics.rowCount,
        expectedRowCount,
      },
    );
  }

  return failures;
}

function sumFoldMetrics(folds, metricName) {
  let truePositive = 0;
  let trueNegative = 0;
  let falsePositive = 0;
  let falseNegative = 0;

  for (const fold of folds) {
    const metrics = fold[metricName];

    truePositive += metrics.truePositive;

    trueNegative += metrics.trueNegative;

    falsePositive += metrics.falsePositive;

    falseNegative += metrics.falseNegative;
  }

  return calculateBinaryMetrics({
    truePositive,
    trueNegative,
    falsePositive,
    falseNegative,
  });
}

function compareConfusionMatrices({ actual, expected, location }) {
  const failures = [];

  const countNames = [
    "truePositive",
    "trueNegative",
    "falsePositive",
    "falseNegative",
  ];

  for (const countName of countNames) {
    if (actual[countName] !== expected[countName]) {
      addIssue(
        failures,
        "aggregate_metric_mismatch",
        `${location}.${countName}=${actual[countName]}, ` +
          `expected ${expected[countName]}.`,
        {
          metricName: countName,
          actual: actual[countName],
          expected: expected[countName],
        },
      );
    }
  }

  return failures;
}

function getKanjiWithHybridFalseNegatives(folds) {
  return folds
    .filter((fold) => fold.hybridMetrics.falseNegative > 0)
    .map((fold) => ({
      heldOutKanji: fold.heldOutKanji,
      falseNegative: fold.hybridMetrics.falseNegative,
      evaluationPositiveCount:
        fold.evaluationLabelCounts?.positiveCount ?? null,
      threshold: fold.selectedThreshold,
      unseenEvaluationFeatureCount: fold.unseenEvaluationFeatureCount,
    }));
}

function getKanjiWithFpImprovement(folds) {
  return folds
    .filter(
      (fold) =>
        fold.hybridMetrics.falsePositive < fold.descriptorMetrics.falsePositive,
    )
    .map((fold) => ({
      heldOutKanji: fold.heldOutKanji,
      descriptorFalsePositive: fold.descriptorMetrics.falsePositive,
      hybridFalsePositive: fold.hybridMetrics.falsePositive,
      falsePositiveReduction:
        fold.descriptorMetrics.falsePositive - fold.hybridMetrics.falsePositive,
    }));
}

function getKanjiWithFpRegression(folds) {
  return folds
    .filter(
      (fold) =>
        fold.hybridMetrics.falsePositive > fold.descriptorMetrics.falsePositive,
    )
    .map((fold) => ({
      heldOutKanji: fold.heldOutKanji,
      descriptorFalsePositive: fold.descriptorMetrics.falsePositive,
      hybridFalsePositive: fold.hybridMetrics.falsePositive,
    }));
}

function validateFold({ fold, expectedSourceRowCount }) {
  const failures = [];

  if (!fold || typeof fold !== "object") {
    addIssue(failures, "invalid_fold", "Fold must be an object.");

    return failures;
  }

  if (typeof fold.heldOutKanji !== "string" || fold.heldOutKanji.length === 0) {
    addIssue(
      failures,
      "invalid_held_out_kanji",
      "Fold heldOutKanji must be a non-empty string.",
    );
  }

  if (fold.integrity?.passed !== true) {
    addIssue(
      failures,
      "fold_integrity_failed",
      `Fold ${fold.heldOutKanji} integrity.passed is not true.`,
    );
  }

  if (!Number.isInteger(fold.trainingRowCount) || fold.trainingRowCount <= 0) {
    addIssue(
      failures,
      "invalid_fold_training_row_count",
      `Fold ${fold.heldOutKanji} has an invalid training row count.`,
    );
  }

  if (
    !Number.isInteger(fold.evaluationRowCount) ||
    fold.evaluationRowCount <= 0
  ) {
    addIssue(
      failures,
      "invalid_fold_evaluation_row_count",
      `Fold ${fold.heldOutKanji} has an invalid evaluation row count.`,
    );
  }

  if (
    Number.isInteger(fold.trainingRowCount) &&
    Number.isInteger(fold.evaluationRowCount) &&
    fold.trainingRowCount + fold.evaluationRowCount !== expectedSourceRowCount
  ) {
    addIssue(
      failures,
      "fold_source_row_count_mismatch",
      `Fold ${fold.heldOutKanji} training and evaluation rows ` +
        `do not sum to ${expectedSourceRowCount}.`,
      {
        trainingRowCount: fold.trainingRowCount,
        evaluationRowCount: fold.evaluationRowCount,
        expectedSourceRowCount,
      },
    );
  }

  if (fold.trainingKanjiCount !== 18) {
    addIssue(
      failures,
      "invalid_training_kanji_count",
      `Fold ${fold.heldOutKanji} trainingKanjiCount=` +
        `${fold.trainingKanjiCount}, expected 18.`,
    );
  }

  if (fold.thresholdCalibrationScope !== "outer_fold_training_partition") {
    addIssue(
      failures,
      "invalid_threshold_calibration_scope",
      `Fold ${fold.heldOutKanji} uses an unexpected ` +
        `threshold calibration scope.`,
      {
        actual: fold.thresholdCalibrationScope,
      },
    );
  }

  if (
    typeof fold.selectedThreshold !== "number" ||
    !Number.isFinite(fold.selectedThreshold) ||
    fold.selectedThreshold < 0 ||
    fold.selectedThreshold > 1
  ) {
    addIssue(
      failures,
      "invalid_selected_threshold",
      `Fold ${fold.heldOutKanji} has an invalid selected threshold.`,
      {
        selectedThreshold: fold.selectedThreshold,
      },
    );
  }

  failures.push(
    ...validateMetricRowCount({
      metrics: fold.trainingMetrics,
      expectedRowCount: fold.trainingRowCount,
      location: `${fold.heldOutKanji}.trainingMetrics`,
    }),
  );

  failures.push(
    ...validateMetricRowCount({
      metrics: fold.descriptorMetrics,
      expectedRowCount: fold.evaluationRowCount,
      location: `${fold.heldOutKanji}.descriptorMetrics`,
    }),
  );

  failures.push(
    ...validateMetricRowCount({
      metrics: fold.pureMlMetrics,
      expectedRowCount: fold.evaluationRowCount,
      location: `${fold.heldOutKanji}.pureMlMetrics`,
    }),
  );

  failures.push(
    ...validateMetricRowCount({
      metrics: fold.hybridMetrics,
      expectedRowCount: fold.evaluationRowCount,
      location: `${fold.heldOutKanji}.hybridMetrics`,
    }),
  );

  if (fold.trainingMetrics && fold.trainingMetrics.falseNegative !== 0) {
    addIssue(
      failures,
      "training_threshold_not_fn_safe",
      `Fold ${fold.heldOutKanji} training threshold ` +
        `has FN=${fold.trainingMetrics.falseNegative}.`,
    );
  }

  if (
    fold.descriptorMetrics &&
    fold.hybridMetrics &&
    fold.hybridMetrics.falsePositive > fold.descriptorMetrics.falsePositive
  ) {
    addIssue(
      failures,
      "hybrid_fp_exceeds_descriptor",
      `Fold ${fold.heldOutKanji} hybrid FP exceeds descriptor FP.`,
      {
        descriptorFalsePositive: fold.descriptorMetrics.falsePositive,
        hybridFalsePositive: fold.hybridMetrics.falsePositive,
      },
    );
  }

  if (
    !Number.isInteger(fold.trainingFeatureCount) ||
    fold.trainingFeatureCount <= 0
  ) {
    addIssue(
      failures,
      "invalid_training_feature_count",
      `Fold ${fold.heldOutKanji} has an invalid training feature count.`,
    );
  }

  if (fold.dimensionCount !== fold.trainingFeatureCount * 2) {
    addIssue(
      failures,
      "fold_dimension_count_mismatch",
      `Fold ${fold.heldOutKanji} dimensionCount=` +
        `${fold.dimensionCount}, expected ` +
        `${fold.trainingFeatureCount * 2}.`,
    );
  }

  if (
    !Number.isInteger(fold.unseenEvaluationFeatureCount) ||
    fold.unseenEvaluationFeatureCount < 0
  ) {
    addIssue(
      failures,
      "invalid_unseen_feature_count",
      `Fold ${fold.heldOutKanji} has an invalid unseen feature count.`,
    );
  }

  if (
    Array.isArray(fold.unseenEvaluationFeatures) &&
    fold.unseenEvaluationFeatures.length !== fold.unseenEvaluationFeatureCount
  ) {
    addIssue(
      failures,
      "unseen_feature_count_mismatch",
      `Fold ${fold.heldOutKanji} unseen feature list length ` +
        `does not match its stored count.`,
    );
  }

  return failures;
}

function evaluateLoocvQualityGate({
  report,
  expectedFoldCount = DEFAULT_EXPECTED_FOLD_COUNT,
  expectedRowCount = DEFAULT_EXPECTED_ROW_COUNT,
  minimumFpReduction = DEFAULT_MINIMUM_FP_REDUCTION,
}) {
  const technicalFailures = [];
  const candidateFailures = [];
  const warnings = [];

  if (report === null || typeof report !== "object") {
    addIssue(
      technicalFailures,
      "invalid_report",
      "LOOCV report must be an object.",
    );

    return {
      technicalGatePassed: false,
      candidateGatePassed: false,
      productionPromotionReady: false,
      technicalFailures,
      candidateFailures,
      warnings,
      observed: {},
    };
  }

  if (report.schemaVersion !== 1) {
    addIssue(
      technicalFailures,
      "unsupported_schema_version",
      `Expected schemaVersion=1, actual=${report.schemaVersion}.`,
    );
  }

  if (report.strategy !== "leave_one_target_kanji_out") {
    addIssue(
      technicalFailures,
      "unexpected_strategy",
      `Unexpected strategy: ${report.strategy}.`,
    );
  }

  if (report.partialExecution !== false) {
    addIssue(
      technicalFailures,
      "partial_execution",
      "A complete LOOCV quality gate requires partialExecution=false.",
    );
  }

  if (report.integrity?.passed !== true) {
    addIssue(
      technicalFailures,
      "source_integrity_failed",
      "LOOCV report integrity.passed is not true.",
    );
  }

  if (report.dataset?.rowCount !== expectedRowCount) {
    addIssue(
      technicalFailures,
      "dataset_row_count_mismatch",
      `Dataset rowCount=${report.dataset?.rowCount}, ` +
        `expected ${expectedRowCount}.`,
    );
  }

  if (report.executedFoldCount !== expectedFoldCount) {
    addIssue(
      technicalFailures,
      "executed_fold_count_mismatch",
      `executedFoldCount=${report.executedFoldCount}, ` +
        `expected ${expectedFoldCount}.`,
    );
  }

  if (!Array.isArray(report.folds)) {
    addIssue(
      technicalFailures,
      "missing_folds",
      "LOOCV report folds must be an array.",
    );

    return {
      technicalGatePassed: false,
      candidateGatePassed: false,
      productionPromotionReady: false,
      technicalFailures,
      candidateFailures,
      warnings,
      observed: {},
    };
  }

  if (report.folds.length !== expectedFoldCount) {
    addIssue(
      technicalFailures,
      "stored_fold_count_mismatch",
      `Stored folds=${report.folds.length}, ` +
        `expected ${expectedFoldCount}.`,
    );
  }

  const heldOutKanjis = report.folds.map((fold) => fold.heldOutKanji);

  if (new Set(heldOutKanjis).size !== heldOutKanjis.length) {
    addIssue(
      technicalFailures,
      "duplicate_held_out_kanji",
      "Held-out kanjis contain duplicates.",
    );
  }

  for (const fold of report.folds) {
    technicalFailures.push(
      ...validateFold({
        fold,
        expectedSourceRowCount: expectedRowCount,
      }),
    );
  }

  const evaluatedRowCount = report.folds.reduce(
    (total, fold) =>
      total +
      (Number.isInteger(fold.evaluationRowCount) ? fold.evaluationRowCount : 0),
    0,
  );

  if (evaluatedRowCount !== expectedRowCount) {
    addIssue(
      technicalFailures,
      "aggregate_evaluation_row_count_mismatch",
      `The folds evaluate ${evaluatedRowCount} rows, ` +
        `expected ${expectedRowCount}.`,
      {
        evaluatedRowCount,
        expectedRowCount,
      },
    );
  }

  const recalculatedDescriptor = sumFoldMetrics(
    report.folds,
    "descriptorMetrics",
  );

  const recalculatedPureMl = sumFoldMetrics(report.folds, "pureMlMetrics");

  const recalculatedHybrid = sumFoldMetrics(report.folds, "hybridMetrics");

  technicalFailures.push(
    ...compareConfusionMatrices({
      actual: report.aggregate?.descriptorMetrics ?? {},
      expected: recalculatedDescriptor,
      location: "aggregate.descriptorMetrics",
    }),
  );

  technicalFailures.push(
    ...compareConfusionMatrices({
      actual: report.aggregate?.pureMlMetrics ?? {},
      expected: recalculatedPureMl,
      location: "aggregate.pureMlMetrics",
    }),
  );

  technicalFailures.push(
    ...compareConfusionMatrices({
      actual: report.aggregate?.hybridMetrics ?? {},
      expected: recalculatedHybrid,
      location: "aggregate.hybridMetrics",
    }),
  );

  const aggregateDescriptor = recalculatedDescriptor;

  const aggregateHybrid = recalculatedHybrid;

  const aggregateFpReduction =
    aggregateDescriptor.falsePositive - aggregateHybrid.falsePositive;

  const kanjiWithHybridFalseNegatives = getKanjiWithHybridFalseNegatives(
    report.folds,
  );

  const kanjiWithFpImprovement = getKanjiWithFpImprovement(report.folds);

  const kanjiWithFpRegression = getKanjiWithFpRegression(report.folds);

  if (aggregateDescriptor.falseNegative !== 0) {
    addIssue(
      technicalFailures,
      "descriptor_has_false_negatives",
      `Descriptor aggregate FN=${aggregateDescriptor.falseNegative}, expected 0.`,
    );
  }

  if (aggregateHybrid.falseNegative !== 0) {
    addIssue(
      candidateFailures,
      "aggregate_hybrid_not_fn_safe",
      `Aggregate hybrid FN=${aggregateHybrid.falseNegative}, expected 0.`,
      {
        falseNegative: aggregateHybrid.falseNegative,
        affectedKanjis: kanjiWithHybridFalseNegatives,
      },
    );
  }

  if (kanjiWithHybridFalseNegatives.length > 0) {
    addIssue(
      candidateFailures,
      "folds_with_hybrid_false_negatives",
      `${kanjiWithHybridFalseNegatives.length} folds contain hybrid false negatives.`,
      {
        folds: kanjiWithHybridFalseNegatives,
      },
    );
  }

  if (aggregateFpReduction < minimumFpReduction) {
    addIssue(
      candidateFailures,
      "aggregate_fp_reduction_below_minimum",
      `Aggregate FP reduction=${aggregateFpReduction}, ` +
        `minimum=${minimumFpReduction}.`,
    );
  }

  if (kanjiWithFpRegression.length > 0) {
    addIssue(
      technicalFailures,
      "fold_fp_regression_impossible_for_and_rule",
      "One or more folds have hybrid FP greater than descriptor FP.",
      {
        folds: kanjiWithFpRegression,
      },
    );
  }

  if (
    report.assessment?.aggregateHybridFalseNegativeSafe !==
    (aggregateHybrid.falseNegative === 0)
  ) {
    addIssue(
      technicalFailures,
      "assessment_fn_safe_mismatch",
      "assessment.aggregateHybridFalseNegativeSafe does not match the aggregate metrics.",
    );
  }

  if (report.assessment?.aggregateHybridFpReduction !== aggregateFpReduction) {
    addIssue(
      technicalFailures,
      "assessment_fp_reduction_mismatch",
      `assessment.aggregateHybridFpReduction=` +
        `${report.assessment?.aggregateHybridFpReduction}, ` +
        `calculated=${aggregateFpReduction}.`,
    );
  }

  if (
    report.assessment?.aggregateHybridFpImprovement !==
    aggregateFpReduction > 0
  ) {
    addIssue(
      technicalFailures,
      "assessment_fp_improvement_mismatch",
      "assessment.aggregateHybridFpImprovement does not match the aggregate metrics.",
    );
  }

  warnings.push({
    code: "threshold_calibrated_on_outer_training",
    message:
      "Each threshold was calibrated on the same outer training partition used to fit its model.",
  });

  warnings.push({
    code: "small_folds_present",
    message:
      "Some held-out kanjis contain very few positive or negative samples.",
  });

  warnings.push({
    code: "external_dataset_still_required",
    message:
      "A separately reserved external unseen-kanji dataset is still required.",
  });

  if (kanjiWithHybridFalseNegatives.length > 0) {
    warnings.push({
      code: "hybrid_false_negative_diagnosis_required",
      message:
        "The rejected positive samples must be diagnosed before considering another candidate.",
      details: {
        folds: kanjiWithHybridFalseNegatives,
      },
    });
  }

  const technicalGatePassed = technicalFailures.length === 0;

  const candidateGatePassed =
    technicalGatePassed && candidateFailures.length === 0;

  return {
    technicalGatePassed,
    candidateGatePassed,
    productionPromotionReady: candidateGatePassed,
    technicalFailures,
    candidateFailures,
    warnings,
    requirements: {
      expectedFoldCount,
      expectedRowCount,
      minimumFpReduction,
      aggregateHybridFalseNegative: 0,
      foldsWithHybridFalseNegatives: 0,
    },
    observed: {
      executedFoldCount: report.executedFoldCount,
      storedFoldCount: report.folds.length,
      evaluatedRowCount,
      descriptorMetrics: aggregateDescriptor,
      pureMlMetrics: recalculatedPureMl,
      hybridMetrics: aggregateHybrid,
      aggregateFpReduction,
      kanjiWithHybridFalseNegatives,
      kanjiWithFpImprovement,
      kanjiWithFpRegression,
      foldsWithHybridFalseNegativeCount: kanjiWithHybridFalseNegatives.length,
      foldsWithFpImprovementCount: kanjiWithFpImprovement.length,
      foldsWithFpRegressionCount: kanjiWithFpRegression.length,
    },
  };
}

function formatMetrics(metrics) {
  return (
    `TP=${metrics.truePositive}, ` +
    `TN=${metrics.trueNegative}, ` +
    `FP=${metrics.falsePositive}, ` +
    `FN=${metrics.falseNegative}`
  );
}

function printIssues(title, issues) {
  console.log("");
  console.log(title);
  console.log("-".repeat(title.length));

  if (issues.length === 0) {
    console.log("None");
    return;
  }

  for (const issue of issues) {
    console.log(`- [${issue.code}] ${issue.message}`);
  }
}

function printQualityGate({ reportPath, reportSha256, result }) {
  console.log("");
  console.log("REFERENCE CANDIDATE LOGISTIC LOOCV QUALITY GATE");

  console.log("================================================");

  console.log(`Report: ${reportPath}`);

  console.log(`Report SHA-256: ${reportSha256}`);

  console.log("");
  console.log("Requirements");
  console.log("------------");

  console.log(`Expected folds: ` + `${result.requirements.expectedFoldCount}`);

  console.log(
    `Expected evaluated rows: ` + `${result.requirements.expectedRowCount}`,
  );

  console.log(
    `Minimum aggregate FP reduction: ` +
      `${result.requirements.minimumFpReduction}`,
  );

  console.log("Required aggregate hybrid FN: 0");

  console.log("Required folds with hybrid FN: 0");

  console.log("");
  console.log("Observed");
  console.log("--------");

  console.log(`Executed folds: ` + `${result.observed.executedFoldCount}`);

  console.log(`Evaluated rows: ` + `${result.observed.evaluatedRowCount}`);

  console.log(
    `Descriptor: ${formatMetrics(result.observed.descriptorMetrics)}`,
  );

  console.log(`Pure ML: ${formatMetrics(result.observed.pureMlMetrics)}`);

  console.log(`Hybrid: ${formatMetrics(result.observed.hybridMetrics)}`);

  console.log(
    `Aggregate FP reduction: ` + `${result.observed.aggregateFpReduction}`,
  );

  console.log(
    `Folds with hybrid FN: ` +
      `${result.observed.foldsWithHybridFalseNegativeCount}`,
  );

  console.log(
    `Hybrid FN kanjis: ` +
      `${
        result.observed.kanjiWithHybridFalseNegatives
          .map((fold) => `${fold.heldOutKanji}(${fold.falseNegative})`)
          .join(", ") || "none"
      }`,
  );

  console.log(
    `Folds with FP improvement: ` +
      `${result.observed.foldsWithFpImprovementCount}`,
  );

  console.log(
    `FP improvement kanjis: ` +
      `${
        result.observed.kanjiWithFpImprovement
          .map(
            (fold) => `${fold.heldOutKanji}(-${fold.falsePositiveReduction})`,
          )
          .join(", ") || "none"
      }`,
  );

  console.log(
    `Folds with FP regression: ` +
      `${result.observed.foldsWithFpRegressionCount}`,
  );

  console.log("");
  console.log("Decision");
  console.log("--------");

  console.log(`Technical failures: ` + `${result.technicalFailures.length}`);

  console.log(`Candidate failures: ` + `${result.candidateFailures.length}`);

  console.log(`Warnings: ` + `${result.warnings.length}`);

  console.log(`Technical gate passed: ` + `${result.technicalGatePassed}`);

  console.log(`Candidate gate passed: ` + `${result.candidateGatePassed}`);

  console.log(
    `Production promotion ready: ` + `${result.productionPromotionReady}`,
  );

  printIssues("Technical failures", result.technicalFailures);

  printIssues("Candidate failures", result.candidateFailures);

  printIssues("Warnings", result.warnings);
}

function main(argv = process.argv.slice(2)) {
  try {
    const options = parseArguments(argv);

    if (options.help) {
      printHelp();
      return;
    }

    validateOptions(options);

    const report = readJson(options.reportPath, "LOOCV evaluation report");

    const result = evaluateLoocvQualityGate({
      report,
      expectedFoldCount: options.expectedFoldCount,
      expectedRowCount: options.expectedRowCount,
      minimumFpReduction: options.minimumFpReduction,
    });

    printQualityGate({
      reportPath: options.reportPath,
      reportSha256: calculateFileSha256(options.reportPath),
      result,
    });

    if (!result.technicalGatePassed) {
      process.exitCode = 1;
      return;
    }

    console.log("");

    if (result.candidateGatePassed) {
      console.log("LOOCV candidate quality gate passed.");
    } else {
      console.log(
        "LOOCV experiment is technically valid, " +
          "but candidate promotion remains blocked.",
      );
    }
  } catch (error) {
    console.error("");

    console.error(`LOOCV quality gate failed: ${error.message}`);

    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  DEFAULT_EXPECTED_FOLD_COUNT,
  DEFAULT_EXPECTED_ROW_COUNT,
  DEFAULT_MINIMUM_FP_REDUCTION,
  parseArguments,
  validateOptions,
  assertFileExists,
  readJson,
  calculateFileSha256,
  calculateConfusionMatrixRowCount,
  validateMetricObject,
  validateMetricRowCount,
  sumFoldMetrics,
  compareConfusionMatrices,
  getKanjiWithHybridFalseNegatives,
  getKanjiWithFpImprovement,
  getKanjiWithFpRegression,
  validateFold,
  evaluateLoocvQualityGate,
  formatMetrics,
  main,
};
