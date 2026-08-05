"use strict";

const DEFAULT_EPOCHS = 2000;
const DEFAULT_LEARNING_RATE = 0.01;
const DEFAULT_L2_STRENGTH = 0.001;
const DEFAULT_REPORT_EVERY = 100;
const DEFAULT_THRESHOLD = 0.5;

const MINIMUM_PROBABILITY = 1e-15;
const MAXIMUM_PROBABILITY = 1 - MINIMUM_PROBABILITY;

function assertFiniteNumber(value, name) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${name} must be a finite number`);
  }
}

function validateTrainingConfiguration({
  epochs = DEFAULT_EPOCHS,
  learningRate = DEFAULT_LEARNING_RATE,
  l2Strength = DEFAULT_L2_STRENGTH,
  reportEvery = DEFAULT_REPORT_EVERY,
}) {
  if (!Number.isInteger(epochs) || epochs <= 0) {
    throw new Error("epochs must be a positive integer");
  }

  assertFiniteNumber(learningRate, "learningRate");

  if (learningRate <= 0) {
    throw new Error("learningRate must be greater than 0");
  }

  assertFiniteNumber(l2Strength, "l2Strength");

  if (l2Strength < 0) {
    throw new Error("l2Strength must be greater than or equal to 0");
  }

  if (!Number.isInteger(reportEvery) || reportEvery <= 0) {
    throw new Error("reportEvery must be a positive integer");
  }

  return {
    epochs,
    learningRate,
    l2Strength,
    reportEvery,
  };
}

function validateThreshold(threshold) {
  assertFiniteNumber(threshold, "threshold");

  if (threshold < 0 || threshold > 1) {
    throw new Error("threshold must be between 0 and 1");
  }
}

function validateBinaryLabel(label, name) {
  if (label !== 0 && label !== 1) {
    throw new Error(`${name} must be either 0 or 1`);
  }
}

function validateVector(vector, name) {
  if (!Array.isArray(vector)) {
    throw new Error(`${name} must be an array`);
  }

  if (vector.length === 0) {
    throw new Error(`${name} must not be empty`);
  }

  for (let index = 0; index < vector.length; index++) {
    assertFiniteNumber(vector[index], `${name}[${index}]`);
  }
}

function validateTrainingExamples(trainingExamples) {
  if (!Array.isArray(trainingExamples)) {
    throw new Error("trainingExamples must be an array");
  }

  if (trainingExamples.length === 0) {
    throw new Error("trainingExamples must not be empty");
  }

  let dimensionCount = null;
  let positiveCount = 0;
  let negativeCount = 0;

  for (let index = 0; index < trainingExamples.length; index++) {
    const example = trainingExamples[index];

    if (example === null || typeof example !== "object") {
      throw new Error(`trainingExamples[${index}] must be an object`);
    }

    validateVector(example.vector, `trainingExamples[${index}].vector`);

    validateBinaryLabel(example.label, `trainingExamples[${index}].label`);

    if (dimensionCount === null) {
      dimensionCount = example.vector.length;
    }

    if (example.vector.length !== dimensionCount) {
      throw new Error(
        `trainingExamples[${index}].vector has ` +
          `${example.vector.length} dimensions, ` +
          `expected ${dimensionCount}`,
      );
    }

    if (example.label === 1) {
      positiveCount++;
    } else {
      negativeCount++;
    }
  }

  if (positiveCount === 0) {
    throw new Error(
      "trainingExamples must contain at least one positive label",
    );
  }

  if (negativeCount === 0) {
    throw new Error(
      "trainingExamples must contain at least one negative label",
    );
  }

  return {
    rowCount: trainingExamples.length,
    dimensionCount,
    positiveCount,
    negativeCount,
  };
}

function createZeroModel(dimensionCount) {
  if (!Number.isInteger(dimensionCount) || dimensionCount <= 0) {
    throw new Error("dimensionCount must be a positive integer");
  }

  return {
    bias: 0,
    weights: Array(dimensionCount).fill(0),
  };
}

function validateModel(model, expectedDimensionCount = null) {
  if (model === null || typeof model !== "object") {
    throw new Error("model must be an object");
  }

  assertFiniteNumber(model.bias, "model.bias");

  validateVector(model.weights, "model.weights");

  if (
    expectedDimensionCount !== null &&
    model.weights.length !== expectedDimensionCount
  ) {
    throw new Error(
      `model.weights has ` +
        `${model.weights.length} dimensions, ` +
        `expected ${expectedDimensionCount}`,
    );
  }
}

function dotProduct(left, right) {
  validateVector(left, "left");
  validateVector(right, "right");

  if (left.length !== right.length) {
    throw new Error(
      `Vector length mismatch: ` +
        `left=${left.length}, ` +
        `right=${right.length}`,
    );
  }

  let result = 0;

  for (let index = 0; index < left.length; index++) {
    result += left[index] * right[index];
  }

  return result;
}

function sigmoid(score) {
  assertFiniteNumber(score, "score");

  if (score >= 0) {
    const exponential = Math.exp(-score);

    return 1 / (1 + exponential);
  }

  const exponential = Math.exp(score);

  return exponential / (1 + exponential);
}

function calculateLinearScore({ model, vector }) {
  validateVector(vector, "vector");

  validateModel(model, vector.length);

  return model.bias + dotProduct(model.weights, vector);
}

function predictProbability({ model, vector }) {
  return sigmoid(
    calculateLinearScore({
      model,
      vector,
    }),
  );
}

function predictLabel({ model, vector, threshold = DEFAULT_THRESHOLD }) {
  validateThreshold(threshold);

  const probability = predictProbability({
    model,
    vector,
  });

  return probability >= threshold ? 1 : 0;
}

function clampProbability(probability) {
  assertFiniteNumber(probability, "probability");

  return Math.min(
    MAXIMUM_PROBABILITY,
    Math.max(MINIMUM_PROBABILITY, probability),
  );
}

function calculateBinaryCrossEntropy({ label, probability }) {
  validateBinaryLabel(label, "label");

  const safeProbability = clampProbability(probability);

  return -(
    label * Math.log(safeProbability) +
    (1 - label) * Math.log(1 - safeProbability)
  );
}

function calculateL2Penalty({ weights, l2Strength }) {
  validateVector(weights, "weights");

  assertFiniteNumber(l2Strength, "l2Strength");

  if (l2Strength < 0) {
    throw new Error("l2Strength must be greater than or equal to 0");
  }

  let squaredWeightSum = 0;

  for (const weight of weights) {
    squaredWeightSum += weight * weight;
  }

  return 0.5 * l2Strength * squaredWeightSum;
}

function calculateDatasetLoss({ model, examples, l2Strength = 0 }) {
  const datasetSummary = validateTrainingExamples(examples);

  validateModel(model, datasetSummary.dimensionCount);

  let crossEntropySum = 0;

  for (const example of examples) {
    const probability = predictProbability({
      model,
      vector: example.vector,
    });

    crossEntropySum += calculateBinaryCrossEntropy({
      label: example.label,
      probability,
    });
  }

  const meanCrossEntropy = crossEntropySum / examples.length;

  const l2Penalty = calculateL2Penalty({
    weights: model.weights,
    l2Strength,
  });

  return {
    totalLoss: meanCrossEntropy + l2Penalty,
    meanCrossEntropy,
    l2Penalty,
  };
}

function calculateBatchGradient({ model, examples, l2Strength = 0 }) {
  const datasetSummary = validateTrainingExamples(examples);

  validateModel(model, datasetSummary.dimensionCount);

  assertFiniteNumber(l2Strength, "l2Strength");

  if (l2Strength < 0) {
    throw new Error("l2Strength must be greater than or equal to 0");
  }

  const weightGradients = Array(datasetSummary.dimensionCount).fill(0);

  let biasGradient = 0;

  for (const example of examples) {
    const probability = predictProbability({
      model,
      vector: example.vector,
    });

    const error = probability - example.label;

    biasGradient += error;

    for (
      let dimensionIndex = 0;
      dimensionIndex < datasetSummary.dimensionCount;
      dimensionIndex++
    ) {
      weightGradients[dimensionIndex] += error * example.vector[dimensionIndex];
    }
  }

  biasGradient /= examples.length;

  for (
    let dimensionIndex = 0;
    dimensionIndex < weightGradients.length;
    dimensionIndex++
  ) {
    weightGradients[dimensionIndex] =
      weightGradients[dimensionIndex] / examples.length +
      l2Strength * model.weights[dimensionIndex];
  }

  return {
    biasGradient,
    weightGradients,
  };
}

function updateModel({ model, gradient, learningRate }) {
  validateModel(model);

  assertFiniteNumber(learningRate, "learningRate");

  if (learningRate <= 0) {
    throw new Error("learningRate must be greater than 0");
  }

  assertFiniteNumber(gradient.biasGradient, "gradient.biasGradient");

  validateVector(gradient.weightGradients, "gradient.weightGradients");

  if (gradient.weightGradients.length !== model.weights.length) {
    throw new Error("Gradient and model dimension counts do not match");
  }

  const updatedWeights = model.weights.map(
    (weight, index) => weight - learningRate * gradient.weightGradients[index],
  );

  const updatedModel = {
    bias: model.bias - learningRate * gradient.biasGradient,
    weights: updatedWeights,
  };

  validateModel(updatedModel, model.weights.length);

  return updatedModel;
}

function shouldRecordEpoch({ epoch, epochs, reportEvery }) {
  return (
    epoch === 0 || epoch === 1 || epoch === epochs || epoch % reportEvery === 0
  );
}

function trainLogisticRegression({
  trainingExamples,
  epochs = DEFAULT_EPOCHS,
  learningRate = DEFAULT_LEARNING_RATE,
  l2Strength = DEFAULT_L2_STRENGTH,
  reportEvery = DEFAULT_REPORT_EVERY,
}) {
  const configuration = validateTrainingConfiguration({
    epochs,
    learningRate,
    l2Strength,
    reportEvery,
  });

  const datasetSummary = validateTrainingExamples(trainingExamples);

  let model = createZeroModel(datasetSummary.dimensionCount);

  const initialLoss = calculateDatasetLoss({
    model,
    examples: trainingExamples,
    l2Strength: configuration.l2Strength,
  });

  const history = [
    {
      epoch: 0,
      ...initialLoss,
    },
  ];

  for (let epoch = 1; epoch <= configuration.epochs; epoch++) {
    const gradient = calculateBatchGradient({
      model,
      examples: trainingExamples,
      l2Strength: configuration.l2Strength,
    });

    model = updateModel({
      model,
      gradient,
      learningRate: configuration.learningRate,
    });

    if (
      shouldRecordEpoch({
        epoch,
        epochs: configuration.epochs,
        reportEvery: configuration.reportEvery,
      })
    ) {
      const epochLoss = calculateDatasetLoss({
        model,
        examples: trainingExamples,
        l2Strength: configuration.l2Strength,
      });

      history.push({
        epoch,
        ...epochLoss,
      });
    }
  }

  const finalLoss = calculateDatasetLoss({
    model,
    examples: trainingExamples,
    l2Strength: configuration.l2Strength,
  });

  return {
    model,
    configuration,
    datasetSummary,
    initialLoss,
    finalLoss,
    history,
  };
}

function calculateBinaryMetrics({
  truePositive,
  trueNegative,
  falsePositive,
  falseNegative,
}) {
  const positiveCount = truePositive + falseNegative;

  const negativeCount = trueNegative + falsePositive;

  const predictedPositiveCount = truePositive + falsePositive;

  const predictedNegativeCount = trueNegative + falseNegative;

  const rowCount = positiveCount + negativeCount;

  return {
    truePositive,
    trueNegative,
    falsePositive,
    falseNegative,
    rowCount,
    positiveCount,
    negativeCount,
    predictedPositiveCount,
    predictedNegativeCount,
    accuracy: safeDivide(truePositive + trueNegative, rowCount),
    recall: safeDivide(truePositive, positiveCount),
    specificity: safeDivide(trueNegative, negativeCount),
    precision: safeDivide(truePositive, predictedPositiveCount),
    falseNegativeRate: safeDivide(falseNegative, positiveCount),
    falsePositiveRate: safeDivide(falsePositive, negativeCount),
  };
}

function safeDivide(numerator, denominator) {
  if (denominator === 0) {
    return null;
  }

  return numerator / denominator;
}

function evaluateLogisticModel({
  model,
  examples,
  threshold = DEFAULT_THRESHOLD,
}) {
  validateThreshold(threshold);

  if (!Array.isArray(examples) || examples.length === 0) {
    throw new Error("examples must be a non-empty array");
  }

  let truePositive = 0;
  let trueNegative = 0;
  let falsePositive = 0;
  let falseNegative = 0;

  const predictions = [];

  for (let index = 0; index < examples.length; index++) {
    const example = examples[index];

    validateVector(example.vector, `examples[${index}].vector`);

    validateBinaryLabel(example.label, `examples[${index}].label`);

    const probability = predictProbability({
      model,
      vector: example.vector,
    });

    const predictedLabel = probability >= threshold ? 1 : 0;

    if (example.label === 1 && predictedLabel === 1) {
      truePositive++;
    } else if (example.label === 0 && predictedLabel === 0) {
      trueNegative++;
    } else if (example.label === 0 && predictedLabel === 1) {
      falsePositive++;
    } else {
      falseNegative++;
    }

    predictions.push({
      recognitionId: example.recognitionId ?? null,
      targetKanji: example.targetKanji ?? null,
      label: example.label,
      probability,
      predictedLabel,
    });
  }

  return {
    threshold,
    metrics: calculateBinaryMetrics({
      truePositive,
      trueNegative,
      falsePositive,
      falseNegative,
    }),
    predictions,
  };
}

function rankModelWeights({ model, dimensionNames }) {
  validateModel(model);

  if (!Array.isArray(dimensionNames)) {
    throw new Error("dimensionNames must be an array");
  }

  if (dimensionNames.length !== model.weights.length) {
    throw new Error(
      `dimensionNames has ` +
        `${dimensionNames.length} entries, ` +
        `expected ${model.weights.length}`,
    );
  }

  return model.weights
    .map((weight, index) => ({
      index,
      dimensionName: dimensionNames[index],
      weight,
      absoluteWeight: Math.abs(weight),
      effect:
        weight > 0
          ? "increases_positive_probability"
          : weight < 0
            ? "decreases_positive_probability"
            : "neutral",
    }))
    .sort((left, right) => {
      if (right.absoluteWeight !== left.absoluteWeight) {
        return right.absoluteWeight - left.absoluteWeight;
      }

      return left.dimensionName.localeCompare(right.dimensionName);
    });
}

function validateTrainingResult(trainingResult) {
  const errors = [];

  try {
    validateModel(
      trainingResult.model,
      trainingResult.datasetSummary.dimensionCount,
    );
  } catch (error) {
    errors.push(error.message);
  }

  const lossValues = [
    trainingResult.initialLoss?.totalLoss,
    trainingResult.finalLoss?.totalLoss,
    trainingResult.initialLoss?.meanCrossEntropy,
    trainingResult.finalLoss?.meanCrossEntropy,
    trainingResult.initialLoss?.l2Penalty,
    trainingResult.finalLoss?.l2Penalty,
  ];

  for (let index = 0; index < lossValues.length; index++) {
    if (
      typeof lossValues[index] !== "number" ||
      !Number.isFinite(lossValues[index])
    ) {
      errors.push(`Training loss value ${index} is not finite.`);
    }
  }

  if (
    Number.isFinite(trainingResult.initialLoss?.totalLoss) &&
    Number.isFinite(trainingResult.finalLoss?.totalLoss) &&
    trainingResult.finalLoss.totalLoss > trainingResult.initialLoss.totalLoss
  ) {
    errors.push("Final training loss is greater than initial training loss.");
  }

  return {
    passed: errors.length === 0,
    errors,
  };
}

module.exports = {
  DEFAULT_EPOCHS,
  DEFAULT_LEARNING_RATE,
  DEFAULT_L2_STRENGTH,
  DEFAULT_REPORT_EVERY,
  DEFAULT_THRESHOLD,
  MINIMUM_PROBABILITY,
  MAXIMUM_PROBABILITY,
  assertFiniteNumber,
  validateTrainingConfiguration,
  validateThreshold,
  validateBinaryLabel,
  validateVector,
  validateTrainingExamples,
  createZeroModel,
  validateModel,
  dotProduct,
  sigmoid,
  calculateLinearScore,
  predictProbability,
  predictLabel,
  clampProbability,
  calculateBinaryCrossEntropy,
  calculateL2Penalty,
  calculateDatasetLoss,
  calculateBatchGradient,
  updateModel,
  shouldRecordEpoch,
  trainLogisticRegression,
  calculateBinaryMetrics,
  safeDivide,
  evaluateLogisticModel,
  rankModelWeights,
  validateTrainingResult,
};
