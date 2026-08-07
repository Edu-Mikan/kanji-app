"use strict";

const fs = require("node:fs");
const path = require("node:path");

const {
  loadJsonlDataset,
  validateDatasetRows,
  determineFeatureNames,
  calculateDescriptorMetrics,
} = require("./train_reference_candidate_baseline_model");

const { calculateDatasetSha256, calculateLabelCounts } = (() => {
  const splitModule = require("./create_reference_candidate_baseline_split");

  const inspectionModule = require("./train_reference_candidate_baseline_model");

  return {
    calculateDatasetSha256: splitModule.calculateDatasetSha256,
    calculateLabelCounts: inspectionModule.calculateLabelCounts,
  };
})();

const {
  readJson,
  buildEntryMapByRecognitionId,
  resolveEntriesByRecognitionIds,
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
  trainLogisticRegression,
  validateTrainingResult,
  evaluateLogisticModel,
  calculateBinaryMetrics,
} = require("./reference_candidate_logistic_regression");

const {
  buildTrainingExamples,
  calculateFileSha256,
  calculateValueSha256,
} = require("./train_reference_candidate_logistic_baseline_model");

const {
  buildProbabilityRows,
  selectFnSafeThreshold,
  calculateMetricDifference,
} = require("./select_reference_candidate_logistic_fn_safe_threshold");

const {
  buildHybridEvaluationRows,
  evaluateHybridRows,
  summarizeHybridChanges,
} = require("./reference_candidate_hybrid_evaluation");

const {
  validateLeaveOneKanjiOutManifest,
} = require("./create_reference_candidate_leave_one_kanji_out_folds");

const DEFAULT_DATASET_PATH = path.resolve(
  process.cwd(),
  "ml_datasets",
  "reference_candidate_binary_dataset.jsonl",
);

const DEFAULT_FOLDS_PATH = path.resolve(
  process.cwd(),
  "ml_datasets",
  "reference_candidate_leave_one_kanji_out_folds.json",
);

const DEFAULT_OUTPUT_PATH = path.resolve(
  process.cwd(),
  "ml_models",
  "reference_candidate_logistic_leave_one_kanji_out_report.json",
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
    foldsPath: DEFAULT_FOLDS_PATH,
    outputPath: DEFAULT_OUTPUT_PATH,
    epochs: DEFAULT_EPOCHS,
    learningRate: DEFAULT_LEARNING_RATE,
    l2Strength: DEFAULT_L2_STRENGTH,
    reportEvery: DEFAULT_REPORT_EVERY,
    onlyKanji: null,
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

    if (argument === "--folds") {
      options.foldsPath = path.resolve(
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

    if (argument === "--only-kanji") {
      options.onlyKanji = requireArgumentValue(argv, index, argument);

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
REFERENCE CANDIDATE LOGISTIC LEAVE-ONE-KANJI-OUT

Usage:
  node scripts/evaluate_reference_candidate_logistic_leave_one_kanji_out.js

Options:
  --dataset <path>
      Input ML dataset.

  --folds <path>
      Leave-one-kanji-out fold manifest.

  --out <path>
      Output evaluation report.

  --epochs <number>
      Default: 2000

  --learning-rate <number>
      Default: 0.01

  --l2-strength <number>
      Default: 0.001

  --report-every <number>
      Default: 100

  --only-kanji <kanji>
      Execute only one fold for diagnostic purposes.

  --help, -h
      Show this help.

For every fold:
  1. Fit features and transformers using training only.
  2. Train a new logistic model.
  3. Select the FN-safe threshold using training only.
  4. Evaluate the held-out kanji without recalibration.
`);
}

function validateOptions(options) {
  if (!Number.isInteger(options.epochs) || options.epochs <= 0) {
    throw new Error("epochs must be a positive integer");
  }

  if (!Number.isFinite(options.learningRate) || options.learningRate <= 0) {
    throw new Error("learningRate must be greater than 0");
  }

  if (!Number.isFinite(options.l2Strength) || options.l2Strength < 0) {
    throw new Error("l2Strength must be greater than or equal to 0");
  }

  if (!Number.isInteger(options.reportEvery) || options.reportEvery <= 0) {
    throw new Error("reportEvery must be a positive integer");
  }

  if (
    options.onlyKanji !== null &&
    (typeof options.onlyKanji !== "string" || options.onlyKanji.length === 0)
  ) {
    throw new Error("onlyKanji must be null or a non-empty string");
  }
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

function resolveFoldEntries({ fold, entriesByRecognitionId }) {
  const trainingEntries = resolveEntriesByRecognitionIds({
    recognitionIds: fold.training.recognitionIds,
    entriesByRecognitionId,
    partitionName: `Fold ${fold.heldOutKanji} training`,
  });

  const evaluationEntries = resolveEntriesByRecognitionIds({
    recognitionIds: fold.evaluation.recognitionIds,
    entriesByRecognitionId,
    partitionName: `Fold ${fold.heldOutKanji} evaluation`,
  });

  return {
    trainingEntries,
    evaluationEntries,
  };
}

function findUnseenEvaluationFeatures({
  trainingFeatureNames,
  evaluationEntries,
}) {
  const trainingFeatureSet = new Set(trainingFeatureNames);

  return determineFeatureNames(evaluationEntries).filter(
    (featureName) => !trainingFeatureSet.has(featureName),
  );
}

function sumMetrics(metricObjects) {
  let truePositive = 0;
  let trueNegative = 0;
  let falsePositive = 0;
  let falseNegative = 0;

  for (const metrics of metricObjects) {
    truePositive += metrics.truePositive;

    trueNegative += metrics.trueNegative;

    falsePositive += metrics.falsePositive;

    falseNegative += metrics.falseNegative;
  }

  return calculateBinaryMetrics({
    truePositive,
    trueNegative,
    falsePositive,
    falseNegative,
  });
}

function summarizeFoldOutcomes(folds) {
  return {
    foldCount: folds.length,
    evaluationRowCount: folds.reduce(
      (total, fold) => total + fold.evaluationRowCount,
      0,
    ),
    foldsWithHybridFalseNegatives: folds
      .filter((fold) => fold.hybridMetrics.falseNegative > 0)
      .map((fold) => fold.heldOutKanji),
    foldsWithHybridFpImprovement: folds
      .filter(
        (fold) =>
          fold.hybridMetrics.falsePositive <
          fold.descriptorMetrics.falsePositive,
      )
      .map((fold) => fold.heldOutKanji),
    foldsWithHybridFpEquality: folds
      .filter(
        (fold) =>
          fold.hybridMetrics.falsePositive ===
          fold.descriptorMetrics.falsePositive,
      )
      .map((fold) => fold.heldOutKanji),
    foldsWithHybridFpRegression: folds
      .filter(
        (fold) =>
          fold.hybridMetrics.falsePositive >
          fold.descriptorMetrics.falsePositive,
      )
      .map((fold) => fold.heldOutKanji),
    foldsWithUnseenEvaluationFeatures: folds
      .filter((fold) => fold.unseenEvaluationFeatureCount > 0)
      .map((fold) => ({
        heldOutKanji: fold.heldOutKanji,
        count: fold.unseenEvaluationFeatureCount,
      })),
  };
}

function calculateConfusionMatrixRowCount(metrics) {
  return (
    metrics.truePositive +
    metrics.trueNegative +
    metrics.falsePositive +
    metrics.falseNegative
  );
}

function validateFoldResult({ foldResult, sourceRowCount }) {
  const errors = [];

  if (
    foldResult.trainingRowCount + foldResult.evaluationRowCount !==
    sourceRowCount
  ) {
    errors.push(`Fold ${foldResult.heldOutKanji} row count mismatch.`);
  }

  if (foldResult.trainingKanjiCount !== 18) {
    errors.push(
      `Fold ${foldResult.heldOutKanji} training must contain 18 kanjis.`,
    );
  }

  const trainingMetricRowCount = calculateConfusionMatrixRowCount(
    foldResult.trainingMetrics,
  );

  if (trainingMetricRowCount !== foldResult.trainingRowCount) {
    errors.push(
      `Fold ${foldResult.heldOutKanji} trainingMetrics ` +
        `row count mismatch: ` +
        `actual=${trainingMetricRowCount}, ` +
        `expected=${foldResult.trainingRowCount}.`,
    );
  }

  if (foldResult.trainingMetrics.falseNegative !== 0) {
    errors.push(
      `Fold ${foldResult.heldOutKanji} selected threshold ` +
        `is not FN-safe on training.`,
    );
  }

  const evaluatorNames = [
    "descriptorMetrics",
    "pureMlMetrics",
    "hybridMetrics",
  ];

  for (const evaluatorName of evaluatorNames) {
    const metrics = foldResult[evaluatorName];

    const metricRowCount = calculateConfusionMatrixRowCount(metrics);

    if (metricRowCount !== foldResult.evaluationRowCount) {
      errors.push(
        `Fold ${foldResult.heldOutKanji} ${evaluatorName} ` +
          `row count mismatch: ` +
          `actual=${metricRowCount}, ` +
          `expected=${foldResult.evaluationRowCount}.`,
      );
    }
  }

  return {
    passed: errors.length === 0,
    errors,
  };
}

function evaluateFold({
  fold,
  datasetEntries,
  entriesByRecognitionId,
  options,
}) {
  const { trainingEntries, evaluationEntries } = resolveFoldEntries({
    fold,
    entriesByRecognitionId,
  });

  const trainingFeatureNames = determineFeatureNames(trainingEntries);

  const evaluationFeatureNames = determineFeatureNames(evaluationEntries);

  const unseenEvaluationFeatures = findUnseenEvaluationFeatures({
    trainingFeatureNames,
    evaluationEntries,
  });

  const featureTransformers = fitFeatureTransformers({
    trainingEntries,
    featureNames: trainingFeatureNames,
  });

  const dimensionNames = buildVectorDimensionNames(featureTransformers);

  const trainingVectors = vectorizeDatasetEntries({
    datasetEntries: trainingEntries,
    featureTransformers,
  });

  const evaluationVectors = vectorizeDatasetEntries({
    datasetEntries: evaluationEntries,
    featureTransformers,
  });

  const trainingVectorValidation = validateVectors({
    vectorizedEntries: trainingVectors,
    expectedDimensionCount: dimensionNames.length,
    partitionName: `${fold.heldOutKanji} training`,
  });

  const evaluationVectorValidation = validateVectors({
    vectorizedEntries: evaluationVectors,
    expectedDimensionCount: dimensionNames.length,
    partitionName: `${fold.heldOutKanji} evaluation`,
  });

  if (!trainingVectorValidation.passed || !evaluationVectorValidation.passed) {
    throw new Error(`Vector validation failed for fold ${fold.heldOutKanji}.`);
  }

  const trainingExamples = buildTrainingExamples(trainingVectors);

  const evaluationExamples = buildTrainingExamples(evaluationVectors);

  const trainingResult = trainLogisticRegression({
    trainingExamples,
    epochs: options.epochs,
    learningRate: options.learningRate,
    l2Strength: options.l2Strength,
    reportEvery: options.reportEvery,
  });

  const trainingResultValidation = validateTrainingResult(trainingResult);

  if (!trainingResultValidation.passed) {
    throw new Error(
      `Training validation failed for fold ${fold.heldOutKanji}: ` +
        trainingResultValidation.errors[0],
    );
  }

  const trainingProbabilityRows = buildProbabilityRows({
    model: trainingResult.model,
    examples: trainingExamples,
  });

  const thresholdSelection = selectFnSafeThreshold(trainingProbabilityRows);

  const selectedThreshold = thresholdSelection.selectedThreshold;

  const trainingEvaluation = evaluateLogisticModel({
    model: trainingResult.model,
    examples: trainingExamples,
    threshold: selectedThreshold,
  });

  const evaluationProbabilityRows = buildProbabilityRows({
    model: trainingResult.model,
    examples: evaluationExamples,
  });

  const pureMlEvaluation = evaluateLogisticModel({
    model: trainingResult.model,
    examples: evaluationExamples,
    threshold: selectedThreshold,
  });

  const descriptorMetrics = calculateDescriptorMetrics(evaluationEntries);

  const hybridRows = buildHybridEvaluationRows({
    datasetEntries: evaluationEntries,
    probabilityRows: evaluationProbabilityRows,
  });

  const hybridEvaluation = evaluateHybridRows({
    hybridRows,
    threshold: selectedThreshold,
  });

  const hybridChanges = summarizeHybridChanges({
    hybridEvaluation,
  });

  const trainingKanjis = new Set(
    trainingEntries.map(({ row }) => row.targetKanji),
  );

  const foldResult = {
    foldId: fold.foldId,
    heldOutKanji: fold.heldOutKanji,
    thresholdCalibrationScope: "outer_fold_training_partition",
    trainingRowCount: trainingEntries.length,
    evaluationRowCount: evaluationEntries.length,
    trainingKanjiCount: trainingKanjis.size,
    trainingFeatureCount: trainingFeatureNames.length,
    evaluationFeatureCount: evaluationFeatureNames.length,
    dimensionCount: dimensionNames.length,
    unseenEvaluationFeatureCount: unseenEvaluationFeatures.length,
    unseenEvaluationFeatures,
    trainingLabelCounts: calculateLabelCounts(trainingEntries),
    evaluationLabelCounts: calculateLabelCounts(evaluationEntries),
    selectedThreshold,
    thresholdCandidateCount: thresholdSelection.candidateThresholdCount,
    trainingProbabilityBoundaries: thresholdSelection.probabilityBoundaries,
    initialLoss: trainingResult.initialLoss,
    finalLoss: trainingResult.finalLoss,
    modelPayloadSha256: calculateValueSha256({
      bias: trainingResult.model.bias,
      weights: trainingResult.model.weights,
    }),
    trainingMetrics: trainingEvaluation.metrics,
    descriptorMetrics,
    pureMlMetrics: pureMlEvaluation.metrics,
    hybridMetrics: hybridEvaluation.metrics,
    hybridChanges,
    comparisons: {
      hybridVsDescriptor: calculateMetricDifference({
        candidateMetrics: hybridEvaluation.metrics,
        baselineMetrics: descriptorMetrics,
      }),
      hybridVsPureMl: calculateMetricDifference({
        candidateMetrics: hybridEvaluation.metrics,
        baselineMetrics: pureMlEvaluation.metrics,
      }),
    },
  };

  const validation = validateFoldResult({
    foldResult,
    sourceRowCount: datasetEntries.length,
  });

  return {
    ...foldResult,
    integrity: validation,
  };
}

function buildAggregateResult(foldResults) {
  const descriptorMetrics = sumMetrics(
    foldResults.map((fold) => fold.descriptorMetrics),
  );

  const pureMlMetrics = sumMetrics(
    foldResults.map((fold) => fold.pureMlMetrics),
  );

  const hybridMetrics = sumMetrics(
    foldResults.map((fold) => fold.hybridMetrics),
  );

  return {
    descriptorMetrics,
    pureMlMetrics,
    hybridMetrics,
    comparisons: {
      hybridVsDescriptor: calculateMetricDifference({
        candidateMetrics: hybridMetrics,
        baselineMetrics: descriptorMetrics,
      }),
      hybridVsPureMl: calculateMetricDifference({
        candidateMetrics: hybridMetrics,
        baselineMetrics: pureMlMetrics,
      }),
    },
    outcomes: summarizeFoldOutcomes(foldResults),
  };
}

function buildReport({ options, datasetEntries, foldsManifest, foldResults }) {
  const foldErrors = foldResults.flatMap((fold) =>
    fold.integrity.errors.map((error) => `${fold.heldOutKanji}: ${error}`),
  );

  const aggregate = buildAggregateResult(foldResults);

  return {
    schemaVersion: 1,
    purpose:
      "Leave-one-kanji-out evaluation of the descriptor, logistic model and conservative hybrid validator",
    strategy: "leave_one_target_kanji_out",
    evaluationScope:
      "Each model is evaluated on one target kanji completely absent from training and threshold calibration.",
    dataset: {
      path: options.datasetPath,
      sha256: calculateDatasetSha256(options.datasetPath),
      rowCount: datasetEntries.length,
    },
    foldsManifest: {
      path: options.foldsPath,
      sha256: calculateFileSha256(options.foldsPath),
      foldCount: foldsManifest.foldCount,
    },
    trainingConfiguration: {
      epochs: options.epochs,
      learningRate: options.learningRate,
      l2Strength: options.l2Strength,
      reportEvery: options.reportEvery,
      initialization: "zero_bias_and_zero_weights",
      optimization: "full_batch_gradient_descent",
      thresholdCalibrationScope: "outer_fold_training_partition",
    },
    executedFoldCount: foldResults.length,
    partialExecution: options.onlyKanji !== null,
    onlyKanji: options.onlyKanji,
    folds: foldResults,
    aggregate,
    assessment: {
      aggregateHybridFalseNegativeSafe:
        aggregate.hybridMetrics.falseNegative === 0,
      aggregateHybridFpImprovement:
        aggregate.hybridMetrics.falsePositive <
        aggregate.descriptorMetrics.falsePositive,
      aggregateHybridFpReduction:
        aggregate.descriptorMetrics.falsePositive -
        aggregate.hybridMetrics.falsePositive,
      foldsWithHybridFalseNegativeCount:
        aggregate.outcomes.foldsWithHybridFalseNegatives.length,
      foldsWithHybridFpImprovementCount:
        aggregate.outcomes.foldsWithHybridFpImprovement.length,
    },
    integrity: {
      passed: foldErrors.length === 0,
      errors: foldErrors,
    },
  };
}

function formatDecimal(value) {
  if (value === null || value === undefined) {
    return "n/a";
  }

  return value.toFixed(9);
}

function formatMetrics(metrics) {
  return (
    `TP=${metrics.truePositive}, ` +
    `TN=${metrics.trueNegative}, ` +
    `FP=${metrics.falsePositive}, ` +
    `FN=${metrics.falseNegative}`
  );
}

function printReport({ report, outputPath }) {
  console.log("");
  console.log("REFERENCE CANDIDATE LOGISTIC LEAVE-ONE-KANJI-OUT");
  console.log("================================================");

  console.log(`Dataset SHA-256: ${report.dataset.sha256}`);

  console.log(`Folds manifest SHA-256: ` + `${report.foldsManifest.sha256}`);

  console.log(`Executed folds: ${report.executedFoldCount}`);

  console.log(`Output: ${outputPath}`);

  console.log("");
  console.log("Fold results");
  console.log("------------");

  for (const fold of report.folds) {
    console.log(
      `${fold.heldOutKanji}: ` +
        `threshold=${formatDecimal(fold.selectedThreshold)}, ` +
        `features=${fold.trainingFeatureCount}, ` +
        `unseen=${fold.unseenEvaluationFeatureCount}, ` +
        `descriptor[${formatMetrics(fold.descriptorMetrics)}], ` +
        `ml[${formatMetrics(fold.pureMlMetrics)}], ` +
        `hybrid[${formatMetrics(fold.hybridMetrics)}], ` +
        `passed=${fold.integrity.passed}`,
    );
  }

  console.log("");
  console.log("Aggregate descriptor");
  console.log("--------------------");

  console.log(formatMetrics(report.aggregate.descriptorMetrics));

  console.log("");
  console.log("Aggregate pure ML");
  console.log("-----------------");

  console.log(formatMetrics(report.aggregate.pureMlMetrics));

  console.log("");
  console.log("Aggregate hybrid");
  console.log("----------------");

  console.log(formatMetrics(report.aggregate.hybridMetrics));

  console.log("");
  console.log("Aggregate comparison");
  console.log("--------------------");

  const difference = report.aggregate.comparisons.hybridVsDescriptor;

  console.log(
    `Hybrid vs descriptor: ` +
      `Delta TP=${difference.truePositive}, ` +
      `TN=${difference.trueNegative}, ` +
      `FP=${difference.falsePositive}, ` +
      `FN=${difference.falseNegative}`,
  );

  console.log("");
  console.log("Fold outcomes");
  console.log("-------------");

  console.log(
    `Folds with hybrid FN: ` +
      `${report.aggregate.outcomes.foldsWithHybridFalseNegatives.length}`,
  );

  console.log(
    `Hybrid FN kanjis: ` +
      `${
        report.aggregate.outcomes.foldsWithHybridFalseNegatives.join(", ") ||
        "none"
      }`,
  );

  console.log(
    `Folds with FP improvement: ` +
      `${report.aggregate.outcomes.foldsWithHybridFpImprovement.length}`,
  );

  console.log(
    `Folds with FP equality: ` +
      `${report.aggregate.outcomes.foldsWithHybridFpEquality.length}`,
  );

  console.log(
    `Folds with FP regression: ` +
      `${report.aggregate.outcomes.foldsWithHybridFpRegression.length}`,
  );

  console.log("");
  console.log("Assessment");
  console.log("----------");

  console.log(
    `Aggregate hybrid FN-safe: ` +
      `${report.assessment.aggregateHybridFalseNegativeSafe}`,
  );

  console.log(
    `Aggregate hybrid FP improvement: ` +
      `${report.assessment.aggregateHybridFpImprovement}`,
  );

  console.log(
    `Aggregate hybrid FP reduction: ` +
      `${report.assessment.aggregateHybridFpReduction}`,
  );

  console.log("");
  console.log("Integrity");
  console.log("---------");

  console.log(`Errors: ${report.integrity.errors.length}`);

  console.log(`Passed: ${report.integrity.passed}`);
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

    assertFileExists(options.foldsPath, "Leave-one-kanji-out folds");

    const datasetEntries = loadJsonlDataset(options.datasetPath);

    const datasetValidation = validateDatasetRows(datasetEntries);

    if (datasetValidation.errors.length > 0) {
      throw new Error(
        `Dataset validation failed. ` + datasetValidation.errors[0],
      );
    }

    const foldsManifest = readJson(
      options.foldsPath,
      "Leave-one-kanji-out folds",
    );

    const manifestValidation = validateLeaveOneKanjiOutManifest(foldsManifest);

    if (!manifestValidation.passed) {
      throw new Error(
        `Fold manifest validation failed. ` + manifestValidation.errors[0],
      );
    }

    const datasetSha256 = calculateDatasetSha256(options.datasetPath);

    if (foldsManifest.dataset?.sha256 !== datasetSha256) {
      throw new Error(
        "Fold manifest dataset SHA-256 does not match the current dataset.",
      );
    }

    const entriesByRecognitionId = buildEntryMapByRecognitionId(datasetEntries);

    let folds = foldsManifest.folds;

    if (options.onlyKanji !== null) {
      folds = folds.filter((fold) => fold.heldOutKanji === options.onlyKanji);

      if (folds.length === 0) {
        throw new Error(`Fold not found for kanji: ${options.onlyKanji}`);
      }
    }

    const foldResults = [];

    for (let index = 0; index < folds.length; index++) {
      const fold = folds[index];

      console.log(
        `Training fold ${index + 1}/${folds.length}: ` +
          `held out ${fold.heldOutKanji}`,
      );

      foldResults.push(
        evaluateFold({
          fold,
          datasetEntries,
          entriesByRecognitionId,
          options,
        }),
      );
    }

    const report = buildReport({
      options,
      datasetEntries,
      foldsManifest,
      foldResults,
    });

    writeJson(options.outputPath, report);

    printReport({
      report,
      outputPath: options.outputPath,
    });

    if (!report.integrity.passed) {
      process.exitCode = 1;
      return;
    }

    console.log("");
    console.log("Leave-one-kanji-out evaluation completed successfully.");
  } catch (error) {
    console.error("");
    console.error(`Leave-one-kanji-out evaluation failed: ${error.message}`);

    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  parseArguments,
  validateOptions,
  assertFileExists,
  writeJson,
  resolveFoldEntries,
  findUnseenEvaluationFeatures,
  sumMetrics,
  summarizeFoldOutcomes,
  calculateConfusionMatrixRowCount,
  validateFoldResult,
  evaluateFold,
  buildAggregateResult,
  buildReport,
  formatDecimal,
  formatMetrics,
  main,
};
