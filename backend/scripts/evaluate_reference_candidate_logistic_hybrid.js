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
} = require("./reference_candidate_logistic_regression");

const {
  calculateFileSha256,
  calculateValueSha256,
  buildTrainingExamples,
} = require("./train_reference_candidate_logistic_baseline_model");

const {
  buildProbabilityRows,
  calculateMetricDifference,
} = require("./select_reference_candidate_logistic_fn_safe_threshold");

const {
  buildHybridEvaluationRows,
  evaluateHybridRows,
  summarizeHybridChanges,
  validateHybridEvaluation,
} = require("./reference_candidate_hybrid_evaluation");

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

const DEFAULT_THRESHOLD_REPORT_PATH = path.resolve(
  process.cwd(),
  "ml_models",
  "reference_candidate_logistic_fn_safe_threshold_report.json",
);

const DEFAULT_OUTPUT_PATH = path.resolve(
  process.cwd(),
  "ml_models",
  "reference_candidate_logistic_hybrid_evaluation_report.json",
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
    splitPath: DEFAULT_SPLIT_PATH,
    modelPath: DEFAULT_MODEL_PATH,
    thresholdReportPath: DEFAULT_THRESHOLD_REPORT_PATH,
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

    if (argument === "--model") {
      options.modelPath = path.resolve(
        process.cwd(),
        requireArgumentValue(argv, index, argument),
      );

      index++;
      continue;
    }

    if (argument === "--threshold-report") {
      options.thresholdReportPath = path.resolve(
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
REFERENCE CANDIDATE LOGISTIC HYBRID EVALUATION

Usage:
  node scripts/evaluate_reference_candidate_logistic_hybrid.js

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

  --threshold-report <path>
      FN-safe threshold selection report.

      Default:
      ./ml_models/reference_candidate_logistic_fn_safe_threshold_report.json

  --out <path>
      Output hybrid evaluation report.

      Default:
      ./ml_models/reference_candidate_logistic_hybrid_evaluation_report.json

  --help, -h
      Show this help.

Hybrid decision:
  accept =
    descriptorPrediction === 1 &&
    mlProbability >= fnSafeThreshold

Important:
  This is still a row-level development evaluation.

  It is not evidence of generalization to unseen kanjis.
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

function getModelPayload(modelArtifact) {
  return {
    bias: modelArtifact.model?.bias,
    weights: modelArtifact.model?.weights,
  };
}

function compareOrderedArrays(left, right) {
  if (
    !Array.isArray(left) ||
    !Array.isArray(right) ||
    left.length !== right.length
  ) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

function validateStoredArtifacts({
  datasetPath,
  splitPath,
  modelPath,
  thresholdReportPath,
  featureNames,
  dimensionNames,
  modelArtifact,
  thresholdReport,
}) {
  const errors = [];

  const datasetSha256 = calculateDatasetSha256(datasetPath);

  const splitSha256 = calculateFileSha256(splitPath);

  const modelFileSha256 = calculateFileSha256(modelPath);

  const thresholdReportFileSha256 = calculateFileSha256(thresholdReportPath);

  const model = getModelPayload(modelArtifact);

  try {
    validateModel(model, dimensionNames.length);
  } catch (error) {
    errors.push(error.message);
  }

  const modelPayloadSha256 = calculateValueSha256(model);

  if (modelArtifact.modelType !== "binary_logistic_regression") {
    errors.push(`Unsupported model type: ${modelArtifact.modelType}.`);
  }

  if (modelArtifact.dataset?.sha256 !== datasetSha256) {
    errors.push("Model dataset SHA-256 does not match the current dataset.");
  }

  if (modelArtifact.split?.sha256 !== splitSha256) {
    errors.push("Model split SHA-256 does not match the current split.");
  }

  if (modelArtifact.model?.modelPayloadSha256 !== modelPayloadSha256) {
    errors.push("Model payload SHA-256 does not match its stored value.");
  }

  if (modelArtifact.integrity?.passed !== true) {
    errors.push("Stored model integrity.passed is not true.");
  }

  if (
    modelArtifact.vectorization?.originalFeatureCount !== featureNames.length
  ) {
    errors.push(
      `Model feature count mismatch: ` +
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

  if (
    !compareOrderedArrays(
      modelArtifact.vectorization?.dimensionNames,
      dimensionNames,
    )
  ) {
    errors.push(
      "Model dimension names or order do not match reconstructed vectors.",
    );
  }

  if (thresholdReport.dataset?.sha256 !== datasetSha256) {
    errors.push("Threshold report dataset SHA-256 does not match.");
  }

  if (thresholdReport.split?.sha256 !== splitSha256) {
    errors.push("Threshold report split SHA-256 does not match.");
  }

  if (thresholdReport.model?.fileSha256 !== modelFileSha256) {
    errors.push("Threshold report model file SHA-256 does not match.");
  }

  if (thresholdReport.model?.modelPayloadSha256 !== modelPayloadSha256) {
    errors.push("Threshold report model payload SHA-256 does not match.");
  }

  if (thresholdReport.integrity?.passed !== true) {
    errors.push("Threshold report integrity.passed is not true.");
  }

  const fnSafeThreshold = thresholdReport.fnSafeThreshold?.threshold;

  if (
    typeof fnSafeThreshold !== "number" ||
    !Number.isFinite(fnSafeThreshold) ||
    fnSafeThreshold < 0 ||
    fnSafeThreshold > 1
  ) {
    errors.push("Threshold report FN-safe threshold is invalid.");
  }

  if (thresholdReport.fnSafeThreshold?.validationMetrics?.falseNegative !== 0) {
    errors.push(
      "Stored FN-safe threshold report contains validation false negatives.",
    );
  }

  return {
    passed: errors.length === 0,
    errors,
    model,
    fnSafeThreshold,
    hashes: {
      datasetSha256,
      splitSha256,
      modelFileSha256,
      modelPayloadSha256,
      thresholdReportFileSha256,
    },
  };
}

function validateReconstructedProbabilities({
  modelArtifact,
  trainingEvaluation,
  validationEvaluation,
}) {
  const errors = [];

  const storedTrainingMetrics =
    modelArtifact.evaluationAtInitialThreshold?.training?.metrics;

  const storedValidationMetrics =
    modelArtifact.evaluationAtInitialThreshold?.validation?.metrics;

  if (!storedTrainingMetrics || !storedValidationMetrics) {
    errors.push("Stored model does not contain initial threshold metrics.");

    return {
      passed: false,
      errors,
    };
  }

  const metricNames = [
    "truePositive",
    "trueNegative",
    "falsePositive",
    "falseNegative",
  ];

  for (const metricName of metricNames) {
    if (
      trainingEvaluation.metrics[metricName] !==
      storedTrainingMetrics[metricName]
    ) {
      errors.push(`Reconstructed training metric mismatch: ${metricName}.`);
    }

    if (
      validationEvaluation.metrics[metricName] !==
      storedValidationMetrics[metricName]
    ) {
      errors.push(`Reconstructed validation metric mismatch: ${metricName}.`);
    }
  }

  return {
    passed: errors.length === 0,
    errors,
  };
}

function buildPartitionHybridResult({
  datasetEntries,
  probabilityRows,
  threshold,
  requireFalseNegativeSafe,
}) {
  const descriptorMetrics = calculateDescriptorMetrics(datasetEntries);

  const hybridRows = buildHybridEvaluationRows({
    datasetEntries,
    probabilityRows,
  });

  const hybridEvaluation = evaluateHybridRows({
    hybridRows,
    threshold,
  });

  const changeSummary = summarizeHybridChanges({
    hybridEvaluation,
  });

  const validation = validateHybridEvaluation({
    hybridEvaluation,
    descriptorMetrics,
    expectedRowCount: datasetEntries.length,
    requireFalseNegativeSafe,
  });

  return {
    descriptorMetrics,
    hybridEvaluation,
    changeSummary,
    validation,
  };
}

function buildComparisonSummary({
  descriptorMetrics,
  pureMlMetrics,
  hybridMetrics,
}) {
  return {
    hybridVsDescriptor: calculateMetricDifference({
      candidateMetrics: hybridMetrics,
      baselineMetrics: descriptorMetrics,
    }),
    hybridVsPureMl: calculateMetricDifference({
      candidateMetrics: hybridMetrics,
      baselineMetrics: pureMlMetrics,
    }),
  };
}

function buildHybridReport({
  options,
  splitManifest,
  artifactValidation,
  thresholdReport,
  trainingExamples,
  validationExamples,
  trainingPureMlEvaluation,
  validationPureMlEvaluation,
  trainingResult,
  validationResult,
  reconstructedProbabilityValidation,
}) {
  const integrityErrors = [
    ...artifactValidation.errors,
    ...reconstructedProbabilityValidation.errors,
    ...trainingResult.validation.errors,
    ...validationResult.validation.errors,
  ];

  return {
    schemaVersion: 1,
    purpose:
      "Evaluate descriptor and FN-safe logistic model as a conservative hybrid validator",
    evaluationScope:
      "Deterministic stratified row-level development split. " +
      "Not evidence of generalization to unseen kanjis.",
    decisionRule: {
      name: "descriptor_and_logistic_fn_safe",
      expression:
        "descriptorPrediction === 1 && mlProbability >= fnSafeThreshold",
      threshold: artifactValidation.fnSafeThreshold,
    },
    dataset: {
      path: options.datasetPath,
      sha256: artifactValidation.hashes.datasetSha256,
    },
    split: {
      path: options.splitPath,
      sha256: artifactValidation.hashes.splitSha256,
      strategy: splitManifest.strategy,
      seed: splitManifest.configuration?.seed,
    },
    model: {
      path: options.modelPath,
      fileSha256: artifactValidation.hashes.modelFileSha256,
      modelPayloadSha256: artifactValidation.hashes.modelPayloadSha256,
    },
    thresholdReport: {
      path: options.thresholdReportPath,
      fileSha256: artifactValidation.hashes.thresholdReportFileSha256,
    },
    partitions: {
      trainingRowCount: trainingExamples.length,
      validationRowCount: validationExamples.length,
    },
    training: {
      descriptorMetrics: trainingResult.descriptorMetrics,
      pureMlMetrics: trainingPureMlEvaluation.metrics,
      hybridMetrics: trainingResult.hybridEvaluation.metrics,
      changes: trainingResult.changeSummary,
      comparisons: buildComparisonSummary({
        descriptorMetrics: trainingResult.descriptorMetrics,
        pureMlMetrics: trainingPureMlEvaluation.metrics,
        hybridMetrics: trainingResult.hybridEvaluation.metrics,
      }),
    },
    validation: {
      descriptorMetrics: validationResult.descriptorMetrics,
      pureMlMetrics: validationPureMlEvaluation.metrics,
      hybridMetrics: validationResult.hybridEvaluation.metrics,
      changes: validationResult.changeSummary,
      comparisons: buildComparisonSummary({
        descriptorMetrics: validationResult.descriptorMetrics,
        pureMlMetrics: validationPureMlEvaluation.metrics,
        hybridMetrics: validationResult.hybridEvaluation.metrics,
      }),
    },
    thresholdSource: {
      selectedThreshold: thresholdReport.fnSafeThreshold.threshold,
      minimumPositiveProbability:
        thresholdReport.fnSafeThreshold.probabilityBoundaries
          ?.minimumPositiveProbability,
      maximumNegativeProbability:
        thresholdReport.fnSafeThreshold.probabilityBoundaries
          ?.maximumNegativeProbability,
    },
    assessment: {
      validationFalseNegativeSafe:
        validationResult.hybridEvaluation.metrics.falseNegative === 0,
      validationFalsePositiveNonRegression:
        validationResult.hybridEvaluation.metrics.falsePositive <=
        validationResult.descriptorMetrics.falsePositive,
      validationFalsePositiveImprovement:
        validationResult.hybridEvaluation.metrics.falsePositive <
        validationResult.descriptorMetrics.falsePositive,
      validationFalsePositiveReduction:
        validationResult.descriptorMetrics.falsePositive -
        validationResult.hybridEvaluation.metrics.falsePositive,
      trainingFalseNegativeSafe:
        trainingResult.hybridEvaluation.metrics.falseNegative === 0,
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

function printHybridReport({ report, outputPath }) {
  console.log("");
  console.log("REFERENCE CANDIDATE LOGISTIC HYBRID EVALUATION");
  console.log("==============================================");

  console.log(`Dataset SHA-256: ${report.dataset.sha256}`);

  console.log(`Model SHA-256: ${report.model.fileSha256}`);

  console.log(
    `Threshold report SHA-256: ` + `${report.thresholdReport.fileSha256}`,
  );

  console.log(`Output: ${outputPath}`);

  console.log("");
  console.log("Decision");
  console.log("--------");

  console.log(`Rule: ${report.decisionRule.expression}`);

  console.log(
    `FN-safe threshold: ` + `${formatDecimal(report.decisionRule.threshold)}`,
  );

  console.log("");
  console.log("Validation descriptor");
  console.log("---------------------");

  printMetrics(report.validation.descriptorMetrics);

  console.log("");
  console.log("Validation pure ML");
  console.log("------------------");

  printMetrics(report.validation.pureMlMetrics);

  console.log("");
  console.log("Validation hybrid");
  console.log("-----------------");

  printMetrics(report.validation.hybridMetrics);

  console.log("");
  console.log("Hybrid changes in validation");
  console.log("----------------------------");

  console.log(
    `Descriptor FP rejected by ML: ` +
      `${report.validation.changes.descriptorFalsePositiveRejectedCount}`,
  );

  console.log(
    `Descriptor TP rejected by ML: ` +
      `${report.validation.changes.descriptorTruePositiveRejectedCount}`,
  );

  console.log(
    `Remaining descriptor FP: ` +
      `${report.validation.changes.remainingDescriptorFalsePositiveCount}`,
  );

  console.log("");
  console.log("Hybrid versus descriptor validation");
  console.log("-----------------------------------");

  const validationDelta = report.validation.comparisons.hybridVsDescriptor;

  console.log(
    `Delta TP=${validationDelta.truePositive}, ` +
      `TN=${validationDelta.trueNegative}, ` +
      `FP=${validationDelta.falsePositive}, ` +
      `FN=${validationDelta.falseNegative}`,
  );

  console.log("");
  console.log("Training hybrid");
  console.log("---------------");

  printMetrics(report.training.hybridMetrics);

  console.log("");
  console.log("Assessment");
  console.log("----------");

  console.log(
    `Validation FN-safe: ` + `${report.assessment.validationFalseNegativeSafe}`,
  );

  console.log(
    `Validation FP non-regression: ` +
      `${report.assessment.validationFalsePositiveNonRegression}`,
  );

  console.log(
    `Validation FP improvement: ` +
      `${report.assessment.validationFalsePositiveImprovement}`,
  );

  console.log(
    `Validation FP reduction: ` +
      `${report.assessment.validationFalsePositiveReduction}`,
  );

  console.log(
    `Training FN-safe: ` + `${report.assessment.trainingFalseNegativeSafe}`,
  );

  console.log("");
  console.log("Integrity");
  console.log("---------");

  console.log(`Errors: ${report.integrity.errors.length}`);

  console.log(`Passed: ${report.integrity.passed}`);

  console.log("");
  console.log("Evaluation warning");
  console.log("------------------");

  console.log(
    "This hybrid result uses a threshold selected on the same " +
      "development validation partition. Unseen-kanji evaluation is still required.",
  );
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

    assertFileExists(options.modelPath, "Logistic baseline model");

    assertFileExists(options.thresholdReportPath, "FN-safe threshold report");

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

    const trainingExamples = buildTrainingExamples(trainingVectors);

    const validationExamples = buildTrainingExamples(validationVectors);

    const modelArtifact = readJson(
      options.modelPath,
      "Logistic baseline model",
    );

    const thresholdReport = readJson(
      options.thresholdReportPath,
      "FN-safe threshold report",
    );

    const artifactValidation = validateStoredArtifacts({
      datasetPath: options.datasetPath,
      splitPath: options.splitPath,
      modelPath: options.modelPath,
      thresholdReportPath: options.thresholdReportPath,
      featureNames,
      dimensionNames,
      modelArtifact,
      thresholdReport,
    });

    if (!artifactValidation.passed) {
      throw new Error(
        `Stored artifact validation failed. ` + artifactValidation.errors[0],
      );
    }

    const initialThreshold =
      modelArtifact.trainingConfiguration?.initialEvaluationThreshold ?? 0.5;

    const reconstructedTrainingEvaluation = evaluateLogisticModel({
      model: artifactValidation.model,
      examples: trainingExamples,
      threshold: initialThreshold,
    });

    const reconstructedValidationEvaluation = evaluateLogisticModel({
      model: artifactValidation.model,
      examples: validationExamples,
      threshold: initialThreshold,
    });

    const reconstructedProbabilityValidation =
      validateReconstructedProbabilities({
        modelArtifact,
        trainingEvaluation: reconstructedTrainingEvaluation,
        validationEvaluation: reconstructedValidationEvaluation,
      });

    if (!reconstructedProbabilityValidation.passed) {
      throw new Error(
        `Reconstructed probability validation failed. ` +
          reconstructedProbabilityValidation.errors[0],
      );
    }

    const trainingProbabilityRows = buildProbabilityRows({
      model: artifactValidation.model,
      examples: trainingExamples,
    });

    const validationProbabilityRows = buildProbabilityRows({
      model: artifactValidation.model,
      examples: validationExamples,
    });

    const pureMlTrainingEvaluation = evaluateLogisticModel({
      model: artifactValidation.model,
      examples: trainingExamples,
      threshold: artifactValidation.fnSafeThreshold,
    });

    const pureMlValidationEvaluation = evaluateLogisticModel({
      model: artifactValidation.model,
      examples: validationExamples,
      threshold: artifactValidation.fnSafeThreshold,
    });

    const trainingResult = buildPartitionHybridResult({
      datasetEntries: trainingEntries,
      probabilityRows: trainingProbabilityRows,
      threshold: artifactValidation.fnSafeThreshold,
      requireFalseNegativeSafe: true,
    });

    const validationResult = buildPartitionHybridResult({
      datasetEntries: validationEntries,
      probabilityRows: validationProbabilityRows,
      threshold: artifactValidation.fnSafeThreshold,
      requireFalseNegativeSafe: true,
    });

    const report = buildHybridReport({
      options,
      splitManifest,
      artifactValidation,
      thresholdReport,
      trainingExamples,
      validationExamples,
      trainingPureMlEvaluation: pureMlTrainingEvaluation,
      validationPureMlEvaluation: pureMlValidationEvaluation,
      trainingResult,
      validationResult,
      reconstructedProbabilityValidation,
    });

    writeJson(options.outputPath, report);

    printHybridReport({
      report,
      outputPath: options.outputPath,
    });

    if (!report.integrity.passed) {
      console.error("");
      console.error("Hybrid evaluation integrity errors:");

      for (const error of report.integrity.errors) {
        console.error(`- ${error}`);
      }

      process.exitCode = 1;
      return;
    }

    console.log("");
    console.log("Logistic hybrid evaluation completed successfully.");
  } catch (error) {
    console.error("");
    console.error(`Logistic hybrid evaluation failed: ${error.message}`);

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
  getModelPayload,
  compareOrderedArrays,
  validateStoredArtifacts,
  validateReconstructedProbabilities,
  buildPartitionHybridResult,
  buildComparisonSummary,
  buildHybridReport,
  formatDecimal,
  main,
};
