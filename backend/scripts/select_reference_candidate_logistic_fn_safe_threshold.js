"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const {
  loadJsonlDataset,
  validateDatasetRows,
  determineFeatureNames,
  calculateDescriptorMetrics,
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
  validateModel,
  evaluateLogisticModel,
  predictProbability,
} = require("./reference_candidate_logistic_regression");

const {
  calculateFileSha256,
  calculateValueSha256,
  buildTrainingExamples,
} = require("./train_reference_candidate_logistic_baseline_model");

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

const DEFAULT_MODEL_PATH = path.resolve(
  process.cwd(),
  "ml_models",
  "reference_candidate_logistic_baseline_model.json",
);

const DEFAULT_OUTPUT_PATH = path.resolve(
  process.cwd(),
  "ml_models",
  "reference_candidate_logistic_fn_safe_threshold_report.json",
);

const DEFAULT_REFERENCE_THRESHOLD = 0.5;

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
    modelPath: DEFAULT_MODEL_PATH,
    outputPath: DEFAULT_OUTPUT_PATH,
    referenceThreshold: DEFAULT_REFERENCE_THRESHOLD,
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

    if (argument === "--model") {
      options.modelPath = path.resolve(
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

    if (argument === "--reference-threshold") {
      options.referenceThreshold = Number(
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
REFERENCE CANDIDATE LOGISTIC FN-SAFE THRESHOLD

Usage:
  node scripts/select_reference_candidate_logistic_fn_safe_threshold.js

Options:
  --dataset <path>
      Input ML dataset.

      Default:
      ./ml_datasets/reference_candidate_binary_dataset.jsonl

  --split <path>
      Reproducible split manifest.

      Default:
      ./ml_datasets/reference_candidate_baseline_split.json

  --model <path>
      Trained logistic baseline model.

      Default:
      ./ml_models/reference_candidate_logistic_baseline_model.json

  --out <path>
      Output threshold selection report.

      Default:
      ./ml_models/reference_candidate_logistic_fn_safe_threshold_report.json

  --reference-threshold <number>
      Provisional threshold used for comparison.

      Default: 0.5

  --help, -h
      Show this help.

Selection rule:
  1. Require validation false negatives = 0.
  2. Among safe thresholds, minimize false positives.
  3. Among ties, choose the highest threshold.

Important:
  The selected threshold is calibrated on the development validation
  partition. It is not yet evidence of generalization to unseen kanjis.
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

function validateThreshold(threshold, name) {
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new Error(`${name} must be between 0 and 1`);
  }
}

function validateOptions(options) {
  validateThreshold(options.referenceThreshold, "referenceThreshold");
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), {
    recursive: true,
  });

  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function getModelPayload(modelArtifact) {
  return {
    bias: modelArtifact.model?.bias,
    weights: modelArtifact.model?.weights,
  };
}

function validateModelArtifact({
  modelArtifact,
  modelPath,
  datasetPath,
  splitPath,
  featureNames,
  dimensionNames,
}) {
  const errors = [];

  const datasetSha256 = calculateDatasetSha256(datasetPath);

  const splitSha256 = calculateFileSha256(splitPath);

  if (modelArtifact.modelType !== "binary_logistic_regression") {
    errors.push(`Unsupported model type: ${modelArtifact.modelType}.`);
  }

  if (modelArtifact.dataset?.sha256 !== datasetSha256) {
    errors.push("Model dataset SHA-256 does not match the current dataset.");
  }

  if (modelArtifact.split?.sha256 !== splitSha256) {
    errors.push("Model split SHA-256 does not match the current split.");
  }

  if (
    modelArtifact.vectorization?.originalFeatureCount !== featureNames.length
  ) {
    errors.push(
      `Model original feature count mismatch: ` +
        `model=${modelArtifact.vectorization?.originalFeatureCount}, ` +
        `actual=${featureNames.length}.`,
    );
  }

  if (modelArtifact.vectorization?.dimensionCount !== dimensionNames.length) {
    errors.push(
      `Model dimension count mismatch: ` +
        `model=${modelArtifact.vectorization?.dimensionCount}, ` +
        `actual=${dimensionNames.length}.`,
    );
  }

  const storedDimensionNames = modelArtifact.vectorization?.dimensionNames;

  if (
    !Array.isArray(storedDimensionNames) ||
    storedDimensionNames.length !== dimensionNames.length ||
    storedDimensionNames.some(
      (dimensionName, index) => dimensionName !== dimensionNames[index],
    )
  ) {
    errors.push(
      "Model dimension names or order do not match reconstructed vectors.",
    );
  }

  const model = getModelPayload(modelArtifact);

  try {
    validateModel(model, dimensionNames.length);
  } catch (error) {
    errors.push(error.message);
  }

  const calculatedPayloadSha256 = calculateValueSha256(model);

  if (modelArtifact.model?.modelPayloadSha256 !== calculatedPayloadSha256) {
    errors.push(
      "Model payload SHA-256 does not match the stored model payload.",
    );
  }

  if (modelArtifact.integrity?.passed !== true) {
    errors.push("Stored model integrity.passed is not true.");
  }

  return {
    passed: errors.length === 0,
    errors,
    model,
    datasetSha256,
    splitSha256,
    modelFileSha256: calculateFileSha256(modelPath),
    calculatedPayloadSha256,
  };
}

function buildProbabilityRows({ model, examples }) {
  return examples.map((example) => ({
    recognitionId: example.recognitionId,
    targetKanji: example.targetKanji,
    label: example.label,
    probability: predictProbability({
      model,
      vector: example.vector,
    }),
  }));
}

function buildCandidateThresholds(probabilityRows) {
  if (!Array.isArray(probabilityRows) || probabilityRows.length === 0) {
    throw new Error("probabilityRows must be a non-empty array");
  }

  const thresholds = new Set([0, 1]);

  for (const row of probabilityRows) {
    validateThreshold(row.probability, "probability");

    thresholds.add(row.probability);
  }

  return [...thresholds].sort((left, right) => right - left);
}

function evaluateProbabilityRows({ probabilityRows, threshold }) {
  validateThreshold(threshold, "threshold");

  let truePositive = 0;
  let trueNegative = 0;
  let falsePositive = 0;
  let falseNegative = 0;

  const predictions = [];

  for (const row of probabilityRows) {
    const predictedLabel = row.probability >= threshold ? 1 : 0;

    if (row.label === 1 && predictedLabel === 1) {
      truePositive++;
    } else if (row.label === 0 && predictedLabel === 0) {
      trueNegative++;
    } else if (row.label === 0 && predictedLabel === 1) {
      falsePositive++;
    } else if (row.label === 1 && predictedLabel === 0) {
      falseNegative++;
    } else {
      throw new Error(`Unsupported binary label: ${row.label}`);
    }

    predictions.push({
      ...row,
      predictedLabel,
    });
  }

  const positiveCount = truePositive + falseNegative;

  const negativeCount = trueNegative + falsePositive;

  const predictedPositiveCount = truePositive + falsePositive;

  const rowCount = positiveCount + negativeCount;

  return {
    threshold,
    metrics: {
      truePositive,
      trueNegative,
      falsePositive,
      falseNegative,
      rowCount,
      positiveCount,
      negativeCount,
      predictedPositiveCount,
      predictedNegativeCount: trueNegative + falseNegative,
      accuracy: safeDivide(truePositive + trueNegative, rowCount),
      recall: safeDivide(truePositive, positiveCount),
      specificity: safeDivide(trueNegative, negativeCount),
      precision: safeDivide(truePositive, predictedPositiveCount),
      falseNegativeRate: safeDivide(falseNegative, positiveCount),
      falsePositiveRate: safeDivide(falsePositive, negativeCount),
    },
    predictions,
  };
}

function safeDivide(numerator, denominator) {
  if (denominator === 0) {
    return null;
  }

  return numerator / denominator;
}

function compareSafeThresholdCandidates(left, right) {
  if (left.metrics.falsePositive !== right.metrics.falsePositive) {
    return left.metrics.falsePositive - right.metrics.falsePositive;
  }

  if (left.threshold !== right.threshold) {
    return right.threshold - left.threshold;
  }

  return 0;
}

function selectFnSafeThreshold(probabilityRows) {
  const positiveRows = probabilityRows.filter((row) => row.label === 1);

  const negativeRows = probabilityRows.filter((row) => row.label === 0);

  if (positiveRows.length === 0) {
    throw new Error(
      "Cannot select an FN-safe threshold without positive rows.",
    );
  }

  if (negativeRows.length === 0) {
    throw new Error("Cannot evaluate false positives without negative rows.");
  }

  const candidateThresholds = buildCandidateThresholds(probabilityRows);

  const evaluations = candidateThresholds.map((threshold) =>
    evaluateProbabilityRows({
      probabilityRows,
      threshold,
    }),
  );

  const safeEvaluations = evaluations
    .filter((evaluation) => evaluation.metrics.falseNegative === 0)
    .sort(compareSafeThresholdCandidates);

  if (safeEvaluations.length === 0) {
    throw new Error("No FN-safe threshold was found.");
  }

  const selectedEvaluation = safeEvaluations[0];

  const positiveProbabilities = positiveRows
    .map((row) => row.probability)
    .sort((left, right) => left - right);

  const negativeProbabilities = negativeRows
    .map((row) => row.probability)
    .sort((left, right) => right - left);

  return {
    selectionRule: [
      "require_false_negative_count_zero",
      "minimize_false_positive_count",
      "maximize_threshold_on_tie",
    ],
    candidateThresholdCount: candidateThresholds.length,
    safeCandidateCount: safeEvaluations.length,
    selectedThreshold: selectedEvaluation.threshold,
    selectedEvaluation,
    probabilityBoundaries: {
      minimumPositiveProbability: positiveProbabilities[0],
      maximumNegativeProbability: negativeProbabilities[0],
      positiveNegativeMargin:
        positiveProbabilities[0] - negativeProbabilities[0],
    },
  };
}

function summarizeChangedPredictions({
  referenceEvaluation,
  selectedEvaluation,
}) {
  const referenceById = new Map(
    referenceEvaluation.predictions.map((prediction) => [
      prediction.recognitionId,
      prediction,
    ]),
  );

  const changedPredictions = [];

  for (const selectedPrediction of selectedEvaluation.predictions) {
    const referencePrediction = referenceById.get(
      selectedPrediction.recognitionId,
    );

    if (!referencePrediction) {
      throw new Error(
        `Reference prediction not found: ` +
          `${selectedPrediction.recognitionId}`,
      );
    }

    if (
      referencePrediction.predictedLabel !== selectedPrediction.predictedLabel
    ) {
      changedPredictions.push({
        recognitionId: selectedPrediction.recognitionId,
        targetKanji: selectedPrediction.targetKanji,
        label: selectedPrediction.label,
        probability: selectedPrediction.probability,
        referencePredictedLabel: referencePrediction.predictedLabel,
        selectedPredictedLabel: selectedPrediction.predictedLabel,
      });
    }
  }

  changedPredictions.sort((left, right) => {
    if (left.probability !== right.probability) {
      return left.probability - right.probability;
    }

    return left.recognitionId.localeCompare(right.recognitionId);
  });

  return {
    changedPredictionCount: changedPredictions.length,
    recoveredPositiveCount: changedPredictions.filter(
      (prediction) =>
        prediction.label === 1 &&
        prediction.referencePredictedLabel === 0 &&
        prediction.selectedPredictedLabel === 1,
    ).length,
    newlyAcceptedNegativeCount: changedPredictions.filter(
      (prediction) =>
        prediction.label === 0 &&
        prediction.referencePredictedLabel === 0 &&
        prediction.selectedPredictedLabel === 1,
    ).length,
    changedPredictions,
  };
}

function calculateMetricDifference({ candidateMetrics, baselineMetrics }) {
  return {
    truePositive: candidateMetrics.truePositive - baselineMetrics.truePositive,
    trueNegative: candidateMetrics.trueNegative - baselineMetrics.trueNegative,
    falsePositive:
      candidateMetrics.falsePositive - baselineMetrics.falsePositive,
    falseNegative:
      candidateMetrics.falseNegative - baselineMetrics.falseNegative,
    accuracy: subtractNullable(
      candidateMetrics.accuracy,
      baselineMetrics.accuracy,
    ),
    recall: subtractNullable(candidateMetrics.recall, baselineMetrics.recall),
    specificity: subtractNullable(
      candidateMetrics.specificity,
      baselineMetrics.specificity,
    ),
    precision: subtractNullable(
      candidateMetrics.precision,
      baselineMetrics.precision,
    ),
  };
}

function subtractNullable(left, right) {
  if (
    left === null ||
    left === undefined ||
    right === null ||
    right === undefined
  ) {
    return null;
  }

  return left - right;
}

function validateThresholdSelection({
  selection,
  validationRowCount,
  descriptorMetrics,
}) {
  const errors = [];

  const selectedMetrics = selection.selectedEvaluation.metrics;

  if (selectedMetrics.rowCount !== validationRowCount) {
    errors.push("Selected threshold evaluation row count mismatch.");
  }

  if (selectedMetrics.falseNegative !== 0) {
    errors.push("Selected threshold is not FN-safe.");
  }

  if (
    selection.selectedThreshold !==
    selection.probabilityBoundaries.minimumPositiveProbability
  ) {
    errors.push("Selected threshold is not the minimum positive probability.");
  }

  if (descriptorMetrics.falseNegative !== 0) {
    errors.push("Descriptor baseline unexpectedly has false negatives.");
  }

  return {
    passed: errors.length === 0,
    errors,
  };
}

function buildThresholdReport({
  options,
  modelArtifact,
  modelValidation,
  splitManifest,
  trainingExamples,
  validationExamples,
  descriptorTrainingMetrics,
  descriptorValidationMetrics,
  referenceTrainingEvaluation,
  referenceValidationEvaluation,
  trainingSafeEvaluation,
  selection,
  changedPredictions,
  selectionValidation,
}) {
  const selectedValidationMetrics = selection.selectedEvaluation.metrics;

  return {
    schemaVersion: 1,
    purpose:
      "Select the highest practical logistic threshold that preserves zero validation false negatives",
    evaluationScope:
      "Threshold calibrated on the deterministic row-level development validation partition. " +
      "Not evidence of generalization to unseen kanjis.",
    dataset: {
      path: options.datasetPath,
      sha256: modelValidation.datasetSha256,
    },
    split: {
      path: options.splitPath,
      sha256: modelValidation.splitSha256,
      strategy: splitManifest.strategy,
      seed: splitManifest.configuration?.seed,
    },
    model: {
      path: options.modelPath,
      fileSha256: modelValidation.modelFileSha256,
      modelPayloadSha256: modelValidation.calculatedPayloadSha256,
      modelType: modelArtifact.modelType,
    },
    partitions: {
      trainingRowCount: trainingExamples.length,
      validationRowCount: validationExamples.length,
    },
    referenceThreshold: {
      threshold: options.referenceThreshold,
      trainingMetrics: referenceTrainingEvaluation.metrics,
      validationMetrics: referenceValidationEvaluation.metrics,
    },
    fnSafeThreshold: {
      selectionRule: selection.selectionRule,
      candidateThresholdCount: selection.candidateThresholdCount,
      safeCandidateCount: selection.safeCandidateCount,
      threshold: selection.selectedThreshold,
      probabilityBoundaries: selection.probabilityBoundaries,
      trainingMetrics: trainingSafeEvaluation.metrics,
      validationMetrics: selectedValidationMetrics,
    },
    descriptorBaseline: {
      trainingMetrics: descriptorTrainingMetrics,
      validationMetrics: descriptorValidationMetrics,
    },
    comparisons: {
      fnSafeVsDescriptorValidation: calculateMetricDifference({
        candidateMetrics: selectedValidationMetrics,
        baselineMetrics: descriptorValidationMetrics,
      }),
      fnSafeVsReferenceThresholdValidation: calculateMetricDifference({
        candidateMetrics: selectedValidationMetrics,
        baselineMetrics: referenceValidationEvaluation.metrics,
      }),
    },
    changedPredictions,
    integrity: {
      passed: selectionValidation.passed,
      errors: selectionValidation.errors,
    },
  };
}

function formatDecimal(value) {
  if (value === null || value === undefined) {
    return "n/a";
  }

  return value.toFixed(9);
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

function printThresholdReport({ report, outputPath }) {
  console.log("");
  console.log("REFERENCE CANDIDATE LOGISTIC FN-SAFE THRESHOLD");
  console.log("==============================================");

  console.log(`Model file SHA-256: ${report.model.fileSha256}`);

  console.log(`Model payload SHA-256: ${report.model.modelPayloadSha256}`);

  console.log(`Output: ${outputPath}`);

  console.log("");
  console.log("Threshold selection");
  console.log("-------------------");

  console.log(
    `Candidate thresholds: ` +
      `${report.fnSafeThreshold.candidateThresholdCount}`,
  );

  console.log(
    `FN-safe candidates: ` + `${report.fnSafeThreshold.safeCandidateCount}`,
  );

  console.log(
    `Selected threshold: ` +
      `${formatDecimal(report.fnSafeThreshold.threshold)}`,
  );

  console.log(
    `Minimum positive probability: ` +
      `${formatDecimal(
        report.fnSafeThreshold.probabilityBoundaries.minimumPositiveProbability,
      )}`,
  );

  console.log(
    `Maximum negative probability: ` +
      `${formatDecimal(
        report.fnSafeThreshold.probabilityBoundaries.maximumNegativeProbability,
      )}`,
  );

  console.log(
    `Positive-negative margin: ` +
      `${formatDecimal(
        report.fnSafeThreshold.probabilityBoundaries.positiveNegativeMargin,
      )}`,
  );

  console.log("");
  console.log(
    `ML validation at reference threshold ${report.referenceThreshold.threshold}`,
  );
  console.log("------------------------------------------");

  printMetrics(report.referenceThreshold.validationMetrics);

  console.log("");
  console.log("ML validation at FN-safe threshold");
  console.log("----------------------------------");

  printMetrics(report.fnSafeThreshold.validationMetrics);

  console.log("");
  console.log("Descriptor validation baseline");
  console.log("------------------------------");

  printMetrics(report.descriptorBaseline.validationMetrics);

  console.log("");
  console.log("FN-safe ML versus descriptor baseline");
  console.log("-------------------------------------");

  const difference = report.comparisons.fnSafeVsDescriptorValidation;

  console.log(
    `Delta TP=${difference.truePositive}, ` +
      `TN=${difference.trueNegative}, ` +
      `FP=${difference.falsePositive}, ` +
      `FN=${difference.falseNegative}`,
  );

  console.log("");
  console.log("Effect of lowering the ML threshold");
  console.log("-----------------------------------");

  console.log(
    `Changed predictions: ` +
      `${report.changedPredictions.changedPredictionCount}`,
  );

  console.log(
    `Recovered positives: ` +
      `${report.changedPredictions.recoveredPositiveCount}`,
  );

  console.log(
    `Newly accepted negatives: ` +
      `${report.changedPredictions.newlyAcceptedNegativeCount}`,
  );

  console.log("");
  console.log("Training at selected threshold");
  console.log("------------------------------");

  printMetrics(report.fnSafeThreshold.trainingMetrics);

  console.log("");
  console.log("Integrity");
  console.log("---------");

  console.log(`Errors: ${report.integrity.errors.length}`);

  console.log(`Passed: ${report.integrity.passed}`);

  console.log("");
  console.log("Evaluation warning");
  console.log("------------------");

  console.log(
    "The threshold was selected using validation labels. " +
      "A separate quality gate and unseen-kanji evaluation are still required.",
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

    assertFileExists(options.modelPath, "Logistic baseline model");

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
      throw new Error("Vector validation failed.");
    }

    const modelArtifact = readJson(
      options.modelPath,
      "Logistic baseline model",
    );

    const modelValidation = validateModelArtifact({
      modelArtifact,
      modelPath: options.modelPath,
      datasetPath: options.datasetPath,
      splitPath: options.splitPath,
      featureNames,
      dimensionNames,
    });

    if (!modelValidation.passed) {
      throw new Error(`Model validation failed. ` + modelValidation.errors[0]);
    }

    const trainingExamples = buildTrainingExamples(trainingVectors);

    const validationExamples = buildTrainingExamples(validationVectors);

    const validationProbabilityRows = buildProbabilityRows({
      model: modelValidation.model,
      examples: validationExamples,
    });

    const selection = selectFnSafeThreshold(validationProbabilityRows);

    const referenceTrainingEvaluation = evaluateLogisticModel({
      model: modelValidation.model,
      examples: trainingExamples,
      threshold: options.referenceThreshold,
    });

    const referenceValidationEvaluation = evaluateLogisticModel({
      model: modelValidation.model,
      examples: validationExamples,
      threshold: options.referenceThreshold,
    });

    const trainingSafeEvaluation = evaluateLogisticModel({
      model: modelValidation.model,
      examples: trainingExamples,
      threshold: selection.selectedThreshold,
    });

    const descriptorTrainingMetrics =
      calculateDescriptorMetrics(trainingEntries);

    const descriptorValidationMetrics =
      calculateDescriptorMetrics(validationEntries);

    const changedPredictions = summarizeChangedPredictions({
      referenceEvaluation: referenceValidationEvaluation,
      selectedEvaluation: selection.selectedEvaluation,
    });

    const selectionValidation = validateThresholdSelection({
      selection,
      validationRowCount: validationExamples.length,
      descriptorMetrics: descriptorValidationMetrics,
    });

    const report = buildThresholdReport({
      options,
      modelArtifact,
      modelValidation,
      splitManifest,
      trainingExamples,
      validationExamples,
      descriptorTrainingMetrics,
      descriptorValidationMetrics,
      referenceTrainingEvaluation,
      referenceValidationEvaluation,
      trainingSafeEvaluation,
      selection,
      changedPredictions,
      selectionValidation,
    });

    writeJson(options.outputPath, report);

    printThresholdReport({
      report,
      outputPath: options.outputPath,
    });

    if (!report.integrity.passed) {
      console.error("");
      console.error("Threshold selection integrity errors:");

      for (const error of report.integrity.errors) {
        console.error(`- ${error}`);
      }

      process.exitCode = 1;
      return;
    }

    console.log("");
    console.log("FN-safe threshold selected successfully.");
  } catch (error) {
    console.error("");
    console.error(`FN-safe threshold selection failed: ${error.message}`);

    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  DEFAULT_REFERENCE_THRESHOLD,
  parseArguments,
  validateThreshold,
  validateOptions,
  writeJson,
  getModelPayload,
  validateModelArtifact,
  buildProbabilityRows,
  buildCandidateThresholds,
  evaluateProbabilityRows,
  safeDivide,
  compareSafeThresholdCandidates,
  selectFnSafeThreshold,
  summarizeChangedPredictions,
  calculateMetricDifference,
  subtractNullable,
  validateThresholdSelection,
  buildThresholdReport,
  formatDecimal,
  main,
};
