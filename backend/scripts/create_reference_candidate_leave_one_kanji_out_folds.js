"use strict";

const fs = require("node:fs");
const path = require("node:path");

const {
  loadJsonlDataset,
  validateDatasetRows,
  determineFeatureNames,
  calculateLabelCounts,
} = require("./train_reference_candidate_baseline_model");

const {
  calculateDatasetSha256,
  getRecognitionIds,
  getTargetKanjis,
  findDuplicateRecognitionIds,
} = require("./create_reference_candidate_baseline_split");

const DEFAULT_DATASET_PATH = path.resolve(
  process.cwd(),
  "ml_datasets",
  "reference_candidate_binary_dataset.jsonl",
);

const DEFAULT_OUTPUT_PATH = path.resolve(
  process.cwd(),
  "ml_datasets",
  "reference_candidate_leave_one_kanji_out_folds.json",
);

function requireArgumentValue(argv, index, argumentName) {
  const value = argv[index + 1];

  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${argumentName} requires a value`);
  }

  return value;
}

function parseArguments(argv) {
  const options = {
    datasetPath: DEFAULT_DATASET_PATH,
    outputPath: DEFAULT_OUTPUT_PATH,
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
REFERENCE CANDIDATE LEAVE-ONE-KANJI-OUT FOLDS

Usage:
  node scripts/create_reference_candidate_leave_one_kanji_out_folds.js

Options:
  --dataset <path>
      Input ML JSONL dataset.

      Default:
      ./ml_datasets/reference_candidate_binary_dataset.jsonl

  --out <path>
      Output LOOCV fold manifest.

      Default:
      ./ml_datasets/reference_candidate_leave_one_kanji_out_folds.json

  --help, -h
      Show this help.

For each target kanji:
  - training contains all other target kanjis
  - evaluation contains only the held-out target kanji

This script creates partitions only.
It does not train any model.
`);
}

function assertFileExists(filePath, label) {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error(`${label} not found: ${filePath}`);
  }

  if (!fs.statSync(filePath).isFile()) {
    throw new Error(`${label} is not a file: ${filePath}`);
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), {
    recursive: true,
  });

  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function splitEntriesByHeldOutKanji({ datasetEntries, heldOutKanji }) {
  const trainingEntries = [];
  const evaluationEntries = [];

  for (const datasetEntry of datasetEntries) {
    if (datasetEntry.row.targetKanji === heldOutKanji) {
      evaluationEntries.push(datasetEntry);
    } else {
      trainingEntries.push(datasetEntry);
    }
  }

  return {
    trainingEntries,
    evaluationEntries,
  };
}

function buildPartitionSummary(datasetEntries) {
  const { positiveCount, negativeCount } = calculateLabelCounts(datasetEntries);

  return {
    rowCount: datasetEntries.length,
    positiveCount,
    negativeCount,
    targetKanjiCount: getTargetKanjis(datasetEntries).length,
    targetKanjis: getTargetKanjis(datasetEntries),
    recognitionIds: getRecognitionIds(datasetEntries),
  };
}

function findSharedValues(leftValues, rightValues) {
  const leftSet = new Set(leftValues);

  return rightValues
    .filter((value) => leftSet.has(value))
    .sort((left, right) => left.localeCompare(right));
}

function validateLeaveOneKanjiOutFold({
  sourceEntries,
  heldOutKanji,
  trainingEntries,
  evaluationEntries,
}) {
  const errors = [];

  if (typeof heldOutKanji !== "string" || heldOutKanji.length === 0) {
    errors.push("heldOutKanji must be a non-empty string.");
  }

  if (trainingEntries.length === 0) {
    errors.push("Training partition is empty.");
  }

  if (evaluationEntries.length === 0) {
    errors.push("Evaluation partition is empty.");
  }

  const trainingKanjis = getTargetKanjis(trainingEntries);

  const evaluationKanjis = getTargetKanjis(evaluationEntries);

  if (trainingKanjis.includes(heldOutKanji)) {
    errors.push(`Held-out kanji ${heldOutKanji} appears in training.`);
  }

  if (evaluationKanjis.length !== 1 || evaluationKanjis[0] !== heldOutKanji) {
    errors.push(`Evaluation partition must contain only ${heldOutKanji}.`);
  }

  const trainingIds = getRecognitionIds(trainingEntries);

  const evaluationIds = getRecognitionIds(evaluationEntries);

  const sharedRecognitionIds = findSharedValues(trainingIds, evaluationIds);

  if (sharedRecognitionIds.length > 0) {
    errors.push(
      `Training and evaluation share ` +
        `${sharedRecognitionIds.length} recognition IDs.`,
    );
  }

  const combinedIds = [...trainingIds, ...evaluationIds].sort((left, right) =>
    left.localeCompare(right),
  );

  const sourceIds = getRecognitionIds(sourceEntries);

  if (combinedIds.length !== sourceIds.length) {
    errors.push(
      `Fold row count mismatch: ` +
        `source=${sourceIds.length}, ` +
        `combined=${combinedIds.length}.`,
    );
  } else if (
    combinedIds.some(
      (recognitionId, index) => recognitionId !== sourceIds[index],
    )
  ) {
    errors.push("Fold recognition IDs do not match the source dataset.");
  }

  const trainingLabelCounts = calculateLabelCounts(trainingEntries);

  const evaluationLabelCounts = calculateLabelCounts(evaluationEntries);

  if (trainingLabelCounts.positiveCount === 0) {
    errors.push("Training partition has no positive rows.");
  }

  if (trainingLabelCounts.negativeCount === 0) {
    errors.push("Training partition has no negative rows.");
  }

  if (evaluationLabelCounts.positiveCount === 0) {
    errors.push("Evaluation partition has no positive rows.");
  }

  if (evaluationLabelCounts.negativeCount === 0) {
    errors.push("Evaluation partition has no negative rows.");
  }

  return {
    passed: errors.length === 0,
    errors,
    sharedRecognitionIds,
  };
}

function buildLeaveOneKanjiOutFold({ datasetEntries, heldOutKanji }) {
  const { trainingEntries, evaluationEntries } = splitEntriesByHeldOutKanji({
    datasetEntries,
    heldOutKanji,
  });

  const validation = validateLeaveOneKanjiOutFold({
    sourceEntries: datasetEntries,
    heldOutKanji,
    trainingEntries,
    evaluationEntries,
  });

  return {
    foldId: `held_out_${heldOutKanji.codePointAt(0).toString(16)}`,
    heldOutKanji,
    training: buildPartitionSummary(trainingEntries),
    evaluation: buildPartitionSummary(evaluationEntries),
    validation: {
      passed: validation.passed,
      errors: validation.errors,
      sharedRecognitionIdCount: validation.sharedRecognitionIds.length,
    },
  };
}

function buildLeaveOneKanjiOutManifest({
  datasetPath,
  datasetEntries,
  featureNames,
}) {
  const targetKanjis = getTargetKanjis(datasetEntries);

  const folds = targetKanjis.map((heldOutKanji) =>
    buildLeaveOneKanjiOutFold({
      datasetEntries,
      heldOutKanji,
    }),
  );

  const errors = [];

  for (const fold of folds) {
    for (const error of fold.validation.errors) {
      errors.push(`${fold.heldOutKanji}: ${error}`);
    }
  }

  const sourceDuplicateRecognitionIds =
    findDuplicateRecognitionIds(datasetEntries);

  if (sourceDuplicateRecognitionIds.length > 0) {
    errors.push(
      `Source dataset contains ` +
        `${sourceDuplicateRecognitionIds.length} duplicated recognition IDs.`,
    );
  }

  return {
    schemaVersion: 1,
    purpose:
      "Reproducible leave-one-kanji-out folds for reference candidate baseline evaluation",
    strategy: "leave_one_target_kanji_out",
    evaluationScope:
      "Each fold evaluates one target kanji that is completely absent from model training.",
    dataset: {
      path: datasetPath,
      sha256: calculateDatasetSha256(datasetPath),
      rowCount: datasetEntries.length,
      targetKanjiCount: targetKanjis.length,
      targetKanjis,
      featureCount: featureNames.length,
    },
    foldCount: folds.length,
    folds,
    integrity: {
      passed: errors.length === 0,
      errors,
    },
  };
}

function validateLeaveOneKanjiOutManifest(manifest) {
  const errors = [];

  if (manifest.schemaVersion !== 1) {
    errors.push(`Expected schemaVersion=1, actual=${manifest.schemaVersion}.`);
  }

  if (manifest.strategy !== "leave_one_target_kanji_out") {
    errors.push(`Unexpected strategy: ${manifest.strategy}.`);
  }

  if (!Array.isArray(manifest.folds) || manifest.folds.length === 0) {
    errors.push("Manifest folds are missing or empty.");

    return {
      passed: false,
      errors,
    };
  }

  if (manifest.foldCount !== manifest.folds.length) {
    errors.push(
      `Fold count mismatch: ` +
        `stored=${manifest.foldCount}, ` +
        `actual=${manifest.folds.length}.`,
    );
  }

  if (manifest.dataset?.targetKanjiCount !== manifest.folds.length) {
    errors.push(`Target kanji count does not match fold count.`);
  }

  const heldOutKanjis = manifest.folds.map((fold) => fold.heldOutKanji);

  if (new Set(heldOutKanjis).size !== heldOutKanjis.length) {
    errors.push("Held-out kanjis contain duplicates.");
  }

  for (const fold of manifest.folds) {
    if (fold.validation?.passed !== true) {
      errors.push(`Fold ${fold.heldOutKanji} validation did not pass.`);
    }

    if (
      fold.training.rowCount + fold.evaluation.rowCount !==
      manifest.dataset.rowCount
    ) {
      errors.push(
        `Fold ${fold.heldOutKanji} row count does not match the dataset.`,
      );
    }

    if (fold.training.targetKanjis.includes(fold.heldOutKanji)) {
      errors.push(`Fold ${fold.heldOutKanji} leaks into training.`);
    }

    if (
      fold.evaluation.targetKanjis.length !== 1 ||
      fold.evaluation.targetKanjis[0] !== fold.heldOutKanji
    ) {
      errors.push(`Fold ${fold.heldOutKanji} evaluation target is invalid.`);
    }
  }

  return {
    passed: errors.length === 0,
    errors,
  };
}

function printManifestSummary({ manifest, outputPath }) {
  console.log("");
  console.log("REFERENCE CANDIDATE LEAVE-ONE-KANJI-OUT FOLDS");
  console.log("================================================");

  console.log(`Dataset SHA-256: ${manifest.dataset.sha256}`);

  console.log(`Dataset rows: ${manifest.dataset.rowCount}`);

  console.log(`Target kanjis: ${manifest.dataset.targetKanjiCount}`);

  console.log(`Features: ${manifest.dataset.featureCount}`);

  console.log(`Folds: ${manifest.foldCount}`);

  console.log(`Output: ${outputPath}`);

  console.log("");
  console.log("Folds");
  console.log("-----");

  for (const fold of manifest.folds) {
    console.log(
      `${fold.heldOutKanji}: ` +
        `trainRows=${fold.training.rowCount}, ` +
        `trainPositive=${fold.training.positiveCount}, ` +
        `trainNegative=${fold.training.negativeCount}, ` +
        `evaluationRows=${fold.evaluation.rowCount}, ` +
        `evaluationPositive=${fold.evaluation.positiveCount}, ` +
        `evaluationNegative=${fold.evaluation.negativeCount}, ` +
        `passed=${fold.validation.passed}`,
    );
  }

  console.log("");
  console.log("Integrity");
  console.log("---------");

  console.log(`Errors: ${manifest.integrity.errors.length}`);

  console.log(`Passed: ${manifest.integrity.passed}`);
}

function main(argv = process.argv.slice(2)) {
  try {
    const options = parseArguments(argv);

    if (options.help) {
      printHelp();
      return;
    }

    assertFileExists(options.datasetPath, "ML dataset");

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

    const manifest = buildLeaveOneKanjiOutManifest({
      datasetPath: options.datasetPath,
      datasetEntries,
      featureNames,
    });

    const manifestValidation = validateLeaveOneKanjiOutManifest(manifest);

    if (!manifestValidation.passed) {
      manifest.integrity.passed = false;

      manifest.integrity.errors.push(...manifestValidation.errors);
    }

    writeJson(options.outputPath, manifest);

    printManifestSummary({
      manifest,
      outputPath: options.outputPath,
    });

    if (!manifest.integrity.passed) {
      console.error("");
      console.error("Leave-one-kanji-out manifest errors:");

      for (const error of manifest.integrity.errors) {
        console.error(`- ${error}`);
      }

      process.exitCode = 1;
      return;
    }

    console.log("");
    console.log("Leave-one-kanji-out folds created successfully.");
  } catch (error) {
    console.error("");
    console.error(`Leave-one-kanji-out fold creation failed: ${error.message}`);

    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  parseArguments,
  assertFileExists,
  writeJson,
  splitEntriesByHeldOutKanji,
  buildPartitionSummary,
  findSharedValues,
  validateLeaveOneKanjiOutFold,
  buildLeaveOneKanjiOutFold,
  buildLeaveOneKanjiOutManifest,
  validateLeaveOneKanjiOutManifest,
  main,
};
