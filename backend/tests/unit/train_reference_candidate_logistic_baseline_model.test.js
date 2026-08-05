"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  parseArguments,
  validateOptions,
  calculateFileSha256,
  calculateValueSha256,
  writeJson,
  buildTrainingExamples,
  summarizeProbabilities,
  validateEvaluation,
  buildModelArtifact,
  formatDecimal,
} = require("../../scripts/train_reference_candidate_logistic_baseline_model");

function createVectorEntry({
  recognitionId,
  targetKanji = "木",
  label = 1,
  vector = [0, 1],
}) {
  return {
    recognitionId,
    targetKanji,
    label,
    classification: label === 1 ? "truePositive" : "trueNegative",
    vector,
  };
}

function createMetrics() {
  return {
    truePositive: 1,
    trueNegative: 1,
    falsePositive: 0,
    falseNegative: 0,
    rowCount: 2,
    positiveCount: 1,
    negativeCount: 1,
    predictedPositiveCount: 1,
    predictedNegativeCount: 1,
    accuracy: 1,
    recall: 1,
    specificity: 1,
    precision: 1,
    falseNegativeRate: 0,
    falsePositiveRate: 0,
  };
}

test("parseArguments reads training configuration", () => {
  const options = parseArguments([
    "--dataset",
    "./custom/dataset.jsonl",
    "--split",
    "./custom/split.json",
    "--vector-summary",
    "./custom/vector.json",
    "--out",
    "./custom/model.json",
    "--epochs",
    "500",
    "--learning-rate",
    "0.02",
    "--l2-strength",
    "0.005",
    "--report-every",
    "25",
    "--threshold",
    "0.4",
    "--top-weights",
    "10",
  ]);

  assert.equal(
    options.datasetPath,
    path.resolve(process.cwd(), "custom", "dataset.jsonl"),
  );

  assert.equal(
    options.splitPath,
    path.resolve(process.cwd(), "custom", "split.json"),
  );

  assert.equal(
    options.vectorSummaryPath,
    path.resolve(process.cwd(), "custom", "vector.json"),
  );

  assert.equal(
    options.outputPath,
    path.resolve(process.cwd(), "custom", "model.json"),
  );

  assert.equal(options.epochs, 500);
  assert.equal(options.learningRate, 0.02);
  assert.equal(options.l2Strength, 0.005);
  assert.equal(options.reportEvery, 25);
  assert.equal(options.threshold, 0.4);
  assert.equal(options.topWeightCount, 10);
});

test("validateOptions accepts valid configuration", () => {
  assert.doesNotThrow(() =>
    validateOptions({
      epochs: 100,
      learningRate: 0.01,
      l2Strength: 0.001,
      reportEvery: 10,
      threshold: 0.5,
      topWeightCount: 20,
    }),
  );
});

test("validateOptions rejects an invalid threshold", () => {
  assert.throws(
    () =>
      validateOptions({
        epochs: 100,
        learningRate: 0.01,
        l2Strength: 0.001,
        reportEvery: 10,
        threshold: 1.1,
        topWeightCount: 20,
      }),
    /threshold must be between 0 and 1/,
  );
});

test("validateOptions rejects invalid top weight count", () => {
  assert.throws(
    () =>
      validateOptions({
        epochs: 100,
        learningRate: 0.01,
        l2Strength: 0.001,
        reportEvery: 10,
        threshold: 0.5,
        topWeightCount: 0,
      }),
    /topWeightCount must be a positive integer/,
  );
});

test("calculateFileSha256 is stable", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "kanji-model-hash-"));

  t.after(() => {
    fs.rmSync(directory, {
      recursive: true,
      force: true,
    });
  });

  const filePath = path.join(directory, "value.json");

  fs.writeFileSync(filePath, '{"value":1}', "utf8");

  const firstHash = calculateFileSha256(filePath);

  const secondHash = calculateFileSha256(filePath);

  assert.equal(firstHash, secondHash);

  assert.match(firstHash, /^[a-f0-9]{64}$/);
});

test("calculateValueSha256 is deterministic", () => {
  const value = {
    bias: 0.1,
    weights: [0.2, -0.3],
  };

  assert.equal(calculateValueSha256(value), calculateValueSha256(value));

  assert.notEqual(
    calculateValueSha256(value),
    calculateValueSha256({
      bias: 0.2,
      weights: [0.2, -0.3],
    }),
  );
});

test("writeJson writes a readable JSON file", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "kanji-model-json-"));

  t.after(() => {
    fs.rmSync(directory, {
      recursive: true,
      force: true,
    });
  });

  const filePath = path.join(directory, "nested", "model.json");

  writeJson(filePath, {
    modelType: "binary_logistic_regression",
  });

  const storedValue = JSON.parse(fs.readFileSync(filePath, "utf8"));

  assert.equal(storedValue.modelType, "binary_logistic_regression");
});

test("buildTrainingExamples removes non-training fields", () => {
  const result = buildTrainingExamples([
    createVectorEntry({
      recognitionId: "recognition-1",
      targetKanji: "木",
      label: 1,
      vector: [0.1, 1],
    }),
  ]);

  assert.deepEqual(result, [
    {
      recognitionId: "recognition-1",
      targetKanji: "木",
      label: 1,
      vector: [0.1, 1],
    },
  ]);
});

test("summarizeProbabilities calculates distribution", () => {
  const summary = summarizeProbabilities([
    {
      probability: 0.2,
    },
    {
      probability: 0.4,
    },
    {
      probability: 0.9,
    },
  ]);

  assert.equal(summary.minimum, 0.2);

  assert.equal(summary.maximum, 0.9);

  assert.ok(Math.abs(summary.average - 0.5) < 1e-12);
});

test("summarizeProbabilities supports an empty list", () => {
  assert.deepEqual(summarizeProbabilities([]), {
    minimum: null,
    maximum: null,
    average: null,
  });
});

test("validateEvaluation accepts coherent predictions and metrics", () => {
  const result = validateEvaluation({
    evaluation: {
      metrics: createMetrics(),
      predictions: [
        {
          probability: 0.8,
        },
        {
          probability: 0.2,
        },
      ],
    },
    expectedRowCount: 2,
    partitionName: "Validation",
  });

  assert.equal(result.passed, true);

  assert.deepEqual(result.errors, []);
});

test("validateEvaluation rejects invalid probabilities", () => {
  const result = validateEvaluation({
    evaluation: {
      metrics: createMetrics(),
      predictions: [
        {
          probability: Number.NaN,
        },
        {
          probability: 0.2,
        },
      ],
    },
    expectedRowCount: 2,
    partitionName: "Validation",
  });

  assert.equal(result.passed, false);

  assert.ok(
    result.errors.some((error) =>
      error.includes("contains an invalid probability"),
    ),
  );
});

test("validateEvaluation rejects prediction count mismatch", () => {
  const result = validateEvaluation({
    evaluation: {
      metrics: createMetrics(),
      predictions: [
        {
          probability: 0.8,
        },
      ],
    },
    expectedRowCount: 2,
    partitionName: "Training",
  });

  assert.equal(result.passed, false);

  assert.ok(
    result.errors.some((error) => error.includes("prediction count mismatch")),
  );
});

test("buildModelArtifact records model traceability", (t) => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "kanji-model-artifact-"),
  );

  t.after(() => {
    fs.rmSync(directory, {
      recursive: true,
      force: true,
    });
  });

  const vectorSummaryPath = path.join(directory, "vector-summary.json");

  fs.writeFileSync(vectorSummaryPath, '{"passed":true}', "utf8");

  const options = {
    datasetPath: "/dataset.jsonl",
    splitPath: "/split.json",
    epochs: 100,
    learningRate: 0.01,
    l2Strength: 0.001,
    reportEvery: 10,
    threshold: 0.5,
  };

  const trainingExamples = [
    {
      recognitionId: "training-positive",
      targetKanji: "木",
      label: 1,
      vector: [0, 1],
    },
    {
      recognitionId: "training-negative",
      targetKanji: "木",
      label: 0,
      vector: [1, 0],
    },
  ];

  const validationExamples = [
    {
      recognitionId: "validation-positive",
      targetKanji: "本",
      label: 1,
      vector: [0.2, 1],
    },
  ];

  const trainingEvaluation = {
    threshold: 0.5,
    metrics: createMetrics(),
    predictions: [
      {
        probability: 0.8,
      },
      {
        probability: 0.2,
      },
    ],
  };

  const validationMetrics = {
    truePositive: 1,
    trueNegative: 0,
    falsePositive: 0,
    falseNegative: 0,
    rowCount: 1,
    positiveCount: 1,
    negativeCount: 0,
    predictedPositiveCount: 1,
    predictedNegativeCount: 0,
    accuracy: 1,
    recall: 1,
    specificity: null,
    precision: 1,
    falseNegativeRate: 0,
    falsePositiveRate: null,
  };

  const validationEvaluation = {
    threshold: 0.5,
    metrics: validationMetrics,
    predictions: [
      {
        probability: 0.7,
      },
    ],
  };

  const artifact = buildModelArtifact({
    options,
    datasetEntries: [{}, {}, {}],
    splitManifest: {
      strategy: "test_strategy",
      configuration: {
        seed: "test-seed",
        validationRatio: 0.2,
      },
    },
    vectorSummaryValidation: {
      datasetSha256: "dataset-hash",
      splitSha256: "split-hash",
    },
    vectorSummaryPath,
    featureNames: ["feature.a"],
    featureTransformers: [
      {
        featureName: "feature.a",
        mean: 0,
        scale: 1,
      },
    ],
    dimensionNames: ["value.feature.a", "presence.feature.a"],
    trainingExamples,
    validationExamples,
    trainingResult: {
      model: {
        bias: 0.1,
        weights: [0.2, -0.3],
      },
      initialLoss: {
        totalLoss: 0.69,
        meanCrossEntropy: 0.69,
        l2Penalty: 0,
      },
      finalLoss: {
        totalLoss: 0.3,
        meanCrossEntropy: 0.29,
        l2Penalty: 0.01,
      },
      history: [],
    },
    trainingEvaluation,
    validationEvaluation,
    rankedWeights: [
      {
        index: 1,
        dimensionName: "presence.feature.a",
        weight: -0.3,
        absoluteWeight: 0.3,
        effect: "decreases_positive_probability",
      },
    ],
    integrityErrors: [],
  });

  assert.equal(artifact.schemaVersion, 1);

  assert.equal(artifact.modelType, "binary_logistic_regression");

  assert.equal(artifact.dataset.sha256, "dataset-hash");

  assert.equal(artifact.split.seed, "test-seed");

  assert.equal(artifact.vectorization.dimensionCount, 2);

  assert.equal(artifact.model.weightCount, 2);

  assert.match(artifact.model.modelPayloadSha256, /^[a-f0-9]{64}$/);

  assert.equal(artifact.integrity.passed, true);
});

test("formatDecimal formats metrics consistently", () => {
  assert.equal(formatDecimal(0.123456789), "0.123457");

  assert.equal(formatDecimal(null), "n/a");

  assert.equal(formatDecimal(undefined), "n/a");
});
