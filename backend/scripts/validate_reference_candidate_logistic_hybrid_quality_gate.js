"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const DEFAULT_REPORT_PATH = path.resolve(
  process.cwd(),
  "ml_models",
  "reference_candidate_logistic_hybrid_evaluation_report.json",
);

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
    minimumFpReduction: DEFAULT_MINIMUM_FP_REDUCTION,
    requireTrainingFnSafe: true,
    requireValidationImprovement: true,
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

    if (argument === "--minimum-fp-reduction") {
      options.minimumFpReduction = Number(
        requireArgumentValue(argv, index, argument),
      );

      index++;
      continue;
    }

    if (argument === "--allow-training-fn") {
      options.requireTrainingFnSafe = false;

      continue;
    }

    if (argument === "--allow-no-validation-improvement") {
      options.requireValidationImprovement = false;

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
REFERENCE CANDIDATE LOGISTIC HYBRID QUALITY GATE

Usage:
  node scripts/validate_reference_candidate_logistic_hybrid_quality_gate.js

Options:
  --report <path>
      Hybrid evaluation report.

      Default:
      ./ml_models/reference_candidate_logistic_hybrid_evaluation_report.json

  --minimum-fp-reduction <number>
      Minimum validation FP reduction versus the descriptor.

      Default: 1

  --allow-training-fn
      Do not require training FN = 0.

  --allow-no-validation-improvement
      Require only FP non-regression, not strict improvement.

  --help, -h
      Show this help.

This gate validates the development experiment.

Passing this gate does not mean that the model is ready for
production. Unseen-kanji evaluation remains mandatory.
`);
}

function validateOptions(options) {
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

function addFailure(failures, code, message) {
  failures.push({
    code,
    message,
  });
}

function validateMetricObject({ metrics, partitionName, evaluatorName }) {
  const failures = [];

  if (metrics === null || typeof metrics !== "object") {
    addFailure(
      failures,
      "missing_metrics",
      `${partitionName}.${evaluatorName} metrics are missing.`,
    );

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
      addFailure(
        failures,
        "invalid_metric_count",
        `${partitionName}.${evaluatorName}.${countName} ` +
          `must be a non-negative integer.`,
      );
    }
  }

  return failures;
}

function validateConfusionMatrix({
  metrics,
  expectedRowCount,
  partitionName,
  evaluatorName,
}) {
  const failures = validateMetricObject({
    metrics,
    partitionName,
    evaluatorName,
  });

  if (failures.length > 0) {
    return failures;
  }

  const actualRowCount =
    metrics.truePositive +
    metrics.trueNegative +
    metrics.falsePositive +
    metrics.falseNegative;

  if (actualRowCount !== expectedRowCount) {
    addFailure(
      failures,
      "confusion_matrix_row_count_mismatch",
      `${partitionName}.${evaluatorName} confusion matrix ` +
        `contains ${actualRowCount} rows, expected ${expectedRowCount}.`,
    );
  }

  if (metrics.rowCount !== undefined && metrics.rowCount !== expectedRowCount) {
    addFailure(
      failures,
      "stored_row_count_mismatch",
      `${partitionName}.${evaluatorName}.rowCount=` +
        `${metrics.rowCount}, expected ${expectedRowCount}.`,
    );
  }

  return failures;
}

function evaluateHybridQualityGate({
  report,
  minimumFpReduction = DEFAULT_MINIMUM_FP_REDUCTION,
  requireTrainingFnSafe = true,
  requireValidationImprovement = true,
}) {
  const failures = [];
  const warnings = [];

  if (report === null || typeof report !== "object") {
    return {
      passed: false,
      failures: [
        {
          code: "invalid_report",
          message: "Hybrid evaluation report must be an object.",
        },
      ],
      warnings,
      productionPromotionReady: false,
    };
  }

  if (report.schemaVersion !== 1) {
    addFailure(
      failures,
      "unsupported_schema_version",
      `Expected schemaVersion=1, actual=${report.schemaVersion}.`,
    );
  }

  if (report.decisionRule?.name !== "descriptor_and_logistic_fn_safe") {
    addFailure(
      failures,
      "unexpected_decision_rule",
      `Unexpected decision rule: ${report.decisionRule?.name}.`,
    );
  }

  const threshold = report.decisionRule?.threshold;

  if (
    typeof threshold !== "number" ||
    !Number.isFinite(threshold) ||
    threshold < 0 ||
    threshold > 1
  ) {
    addFailure(
      failures,
      "invalid_threshold",
      `Invalid FN-safe threshold: ${threshold}.`,
    );
  }

  if (report.integrity?.passed !== true) {
    addFailure(
      failures,
      "source_integrity_failed",
      "Hybrid evaluation report integrity.passed is not true.",
    );
  }

  const trainingRowCount = report.partitions?.trainingRowCount;

  const validationRowCount = report.partitions?.validationRowCount;

  if (!Number.isInteger(trainingRowCount) || trainingRowCount <= 0) {
    addFailure(
      failures,
      "invalid_training_row_count",
      `Invalid training row count: ${trainingRowCount}.`,
    );
  }

  if (!Number.isInteger(validationRowCount) || validationRowCount <= 0) {
    addFailure(
      failures,
      "invalid_validation_row_count",
      `Invalid validation row count: ${validationRowCount}.`,
    );
  }

  if (Number.isInteger(trainingRowCount) && trainingRowCount > 0) {
    failures.push(
      ...validateConfusionMatrix({
        metrics: report.training?.descriptorMetrics,
        expectedRowCount: trainingRowCount,
        partitionName: "training",
        evaluatorName: "descriptor",
      }),
    );

    failures.push(
      ...validateConfusionMatrix({
        metrics: report.training?.pureMlMetrics,
        expectedRowCount: trainingRowCount,
        partitionName: "training",
        evaluatorName: "pureMl",
      }),
    );

    failures.push(
      ...validateConfusionMatrix({
        metrics: report.training?.hybridMetrics,
        expectedRowCount: trainingRowCount,
        partitionName: "training",
        evaluatorName: "hybrid",
      }),
    );
  }

  if (Number.isInteger(validationRowCount) && validationRowCount > 0) {
    failures.push(
      ...validateConfusionMatrix({
        metrics: report.validation?.descriptorMetrics,
        expectedRowCount: validationRowCount,
        partitionName: "validation",
        evaluatorName: "descriptor",
      }),
    );

    failures.push(
      ...validateConfusionMatrix({
        metrics: report.validation?.pureMlMetrics,
        expectedRowCount: validationRowCount,
        partitionName: "validation",
        evaluatorName: "pureMl",
      }),
    );

    failures.push(
      ...validateConfusionMatrix({
        metrics: report.validation?.hybridMetrics,
        expectedRowCount: validationRowCount,
        partitionName: "validation",
        evaluatorName: "hybrid",
      }),
    );
  }

  const trainingHybridMetrics = report.training?.hybridMetrics;

  const validationDescriptorMetrics = report.validation?.descriptorMetrics;

  const validationHybridMetrics = report.validation?.hybridMetrics;

  if (requireTrainingFnSafe && trainingHybridMetrics?.falseNegative !== 0) {
    addFailure(
      failures,
      "training_false_negative_regression",
      `Training hybrid falseNegative=` +
        `${trainingHybridMetrics?.falseNegative}, expected 0.`,
    );
  }

  if (validationHybridMetrics?.falseNegative !== 0) {
    addFailure(
      failures,
      "validation_false_negative_regression",
      `Validation hybrid falseNegative=` +
        `${validationHybridMetrics?.falseNegative}, expected 0.`,
    );
  }

  if (
    validationDescriptorMetrics &&
    validationHybridMetrics &&
    validationHybridMetrics.falsePositive >
      validationDescriptorMetrics.falsePositive
  ) {
    addFailure(
      failures,
      "validation_false_positive_regression",
      `Validation hybrid FP=` +
        `${validationHybridMetrics.falsePositive} exceeds ` +
        `descriptor FP=${validationDescriptorMetrics.falsePositive}.`,
    );
  }

  const calculatedFpReduction =
    validationDescriptorMetrics && validationHybridMetrics
      ? validationDescriptorMetrics.falsePositive -
        validationHybridMetrics.falsePositive
      : null;

  if (
    calculatedFpReduction !== null &&
    calculatedFpReduction < minimumFpReduction
  ) {
    addFailure(
      failures,
      "validation_fp_reduction_below_minimum",
      `Validation FP reduction=${calculatedFpReduction}, ` +
        `minimum=${minimumFpReduction}.`,
    );
  }

  if (
    requireValidationImprovement &&
    calculatedFpReduction !== null &&
    calculatedFpReduction <= 0
  ) {
    addFailure(
      failures,
      "missing_validation_fp_improvement",
      "Hybrid evaluation does not strictly improve validation FP.",
    );
  }

  if (
    report.assessment?.validationFalseNegativeSafe !==
    (validationHybridMetrics?.falseNegative === 0)
  ) {
    addFailure(
      failures,
      "assessment_fn_safe_mismatch",
      "assessment.validationFalseNegativeSafe does not match metrics.",
    );
  }

  if (
    report.assessment?.validationFalsePositiveReduction !==
    calculatedFpReduction
  ) {
    addFailure(
      failures,
      "assessment_fp_reduction_mismatch",
      `assessment.validationFalsePositiveReduction=` +
        `${report.assessment?.validationFalsePositiveReduction}, ` +
        `calculated=${calculatedFpReduction}.`,
    );
  }

  if (
    report.assessment?.validationFalsePositiveImprovement !==
    (calculatedFpReduction !== null && calculatedFpReduction > 0)
  ) {
    addFailure(
      failures,
      "assessment_fp_improvement_mismatch",
      "assessment.validationFalsePositiveImprovement does not match metrics.",
    );
  }

  if (
    report.assessment?.validationFalsePositiveNonRegression !==
    (calculatedFpReduction !== null && calculatedFpReduction >= 0)
  ) {
    addFailure(
      failures,
      "assessment_fp_non_regression_mismatch",
      "assessment.validationFalsePositiveNonRegression does not match metrics.",
    );
  }

  warnings.push({
    code: "row_level_development_evaluation_only",
    message: "The result was measured on a row-level development split.",
  });

  warnings.push({
    code: "threshold_selected_on_validation",
    message: "The FN-safe threshold was selected using validation labels.",
  });

  warnings.push({
    code: "unseen_kanji_evaluation_missing",
    message: "Leave-one-kanji-out evaluation has not been completed.",
  });

  warnings.push({
    code: "production_promotion_blocked",
    message: "Passing this gate does not authorize production promotion.",
  });

  return {
    passed: failures.length === 0,
    failures,
    warnings,
    requirements: {
      minimumFpReduction,
      requireTrainingFnSafe,
      requireValidationImprovement,
    },
    observed: {
      trainingFalseNegative: trainingHybridMetrics?.falseNegative ?? null,
      validationFalseNegative: validationHybridMetrics?.falseNegative ?? null,
      validationDescriptorFalsePositive:
        validationDescriptorMetrics?.falsePositive ?? null,
      validationHybridFalsePositive:
        validationHybridMetrics?.falsePositive ?? null,
      validationFpReduction: calculatedFpReduction,
    },
    productionPromotionReady: false,
  };
}

function printQualityGate({ reportPath, reportSha256, result }) {
  console.log("");
  console.log("REFERENCE CANDIDATE LOGISTIC HYBRID QUALITY GATE");
  console.log("================================================");

  console.log(`Report: ${reportPath}`);

  console.log(`Report SHA-256: ${reportSha256}`);

  console.log("");
  console.log("Requirements");
  console.log("------------");

  console.log(
    `Minimum validation FP reduction: ` +
      `${result.requirements.minimumFpReduction}`,
  );

  console.log(
    `Require training FN-safe: ` +
      `${result.requirements.requireTrainingFnSafe}`,
  );

  console.log(
    `Require validation improvement: ` +
      `${result.requirements.requireValidationImprovement}`,
  );

  console.log("");
  console.log("Observed");
  console.log("--------");

  console.log(
    `Training hybrid FN: ` + `${result.observed.trainingFalseNegative}`,
  );

  console.log(
    `Validation hybrid FN: ` + `${result.observed.validationFalseNegative}`,
  );

  console.log(
    `Validation descriptor FP: ` +
      `${result.observed.validationDescriptorFalsePositive}`,
  );

  console.log(
    `Validation hybrid FP: ` +
      `${result.observed.validationHybridFalsePositive}`,
  );

  console.log(
    `Validation FP reduction: ` + `${result.observed.validationFpReduction}`,
  );

  console.log("");
  console.log("Result");
  console.log("------");

  console.log(`Failures: ${result.failures.length}`);

  console.log(`Warnings: ${result.warnings.length}`);

  console.log(`Development gate passed: ${result.passed}`);

  console.log(
    `Production promotion ready: ` + `${result.productionPromotionReady}`,
  );

  if (result.failures.length > 0) {
    console.log("");
    console.log("Failures:");

    for (const failure of result.failures) {
      console.log(`- [${failure.code}] ${failure.message}`);
    }
  }

  console.log("");
  console.log("Warnings:");

  for (const warning of result.warnings) {
    console.log(`- [${warning.code}] ${warning.message}`);
  }
}

function main(argv = process.argv.slice(2)) {
  try {
    const options = parseArguments(argv);

    if (options.help) {
      printHelp();
      return;
    }

    validateOptions(options);

    const report = readJson(options.reportPath, "Hybrid evaluation report");

    const result = evaluateHybridQualityGate({
      report,
      minimumFpReduction: options.minimumFpReduction,
      requireTrainingFnSafe: options.requireTrainingFnSafe,
      requireValidationImprovement: options.requireValidationImprovement,
    });

    printQualityGate({
      reportPath: options.reportPath,
      reportSha256: calculateFileSha256(options.reportPath),
      result,
    });

    if (!result.passed) {
      process.exitCode = 1;
      return;
    }

    console.log("");
    console.log("Hybrid development quality gate passed.");
  } catch (error) {
    console.error("");
    console.error(`Hybrid quality gate failed: ${error.message}`);

    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  DEFAULT_MINIMUM_FP_REDUCTION,
  parseArguments,
  validateOptions,
  assertFileExists,
  readJson,
  calculateFileSha256,
  validateMetricObject,
  validateConfusionMatrix,
  evaluateHybridQualityGate,
  main,
};
