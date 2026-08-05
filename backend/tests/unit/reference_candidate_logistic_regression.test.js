"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  validateTrainingConfiguration,
  validateThreshold,
  validateTrainingExamples,
  createZeroModel,
  validateModel,
  dotProduct,
  sigmoid,
  calculateLinearScore,
  predictProbability,
  predictLabel,
  calculateBinaryCrossEntropy,
  calculateL2Penalty,
  calculateDatasetLoss,
  calculateBatchGradient,
  updateModel,
  shouldRecordEpoch,
  trainLogisticRegression,
  calculateBinaryMetrics,
  evaluateLogisticModel,
  rankModelWeights,
  validateTrainingResult,
} = require("../../scripts/reference_candidate_logistic_regression");

function createLinearlySeparableExamples() {
  return [
    {
      recognitionId: "negative-1",
      targetKanji: "木",
      vector: [-2, -1],
      label: 0,
    },
    {
      recognitionId: "negative-2",
      targetKanji: "木",
      vector: [-1, -2],
      label: 0,
    },
    {
      recognitionId: "positive-1",
      targetKanji: "木",
      vector: [1, 2],
      label: 1,
    },
    {
      recognitionId: "positive-2",
      targetKanji: "木",
      vector: [2, 1],
      label: 1,
    },
  ];
}

test("validateTrainingConfiguration accepts valid defaults", () => {
  const configuration = validateTrainingConfiguration({});

  assert.equal(configuration.epochs, 2000);

  assert.equal(configuration.learningRate, 0.01);

  assert.equal(configuration.l2Strength, 0.001);

  assert.equal(configuration.reportEvery, 100);
});

test("validateTrainingConfiguration rejects invalid values", () => {
  assert.throws(
    () =>
      validateTrainingConfiguration({
        epochs: 0,
      }),
    /epochs must be a positive integer/,
  );

  assert.throws(
    () =>
      validateTrainingConfiguration({
        learningRate: 0,
      }),
    /learningRate must be greater than 0/,
  );

  assert.throws(
    () =>
      validateTrainingConfiguration({
        l2Strength: -1,
      }),
    /l2Strength must be greater than or equal to 0/,
  );

  assert.throws(
    () =>
      validateTrainingConfiguration({
        reportEvery: 0,
      }),
    /reportEvery must be a positive integer/,
  );
});

test("validateThreshold accepts boundary values", () => {
  assert.doesNotThrow(() => validateThreshold(0));

  assert.doesNotThrow(() => validateThreshold(0.5));

  assert.doesNotThrow(() => validateThreshold(1));

  assert.throws(
    () => validateThreshold(-0.1),
    /threshold must be between 0 and 1/,
  );

  assert.throws(
    () => validateThreshold(1.1),
    /threshold must be between 0 and 1/,
  );
});

test("validateTrainingExamples returns dataset metadata", () => {
  const result = validateTrainingExamples(createLinearlySeparableExamples());

  assert.deepEqual(result, {
    rowCount: 4,
    dimensionCount: 2,
    positiveCount: 2,
    negativeCount: 2,
  });
});

test("validateTrainingExamples rejects inconsistent vector sizes", () => {
  const examples = createLinearlySeparableExamples();

  examples[1].vector = [-1];

  assert.throws(
    () => validateTrainingExamples(examples),
    /has 1 dimensions, expected 2/,
  );
});

test("validateTrainingExamples requires both labels", () => {
  assert.throws(
    () =>
      validateTrainingExamples([
        {
          vector: [1, 2],
          label: 1,
        },
        {
          vector: [2, 1],
          label: 1,
        },
      ]),
    /at least one negative label/,
  );

  assert.throws(
    () =>
      validateTrainingExamples([
        {
          vector: [-1, -2],
          label: 0,
        },
        {
          vector: [-2, -1],
          label: 0,
        },
      ]),
    /at least one positive label/,
  );
});

test("createZeroModel creates the requested dimensions", () => {
  const model = createZeroModel(3);

  assert.deepEqual(model, {
    bias: 0,
    weights: [0, 0, 0],
  });
});

test("validateModel rejects non-finite weights", () => {
  assert.throws(
    () =>
      validateModel({
        bias: 0,
        weights: [1, Number.NaN],
      }),
    /model\.weights\[1\] must be a finite number/,
  );
});

test("dotProduct calculates the vector product", () => {
  assert.equal(dotProduct([1, 2, 3], [4, 5, 6]), 32);

  assert.throws(() => dotProduct([1, 2], [1]), /Vector length mismatch/);
});

test("sigmoid is numerically stable", () => {
  assert.equal(sigmoid(0), 0.5);

  assert.ok(sigmoid(10) > 0.999);
  assert.ok(sigmoid(-10) < 0.001);

  assert.ok(Number.isFinite(sigmoid(1000)));

  assert.ok(Number.isFinite(sigmoid(-1000)));

  assert.equal(sigmoid(1000), 1);

  assert.equal(sigmoid(-1000), 0);
});

test("calculateLinearScore applies bias and weights", () => {
  const score = calculateLinearScore({
    model: {
      bias: 0.5,
      weights: [2, -1],
    },
    vector: [3, 4],
  });

  assert.equal(score, 2.5);
});

test("predictProbability returns sigmoid of linear score", () => {
  const probability = predictProbability({
    model: {
      bias: 0,
      weights: [1],
    },
    vector: [0],
  });

  assert.equal(probability, 0.5);
});

test("predictLabel applies the configured threshold", () => {
  const model = {
    bias: 0,
    weights: [0],
  };

  assert.equal(
    predictLabel({
      model,
      vector: [1],
      threshold: 0.5,
    }),
    1,
  );

  assert.equal(
    predictLabel({
      model,
      vector: [1],
      threshold: 0.6,
    }),
    0,
  );
});

test("calculateBinaryCrossEntropy handles correct predictions", () => {
  const positiveLoss = calculateBinaryCrossEntropy({
    label: 1,
    probability: 0.9,
  });

  const negativeLoss = calculateBinaryCrossEntropy({
    label: 0,
    probability: 0.1,
  });

  assert.ok(Math.abs(positiveLoss - negativeLoss) < 1e-12);

  assert.ok(positiveLoss < 0.11);
});

test("calculateBinaryCrossEntropy remains finite at probability limits", () => {
  assert.ok(
    Number.isFinite(
      calculateBinaryCrossEntropy({
        label: 1,
        probability: 0,
      }),
    ),
  );

  assert.ok(
    Number.isFinite(
      calculateBinaryCrossEntropy({
        label: 0,
        probability: 1,
      }),
    ),
  );
});

test("calculateL2Penalty does not include bias", () => {
  const penalty = calculateL2Penalty({
    weights: [3, 4],
    l2Strength: 0.2,
  });

  assert.equal(penalty, 0.5 * 0.2 * 25);
});

test("zero model has log two cross entropy on balanced data", () => {
  const examples = createLinearlySeparableExamples();

  const model = createZeroModel(2);

  const loss = calculateDatasetLoss({
    model,
    examples,
    l2Strength: 0,
  });

  assert.ok(Math.abs(loss.totalLoss - Math.log(2)) < 1e-12);

  assert.equal(loss.l2Penalty, 0);
});

test("calculateBatchGradient returns expected zero-model direction", () => {
  const examples = [
    {
      vector: [-1],
      label: 0,
    },
    {
      vector: [1],
      label: 1,
    },
  ];

  const gradient = calculateBatchGradient({
    model: {
      bias: 0,
      weights: [0],
    },
    examples,
    l2Strength: 0,
  });

  assert.equal(gradient.biasGradient, 0);

  assert.equal(gradient.weightGradients[0], -0.5);
});

test("updateModel applies gradient descent", () => {
  const updatedModel = updateModel({
    model: {
      bias: 0,
      weights: [0, 0],
    },
    gradient: {
      biasGradient: -0.5,
      weightGradients: [-1, 2],
    },
    learningRate: 0.1,
  });

  assert.deepEqual(updatedModel, {
    bias: 0.05,
    weights: [0.1, -0.2],
  });
});

test("shouldRecordEpoch records boundaries and report intervals", () => {
  assert.equal(
    shouldRecordEpoch({
      epoch: 0,
      epochs: 100,
      reportEvery: 20,
    }),
    true,
  );

  assert.equal(
    shouldRecordEpoch({
      epoch: 1,
      epochs: 100,
      reportEvery: 20,
    }),
    true,
  );

  assert.equal(
    shouldRecordEpoch({
      epoch: 20,
      epochs: 100,
      reportEvery: 20,
    }),
    true,
  );

  assert.equal(
    shouldRecordEpoch({
      epoch: 21,
      epochs: 100,
      reportEvery: 20,
    }),
    false,
  );

  assert.equal(
    shouldRecordEpoch({
      epoch: 100,
      epochs: 100,
      reportEvery: 20,
    }),
    true,
  );
});

test("trainLogisticRegression reduces loss on separable data", () => {
  const trainingResult = trainLogisticRegression({
    trainingExamples: createLinearlySeparableExamples(),
    epochs: 500,
    learningRate: 0.1,
    l2Strength: 0.001,
    reportEvery: 100,
  });

  assert.ok(
    trainingResult.finalLoss.totalLoss < trainingResult.initialLoss.totalLoss,
  );

  assert.equal(trainingResult.model.weights.length, 2);

  assert.ok(trainingResult.model.weights.every(Number.isFinite));

  assert.ok(Number.isFinite(trainingResult.model.bias));
});

test("trainLogisticRegression is deterministic", () => {
  const configuration = {
    trainingExamples: createLinearlySeparableExamples(),
    epochs: 200,
    learningRate: 0.05,
    l2Strength: 0.001,
    reportEvery: 50,
  };

  const firstResult = trainLogisticRegression(configuration);

  const secondResult = trainLogisticRegression(configuration);

  assert.deepEqual(firstResult.model, secondResult.model);

  assert.deepEqual(firstResult.history, secondResult.history);
});

test("trained model classifies separable examples", () => {
  const examples = createLinearlySeparableExamples();

  const trainingResult = trainLogisticRegression({
    trainingExamples: examples,
    epochs: 500,
    learningRate: 0.1,
    l2Strength: 0.001,
    reportEvery: 100,
  });

  const evaluation = evaluateLogisticModel({
    model: trainingResult.model,
    examples,
    threshold: 0.5,
  });

  assert.deepEqual(evaluation.metrics, {
    truePositive: 2,
    trueNegative: 2,
    falsePositive: 0,
    falseNegative: 0,
    rowCount: 4,
    positiveCount: 2,
    negativeCount: 2,
    predictedPositiveCount: 2,
    predictedNegativeCount: 2,
    accuracy: 1,
    recall: 1,
    specificity: 1,
    precision: 1,
    falseNegativeRate: 0,
    falsePositiveRate: 0,
  });
});

test("calculateBinaryMetrics handles no predicted positives", () => {
  const metrics = calculateBinaryMetrics({
    truePositive: 0,
    trueNegative: 2,
    falsePositive: 0,
    falseNegative: 1,
  });

  assert.equal(metrics.rowCount, 3);
  assert.equal(metrics.accuracy, 2 / 3);
  assert.equal(metrics.recall, 0);
  assert.equal(metrics.specificity, 1);
  assert.equal(metrics.precision, null);
});

test("evaluateLogisticModel records probabilities and metadata", () => {
  const evaluation = evaluateLogisticModel({
    model: {
      bias: 0,
      weights: [1],
    },
    examples: [
      {
        recognitionId: "recognition-1",
        targetKanji: "木",
        vector: [1],
        label: 1,
      },
    ],
    threshold: 0.5,
  });

  assert.equal(evaluation.predictions.length, 1);

  assert.equal(evaluation.predictions[0].recognitionId, "recognition-1");

  assert.equal(evaluation.predictions[0].targetKanji, "木");

  assert.equal(evaluation.predictions[0].predictedLabel, 1);

  assert.ok(evaluation.predictions[0].probability > 0.5);
});

test("rankModelWeights orders weights by absolute magnitude", () => {
  const rankedWeights = rankModelWeights({
    model: {
      bias: 0,
      weights: [0.5, -2, 1, 0],
    },
    dimensionNames: [
      "dimension.a",
      "dimension.b",
      "dimension.c",
      "dimension.d",
    ],
  });

  assert.deepEqual(
    rankedWeights.map((entry) => entry.dimensionName),
    ["dimension.b", "dimension.c", "dimension.a", "dimension.d"],
  );

  assert.equal(rankedWeights[0].effect, "decreases_positive_probability");

  assert.equal(rankedWeights[1].effect, "increases_positive_probability");

  assert.equal(rankedWeights[3].effect, "neutral");
});

test("validateTrainingResult accepts a valid training result", () => {
  const trainingResult = trainLogisticRegression({
    trainingExamples: createLinearlySeparableExamples(),
    epochs: 100,
    learningRate: 0.1,
    l2Strength: 0.001,
    reportEvery: 20,
  });

  const validation = validateTrainingResult(trainingResult);

  assert.equal(validation.passed, true);

  assert.deepEqual(validation.errors, []);
});

test("validateTrainingResult detects increasing loss", () => {
  const validation = validateTrainingResult({
    model: {
      bias: 0,
      weights: [0],
    },
    datasetSummary: {
      dimensionCount: 1,
    },
    initialLoss: {
      totalLoss: 0.5,
      meanCrossEntropy: 0.5,
      l2Penalty: 0,
    },
    finalLoss: {
      totalLoss: 0.6,
      meanCrossEntropy: 0.6,
      l2Penalty: 0,
    },
  });

  assert.equal(validation.passed, false);

  assert.ok(
    validation.errors.some((error) =>
      error.includes("Final training loss is greater"),
    ),
  );
});
