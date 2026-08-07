const fs = require("node:fs");
const path = require("node:path");

const REFERENCE_COMPARISON_METRICS = [
  "comparisonCost",
  "meanRoleCost",
  "maxRoleCost",
  "missingRoles",
];

const PER_ROLE_METRICS = [
  "comparisonCost",
  "angleAbsDiff",
  "centerDistance",
  "widthRelativeDiff",
  "heightRelativeDiff",
  "deltaXRelativeDiff",
  "deltaYRelativeDiff",
  "straightnessDiff",
];

function parseArgs(argv) {
  const options = {
    batchSummaryPath: null,
    reportsDirectory: null,
    trainingFilePath: null,
    outputJsonlPath: null,
    outputSummaryPath: null,
    includeOnlySafeCandidates: false,
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

    if (argument === "--reports-dir") {
      options.reportsDirectory = path.resolve(argv[index + 1]);
      index++;
      continue;
    }

    if (argument === "--file") {
      options.trainingFilePath = path.resolve(argv[index + 1]);
      index++;
      continue;
    }

    if (argument === "--out-jsonl") {
      options.outputJsonlPath = path.resolve(argv[index + 1]);
      index++;
      continue;
    }

    if (argument === "--out-summary") {
      options.outputSummaryPath = path.resolve(argv[index + 1]);
      index++;
      continue;
    }

    if (argument === "--safe-only") {
      options.includeOnlySafeCandidates = true;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return options;
}

function printHelp() {
  console.log(`
Export reference candidate ML dataset

Usage:
  node scripts/export_reference_candidate_ml_dataset.js \\
    --batch-summary ./candidate_reports_training/reference_descriptor_candidate_pipeline_batch_summary.json \\
    --reports-dir ./candidate_reports_training \\
    --file ./training_data.jsonl \\
    --out-jsonl ./ml_datasets/reference_candidate_binary_dataset.jsonl \\
    --out-summary ./ml_datasets/reference_candidate_binary_dataset_summary.json

Options:
  --safe-only
      Export only candidates marked as safeAgainstFalseNegatives=true.

This exports a binary supervised dataset for candidate-vs-reference acceptance modeling.
Label semantics:
  label = 1 for truePositive or falseNegative
  label = 0 for trueNegative or falsePositive
`);
}

function validateOptions(options) {
  if (options.help) {
    return;
  }

  if (!options.batchSummaryPath) {
    throw new Error("Missing --batch-summary <path>");
  }

  if (!options.reportsDirectory) {
    throw new Error("Missing --reports-dir <path>");
  }

  if (!options.trainingFilePath) {
    throw new Error("Missing --file <path>");
  }

  if (!options.outputJsonlPath) {
    throw new Error("Missing --out-jsonl <path>");
  }

  if (!options.outputSummaryPath) {
    throw new Error("Missing --out-summary <path>");
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readJsonl(filePath) {
  const content = fs.readFileSync(filePath, "utf8").trim();

  if (!content) {
    return [];
  }

  return content.split(/\r?\n/).filter(Boolean).map(JSON.parse);
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), {
    recursive: true,
  });

  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function writeJsonl(filePath, rows) {
  fs.mkdirSync(path.dirname(filePath), {
    recursive: true,
  });

  const content = rows.map((row) => JSON.stringify(row)).join("\n");

  fs.writeFileSync(filePath, `${content}\n`, "utf8");
}

function buildTrainingSampleIndex(samples) {
  return new Map(
    samples
      .filter((sample) => sample.recognitionId)
      .map((sample) => [sample.recognitionId, sample]),
  );
}

function getExpectedKanjiFromSample(sample) {
  return sample?.expectedKanji ?? sample?.kanji ?? null;
}

function getSampleCorrectness(sample) {
  if (typeof sample?.isCorrect === "boolean") {
    return sample.isCorrect;
  }

  if (typeof sample?.expectedCorrect === "boolean") {
    return sample.expectedCorrect;
  }

  if (typeof sample?.correct === "boolean") {
    return sample.correct;
  }

  return null;
}

function labelFromClassification(classification) {
  if (classification === "truePositive" || classification === "falseNegative") {
    return 1;
  }

  if (classification === "trueNegative" || classification === "falsePositive") {
    return 0;
  }

  return null;
}

function addNumericFeature(features, key, value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    features[key] = value;
  }
}

function flattenReferenceFeatures(evaluation) {
  const features = {};

  const referenceComparison = evaluation.referenceComparison ?? {};

  for (const metricName of REFERENCE_COMPARISON_METRICS) {
    addNumericFeature(
      features,
      `referenceComparison.${metricName}`,
      referenceComparison[metricName],
    );
  }

  const perRole = evaluation.perRoleReferenceComparison ?? {};

  for (const [roleKey, metrics] of Object.entries(perRole)) {
    for (const metricName of PER_ROLE_METRICS) {
      addNumericFeature(
        features,
        `perRole.${roleKey}.${metricName}`,
        metrics?.[metricName],
      );
    }
  }

  return features;
}

function getTargetRowsFromBatchSummary({
  batchSummary,
  includeOnlySafeCandidates,
}) {
  return (batchSummary.rows ?? [])
    .filter((row) => row.status === "ok")
    .filter(
      (row) =>
        !includeOnlySafeCandidates || row.safeAgainstFalseNegatives === true,
    );
}

function getCalibrationReportPath({ reportsDirectory, kanji }) {
  return path.join(
    reportsDirectory,
    `${kanji}_reference_candidate_calibration_report.json`,
  );
}

function buildDatasetRow({ targetKanji, evaluation, trainingSample }) {
  const label = labelFromClassification(evaluation.classification);

  if (label == null) {
    return null;
  }

  return {
    recognitionId: evaluation.recognitionId,

    targetKanji,

    expectedKanji: getExpectedKanjiFromSample(trainingSample),

    sampleIsCorrect: getSampleCorrectness(trainingSample),

    classification: evaluation.classification,

    label,

    features: flattenReferenceFeatures(evaluation),
  };
}

function buildDataset({
  batchSummary,
  reportsDirectory,
  trainingSamples,
  includeOnlySafeCandidates = false,
}) {
  const trainingSampleIndex = buildTrainingSampleIndex(trainingSamples);

  const targetRows = getTargetRowsFromBatchSummary({
    batchSummary,
    includeOnlySafeCandidates,
  });

  const rows = [];
  const errors = [];

  for (const target of targetRows) {
    const targetKanji = target.kanji;

    const reportPath = getCalibrationReportPath({
      reportsDirectory,
      kanji: targetKanji,
    });

    if (!fs.existsSync(reportPath)) {
      errors.push({
        kanji: targetKanji,
        message: `Calibration report not found: ${reportPath}`,
      });
      continue;
    }

    const calibrationReport = readJson(reportPath);

    for (const evaluation of calibrationReport.sampleEvaluations ?? []) {
      const trainingSample =
        trainingSampleIndex.get(evaluation.recognitionId) ?? null;

      const row = buildDatasetRow({
        targetKanji,
        evaluation,
        trainingSample,
      });

      if (row) {
        rows.push(row);
      }
    }
  }

  return {
    rows,
    errors,
    targetKanjis: targetRows.map((row) => row.kanji),
  };
}

function countBy(rows, selector) {
  const counts = {};

  for (const row of rows) {
    const key = selector(row);

    counts[key] = (counts[key] ?? 0) + 1;
  }

  return counts;
}

function collectFeatureNames(rows) {
  return [
    ...new Set(rows.flatMap((row) => Object.keys(row.features ?? {}))),
  ].sort();
}

function buildDatasetSummary({
  rows,
  errors,
  targetKanjis,
  includeOnlySafeCandidates,
}) {
  const positiveRows = rows.filter((row) => row.label === 1);

  const negativeRows = rows.filter((row) => row.label === 0);

  return {
    //generatedAt: new Date().toISOString(),

    mode: "reference_candidate_binary_ml_dataset",

    targetKanjiCount: targetKanjis.length,

    targetKanjis,

    includeOnlySafeCandidates,

    rowCount: rows.length,

    positiveCount: positiveRows.length,

    negativeCount: negativeRows.length,

    classificationCounts: countBy(rows, (row) => row.classification),

    labelCounts: countBy(rows, (row) => String(row.label)),

    rowsByTargetKanji: countBy(rows, (row) => row.targetKanji),

    positivesByTargetKanji: countBy(positiveRows, (row) => row.targetKanji),

    negativesByTargetKanji: countBy(negativeRows, (row) => row.targetKanji),

    featureCount: collectFeatureNames(rows).length,

    featureNames: collectFeatureNames(rows),

    errorCount: errors.length,

    errors,
  };
}

function printDatasetSummary(summary) {
  console.log("");
  console.log("REFERENCE CANDIDATE ML DATASET EXPORT");
  console.log("=====================================");
  console.log(`Target kanjis: ${summary.targetKanjiCount}`);
  console.log(`Rows: ${summary.rowCount}`);
  console.log(`Positive labels: ${summary.positiveCount}`);
  console.log(`Negative labels: ${summary.negativeCount}`);
  console.log(`Features: ${summary.featureCount}`);
  console.log(`Errors: ${summary.errorCount}`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  validateOptions(options);

  if (options.help) {
    printHelp();
    return;
  }

  const batchSummary = readJson(options.batchSummaryPath);

  const trainingSamples = readJsonl(options.trainingFilePath);

  const dataset = buildDataset({
    batchSummary,
    reportsDirectory: options.reportsDirectory,
    trainingSamples,
    includeOnlySafeCandidates: options.includeOnlySafeCandidates,
  });

  const summary = buildDatasetSummary({
    rows: dataset.rows,
    errors: dataset.errors,
    targetKanjis: dataset.targetKanjis,
    includeOnlySafeCandidates: options.includeOnlySafeCandidates,
  });

  writeJsonl(options.outputJsonlPath, dataset.rows);

  writeJson(options.outputSummaryPath, summary);

  printDatasetSummary(summary);

  console.log("");
  console.log(`Dataset saved to: ${options.outputJsonlPath}`);
  console.log(`Summary saved to: ${options.outputSummaryPath}`);

  if (summary.errorCount > 0) {
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
  labelFromClassification,
  flattenReferenceFeatures,
  getTargetRowsFromBatchSummary,
  buildDatasetRow,
  buildDataset,
  buildDatasetSummary,
  collectFeatureNames,
};
