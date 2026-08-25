const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");
const { REFERENCE_CATALOG_PATH } = require("../services/kanji_reference_paths");

const DEFAULT_KANJI_DATASET_PATH = REFERENCE_CATALOG_PATH;

function parseArgs(argv) {
  const options = {
    batchSummaryPath: null,
    descriptorPath: null,
    filePath: null,
    datasetPath: DEFAULT_KANJI_DATASET_PATH,
    outputDirectory: null,
    continueOnError: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];

    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }

    if (argument === "--batch-summary") {
      options.batchSummaryPath = path.resolve(argv[index + 1]);
      index++;
      continue;
    }

    if (argument === "--descriptor-file") {
      options.descriptorPath = path.resolve(argv[index + 1]);
      index++;
      continue;
    }

    if (argument === "--file") {
      options.filePath = path.resolve(argv[index + 1]);
      index++;
      continue;
    }

    if (argument === "--dataset") {
      options.datasetPath = path.resolve(argv[index + 1]);
      index++;
      continue;
    }

    if (argument === "--out-dir") {
      options.outputDirectory = path.resolve(argv[index + 1]);
      index++;
      continue;
    }

    if (argument === "--continue-on-error") {
      options.continueOnError = true;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return options;
}

function printHelp() {
  console.log(`
Run FP constraint suggestion batch for generated reference candidates

Usage:
  node scripts/run_reference_candidate_fp_constraint_suggestion_batch.js \\
    --batch-summary ./candidate_reports_training/reference_descriptor_candidate_pipeline_batch_summary.json \\
    --descriptor-file ./data/kanji_descriptors.json \\
    --file ./training_data.jsonl \\
    --dataset ./data/kanji_reference_catalog.json \\
    --dataset <path> \\
        Path to the canonical kanji reference catalog. \\
        Default: ./data/kanji_reference_catalog.json \\
    --out-dir ./candidate_reports_training \\
    --continue-on-error

This script:
  1. Reads the reference candidate batch summary.
  2. Selects safe but permissive candidates.
  3. Generates FP-safe constraint suggestions.
  4. Evaluates the top suggestion for each candidate.
  5. Writes a batch summary with before/after FP/FN/TP/TN.
`);
}

function validateOptions(options) {
  if (options.help) {
    return;
  }

  if (!options.batchSummaryPath) {
    throw new Error("Missing --batch-summary <path>");
  }

  if (!options.descriptorPath) {
    throw new Error("Missing --descriptor-file <path>");
  }

  if (!options.filePath) {
    throw new Error("Missing --file <path>");
  }

  if (!options.outputDirectory) {
    throw new Error("Missing --out-dir <path>");
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), {
    recursive: true,
  });

  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function runNodeScript(scriptPath, args) {
  const commandArgs = [scriptPath, ...args];

  console.log("");
  console.log(`> node ${commandArgs.join(" ")}`);

  const result = childProcess.spawnSync(process.execPath, commandArgs, {
    stdio: "inherit",
    shell: false,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      `Script failed with exit code ${result.status}: ${scriptPath}`,
    );
  }
}

function getPermissiveRows(batchSummary) {
  return (batchSummary.rows ?? []).filter(
    (row) =>
      row.status === "ok" &&
      row.safeAgainstFalseNegatives === true &&
      row.clean === false &&
      (row.falsePositive ?? 0) > 0,
  );
}

function getCandidateDescriptorPath({ kanji, outputDirectory }) {
  return path.join(
    outputDirectory,
    `${kanji}_descriptor_candidate_from_reference.json`,
  );
}

function getCalibrationReportPath({ kanji, outputDirectory }) {
  return path.join(
    outputDirectory,
    `${kanji}_reference_candidate_calibration_report.json`,
  );
}

function getSuggestionsPath({ kanji, outputDirectory }) {
  return path.join(
    outputDirectory,
    `${kanji}_reference_candidate_fp_constraint_suggestions.json`,
  );
}

function getEvaluationSummaryPath({ kanji, outputDirectory }) {
  return path.join(
    outputDirectory,
    `${kanji}_reference_candidate_evaluation_summary.json`,
  );
}

function getBatchResultPath(outputDirectory) {
  return path.join(
    outputDirectory,
    "reference_candidate_fp_constraint_suggestion_batch_summary.json",
  );
}

function runSuggestionGeneration({ kanji, outputDirectory }) {
  runNodeScript(
    path.join("scripts", "suggest_reference_candidate_fp_constraints.js"),
    [
      "--calibration-report",
      getCalibrationReportPath({
        kanji,
        outputDirectory,
      }),
      "--out-json",
      getSuggestionsPath({
        kanji,
        outputDirectory,
      }),
    ],
  );
}

function runTopSuggestionEvaluation({
  kanji,
  outputDirectory,
  descriptorPath,
  filePath,
  datasetPath,
}) {
  runNodeScript(
    path.join(
      "scripts",
      "evaluate_reference_candidate_fp_constraint_suggestion.js",
    ),
    [
      "--kanji",
      kanji,
      "--candidate-descriptor",
      getCandidateDescriptorPath({
        kanji,
        outputDirectory,
      }),
      "--suggestions",
      getSuggestionsPath({
        kanji,
        outputDirectory,
      }),
      "--suggestion-index",
      "0",
      "--descriptor-file",
      descriptorPath,
      "--file",
      filePath,
      "--dataset",
      datasetPath,
      "--out-dir",
      outputDirectory,
    ],
  );
}

function buildNoSuggestionRow(baseRow, suggestionsReport) {
  return {
    kanji: baseRow.kanji,

    status: "no_suggestion",

    before: {
      truePositive: baseRow.truePositive ?? 0,
      falseNegative: baseRow.falseNegative ?? 0,
      trueNegative: baseRow.trueNegative ?? 0,
      falsePositive: baseRow.falsePositive ?? 0,
    },

    suggestionCount: suggestionsReport.suggestionCount ?? 0,

    message: "No FP-safe suggestion was available.",
  };
}

function buildEvaluationRow({ baseRow, suggestion, afterSummary }) {
  const afterClassifications = afterSummary.classifications ?? {};

  const before = {
    truePositive: baseRow.truePositive ?? 0,
    falseNegative: baseRow.falseNegative ?? 0,
    trueNegative: baseRow.trueNegative ?? 0,
    falsePositive: baseRow.falsePositive ?? 0,
  };

  const after = {
    truePositive: afterClassifications.truePositive ?? 0,
    falseNegative: afterClassifications.falseNegative ?? 0,
    trueNegative: afterClassifications.trueNegative ?? 0,
    falsePositive: afterClassifications.falsePositive ?? 0,
  };

  const actualFalsePositiveReduction =
    before.falsePositive - after.falsePositive;

  const actualFalseNegativeIncrease =
    after.falseNegative - before.falseNegative;

  const actualTruePositiveLoss = before.truePositive - after.truePositive;

  return {
    kanji: baseRow.kanji,

    status: "ok",

    metricPath: suggestion.metricPath,

    max: suggestion.max,

    suggestedFalsePositiveReduction:
      suggestion.evidence?.falsePositiveReduction ?? null,

    suggestedTruePositiveLoss: suggestion.evidence?.truePositiveLoss ?? null,

    before,
    after,

    actualFalsePositiveReduction,
    actualFalseNegativeIncrease,
    actualTruePositiveLoss,

    safe: actualFalseNegativeIncrease <= 0 && actualTruePositiveLoss <= 0,

    remainingFalsePositive: after.falsePositive,

    recommendation: afterSummary.recommendation ?? "unknown",
  };
}

function buildBatchSummary({ sourceBatchSummary, rows, errors }) {
  const okRows = rows.filter((row) => row.status === "ok");

  const noSuggestionRows = rows.filter((row) => row.status === "no_suggestion");

  const safeRows = okRows.filter((row) => row.safe);

  const totalFalsePositiveBefore = okRows.reduce(
    (total, row) => total + row.before.falsePositive,
    0,
  );

  const totalFalsePositiveAfter = okRows.reduce(
    (total, row) => total + row.after.falsePositive,
    0,
  );

  const totalFalsePositiveReduction = okRows.reduce(
    (total, row) => total + row.actualFalsePositiveReduction,
    0,
  );

  const totalFalseNegativeIncrease = okRows.reduce(
    (total, row) => total + row.actualFalseNegativeIncrease,
    0,
  );

  const totalTruePositiveLoss = okRows.reduce(
    (total, row) => total + row.actualTruePositiveLoss,
    0,
  );

  return {
    generatedAt: new Date().toISOString(),

    mode: "reference_candidate_fp_constraint_suggestion_batch_summary",

    sourceMode: sourceBatchSummary.mode ?? null,

    targetCount: rows.length,

    evaluatedCount: okRows.length,

    noSuggestionCount: noSuggestionRows.length,

    errorCount: errors.length,

    safeEvaluationCount: safeRows.length,

    totalFalsePositiveBefore,
    totalFalsePositiveAfter,
    totalFalsePositiveReduction,

    totalFalseNegativeIncrease,
    totalTruePositiveLoss,

    passed:
      errors.length === 0 &&
      totalFalseNegativeIncrease <= 0 &&
      totalTruePositiveLoss <= 0,

    rows,
    errors,
  };
}

function printBatchSummary(summary) {
  console.log("");
  console.log("REFERENCE CANDIDATE FP CONSTRAINT SUGGESTION BATCH");
  console.log("==================================================");
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
  console.log(`Passed: ${summary.passed}`);

  console.log("");

  for (const row of summary.rows) {
    if (row.status !== "ok") {
      console.log(`${row.kanji}: ${row.status}`);
      continue;
    }

    console.log(
      [
        `${row.kanji}:`,
        `FP ${row.before.falsePositive}->${row.after.falsePositive}`,
        `reduction=${row.actualFalsePositiveReduction}`,
        `FN increase=${row.actualFalseNegativeIncrease}`,
        `TP loss=${row.actualTruePositiveLoss}`,
        `metric=${row.metricPath}`,
      ].join(" "),
    );
  }
}

function runBatch(options) {
  fs.mkdirSync(options.outputDirectory, {
    recursive: true,
  });

  const sourceBatchSummary = readJson(options.batchSummaryPath);

  const targets = getPermissiveRows(sourceBatchSummary);

  const rows = [];
  const errors = [];

  for (const target of targets) {
    const kanji = target.kanji;

    try {
      runSuggestionGeneration({
        kanji,
        outputDirectory: options.outputDirectory,
      });

      const suggestionsReport = readJson(
        getSuggestionsPath({
          kanji,
          outputDirectory: options.outputDirectory,
        }),
      );

      const topSuggestion = suggestionsReport.suggestions?.[0];

      if (!topSuggestion) {
        rows.push(buildNoSuggestionRow(target, suggestionsReport));
        continue;
      }

      runTopSuggestionEvaluation({
        kanji,
        outputDirectory: options.outputDirectory,
        descriptorPath: options.descriptorPath,
        filePath: options.filePath,
        datasetPath: options.datasetPath,
      });

      const afterSummary = readJson(
        getEvaluationSummaryPath({
          kanji,
          outputDirectory: options.outputDirectory,
        }),
      );

      rows.push(
        buildEvaluationRow({
          baseRow: target,
          suggestion: topSuggestion,
          afterSummary,
        }),
      );
    } catch (error) {
      const errorEntry = {
        kanji,
        message: error.message,
      };

      errors.push(errorEntry);

      rows.push({
        kanji,
        status: "error",
        errorMessage: error.message,
      });

      if (!options.continueOnError) {
        throw error;
      }
    }
  }

  const summary = buildBatchSummary({
    sourceBatchSummary,
    rows,
    errors,
  });

  const outputPath = getBatchResultPath(options.outputDirectory);

  writeJson(outputPath, summary);

  printBatchSummary(summary);

  console.log("");
  console.log(`Batch summary saved to: ${outputPath}`);

  return summary;
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  validateOptions(options);

  if (options.help) {
    printHelp();
    return;
  }

  runBatch(options);
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
  DEFAULT_KANJI_DATASET_PATH,
  parseArgs,
  validateOptions,
  getPermissiveRows,
  getCandidateDescriptorPath,
  getCalibrationReportPath,
  getSuggestionsPath,
  getEvaluationSummaryPath,
  getBatchResultPath,
  buildNoSuggestionRow,
  buildEvaluationRow,
  buildBatchSummary,
};
