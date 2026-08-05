"use strict";

const {
  calculateBinaryMetrics,
} = require("./reference_candidate_logistic_regression");

const VALID_CLASSIFICATIONS = new Set([
  "truePositive",
  "trueNegative",
  "falsePositive",
  "falseNegative",
]);

const DESCRIPTOR_POSITIVE_CLASSIFICATIONS = new Set([
  "truePositive",
  "falsePositive",
]);

const DESCRIPTOR_NEGATIVE_CLASSIFICATIONS = new Set([
  "trueNegative",
  "falseNegative",
]);

function validateBinaryLabel(label, name = "label") {
  if (label !== 0 && label !== 1) {
    throw new Error(`${name} must be either 0 or 1`);
  }
}

function validateProbability(probability, name = "probability") {
  if (
    typeof probability !== "number" ||
    !Number.isFinite(probability) ||
    probability < 0 ||
    probability > 1
  ) {
    throw new Error(`${name} must be between 0 and 1`);
  }
}

function validateThreshold(threshold) {
  validateProbability(threshold, "threshold");
}

function getDescriptorPredictionFromClassification(classification) {
  if (DESCRIPTOR_POSITIVE_CLASSIFICATIONS.has(classification)) {
    return 1;
  }

  if (DESCRIPTOR_NEGATIVE_CLASSIFICATIONS.has(classification)) {
    return 0;
  }

  throw new Error(`Unsupported descriptor classification: ${classification}`);
}

function buildHybridEvaluationRows({ datasetEntries, probabilityRows }) {
  if (!Array.isArray(datasetEntries)) {
    throw new Error("datasetEntries must be an array");
  }

  if (!Array.isArray(probabilityRows)) {
    throw new Error("probabilityRows must be an array");
  }

  const datasetByRecognitionId = new Map();

  for (let index = 0; index < datasetEntries.length; index++) {
    const row = datasetEntries[index].row ?? datasetEntries[index];

    if (!row || typeof row !== "object") {
      throw new Error(`datasetEntries[${index}] must contain a row object`);
    }

    if (
      typeof row.recognitionId !== "string" ||
      row.recognitionId.length === 0
    ) {
      throw new Error(
        `datasetEntries[${index}].recognitionId must be a non-empty string`,
      );
    }

    if (datasetByRecognitionId.has(row.recognitionId)) {
      throw new Error(`Duplicated dataset recognitionId: ${row.recognitionId}`);
    }

    validateBinaryLabel(row.label, `datasetEntries[${index}].label`);

    if (!VALID_CLASSIFICATIONS.has(row.classification)) {
      throw new Error(
        `Unsupported descriptor classification: ${row.classification}`,
      );
    }

    datasetByRecognitionId.set(row.recognitionId, row);
  }

  const probabilityIds = new Set();

  const hybridRows = probabilityRows.map((probabilityRow, index) => {
    if (!probabilityRow || typeof probabilityRow !== "object") {
      throw new Error(`probabilityRows[${index}] must be an object`);
    }

    const recognitionId = probabilityRow.recognitionId;

    if (typeof recognitionId !== "string" || recognitionId.length === 0) {
      throw new Error(
        `probabilityRows[${index}].recognitionId must be a non-empty string`,
      );
    }

    if (probabilityIds.has(recognitionId)) {
      throw new Error(`Duplicated probability recognitionId: ${recognitionId}`);
    }

    probabilityIds.add(recognitionId);

    const datasetRow = datasetByRecognitionId.get(recognitionId);

    if (!datasetRow) {
      throw new Error(
        `Probability recognitionId not found in dataset: ${recognitionId}`,
      );
    }

    validateProbability(
      probabilityRow.probability,
      `probabilityRows[${index}].probability`,
    );

    if (probabilityRow.label !== undefined) {
      validateBinaryLabel(
        probabilityRow.label,
        `probabilityRows[${index}].label`,
      );

      if (probabilityRow.label !== datasetRow.label) {
        throw new Error(`Label mismatch for recognitionId ${recognitionId}`);
      }
    }

    return {
      recognitionId,
      targetKanji: datasetRow.targetKanji,
      label: datasetRow.label,
      classification: datasetRow.classification,
      descriptorPrediction: getDescriptorPredictionFromClassification(
        datasetRow.classification,
      ),
      mlProbability: probabilityRow.probability,
    };
  });

  if (hybridRows.length !== datasetEntries.length) {
    throw new Error(
      `Dataset and probability row count mismatch: ` +
        `dataset=${datasetEntries.length}, ` +
        `probabilities=${hybridRows.length}`,
    );
  }

  return hybridRows;
}

function evaluateHybridRows({ hybridRows, threshold }) {
  if (!Array.isArray(hybridRows) || hybridRows.length === 0) {
    throw new Error("hybridRows must be a non-empty array");
  }

  validateThreshold(threshold);

  let truePositive = 0;
  let trueNegative = 0;
  let falsePositive = 0;
  let falseNegative = 0;

  const predictions = [];

  for (let index = 0; index < hybridRows.length; index++) {
    const row = hybridRows[index];

    validateBinaryLabel(row.label, `hybridRows[${index}].label`);

    validateBinaryLabel(
      row.descriptorPrediction,
      `hybridRows[${index}].descriptorPrediction`,
    );

    validateProbability(
      row.mlProbability,
      `hybridRows[${index}].mlProbability`,
    );

    const mlPrediction = row.mlProbability >= threshold ? 1 : 0;

    const hybridPrediction =
      row.descriptorPrediction === 1 && mlPrediction === 1 ? 1 : 0;

    if (row.label === 1 && hybridPrediction === 1) {
      truePositive++;
    } else if (row.label === 0 && hybridPrediction === 0) {
      trueNegative++;
    } else if (row.label === 0 && hybridPrediction === 1) {
      falsePositive++;
    } else {
      falseNegative++;
    }

    predictions.push({
      recognitionId: row.recognitionId,
      targetKanji: row.targetKanji,
      label: row.label,
      classification: row.classification,
      descriptorPrediction: row.descriptorPrediction,
      mlProbability: row.mlProbability,
      mlPrediction,
      hybridPrediction,
    });
  }

  return {
    threshold,
    decisionRule: "descriptorPrediction === 1 && mlPrediction === 1",
    metrics: calculateBinaryMetrics({
      truePositive,
      trueNegative,
      falsePositive,
      falseNegative,
    }),
    predictions,
  };
}

function summarizeHybridChanges({ hybridEvaluation }) {
  const descriptorFalsePositivesRejected = [];

  const descriptorTruePositivesRejected = [];

  const unchangedDescriptorFalsePositives = [];

  for (const prediction of hybridEvaluation.predictions) {
    const wasDescriptorPositive = prediction.descriptorPrediction === 1;

    const isHybridNegative = prediction.hybridPrediction === 0;

    if (prediction.label === 0 && wasDescriptorPositive && isHybridNegative) {
      descriptorFalsePositivesRejected.push(prediction);
    }

    if (prediction.label === 1 && wasDescriptorPositive && isHybridNegative) {
      descriptorTruePositivesRejected.push(prediction);
    }

    if (
      prediction.label === 0 &&
      wasDescriptorPositive &&
      prediction.hybridPrediction === 1
    ) {
      unchangedDescriptorFalsePositives.push(prediction);
    }
  }

  const sortByProbability = (left, right) => {
    if (left.mlProbability !== right.mlProbability) {
      return left.mlProbability - right.mlProbability;
    }

    return left.recognitionId.localeCompare(right.recognitionId);
  };

  descriptorFalsePositivesRejected.sort(sortByProbability);

  descriptorTruePositivesRejected.sort(sortByProbability);

  unchangedDescriptorFalsePositives.sort(sortByProbability);

  return {
    descriptorFalsePositiveRejectedCount:
      descriptorFalsePositivesRejected.length,
    descriptorTruePositiveRejectedCount: descriptorTruePositivesRejected.length,
    remainingDescriptorFalsePositiveCount:
      unchangedDescriptorFalsePositives.length,
    descriptorFalsePositivesRejected,
    descriptorTruePositivesRejected,
    unchangedDescriptorFalsePositives,
  };
}

function validateHybridEvaluation({
  hybridEvaluation,
  descriptorMetrics,
  expectedRowCount,
  requireFalseNegativeSafe = true,
}) {
  const errors = [];

  const metrics = hybridEvaluation.metrics;

  if (metrics.rowCount !== expectedRowCount) {
    errors.push(
      `Hybrid row count mismatch: ` +
        `actual=${metrics.rowCount}, ` +
        `expected=${expectedRowCount}.`,
    );
  }

  if (requireFalseNegativeSafe && metrics.falseNegative !== 0) {
    errors.push(
      `Hybrid evaluation is not FN-safe: ` +
        `falseNegative=${metrics.falseNegative}.`,
    );
  }

  if (metrics.falsePositive > descriptorMetrics.falsePositive) {
    errors.push(
      `Hybrid false positives exceed descriptor false positives: ` +
        `hybrid=${metrics.falsePositive}, ` +
        `descriptor=${descriptorMetrics.falsePositive}.`,
    );
  }

  if (metrics.trueNegative < descriptorMetrics.trueNegative) {
    errors.push(
      `Hybrid true negatives are below descriptor true negatives: ` +
        `hybrid=${metrics.trueNegative}, ` +
        `descriptor=${descriptorMetrics.trueNegative}.`,
    );
  }

  return {
    passed: errors.length === 0,
    errors,
  };
}

module.exports = {
  VALID_CLASSIFICATIONS,
  DESCRIPTOR_POSITIVE_CLASSIFICATIONS,
  DESCRIPTOR_NEGATIVE_CLASSIFICATIONS,
  validateBinaryLabel,
  validateProbability,
  validateThreshold,
  getDescriptorPredictionFromClassification,
  buildHybridEvaluationRows,
  evaluateHybridRows,
  summarizeHybridChanges,
  validateHybridEvaluation,
};
