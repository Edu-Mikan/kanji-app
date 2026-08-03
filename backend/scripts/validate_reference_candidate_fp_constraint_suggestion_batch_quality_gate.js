const fs = require("node:fs");
const path = require("node:path");

function parseArgs(argv) {
  const options = {
    summaryPath: null,
    help: false,
  };

  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];

    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }

    if (argument === "--summary") {
      options.summaryPath = path.resolve(argv[index + 1]);
      index++;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return options;
}

function printHelp() {
  console.log(`
Validate FP constraint suggestion batch quality gate

Usage:
  node scripts/validate_reference_candidate_fp_constraint_suggestion_batch_quality_gate.js \\
    --summary ./candidate_reports_training/reference_candidate_fp_constraint_suggestion_batch_summary.json

The gate fails when:
  - errorCount > 0
  - passed is not true
  - totalFalseNegativeIncrease > 0
  - totalTruePositiveLoss > 0

Remaining false positives do not fail this gate.
`);
}

function validateOptions(options) {
  if (options.help) {
    return;
  }

  if (!options.summaryPath) {
    throw new Error("Missing --summary <path>");
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function validateReferenceCandidateFpSuggestionBatchQualityGate(summary) {
  const failures = [];

  if (summary.passed !== true) {
    failures.push({
      code: "summary_not_passed",
      message: "Summary passed flag is not true.",
    });
  }

  if ((summary.errorCount ?? 0) > 0) {
    failures.push({
      code: "batch_errors",
      message: `Batch has ${summary.errorCount} processing error(s).`,
    });
  }

  if ((summary.totalFalseNegativeIncrease ?? 0) > 0) {
    failures.push({
      code: "false_negative_increase",
      message: `FP suggestion batch introduced ${summary.totalFalseNegativeIncrease} false negative(s).`,
    });
  }

  if ((summary.totalTruePositiveLoss ?? 0) > 0) {
    failures.push({
      code: "true_positive_loss",
      message: `FP suggestion batch lost ${summary.totalTruePositiveLoss} true positive(s).`,
    });
  }

  const unsafeRows = (summary.rows ?? []).filter(
    (row) => row.status === "ok" && row.safe !== true,
  );

  if (unsafeRows.length > 0) {
    failures.push({
      code: "unsafe_rows",
      message: `Batch has ${unsafeRows.length} unsafe evaluated row(s): ${unsafeRows
        .map((row) => row.kanji)
        .join(", ")}`,
    });
  }

  return {
    passed: failures.length === 0,

    failures,
  };
}

function printQualityGateResult({ summary, result }) {
  console.log("");
  console.log("REFERENCE CANDIDATE FP SUGGESTION BATCH QUALITY GATE");
  console.log("====================================================");

  console.log(`Targets: ${summary.targetCount}`);
  console.log(`Evaluated: ${summary.evaluatedCount}`);
  console.log(`No suggestion: ${summary.noSuggestionCount}`);
  console.log(`Errors: ${summary.errorCount}`);
  console.log(`Safe evaluations: ${summary.safeEvaluationCount}`);
  console.log(`FP before: ${summary.totalFalsePositiveBefore}`);
  console.log(`FP after: ${summary.totalFalsePositiveAfter}`);
  console.log(`FP reduction: ${summary.totalFalsePositiveReduction}`);
  console.log(`FN increase: ${summary.totalFalseNegativeIncrease}`);
  console.log(`TP loss: ${summary.totalTruePositiveLoss}`);

  console.log("");
  console.log(`Passed: ${result.passed}`);

  if (!result.passed) {
    console.log("");
    console.log("Failures:");

    for (const failure of result.failures) {
      console.log(`- ${failure.code}: ${failure.message}`);
    }
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  validateOptions(options);

  if (options.help) {
    printHelp();
    return;
  }

  if (!fs.existsSync(options.summaryPath)) {
    throw new Error(`Summary file not found: ${options.summaryPath}`);
  }

  const summary = readJson(options.summaryPath);

  const result =
    validateReferenceCandidateFpSuggestionBatchQualityGate(summary);

  printQualityGateResult({
    summary,
    result,
  });

  if (!result.passed) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error("");
    console.error("ERROR");
    console.error("-----");
    console.error(error.message);

    process.exitCode = 1;
  }
}

module.exports = {
  parseArgs,
  validateOptions,
  validateReferenceCandidateFpSuggestionBatchQualityGate,
};
