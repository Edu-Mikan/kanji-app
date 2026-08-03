const fs = require("node:fs");
const path = require("node:path");

function parseArgs(argv) {
  const options = {
    datasetPath: null,
    summaryPath: null,
    minRows: 1,
    minPositive: 1,
    minNegative: 1,
    minFeatures: 1,
    help: false,
  };

  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];

    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }

    if (argument === "--dataset") {
      options.datasetPath = path.resolve(argv[index + 1]);
      index++;
      continue;
    }

    if (argument === "--summary") {
      options.summaryPath = path.resolve(argv[index + 1]);
      index++;
      continue;
    }

    if (argument === "--min-rows") {
      options.minRows = Number(argv[index + 1]);
      index++;
      continue;
    }

    if (argument === "--min-positive") {
      options.minPositive = Number(argv[index + 1]);
      index++;
      continue;
    }

    if (argument === "--min-negative") {
      options.minNegative = Number(argv[index + 1]);
      index++;
      continue;
    }

    if (argument === "--min-features") {
      options.minFeatures = Number(argv[index + 1]);
      index++;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return options;
}

function printHelp() {
  console.log(`
Validate reference candidate ML dataset quality gate

Usage:
  node scripts/validate_reference_candidate_ml_dataset_quality_gate.js \\
    --dataset ./ml_datasets/reference_candidate_binary_dataset.jsonl \\
    --summary ./ml_datasets/reference_candidate_binary_dataset_summary.json

Options:
  --min-rows <number>
      Minimum number of dataset rows.
      Default: 1.

  --min-positive <number>
      Minimum number of positive labels.
      Default: 1.

  --min-negative <number>
      Minimum number of negative labels.
      Default: 1.

  --min-features <number>
      Minimum number of exported features.
      Default: 1.

The gate fails when:
  - dataset or summary is missing
  - summary.errorCount > 0
  - rowCount is below threshold
  - positiveCount is below threshold
  - negativeCount is below threshold
  - featureCount is below threshold
  - JSONL line count does not match summary.rowCount
  - featureNames is missing or empty
  - classificationCounts is missing
`);
}

function validateOptions(options) {
  if (options.help) {
    return;
  }

  if (!options.datasetPath) {
    throw new Error("Missing --dataset <path>");
  }

  if (!options.summaryPath) {
    throw new Error("Missing --summary <path>");
  }

  for (const [name, value] of [
    ["--min-rows", options.minRows],
    ["--min-positive", options.minPositive],
    ["--min-negative", options.minNegative],
    ["--min-features", options.minFeatures],
  ]) {
    if (!Number.isFinite(value)) {
      throw new Error(`${name} must be a finite number`);
    }

    if (value < 0) {
      throw new Error(`${name} must be greater than or equal to 0`);
    }
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function countJsonlRows(filePath) {
  const content = fs.readFileSync(filePath, "utf8").trim();

  if (!content) {
    return 0;
  }

  return content.split(/\r?\n/).filter(Boolean).length;
}

function validateMlDatasetQualityGate({
  summary,
  datasetRowCount,
  minRows = 1,
  minPositive = 1,
  minNegative = 1,
  minFeatures = 1,
}) {
  const failures = [];

  if ((summary.errorCount ?? 0) > 0) {
    failures.push({
      code: "dataset_export_errors",
      message: `Dataset export has ${summary.errorCount} error(s).`,
    });
  }

  if ((summary.rowCount ?? 0) < minRows) {
    failures.push({
      code: "row_count_below_minimum",
      message: `rowCount=${summary.rowCount ?? 0}, minimum=${minRows}.`,
    });
  }

  if ((summary.positiveCount ?? 0) < minPositive) {
    failures.push({
      code: "positive_count_below_minimum",
      message: `positiveCount=${summary.positiveCount ?? 0}, minimum=${minPositive}.`,
    });
  }

  if ((summary.negativeCount ?? 0) < minNegative) {
    failures.push({
      code: "negative_count_below_minimum",
      message: `negativeCount=${summary.negativeCount ?? 0}, minimum=${minNegative}.`,
    });
  }

  if ((summary.featureCount ?? 0) < minFeatures) {
    failures.push({
      code: "feature_count_below_minimum",
      message: `featureCount=${summary.featureCount ?? 0}, minimum=${minFeatures}.`,
    });
  }

  if ((summary.rowCount ?? 0) !== datasetRowCount) {
    failures.push({
      code: "jsonl_row_count_mismatch",
      message: `summary.rowCount=${summary.rowCount ?? 0}, datasetRows=${datasetRowCount}.`,
    });
  }

  if (
    !Array.isArray(summary.featureNames) ||
    summary.featureNames.length === 0
  ) {
    failures.push({
      code: "missing_feature_names",
      message: "summary.featureNames is empty or missing.",
    });
  }

  if (
    summary.classificationCounts == null ||
    typeof summary.classificationCounts !== "object" ||
    Array.isArray(summary.classificationCounts)
  ) {
    failures.push({
      code: "missing_classification_counts",
      message: "summary.classificationCounts is missing or invalid.",
    });
  }

  return {
    passed: failures.length === 0,

    failures,
  };
}

function printQualityGateResult({ summary, datasetRowCount, result }) {
  console.log("");
  console.log("REFERENCE CANDIDATE ML DATASET QUALITY GATE");
  console.log("===========================================");

  console.log(`Target kanjis: ${summary.targetKanjiCount}`);
  console.log(`Rows in summary: ${summary.rowCount}`);
  console.log(`Rows in dataset: ${datasetRowCount}`);
  console.log(`Positive labels: ${summary.positiveCount}`);
  console.log(`Negative labels: ${summary.negativeCount}`);
  console.log(`Features: ${summary.featureCount}`);
  console.log(`Errors: ${summary.errorCount}`);

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

  if (!fs.existsSync(options.datasetPath)) {
    throw new Error(`Dataset file not found: ${options.datasetPath}`);
  }

  if (!fs.existsSync(options.summaryPath)) {
    throw new Error(`Summary file not found: ${options.summaryPath}`);
  }

  const summary = readJson(options.summaryPath);

  const datasetRowCount = countJsonlRows(options.datasetPath);

  const result = validateMlDatasetQualityGate({
    summary,
    datasetRowCount,
    minRows: options.minRows,
    minPositive: options.minPositive,
    minNegative: options.minNegative,
    minFeatures: options.minFeatures,
  });

  printQualityGateResult({
    summary,
    datasetRowCount,
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
  countJsonlRows,
  validateMlDatasetQualityGate,
};
