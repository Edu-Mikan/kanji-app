"use strict";

const fs = require("node:fs");
const path = require("node:path");

const {
  loadJsonlDataset,
  validateDatasetRows,
} = require("./train_reference_candidate_baseline_model");

const {
  readJson,
  buildEntryMapByRecognitionId,
} = require("./prepare_reference_candidate_baseline_vectors");

const {
  calculateLinearScore,
  sigmoid,
} = require("./reference_candidate_logistic_regression");

const {
  validateLeaveOneKanjiOutManifest,
} = require("./create_reference_candidate_leave_one_kanji_out_folds");

const {
  evaluateFold,
} = require("./evaluate_reference_candidate_logistic_leave_one_kanji_out");

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

const DEFAULT_LOOCV_REPORT_PATH = path.resolve(
  process.cwd(),
  "ml_models",
  "reference_candidate_logistic_leave_one_kanji_out_report.json",
);

const DEFAULT_OUTPUT_PATH = path.resolve(
  process.cwd(),
  "ml_models",
  "reference_candidate_logistic_leave_one_kanji_out_diagnosis.json",
);

const DEFAULT_EPOCHS = 2000;
const DEFAULT_LEARNING_RATE = 0.01;
const DEFAULT_L2_STRENGTH = 0.001;
const DEFAULT_REPORT_EVERY = 100;
const DEFAULT_TOP_CONTRIBUTION_COUNT = 15;

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

function findFalseNegativeEvidence(report) {
  return report.folds.flatMap((fold) =>
    fold.diagnosticEvidence.hybridFalseNegativePredictions.map(
      (prediction) => ({
        heldOutKanji: fold.heldOutKanji,
        foldId: fold.foldId,
        ...prediction,
      }),
    ),
  );
}

function calculateDimensionContributions({ model, dimensionNames, vector }) {
  if (
    model.weights.length !== dimensionNames.length ||
    model.weights.length !== vector.length
  ) {
    throw new Error("Model, dimension names and vector sizes do not match");
  }

  return dimensionNames.map((dimensionName, index) => {
    const weight = model.weights[index];

    const vectorValue = vector[index];

    const contribution = weight * vectorValue;

    return {
      index,
      dimensionName,
      weight,
      vectorValue,
      contribution,
      absoluteContribution: Math.abs(contribution),
      effect:
        contribution > 0
          ? "increases_positive_probability"
          : contribution < 0
            ? "decreases_positive_probability"
            : "neutral",
    };
  });
}

function rankContributions(contributions) {
  return [...contributions].sort((left, right) => {
    if (right.absoluteContribution !== left.absoluteContribution) {
      return right.absoluteContribution - left.absoluteContribution;
    }

    return left.dimensionName.localeCompare(right.dimensionName);
  });
}

function selectTopContributions({
  contributions,
  count = DEFAULT_TOP_CONTRIBUTION_COUNT,
}) {
  const negative = contributions
    .filter(({ contribution }) => contribution < 0)
    .sort((left, right) => left.contribution - right.contribution)
    .slice(0, count);

  const positive = contributions
    .filter(({ contribution }) => contribution > 0)
    .sort((left, right) => right.contribution - left.contribution)
    .slice(0, count);

  return {
    mostNegative: negative,
    mostPositive: positive,
    mostInfluential: rankContributions(contributions).slice(0, count),
  };
}

function validateContributionDecomposition({ model, vector, contributions }) {
  const contributionSum = contributions.reduce(
    (total, contribution) => total + contribution.contribution,
    0,
  );

  const reconstructedScore = model.bias + contributionSum;

  const directScore = calculateLinearScore({
    model,
    vector,
  });

  const scoreDifference = reconstructedScore - directScore;

  return {
    passed: Math.abs(scoreDifference) < 1e-10,
    contributionSum,
    reconstructedScore,
    directScore,
    scoreDifference,
    reconstructedProbability: sigmoid(reconstructedScore),
  };
}

function findEvaluationExample({ evaluationExamples, recognitionId }) {
  const example = evaluationExamples.find(
    (candidate) => candidate.recognitionId === recognitionId,
  );

  if (!example) {
    throw new Error(`Evaluation example not found: ${recognitionId}`);
  }

  return example;
}

function evaluateCounterfactualThreshold({
  hybridEvaluation,
  counterfactualThreshold,
}) {
  let recoveredPositiveCount = 0;
  let additionalFalsePositiveCount = 0;

  for (const prediction of hybridEvaluation.predictions) {
    const counterfactualMlPrediction =
      prediction.mlProbability >= counterfactualThreshold ? 1 : 0;

    const counterfactualHybridPrediction =
      prediction.descriptorPrediction === 1 && counterfactualMlPrediction === 1
        ? 1
        : 0;

    if (
      prediction.label === 1 &&
      prediction.hybridPrediction === 0 &&
      counterfactualHybridPrediction === 1
    ) {
      recoveredPositiveCount++;
    }

    if (
      prediction.label === 0 &&
      prediction.hybridPrediction === 0 &&
      counterfactualHybridPrediction === 1
    ) {
      additionalFalsePositiveCount++;
    }
  }

  return {
    counterfactualThreshold,
    recoveredPositiveCount,
    additionalFalsePositiveCount,
  };
}

function diagnoseFalseNegative({
  evidence,
  runtimeArtifacts,
  selectedThreshold,
}) {
  const example = findEvaluationExample({
    evaluationExamples: runtimeArtifacts.evaluationExamples,
    recognitionId: evidence.recognitionId,
  });

  const contributions = calculateDimensionContributions({
    model: runtimeArtifacts.model,
    dimensionNames: runtimeArtifacts.dimensionNames,
    vector: example.vector,
  });

  const decomposition = validateContributionDecomposition({
    model: runtimeArtifacts.model,
    vector: example.vector,
    contributions,
  });

  if (!decomposition.passed) {
    throw new Error(
      `Contribution decomposition failed for ${evidence.recognitionId}`,
    );
  }

  const counterfactualThreshold = evidence.mlProbability;

  return {
    heldOutKanji: evidence.heldOutKanji,
    recognitionId: evidence.recognitionId,
    label: evidence.label,
    classification: evidence.classification,
    descriptorPrediction: evidence.descriptorPrediction,
    mlProbability: evidence.mlProbability,
    selectedThreshold,
    thresholdMargin: evidence.thresholdMargin,
    score: decomposition.directScore,
    bias: runtimeArtifacts.model.bias,
    contributionSum: decomposition.contributionSum,
    decomposition,
    topContributions: selectTopContributions({
      contributions,
    }),
    counterfactual: evaluateCounterfactualThreshold({
      hybridEvaluation: runtimeArtifacts.hybridEvaluation,
      counterfactualThreshold,
    }),
  };
}

function buildSummary(diagnoses) {
  return {
    falseNegativeCount: diagnoses.length,
    affectedKanjis: [
      ...new Set(diagnoses.map(({ heldOutKanji }) => heldOutKanji)),
    ],
    minimumProbability: Math.min(
      ...diagnoses.map(({ mlProbability }) => mlProbability),
    ),
    maximumProbability: Math.max(
      ...diagnoses.map(({ mlProbability }) => mlProbability),
    ),
    minimumThresholdMargin: Math.min(
      ...diagnoses.map(({ thresholdMargin }) => thresholdMargin),
    ),
    maximumThresholdMargin: Math.max(
      ...diagnoses.map(({ thresholdMargin }) => thresholdMargin),
    ),
  };
}

function main() {
  try {
    assertFileExists(DEFAULT_DATASET_PATH, "ML dataset");

    assertFileExists(DEFAULT_FOLDS_PATH, "LOOCV folds");

    assertFileExists(DEFAULT_LOOCV_REPORT_PATH, "LOOCV report");

    const datasetEntries = loadJsonlDataset(DEFAULT_DATASET_PATH);

    const datasetValidation = validateDatasetRows(datasetEntries);

    if (datasetValidation.errors.length > 0) {
      throw new Error(datasetValidation.errors[0]);
    }

    const foldsManifest = readJson(DEFAULT_FOLDS_PATH, "LOOCV folds");

    const manifestValidation = validateLeaveOneKanjiOutManifest(foldsManifest);

    if (!manifestValidation.passed) {
      throw new Error(manifestValidation.errors[0]);
    }

    const loocvReport = readJson(DEFAULT_LOOCV_REPORT_PATH, "LOOCV report");

    const evidenceRows = findFalseNegativeEvidence(loocvReport);

    if (evidenceRows.length === 0) {
      throw new Error("No hybrid false negatives were found");
    }

    const affectedKanjis = [
      ...new Set(evidenceRows.map(({ heldOutKanji }) => heldOutKanji)),
    ];

    const entriesByRecognitionId = buildEntryMapByRecognitionId(datasetEntries);

    const diagnoses = [];

    for (const heldOutKanji of affectedKanjis) {
      console.log(`Diagnosing fold: ${heldOutKanji}`);

      const fold = foldsManifest.folds.find(
        (candidate) => candidate.heldOutKanji === heldOutKanji,
      );

      if (!fold) {
        throw new Error(`Fold not found: ${heldOutKanji}`);
      }

      const evaluation = evaluateFold({
        fold,
        datasetEntries,
        entriesByRecognitionId,
        options: {
          epochs: DEFAULT_EPOCHS,
          learningRate: DEFAULT_LEARNING_RATE,
          l2Strength: DEFAULT_L2_STRENGTH,
          reportEvery: DEFAULT_REPORT_EVERY,
        },
      });

      const foldResult = evaluation.foldResult;

      const runtimeArtifacts = evaluation.runtimeArtifacts;

      const foldEvidence = evidenceRows.filter(
        (evidence) => evidence.heldOutKanji === heldOutKanji,
      );

      for (const evidence of foldEvidence) {
        diagnoses.push(
          diagnoseFalseNegative({
            evidence,
            runtimeArtifacts,
            selectedThreshold: foldResult.selectedThreshold,
          }),
        );
      }
    }

    const report = {
      schemaVersion: 1,
      purpose:
        "Diagnose held-out hybrid false negatives without modifying or recalibrating the model",
      methodology: {
        affectedFoldsOnly: true,
        thresholdRecalibration: false,
        modelConfiguration: "same_as_loocv",
        contributionFormula: "weight * vectorValue",
        counterfactualUse: "diagnostic_only",
      },
      source: {
        loocvReportPath: DEFAULT_LOOCV_REPORT_PATH,
        falseNegativeCount: evidenceRows.length,
      },
      summary: buildSummary(diagnoses),
      diagnoses,
      integrity: {
        passed: diagnoses.length === evidenceRows.length,
        expectedDiagnosisCount: evidenceRows.length,
        actualDiagnosisCount: diagnoses.length,
        errors: [],
      },
    };

    writeJson(DEFAULT_OUTPUT_PATH, report);

    console.log("");
    console.log("REFERENCE CANDIDATE LOOCV FN DIAGNOSIS");

    console.log("======================================");

    console.log(`False negatives: ${report.summary.falseNegativeCount}`);

    console.log(`Affected kanjis: ${report.summary.affectedKanjis.join(", ")}`);

    for (const diagnosis of diagnoses) {
      console.log("");
      console.log(`${diagnosis.heldOutKanji} ${diagnosis.recognitionId}`);

      console.log(`Probability: ${diagnosis.mlProbability}`);

      console.log(`Threshold: ${diagnosis.selectedThreshold}`);

      console.log(`Margin: ${diagnosis.thresholdMargin}`);

      console.log(
        `Counterfactual recovered positives: ` +
          `${diagnosis.counterfactual.recoveredPositiveCount}`,
      );

      console.log(
        `Counterfactual additional FP: ` +
          `${diagnosis.counterfactual.additionalFalsePositiveCount}`,
      );

      console.log("Most negative dimensions:");

      for (const contribution of diagnosis.topContributions.mostNegative.slice(
        0,
        5,
      )) {
        console.log(
          `- ${contribution.dimensionName}: ` + `${contribution.contribution}`,
        );
      }
    }

    console.log("");
    console.log(`Output: ${DEFAULT_OUTPUT_PATH}`);

    console.log(`Integrity passed: ${report.integrity.passed}`);

    console.log("");
    console.log("LOOCV false-negative diagnosis completed successfully.");
  } catch (error) {
    console.error("");
    console.error(`LOOCV diagnosis failed: ${error.message}`);

    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  findFalseNegativeEvidence,
  calculateDimensionContributions,
  rankContributions,
  selectTopContributions,
  validateContributionDecomposition,
  findEvaluationExample,
  evaluateCounterfactualThreshold,
  diagnoseFalseNegative,
  buildSummary,
  main,
};
