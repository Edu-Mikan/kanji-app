"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const {
  loadJsonlDataset,
  validateDatasetRows,
  determineFeatureNames,
} = require("./train_reference_candidate_baseline_model");

const {
  calculateDatasetSha256,
} = require("./create_reference_candidate_baseline_split");

const {
  readJson,
  validateSplitManifest,
  buildDatasetPartitions,
  fitFeatureTransformers,
  buildVectorDimensionNames,
  vectorizeDatasetEntries,
  validateVectors,
} = require("./prepare_reference_candidate_baseline_vectors");

const {
  DEFAULT_EPOCHS,
  DEFAULT_LEARNING_RATE,
  DEFAULT_L2_STRENGTH,
  DEFAULT_REPORT_EVERY,
  DEFAULT_THRESHOLD,
  validateTrainingConfiguration,
  trainLogisticRegression,
  evaluateLogisticModel,
  rankModelWeights,
  validateTrainingResult,
} = require("./reference_candidate_logistic_regression");

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

const DEFAULT_VECTOR_SUMMARY_PATH = path.resolve(
  process.cwd(),
  "ml_datasets",
  "reference_candidate_baseline_vector_summary.json",
);

const DEFAULT_OUTPUT_PATH = path.resolve(
  process.cwd(),
  "ml_models",
  "reference_candidate_logistic_baseline_model.json",
);

const DEFAULT_TOP_WEIGHT_COUNT = 20;

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
    splitPath: DEFAULT_SPLIT_PATH,
    vectorSummaryPath: DEFAULT_VECTOR_SUMMARY_PATH,
    outputPath: DEFAULT_OUTPUT_PATH,
    epochs: DEFAULT_EPOCHS,
    learningRate: DEFAULT_LEARNING_RATE,
    l2Strength: DEFAULT_L2_STRENGTH,
    reportEvery: DEFAULT_REPORT_EVERY,
    threshold: DEFAULT_THRESHOLD,
    topWeightCount: DEFAULT_TOP_WEIGHT_COUNT,
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

    if (argument === "--vector-summary") {
      options.vectorSummaryPath = path.resolve(
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

    if (argument === "--epochs") {
      options.epochs = Number(requireArgumentValue(argv, index, argument));

      index++;
      continue;
    }

    if (argument === "--learning-rate") {
      options.learningRate = Number(
        requireArgumentValue(argv, index, argument),
      );

      index++;
      continue;
    }

    if (argument === "--l2-strength") {
      options.l2Strength = Number(requireArgumentValue(argv, index, argument));

      index++;
      continue;
    }

    if (argument === "--report-every") {
      options.reportEvery = Number(requireArgumentValue(argv, index, argument));

      index++;
      continue;
    }

    if (argument === "--threshold") {
      options.threshold = Number(requireArgumentValue(argv, index, argument));

      index++;
      continue;
    }

    if (argument === "--top-weights") {
      options.topWeightCount = Number(
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
REFERENCE CANDIDATE LOGISTIC BASELINE TRAINING

Usage:
  node scripts/train_reference_candidate_logistic_baseline_model.js

Options:
  --dataset <path>
      Input ML dataset.

      Default:
      ./ml_datasets/reference_candidate_binary_dataset.jsonl

  --split <path>
      Reproducible split manifest.

      Default:
      ./ml_datasets/reference_candidate_baseline_split.json

  --vector-summary <path>
      Vector preparation summary.

      Default:
      ./ml_datasets/reference_candidate_baseline_vector_summary.json

  --out <path>
      Output model artifact.

      Default:
      ./ml_models/reference_candidate_logistic_baseline_model.json

  --epochs <number>
      Default: 2000

  --learning-rate <number>
      Default: 0.01

  --l2-strength <number>
      Default: 0.001

  --report-every <number>
      Default: 100

  --threshold <number>
      Evaluation threshold.

      Default: 0.5

  --top-weights <number>
      Number of influential weights printed.

      Default: 20

  --help, -h
      Show this help.

Important:
  Threshold 0.5 is only an initial technical evaluation.

  The FN-safe threshold will be selected in a later step.
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

function validateOptions(options) {
  validateTrainingConfiguration({
    epochs: options.epochs,
    learningRate: options.learningRate,
    l2Strength: options.l2Strength,
    reportEvery: options.reportEvery,
  });

  if (
    !Number.isFinite(options.threshold) ||
    options.threshold < 0 ||
    options.threshold > 1
  ) {
    throw new Error("threshold must be between 0 and 1");
  }

  if (
    !Number.isInteger(options.topWeightCount) ||
    options.topWeightCount <= 0
  ) {
    throw new Error("topWeightCount must be a positive integer");
  }
}

function calculateFileSha256(filePath) {
  assertFileExists(filePath, "File");

  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(filePath))
    .digest("hex");
}

function calculateValueSha256(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value), "utf8")
    .digest("hex");
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), {
    recursive: true,
  });

  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function validateVectorSummary({
  vectorSummary,
  datasetPath,
  splitPath,
  featureNames,
}) {
  const errors = [];

  const datasetSha256 = calculateDatasetSha256(datasetPath);

  const splitSha256 = calculateFileSha256(splitPath);

  if (vectorSummary?.dataset?.sha256 !== datasetSha256) {
    errors.push("Vector summary dataset SHA-256 does not match.");
  }

  if (
    vectorSummary?.vectorization?.originalFeatureCount !== featureNames.length
  ) {
    errors.push(
      `Vector summary feature count mismatch: ` +
        `summary=${vectorSummary?.vectorization?.originalFeatureCount}, ` +
        `actual=${featureNames.length}.`,
    );
  }

  const expectedDimensions = featureNames.length * 2;

  if (
    vectorSummary?.vectorization?.totalDimensionCount !== expectedDimensions
  ) {
    errors.push(
      `Vector summary dimension count mismatch: ` +
        `summary=${vectorSummary?.vectorization?.totalDimensionCount}, ` +
        `expected=${expectedDimensions}.`,
    );
  }

  if (vectorSummary?.validationResult?.passed !== true) {
    errors.push("Vector summary validationResult.passed is not true.");
  }

  return {
    passed: errors.length === 0,
    errors,
    datasetSha256,
    splitSha256,
  };
}

function buildTrainingExamples(vectorizedEntries) {
  return vectorizedEntries.map((entry) => ({
    recognitionId: entry.recognitionId,
    targetKanji: entry.targetKanji,
    label: entry.label,
    vector: entry.vector,
  }));
}

function summarizeProbabilities(predictions) {
  if (!Array.isArray(predictions) || predictions.length === 0) {
    return {
      minimum: null,
      maximum: null,
      average: null,
    };
  }

  const probabilities = predictions.map((prediction) => prediction.probability);

  return {
    minimum: Math.min(...probabilities),
    maximum: Math.max(...probabilities),
    average:
      probabilities.reduce((total, probability) => total + probability, 0) /
      probabilities.length,
  };
}

function validateEvaluation({ evaluation, expectedRowCount, partitionName }) {
  const errors = [];

  if (evaluation.predictions.length !== expectedRowCount) {
    errors.push(`${partitionName} prediction count mismatch.`);
  }

  const metricRowCount =
    evaluation.metrics.truePositive +
    evaluation.metrics.trueNegative +
    evaluation.metrics.falsePositive +
    evaluation.metrics.falseNegative;

  if (metricRowCount !== expectedRowCount) {
    errors.push(`${partitionName} confusion matrix row count mismatch.`);
  }

  for (const prediction of evaluation.predictions) {
    if (
      !Number.isFinite(prediction.probability) ||
      prediction.probability < 0 ||
      prediction.probability > 1
    ) {
      errors.push(`${partitionName} contains an invalid probability.`);

      break;
    }
  }

  return {
    passed: errors.length === 0,
    errors,
  };
}

function buildModelArtifact({
  options,
  datasetEntries,
  splitManifest,
  vectorSummaryValidation,
  vectorSummaryPath,
  featureNames,
  featureTransformers,
  dimensionNames,
  trainingExamples,
  validationExamples,
  trainingResult,
  trainingEvaluation,
  validationEvaluation,
  rankedWeights,
  integrityErrors,
}) {
  const modelPayload = {
    bias: trainingResult.model.bias,
    weights: trainingResult.model.weights,
  };

  return {
    schemaVersion: 1,
    purpose:
      "First interpretable logistic regression baseline for reference candidate validation",
    modelType: "binary_logistic_regression",
    evaluationScope:
      "Deterministic stratified row-level development split. " +
      "Not evidence of generalization to unseen kanjis.",
    dataset: {
      path: options.datasetPath,
      sha256: vectorSummaryValidation.datasetSha256,
      rowCount: datasetEntries.length,
    },
    split: {
      path: options.splitPath,
      sha256: vectorSummaryValidation.splitSha256,
      strategy: splitManifest.strategy,
      seed: splitManifest.configuration?.seed,
      validationRatio: splitManifest.configuration?.validationRatio,
    },
    vectorSummary: {
      path: vectorSummaryPath,
      sha256: calculateFileSha256(vectorSummaryPath),
    },
    vectorization: {
      strategy: "standardized_present_values_plus_presence_indicator",
      fittingScope: "training_partition_only",
      originalFeatureCount: featureNames.length,
      dimensionCount: dimensionNames.length,
      dimensionNames,
      featureTransformers,
    },
    trainingConfiguration: {
      epochs: options.epochs,
      learningRate: options.learningRate,
      l2Strength: options.l2Strength,
      reportEvery: options.reportEvery,
      initialEvaluationThreshold: options.threshold,
      initialization: "zero_bias_and_zero_weights",
      optimization: "full_batch_gradient_descent",
    },
    partitions: {
      training: {
        rowCount: trainingExamples.length,
      },
      validation: {
        rowCount: validationExamples.length,
      },
    },
    training: {
      initialLoss: trainingResult.initialLoss,
      finalLoss: trainingResult.finalLoss,
      history: trainingResult.history,
    },
    model: {
      ...modelPayload,
      modelPayloadSha256: calculateValueSha256(modelPayload),
      weightCount: trainingResult.model.weights.length,
    },
    evaluationAtInitialThreshold: {
      threshold: options.threshold,
      training: {
        metrics: trainingEvaluation.metrics,
        probabilitySummary: summarizeProbabilities(
          trainingEvaluation.predictions,
        ),
      },
      validation: {
        metrics: validationEvaluation.metrics,
        probabilitySummary: summarizeProbabilities(
          validationEvaluation.predictions,
        ),
      },
    },
    interpretation: {
      rankedWeights,
    },
    integrity: {
      passed: integrityErrors.length === 0,
      errors: integrityErrors,
    },
  };
}

function formatDecimal(value) {
  if (value === null || value === undefined) {
    return "n/a";
  }

  return value.toFixed(6);
}

function printMetrics(metrics) {
  console.log(
    `TP=${metrics.truePositive}, ` +
      `TN=${metrics.trueNegative}, ` +
      `FP=${metrics.falsePositive}, ` +
      `FN=${metrics.falseNegative}`,
  );

  console.log(
    `Accuracy=${formatDecimal(metrics.accuracy)}, ` +
      `Recall=${formatDecimal(metrics.recall)}, ` +
      `Specificity=${formatDecimal(metrics.specificity)}, ` +
      `Precision=${formatDecimal(metrics.precision)}`,
  );
}

function printTrainingReport({ artifact, outputPath, topWeightCount }) {
  console.log("");
  console.log("REFERENCE CANDIDATE LOGISTIC BASELINE TRAINING");
  console.log("==============================================");

  console.log(`Dataset SHA-256: ${artifact.dataset.sha256}`);

  console.log(`Split SHA-256: ${artifact.split.sha256}`);

  console.log(`Output: ${outputPath}`);

  console.log("");
  console.log("Configuration");
  console.log("-------------");
  console.log(`Training rows: ${artifact.partitions.training.rowCount}`);
  console.log(`Validation rows: ${artifact.partitions.validation.rowCount}`);
  console.log(
    `Original features: ${artifact.vectorization.originalFeatureCount}`,
  );
  console.log(`Dimensions: ${artifact.vectorization.dimensionCount}`);
  console.log(`Epochs: ${artifact.trainingConfiguration.epochs}`);
  console.log(`Learning rate: ${artifact.trainingConfiguration.learningRate}`);
  console.log(`L2 strength: ${artifact.trainingConfiguration.l2Strength}`);

  console.log("");
  console.log("Training loss");
  console.log("-------------");
  console.log(
    `Initial total loss: ${formatDecimal(
      artifact.training.initialLoss.totalLoss,
    )}`,
  );
  console.log(
    `Final total loss: ${formatDecimal(artifact.training.finalLoss.totalLoss)}`,
  );
  console.log(
    `Final cross entropy: ${formatDecimal(
      artifact.training.finalLoss.meanCrossEntropy,
    )}`,
  );
  console.log(
    `Final L2 penalty: ${formatDecimal(artifact.training.finalLoss.l2Penalty)}`,
  );

  console.log("");
  console.log(
    `Training evaluation at threshold ${artifact.evaluationAtInitialThreshold.threshold}`,
  );
  console.log("-------------------------------------");

  printMetrics(artifact.evaluationAtInitialThreshold.training.metrics);

  console.log("");
  console.log(
    `Validation evaluation at threshold ${artifact.evaluationAtInitialThreshold.threshold}`,
  );
  console.log("---------------------------------------");

  printMetrics(artifact.evaluationAtInitialThreshold.validation.metrics);

  console.log("");
  console.log(`Top ${topWeightCount} influential dimensions`);
  console.log("--------------------------------");

  for (const weight of artifact.interpretation.rankedWeights.slice(
    0,
    topWeightCount,
  )) {
    console.log(
      `${weight.dimensionName}: ` +
        `weight=${formatDecimal(weight.weight)}, ` +
        `effect=${weight.effect}`,
    );
  }

  console.log("");
  console.log("Integrity");
  console.log("---------");
  console.log(`Model weights: ${artifact.model.weightCount}`);
  console.log(`Model payload SHA-256: ${artifact.model.modelPayloadSha256}`);
  console.log(`Errors: ${artifact.integrity.errors.length}`);
  console.log(`Passed: ${artifact.integrity.passed}`);

  console.log("");
  console.log("Evaluation warning");
  console.log("------------------");
  console.log(
    "Threshold 0.5 is provisional. FN-safe threshold selection has not run yet.",
  );
}

function main(argv = process.argv.slice(2)) {
  try {
    const options = parseArguments(argv);

    if (options.help) {
      printHelp();
      return;
    }

    validateOptions(options);

    assertFileExists(options.datasetPath, "ML dataset");

    assertFileExists(options.splitPath, "Baseline split manifest");

    assertFileExists(options.vectorSummaryPath, "Baseline vector summary");

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
      throw new Error(`Split validation failed. ` + splitValidation.errors[0]);
    }

    const vectorSummary = readJson(
      options.vectorSummaryPath,
      "Baseline vector summary",
    );

    const vectorSummaryValidation = validateVectorSummary({
      vectorSummary,
      datasetPath: options.datasetPath,
      splitPath: options.splitPath,
      featureNames,
    });

    if (!vectorSummaryValidation.passed) {
      throw new Error(
        `Vector summary validation failed. ` +
          vectorSummaryValidation.errors[0],
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

    if (
      !trainingVectorValidation.passed ||
      !validationVectorValidation.passed
    ) {
      throw new Error("Vector validation failed before training.");
    }

    const trainingExamples = buildTrainingExamples(trainingVectors);

    const validationExamples = buildTrainingExamples(validationVectors);

    const trainingResult = trainLogisticRegression({
      trainingExamples,
      epochs: options.epochs,
      learningRate: options.learningRate,
      l2Strength: options.l2Strength,
      reportEvery: options.reportEvery,
    });

    const trainingResultValidation = validateTrainingResult(trainingResult);

    const trainingEvaluation = evaluateLogisticModel({
      model: trainingResult.model,
      examples: trainingExamples,
      threshold: options.threshold,
    });

    const validationEvaluation = evaluateLogisticModel({
      model: trainingResult.model,
      examples: validationExamples,
      threshold: options.threshold,
    });

    const trainingEvaluationValidation = validateEvaluation({
      evaluation: trainingEvaluation,
      expectedRowCount: trainingExamples.length,
      partitionName: "Training",
    });

    const validationEvaluationValidation = validateEvaluation({
      evaluation: validationEvaluation,
      expectedRowCount: validationExamples.length,
      partitionName: "Validation",
    });

    const rankedWeights = rankModelWeights({
      model: trainingResult.model,
      dimensionNames,
    });

    const integrityErrors = [
      ...trainingResultValidation.errors,
      ...trainingEvaluationValidation.errors,
      ...validationEvaluationValidation.errors,
    ];

    const artifact = buildModelArtifact({
      options,
      datasetEntries,
      splitManifest,
      vectorSummaryValidation,
      vectorSummaryPath: options.vectorSummaryPath,
      featureNames,
      featureTransformers,
      dimensionNames,
      trainingExamples,
      validationExamples,
      trainingResult,
      trainingEvaluation,
      validationEvaluation,
      rankedWeights,
      integrityErrors,
    });

    writeJson(options.outputPath, artifact);

    printTrainingReport({
      artifact,
      outputPath: options.outputPath,
      topWeightCount: options.topWeightCount,
    });

    if (!artifact.integrity.passed) {
      console.error("");
      console.error("Model integrity errors:");

      for (const error of artifact.integrity.errors) {
        console.error(`- ${error}`);
      }

      process.exitCode = 1;
      return;
    }

    console.log("");
    console.log("Logistic baseline model trained successfully.");
  } catch (error) {
    console.error("");
    console.error(`Logistic baseline training failed: ${error.message}`);

    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  DEFAULT_TOP_WEIGHT_COUNT,
  parseArguments,
  assertFileExists,
  validateOptions,
  calculateFileSha256,
  calculateValueSha256,
  writeJson,
  validateVectorSummary,
  buildTrainingExamples,
  summarizeProbabilities,
  validateEvaluation,
  buildModelArtifact,
  formatDecimal,
  main,
};
