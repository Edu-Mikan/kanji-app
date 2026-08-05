"use strict";

const fs = require("node:fs");
const path = require("node:path");

const {
  loadJsonlDataset,
  validateDatasetRows,
  determineFeatureNames,
  calculateDescriptorMetrics,
} = require("./train_reference_candidate_baseline_model");

const {
  calculateDatasetSha256,
  getRecognitionIds,
} = require("./create_reference_candidate_baseline_split");

const DEFAULT_DATASET_PATH = path.resolve(
  process.cwd(),
  "ml_datasets",
  "reference_candidate_binary_dataset.jsonl",
);

const DEFAULT_SPLIT_PATH = path.resolve(
  process.cwd(),
  "ml_datasets",
  "reference_candidate_baseline_split.json",
);

const DEFAULT_OUTPUT_PATH = path.resolve(
  process.cwd(),
  "ml_datasets",
  "reference_candidate_baseline_vector_summary.json",
);

const STANDARD_DEVIATION_EPSILON = 1e-12;

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
    splitPath: DEFAULT_SPLIT_PATH,
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

    if (argument === "--split") {
      options.splitPath = path.resolve(
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
REFERENCE CANDIDATE BASELINE VECTOR PREPARATION

Usage:
  node scripts/prepare_reference_candidate_baseline_vectors.js

Options:
  --dataset <path>
      Input ML JSONL dataset.

      Default:
      ./ml_datasets/reference_candidate_binary_dataset.jsonl

  --split <path>
      Reproducible split manifest.

      Default:
      ./ml_datasets/reference_candidate_baseline_split.json

  --out <path>
      Output vectorization summary.

      Default:
      ./ml_datasets/reference_candidate_baseline_vector_summary.json

  --help, -h
      Show this help.

Vectorization:
  Each original feature produces two dimensions:

  1. value.<featureName>
     Standardized numeric value.

  2. presence.<featureName>
     1 when present and 0 when absent.

  Missing feature:
    normalized value = 0
    presence = 0

  Present feature:
    normalized value = (value - trainingMean) / trainingScale
    presence = 1

Important:
  Means and standard deviations are fitted using training rows only.
`);
}

function assertFileExists(filePath, label) {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error(`${label} not found: ${filePath}`);
  }

  const stats = fs.statSync(filePath);

  if (!stats.isFile()) {
    throw new Error(`${label} is not a file: ${filePath}`);
  }
}

function readJson(filePath, label) {
  assertFileExists(filePath, label);

  const contents = fs.readFileSync(filePath, "utf8");

  try {
    return JSON.parse(contents);
  } catch (error) {
    throw new Error(`${label} contains invalid JSON: ${error.message}`);
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), {
    recursive: true,
  });

  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function compareSortedArrays(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right)) {
    return false;
  }

  if (left.length !== right.length) {
    return false;
  }

  const sortedLeft = [...left].sort((first, second) =>
    first.localeCompare(second),
  );

  const sortedRight = [...right].sort((first, second) =>
    first.localeCompare(second),
  );

  return sortedLeft.every((value, index) => value === sortedRight[index]);
}

function validateSplitManifest({
  datasetPath,
  datasetEntries,
  featureNames,
  splitManifest,
}) {
  const errors = [];

  const actualDatasetHash = calculateDatasetSha256(datasetPath);

  const sourceRecognitionIds = getRecognitionIds(datasetEntries);

  const trainingRecognitionIds = splitManifest.trainingRecognitionIds;

  const validationRecognitionIds = splitManifest.validationRecognitionIds;

  if (typeof splitManifest !== "object" || splitManifest === null) {
    return {
      passed: false,
      errors: ["Split manifest must be an object."],
    };
  }

  if (
    !Array.isArray(trainingRecognitionIds) ||
    !Array.isArray(validationRecognitionIds)
  ) {
    return {
      passed: false,
      errors: [
        "Split manifest must contain trainingRecognitionIds " +
          "and validationRecognitionIds arrays.",
      ],
    };
  }

  if (splitManifest.dataset?.sha256 !== actualDatasetHash) {
    errors.push(
      `Dataset SHA-256 mismatch: ` +
        `actual=${actualDatasetHash}, ` +
        `split=${splitManifest.dataset?.sha256}.`,
    );
  }

  if (splitManifest.dataset?.rowCount !== datasetEntries.length) {
    errors.push(
      `Dataset row count mismatch: ` +
        `actual=${datasetEntries.length}, ` +
        `split=${splitManifest.dataset?.rowCount}.`,
    );
  }

  if (splitManifest.dataset?.featureCount !== featureNames.length) {
    errors.push(
      `Dataset feature count mismatch: ` +
        `actual=${featureNames.length}, ` +
        `split=${splitManifest.dataset?.featureCount}.`,
    );
  }

  const combinedRecognitionIds = [
    ...trainingRecognitionIds,
    ...validationRecognitionIds,
  ];

  if (!compareSortedArrays(sourceRecognitionIds, combinedRecognitionIds)) {
    errors.push(
      "Training and validation recognition IDs do not " +
        "match the source dataset.",
    );
  }

  const trainingIdSet = new Set(trainingRecognitionIds);

  const sharedRecognitionIds = validationRecognitionIds.filter(
    (recognitionId) => trainingIdSet.has(recognitionId),
  );

  if (sharedRecognitionIds.length > 0) {
    errors.push(
      `Training and validation share ` +
        `${sharedRecognitionIds.length} recognition IDs.`,
    );
  }

  if (new Set(trainingRecognitionIds).size !== trainingRecognitionIds.length) {
    errors.push("Training recognition IDs contain duplicates.");
  }

  if (
    new Set(validationRecognitionIds).size !== validationRecognitionIds.length
  ) {
    errors.push("Validation recognition IDs contain duplicates.");
  }

  return {
    passed: errors.length === 0,
    errors,
    actualDatasetHash,
    sharedRecognitionIds,
  };
}

function buildEntryMapByRecognitionId(datasetEntries) {
  const entriesByRecognitionId = new Map();

  for (const datasetEntry of datasetEntries) {
    const recognitionId = datasetEntry.row.recognitionId;

    if (entriesByRecognitionId.has(recognitionId)) {
      throw new Error(`Duplicated recognitionId in dataset: ${recognitionId}`);
    }

    entriesByRecognitionId.set(recognitionId, datasetEntry);
  }

  return entriesByRecognitionId;
}

function resolveEntriesByRecognitionIds({
  recognitionIds,
  entriesByRecognitionId,
  partitionName,
}) {
  return recognitionIds.map((recognitionId) => {
    const datasetEntry = entriesByRecognitionId.get(recognitionId);

    if (!datasetEntry) {
      throw new Error(
        `${partitionName} recognitionId not found ` +
          `in dataset: ${recognitionId}`,
      );
    }

    return datasetEntry;
  });
}

function buildDatasetPartitions({ datasetEntries, splitManifest }) {
  const entriesByRecognitionId = buildEntryMapByRecognitionId(datasetEntries);

  const trainingEntries = resolveEntriesByRecognitionIds({
    recognitionIds: splitManifest.trainingRecognitionIds,
    entriesByRecognitionId,
    partitionName: "Training",
  });

  const validationEntries = resolveEntriesByRecognitionIds({
    recognitionIds: splitManifest.validationRecognitionIds,
    entriesByRecognitionId,
    partitionName: "Validation",
  });

  return {
    trainingEntries,
    validationEntries,
  };
}

function hasOwnFeature(features, featureName) {
  return Object.prototype.hasOwnProperty.call(features, featureName);
}

function calculateMean(values) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function calculatePopulationStandardDeviation(values, mean) {
  if (values.length === 0) {
    return 0;
  }

  const variance =
    values.reduce((total, value) => {
      const difference = value - mean;

      return total + difference * difference;
    }, 0) / values.length;

  return Math.sqrt(variance);
}

function fitFeatureTransformers({ trainingEntries, featureNames }) {
  return featureNames.map((featureName) => {
    const presentValues = [];

    for (const { row } of trainingEntries) {
      if (hasOwnFeature(row.features, featureName)) {
        presentValues.push(row.features[featureName]);
      }
    }

    const mean = calculateMean(presentValues);

    const standardDeviation = calculatePopulationStandardDeviation(
      presentValues,
      mean,
    );

    const isConstant =
      presentValues.length > 0 &&
      standardDeviation <= STANDARD_DEVIATION_EPSILON;

    const scale =
      standardDeviation > STANDARD_DEVIATION_EPSILON ? standardDeviation : 1;

    return {
      featureName,
      trainingPresentCount: presentValues.length,
      trainingMissingCount: trainingEntries.length - presentValues.length,
      trainingPresenceRatio:
        trainingEntries.length === 0
          ? null
          : presentValues.length / trainingEntries.length,
      mean,
      standardDeviation,
      scale,
      isConstant,
      unseenInTraining: presentValues.length === 0,
    };
  });
}

function buildVectorDimensionNames(featureTransformers) {
  const dimensionNames = [];

  for (const transformer of featureTransformers) {
    dimensionNames.push(`value.${transformer.featureName}`);

    dimensionNames.push(`presence.${transformer.featureName}`);
  }

  return dimensionNames;
}

function vectorizeDatasetEntry({ datasetEntry, featureTransformers }) {
  const vector = [];
  const features = datasetEntry.row.features;

  for (const transformer of featureTransformers) {
    const isPresent = hasOwnFeature(features, transformer.featureName);

    if (!isPresent) {
      vector.push(0);
      vector.push(0);
      continue;
    }

    const originalValue = features[transformer.featureName];

    const normalizedValue =
      (originalValue - transformer.mean) / transformer.scale;

    vector.push(normalizedValue);
    vector.push(1);
  }

  return {
    recognitionId: datasetEntry.row.recognitionId,
    targetKanji: datasetEntry.row.targetKanji,
    label: datasetEntry.row.label,
    classification: datasetEntry.row.classification,
    vector,
  };
}

function vectorizeDatasetEntries({ datasetEntries, featureTransformers }) {
  return datasetEntries.map((datasetEntry) =>
    vectorizeDatasetEntry({
      datasetEntry,
      featureTransformers,
    }),
  );
}

function validateVectors({
  vectorizedEntries,
  expectedDimensionCount,
  partitionName,
}) {
  const errors = [];

  for (const vectorizedEntry of vectorizedEntries) {
    if (vectorizedEntry.vector.length !== expectedDimensionCount) {
      errors.push(
        `${partitionName} vector ` +
          `${vectorizedEntry.recognitionId} has ` +
          `${vectorizedEntry.vector.length} dimensions, ` +
          `expected ${expectedDimensionCount}.`,
      );
    }

    for (let index = 0; index < vectorizedEntry.vector.length; index++) {
      const value = vectorizedEntry.vector[index];

      if (typeof value !== "number" || !Number.isFinite(value)) {
        errors.push(
          `${partitionName} vector ` +
            `${vectorizedEntry.recognitionId} contains ` +
            `a non-finite value at dimension ${index}.`,
        );
      }
    }
  }

  return {
    passed: errors.length === 0,
    errors,
  };
}

function buildPartitionVectorSummary({ datasetEntries, vectorizedEntries }) {
  const descriptorMetrics = calculateDescriptorMetrics(datasetEntries);

  const labels = {
    positiveCount: descriptorMetrics.positiveCount,
    negativeCount: descriptorMetrics.negativeCount,
  };

  const nonZeroDimensionCounts = vectorizedEntries.map(
    ({ vector }) => vector.filter((value) => value !== 0).length,
  );

  return {
    rowCount: datasetEntries.length,
    ...labels,
    descriptorBaselineMetrics: descriptorMetrics,
    nonZeroDimensionsPerRow: {
      minimum: Math.min(...nonZeroDimensionCounts),
      maximum: Math.max(...nonZeroDimensionCounts),
      average:
        nonZeroDimensionCounts.reduce((total, count) => total + count, 0) /
        nonZeroDimensionCounts.length,
    },
  };
}

function buildVectorSummary({
  datasetPath,
  splitPath,
  datasetHash,
  featureNames,
  featureTransformers,
  dimensionNames,
  trainingEntries,
  validationEntries,
  trainingVectors,
  validationVectors,
  trainingVectorValidation,
  validationVectorValidation,
}) {
  const unseenInTrainingFeatures = featureTransformers
    .filter((transformer) => transformer.unseenInTraining)
    .map((transformer) => transformer.featureName);

  const constantTrainingFeatures = featureTransformers
    .filter((transformer) => transformer.isConstant)
    .map((transformer) => transformer.featureName);

  const errors = [
    ...trainingVectorValidation.errors,
    ...validationVectorValidation.errors,
  ];

  return {
    schemaVersion: 1,
    purpose:
      "Sparse vector preparation for the first interpretable reference candidate baseline",
    dataset: {
      path: datasetPath,
      sha256: datasetHash,
      rowCount: trainingEntries.length + validationEntries.length,
    },
    split: {
      path: splitPath,
    },
    vectorization: {
      strategy: "standardized_present_values_plus_presence_indicator",
      fittingScope: "training_partition_only",
      missingFeatureStrategy: {
        normalizedValue: 0,
        presenceIndicator: 0,
      },
      presentFeatureStrategy: {
        normalizedValue: "(value - trainingMean) / trainingScale",
        presenceIndicator: 1,
      },
      originalFeatureCount: featureNames.length,
      dimensionsPerOriginalFeature: 2,
      totalDimensionCount: dimensionNames.length,
      dimensionOrder: "value then presence for each sorted original feature",
      dimensionNames,
      unseenInTrainingFeatureCount: unseenInTrainingFeatures.length,
      unseenInTrainingFeatures,
      constantTrainingFeatureCount: constantTrainingFeatures.length,
      constantTrainingFeatures,
      featureTransformers,
    },
    training: buildPartitionVectorSummary({
      datasetEntries: trainingEntries,
      vectorizedEntries: trainingVectors,
    }),
    validation: buildPartitionVectorSummary({
      datasetEntries: validationEntries,
      vectorizedEntries: validationVectors,
    }),
    validationResult: {
      passed: errors.length === 0,
      errors,
    },
  };
}

function formatDecimal(value) {
  if (value === null || value === undefined) {
    return "n/a";
  }

  return value.toFixed(6);
}

function printVectorSummary({ outputPath, summary }) {
  console.log("");
  console.log("REFERENCE CANDIDATE BASELINE VECTOR PREPARATION");
  console.log("===============================================");

  console.log(`Dataset SHA-256: ${summary.dataset.sha256}`);

  console.log(`Output: ${outputPath}`);

  console.log("");
  console.log("Vectorization");
  console.log("-------------");
  console.log(
    `Original features: ` + `${summary.vectorization.originalFeatureCount}`,
  );
  console.log(
    `Dimensions per feature: ` +
      `${summary.vectorization.dimensionsPerOriginalFeature}`,
  );
  console.log(
    `Total dimensions: ` + `${summary.vectorization.totalDimensionCount}`,
  );
  console.log(
    `Unseen features in training: ` +
      `${summary.vectorization.unseenInTrainingFeatureCount}`,
  );
  console.log(
    `Constant features in training: ` +
      `${summary.vectorization.constantTrainingFeatureCount}`,
  );

  console.log("");
  console.log("Training");
  console.log("--------");
  console.log(`Rows: ${summary.training.rowCount}`);
  console.log(`Positive: ${summary.training.positiveCount}`);
  console.log(`Negative: ${summary.training.negativeCount}`);
  console.log(
    `Non-zero dimensions per row: ` +
      `min=${summary.training.nonZeroDimensionsPerRow.minimum}, ` +
      `max=${summary.training.nonZeroDimensionsPerRow.maximum}, ` +
      `average=${formatDecimal(
        summary.training.nonZeroDimensionsPerRow.average,
      )}`,
  );

  console.log("");
  console.log("Validation");
  console.log("----------");
  console.log(`Rows: ${summary.validation.rowCount}`);
  console.log(`Positive: ${summary.validation.positiveCount}`);
  console.log(`Negative: ${summary.validation.negativeCount}`);
  console.log(
    `Non-zero dimensions per row: ` +
      `min=${summary.validation.nonZeroDimensionsPerRow.minimum}, ` +
      `max=${summary.validation.nonZeroDimensionsPerRow.maximum}, ` +
      `average=${formatDecimal(
        summary.validation.nonZeroDimensionsPerRow.average,
      )}`,
  );

  console.log("");
  console.log("Descriptor baseline by partition");
  console.log("--------------------------------");

  console.log(
    `Training: ` +
      `TP=${summary.training.descriptorBaselineMetrics.truePositive}, ` +
      `TN=${summary.training.descriptorBaselineMetrics.trueNegative}, ` +
      `FP=${summary.training.descriptorBaselineMetrics.falsePositive}, ` +
      `FN=${summary.training.descriptorBaselineMetrics.falseNegative}`,
  );

  console.log(
    `Validation: ` +
      `TP=${summary.validation.descriptorBaselineMetrics.truePositive}, ` +
      `TN=${summary.validation.descriptorBaselineMetrics.trueNegative}, ` +
      `FP=${summary.validation.descriptorBaselineMetrics.falsePositive}, ` +
      `FN=${summary.validation.descriptorBaselineMetrics.falseNegative}`,
  );

  console.log("");
  console.log("Integrity");
  console.log("---------");
  console.log(`Errors: ${summary.validationResult.errors.length}`);
  console.log(`Passed: ${summary.validationResult.passed}`);
}

function main(argv = process.argv.slice(2)) {
  try {
    const options = parseArguments(argv);

    if (options.help) {
      printHelp();
      return;
    }

    assertFileExists(options.datasetPath, "ML dataset");

    assertFileExists(options.splitPath, "Baseline split manifest");

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

    const splitManifest = readJson(
      options.splitPath,
      "Baseline split manifest",
    );

    const splitValidation = validateSplitManifest({
      datasetPath: options.datasetPath,
      datasetEntries,
      featureNames,
      splitManifest,
    });

    if (!splitValidation.passed) {
      throw new Error(
        `Split manifest validation failed. ` + splitValidation.errors[0],
      );
    }

    const { trainingEntries, validationEntries } = buildDatasetPartitions({
      datasetEntries,
      splitManifest,
    });

    const featureTransformers = fitFeatureTransformers({
      trainingEntries,
      featureNames,
    });

    const dimensionNames = buildVectorDimensionNames(featureTransformers);

    const trainingVectors = vectorizeDatasetEntries({
      datasetEntries: trainingEntries,
      featureTransformers,
    });

    const validationVectors = vectorizeDatasetEntries({
      datasetEntries: validationEntries,
      featureTransformers,
    });

    const trainingVectorValidation = validateVectors({
      vectorizedEntries: trainingVectors,
      expectedDimensionCount: dimensionNames.length,
      partitionName: "Training",
    });

    const validationVectorValidation = validateVectors({
      vectorizedEntries: validationVectors,
      expectedDimensionCount: dimensionNames.length,
      partitionName: "Validation",
    });

    const summary = buildVectorSummary({
      datasetPath: options.datasetPath,
      splitPath: options.splitPath,
      datasetHash: splitValidation.actualDatasetHash,
      featureNames,
      featureTransformers,
      dimensionNames,
      trainingEntries,
      validationEntries,
      trainingVectors,
      validationVectors,
      trainingVectorValidation,
      validationVectorValidation,
    });

    writeJson(options.outputPath, summary);

    printVectorSummary({
      outputPath: options.outputPath,
      summary,
    });

    if (!summary.validationResult.passed) {
      console.error("");
      console.error("Vector validation errors:");

      for (const error of summary.validationResult.errors) {
        console.error(`- ${error}`);
      }

      process.exitCode = 1;
      return;
    }

    console.log("");
    console.log("Baseline vectors prepared successfully.");
  } catch (error) {
    console.error("");
    console.error(`Baseline vector preparation failed: ${error.message}`);

    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  STANDARD_DEVIATION_EPSILON,
  parseArguments,
  assertFileExists,
  readJson,
  writeJson,
  compareSortedArrays,
  validateSplitManifest,
  buildEntryMapByRecognitionId,
  resolveEntriesByRecognitionIds,
  buildDatasetPartitions,
  hasOwnFeature,
  calculateMean,
  calculatePopulationStandardDeviation,
  fitFeatureTransformers,
  buildVectorDimensionNames,
  vectorizeDatasetEntry,
  vectorizeDatasetEntries,
  validateVectors,
  buildPartitionVectorSummary,
  buildVectorSummary,
  main,
};
