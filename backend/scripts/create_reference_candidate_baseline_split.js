"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const {
  loadJsonlDataset,
  validateDatasetRows,
  determineFeatureNames,
  calculateLabelCounts,
} = require("./train_reference_candidate_baseline_model");

const DEFAULT_DATASET_PATH = path.resolve(
  process.cwd(),
  "ml_datasets",
  "reference_candidate_binary_dataset.jsonl",
);

const DEFAULT_OUTPUT_PATH = path.resolve(
  process.cwd(),
  "ml_datasets",
  "reference_candidate_baseline_split.json",
);

const DEFAULT_SEED = "reference-candidate-baseline-v1";
const DEFAULT_VALIDATION_RATIO = 0.2;

function requireArgumentValue(argv, index, argumentName) {
  const value = argv[index + 1];

  if (!value || value.startsWith("--")) {
    throw new Error(`${argumentName} requires a value`);
  }

  return value;
}

function parseArguments(argv) {
  const options = {
    datasetPath: DEFAULT_DATASET_PATH,
    outputPath: DEFAULT_OUTPUT_PATH,
    seed: DEFAULT_SEED,
    validationRatio: DEFAULT_VALIDATION_RATIO,
    help: false,
  };

  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];

    if (argument === "--dataset") {
      options.datasetPath = path.resolve(
        process.cwd(),
        requireArgumentValue(argv, index, argument),
      );

      index++;
      continue;
    }

    if (argument === "--out") {
      options.outputPath = path.resolve(
        process.cwd(),
        requireArgumentValue(argv, index, argument),
      );

      index++;
      continue;
    }

    if (argument === "--seed") {
      options.seed = requireArgumentValue(argv, index, argument);

      index++;
      continue;
    }

    if (argument === "--validation-ratio") {
      options.validationRatio = Number(
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
REFERENCE CANDIDATE BASELINE STRATIFIED SPLIT

Usage:
  node scripts/create_reference_candidate_baseline_split.js

Options:
  --dataset <path>
      Input ML dataset.

      Default:
      ./ml_datasets/reference_candidate_binary_dataset.jsonl

  --out <path>
      Output JSON split manifest.

      Default:
      ./ml_datasets/reference_candidate_baseline_split.json

  --seed <value>
      Deterministic split seed.

      Default:
      reference-candidate-baseline-v1

  --validation-ratio <number>
      Fraction assigned to validation.

      Must be greater than 0 and less than 1.
      Default: 0.2

  --help, -h
      Show this help.

Important:
  This split is stratified by targetKanji and label.

  It is suitable for development of the first baseline, but it does
  not measure generalization to completely unseen kanjis.
`);
}

function validateOptions(options) {
  if (typeof options.seed !== "string" || options.seed.length === 0) {
    throw new Error("seed must be a non-empty string");
  }

  if (
    !Number.isFinite(options.validationRatio) ||
    options.validationRatio <= 0 ||
    options.validationRatio >= 1
  ) {
    throw new Error("validationRatio must be greater than 0 and less than 1");
  }
}

function calculateDatasetSha256(datasetPath) {
  const contents = fs.readFileSync(datasetPath);

  return crypto.createHash("sha256").update(contents).digest("hex");
}

function calculateDeterministicKey({ seed, recognitionId }) {
  return crypto
    .createHash("sha256")
    .update(`${seed}\u0000${recognitionId}`)
    .digest("hex");
}

function buildStratumKey(row) {
  return `${row.targetKanji}\u0000${row.label}`;
}

function groupEntriesByStratum(datasetEntries) {
  const strata = new Map();

  for (const datasetEntry of datasetEntries) {
    const key = buildStratumKey(datasetEntry.row);

    if (!strata.has(key)) {
      strata.set(key, []);
    }

    strata.get(key).push(datasetEntry);
  }

  return strata;
}

function sortEntriesDeterministically(datasetEntries, seed) {
  return [...datasetEntries].sort((left, right) => {
    const leftKey = calculateDeterministicKey({
      seed,
      recognitionId: left.row.recognitionId,
    });

    const rightKey = calculateDeterministicKey({
      seed,
      recognitionId: right.row.recognitionId,
    });

    const keyComparison = leftKey.localeCompare(rightKey);

    if (keyComparison !== 0) {
      return keyComparison;
    }

    return left.row.recognitionId.localeCompare(right.row.recognitionId);
  });
}

function calculateValidationCount({ stratumSize, validationRatio }) {
  if (stratumSize <= 1) {
    return 0;
  }

  const roundedCount = Math.round(stratumSize * validationRatio);

  return Math.min(stratumSize - 1, Math.max(1, roundedCount));
}

function createStratifiedDatasetSplit({
  datasetEntries,
  validationRatio,
  seed,
}) {
  const strata = groupEntriesByStratum(datasetEntries);

  const trainingEntries = [];
  const validationEntries = [];
  const stratumSummaries = [];

  const sortedStratumKeys = [...strata.keys()].sort((left, right) =>
    left.localeCompare(right),
  );

  for (const stratumKey of sortedStratumKeys) {
    const entries = strata.get(stratumKey);

    const sortedEntries = sortEntriesDeterministically(entries, seed);

    const validationCount = calculateValidationCount({
      stratumSize: sortedEntries.length,
      validationRatio,
    });

    const stratumValidationEntries = sortedEntries.slice(0, validationCount);

    const stratumTrainingEntries = sortedEntries.slice(validationCount);

    validationEntries.push(...stratumValidationEntries);

    trainingEntries.push(...stratumTrainingEntries);

    const firstRow = entries[0].row;

    stratumSummaries.push({
      targetKanji: firstRow.targetKanji,
      label: firstRow.label,
      totalCount: entries.length,
      trainingCount: stratumTrainingEntries.length,
      validationCount: stratumValidationEntries.length,
    });
  }

  return {
    trainingEntries,
    validationEntries,
    stratumSummaries,
  };
}

function getRecognitionIds(datasetEntries) {
  return datasetEntries
    .map(({ row }) => row.recognitionId)
    .sort((left, right) => left.localeCompare(right));
}

function getTargetKanjis(datasetEntries) {
  return [...new Set(datasetEntries.map(({ row }) => row.targetKanji))].sort(
    (left, right) => left.localeCompare(right),
  );
}

function findSharedRecognitionIds({ trainingEntries, validationEntries }) {
  const trainingIds = new Set(getRecognitionIds(trainingEntries));

  return getRecognitionIds(validationEntries).filter((recognitionId) =>
    trainingIds.has(recognitionId),
  );
}

function findDuplicateRecognitionIds(datasetEntries) {
  const counts = new Map();

  for (const { row } of datasetEntries) {
    counts.set(row.recognitionId, (counts.get(row.recognitionId) ?? 0) + 1);
  }

  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([recognitionId, count]) => ({
      recognitionId,
      count,
    }))
    .sort((left, right) =>
      left.recognitionId.localeCompare(right.recognitionId),
    );
}

function buildPartitionSummary(datasetEntries) {
  const { positiveCount, negativeCount } = calculateLabelCounts(datasetEntries);

  return {
    rowCount: datasetEntries.length,
    positiveCount,
    negativeCount,
    targetKanjiCount: getTargetKanjis(datasetEntries).length,
    targetKanjis: getTargetKanjis(datasetEntries),
  };
}

function validateCreatedSplit({
  sourceEntries,
  trainingEntries,
  validationEntries,
}) {
  const errors = [];

  const sourceIds = getRecognitionIds(sourceEntries);

  const trainingIds = getRecognitionIds(trainingEntries);

  const validationIds = getRecognitionIds(validationEntries);

  const combinedIds = [...trainingIds, ...validationIds].sort((left, right) =>
    left.localeCompare(right),
  );

  const sharedRecognitionIds = findSharedRecognitionIds({
    trainingEntries,
    validationEntries,
  });

  const sourceDuplicateIds = findDuplicateRecognitionIds(sourceEntries);

  if (sourceDuplicateIds.length > 0) {
    errors.push(
      `Source dataset contains ${sourceDuplicateIds.length} ` +
        `duplicated recognition IDs.`,
    );
  }

  if (sharedRecognitionIds.length > 0) {
    errors.push(
      `Training and validation share ` +
        `${sharedRecognitionIds.length} recognition IDs.`,
    );
  }

  if (sourceIds.length !== combinedIds.length) {
    errors.push(
      `Split row count mismatch: source=${sourceIds.length}, ` +
        `combined=${combinedIds.length}.`,
    );
  }

  if (
    sourceIds.length === combinedIds.length &&
    sourceIds.some(
      (recognitionId, index) => recognitionId !== combinedIds[index],
    )
  ) {
    errors.push("Split recognition IDs do not match the source dataset.");
  }

  if (trainingEntries.length === 0) {
    errors.push("Training partition is empty.");
  }

  if (validationEntries.length === 0) {
    errors.push("Validation partition is empty.");
  }

  const trainingLabels = calculateLabelCounts(trainingEntries);

  const validationLabels = calculateLabelCounts(validationEntries);

  if (trainingLabels.positiveCount === 0) {
    errors.push("Training partition has no positive rows.");
  }

  if (trainingLabels.negativeCount === 0) {
    errors.push("Training partition has no negative rows.");
  }

  if (validationLabels.positiveCount === 0) {
    errors.push("Validation partition has no positive rows.");
  }

  if (validationLabels.negativeCount === 0) {
    errors.push("Validation partition has no negative rows.");
  }

  return {
    passed: errors.length === 0,
    errors,
    sharedRecognitionIds,
  };
}

function buildSplitManifest({
  datasetPath,
  datasetEntries,
  featureNames,
  validationRatio,
  seed,
  split,
  validation,
}) {
  return {
    schemaVersion: 1,
    purpose:
      "First interpretable reference candidate baseline development split",
    evaluationScope:
      "Stratified row-level development split. " +
      "Not evidence of generalization to unseen kanjis.",
    strategy: "deterministic_stratified_by_target_kanji_and_label",
    dataset: {
      path: datasetPath,
      sha256: calculateDatasetSha256(datasetPath),
      rowCount: datasetEntries.length,
      featureCount: featureNames.length,
    },
    configuration: {
      seed,
      validationRatio,
    },
    source: buildPartitionSummary(datasetEntries),
    training: buildPartitionSummary(split.trainingEntries),
    validation: buildPartitionSummary(split.validationEntries),
    validationResult: {
      passed: validation.passed,
      errors: validation.errors,
      sharedRecognitionIdCount: validation.sharedRecognitionIds.length,
    },
    strata: split.stratumSummaries,
    trainingRecognitionIds: getRecognitionIds(split.trainingEntries),
    validationRecognitionIds: getRecognitionIds(split.validationEntries),
  };
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), {
    recursive: true,
  });

  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function formatRatio(numerator, denominator) {
  if (denominator === 0) {
    return "n/a";
  }

  return (numerator / denominator).toFixed(6);
}

function printSplitSummary({ datasetPath, outputPath, manifest }) {
  console.log("");
  console.log("REFERENCE CANDIDATE BASELINE STRATIFIED SPLIT");
  console.log("=============================================");
  console.log(`Dataset: ${datasetPath}`);
  console.log(`Output: ${outputPath}`);
  console.log(`Dataset SHA-256: ${manifest.dataset.sha256}`);
  console.log(`Seed: ${manifest.configuration.seed}`);
  console.log(
    `Requested validation ratio: ` +
      `${manifest.configuration.validationRatio}`,
  );

  console.log("");
  console.log("Source");
  console.log("------");
  console.log(`Rows: ${manifest.source.rowCount}`);
  console.log(`Positive: ${manifest.source.positiveCount}`);
  console.log(`Negative: ${manifest.source.negativeCount}`);
  console.log(`Target kanjis: ${manifest.source.targetKanjiCount}`);

  console.log("");
  console.log("Training");
  console.log("--------");
  console.log(`Rows: ${manifest.training.rowCount}`);
  console.log(`Positive: ${manifest.training.positiveCount}`);
  console.log(`Negative: ${manifest.training.negativeCount}`);
  console.log(`Target kanjis: ${manifest.training.targetKanjiCount}`);

  console.log("");
  console.log("Validation");
  console.log("----------");
  console.log(`Rows: ${manifest.validation.rowCount}`);
  console.log(`Positive: ${manifest.validation.positiveCount}`);
  console.log(`Negative: ${manifest.validation.negativeCount}`);
  console.log(`Target kanjis: ${manifest.validation.targetKanjiCount}`);
  console.log(
    `Actual validation ratio: ` +
      `${formatRatio(manifest.validation.rowCount, manifest.source.rowCount)}`,
  );

  console.log("");
  console.log("Integrity");
  console.log("---------");
  console.log(
    `Shared recognition IDs: ` +
      `${manifest.validationResult.sharedRecognitionIdCount}`,
  );
  console.log(`Passed: ${manifest.validationResult.passed}`);

  console.log("");
  console.log("Evaluation scope");
  console.log("----------------");
  console.log(manifest.evaluationScope);
}

function main(argv = process.argv.slice(2)) {
  try {
    const options = parseArguments(argv);

    if (options.help) {
      printHelp();
      return;
    }

    validateOptions(options);

    const datasetEntries = loadJsonlDataset(options.datasetPath);

    const datasetValidation = validateDatasetRows(datasetEntries);

    if (datasetValidation.errors.length > 0) {
      throw new Error(
        `Dataset validation failed with ` +
          `${datasetValidation.errors.length} errors. ` +
          datasetValidation.errors[0],
      );
    }

    const featureNames = determineFeatureNames(datasetEntries);

    const split = createStratifiedDatasetSplit({
      datasetEntries,
      validationRatio: options.validationRatio,
      seed: options.seed,
    });

    const validation = validateCreatedSplit({
      sourceEntries: datasetEntries,
      trainingEntries: split.trainingEntries,
      validationEntries: split.validationEntries,
    });

    const manifest = buildSplitManifest({
      datasetPath: options.datasetPath,
      datasetEntries,
      featureNames,
      validationRatio: options.validationRatio,
      seed: options.seed,
      split,
      validation,
    });

    writeJson(options.outputPath, manifest);

    printSplitSummary({
      datasetPath: options.datasetPath,
      outputPath: options.outputPath,
      manifest,
    });

    if (!validation.passed) {
      console.error("");
      console.error("Split validation errors:");

      for (const error of validation.errors) {
        console.error(`- ${error}`);
      }

      process.exitCode = 1;
      return;
    }

    console.log("");
    console.log("Baseline split created successfully.");
  } catch (error) {
    console.error("");
    console.error(`Baseline split creation failed: ${error.message}`);

    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  DEFAULT_SEED,
  DEFAULT_VALIDATION_RATIO,
  parseArguments,
  validateOptions,
  calculateDatasetSha256,
  calculateDeterministicKey,
  buildStratumKey,
  groupEntriesByStratum,
  sortEntriesDeterministically,
  calculateValidationCount,
  createStratifiedDatasetSplit,
  getRecognitionIds,
  getTargetKanjis,
  findSharedRecognitionIds,
  findDuplicateRecognitionIds,
  buildPartitionSummary,
  validateCreatedSplit,
  buildSplitManifest,
  writeJson,
  main,
};
