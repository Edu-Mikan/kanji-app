"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  findFalseNegativeEvidence,
  calculateDimensionContributions,
  rankContributions,
  selectTopContributions,
  validateContributionDecomposition,
  findEvaluationExample,
  evaluateCounterfactualThreshold,
  diagnoseFalseNegative,
  buildSummary,
} = require("../../scripts/diagnose_reference_candidate_logistic_leave_one_kanji_out");

function createModel() {
  return {
    bias: 0.25,
    weights: [2, -3, 0.5],
  };
}

function createRuntimeArtifacts() {
  const model = createModel();

  const dimensionNames = [
    "value.feature.positive",
    "value.feature.negative",
    "presence.feature.present",
  ];

  const evaluationExamples = [
    {
      recognitionId: "positive-rejected",
      targetKanji: "木",
      label: 1,
      vector: [0.5, 1, 1],
    },
  ];

  const hybridEvaluation = {
    predictions: [
      {
        recognitionId: "positive-rejected",
        targetKanji: "木",
        label: 1,
        classification: "truePositive",
        descriptorPrediction: 1,
        mlProbability: 0.02,
        mlPrediction: 0,
        hybridPrediction: 0,
      },
      {
        recognitionId: "descriptor-fp-rejected",
        targetKanji: "木",
        label: 0,
        classification: "falsePositive",
        descriptorPrediction: 1,
        mlProbability: 0.015,
        mlPrediction: 0,
        hybridPrediction: 0,
      },
      {
        recognitionId: "descriptor-fp-kept",
        targetKanji: "木",
        label: 0,
        classification: "falsePositive",
        descriptorPrediction: 1,
        mlProbability: 0.8,
        mlPrediction: 1,
        hybridPrediction: 1,
      },
      {
        recognitionId: "descriptor-tn",
        targetKanji: "木",
        label: 0,
        classification: "trueNegative",
        descriptorPrediction: 0,
        mlProbability: 0.9,
        mlPrediction: 1,
        hybridPrediction: 0,
      },
    ],
  };

  return {
    model,
    dimensionNames,
    featureTransformers: [],
    trainingExamples: [],
    evaluationExamples,
    evaluationProbabilityRows: [],
    hybridEvaluation,
  };
}

test("findFalseNegativeEvidence flattens affected folds", () => {
  const report = {
    folds: [
      {
        foldId: "held-out-book",
        heldOutKanji: "本",
        diagnosticEvidence: {
          hybridFalseNegativePredictions: [
            {
              recognitionId: "book-fn",
              label: 1,
              classification: "truePositive",
              descriptorPrediction: 1,
              mlProbability: 0.02,
              selectedThreshold: 0.03,
              thresholdMargin: -0.01,
              mlPrediction: 0,
              hybridPrediction: 0,
            },
          ],
        },
      },
      {
        foldId: "held-out-wood",
        heldOutKanji: "木",
        diagnosticEvidence: {
          hybridFalseNegativePredictions: [
            {
              recognitionId: "wood-fn-1",
              label: 1,
              classification: "truePositive",
              descriptorPrediction: 1,
              mlProbability: 0.001,
              selectedThreshold: 0.02,
              thresholdMargin: -0.019,
              mlPrediction: 0,
              hybridPrediction: 0,
            },
            {
              recognitionId: "wood-fn-2",
              label: 1,
              classification: "truePositive",
              descriptorPrediction: 1,
              mlProbability: 0.01,
              selectedThreshold: 0.02,
              thresholdMargin: -0.01,
              mlPrediction: 0,
              hybridPrediction: 0,
            },
          ],
        },
      },
    ],
  };

  const evidence = findFalseNegativeEvidence(report);

  assert.equal(evidence.length, 3);

  assert.deepEqual(
    evidence.map((row) => row.heldOutKanji),
    ["本", "木", "木"],
  );

  assert.equal(evidence[0].foldId, "held-out-book");
});

test("calculateDimensionContributions calculates weight times value", () => {
  const contributions = calculateDimensionContributions({
    model: createModel(),
    dimensionNames: ["dimension.a", "dimension.b", "dimension.c"],
    vector: [0.5, 2, 0],
  });

  assert.equal(contributions.length, 3);

  assert.equal(contributions[0].contribution, 1);

  assert.equal(contributions[1].contribution, -6);

  assert.equal(contributions[2].contribution, 0);

  assert.equal(contributions[0].effect, "increases_positive_probability");

  assert.equal(contributions[1].effect, "decreases_positive_probability");

  assert.equal(contributions[2].effect, "neutral");
});

test("calculateDimensionContributions rejects dimension mismatches", () => {
  assert.throws(
    () =>
      calculateDimensionContributions({
        model: {
          bias: 0,
          weights: [1, 2],
        },
        dimensionNames: ["dimension.a"],
        vector: [1, 2],
      }),
    /sizes do not match/,
  );
});

test("rankContributions orders by absolute contribution", () => {
  const ranked = rankContributions([
    {
      dimensionName: "dimension.small",
      contribution: 0.5,
      absoluteContribution: 0.5,
    },
    {
      dimensionName: "dimension.negative",
      contribution: -3,
      absoluteContribution: 3,
    },
    {
      dimensionName: "dimension.positive",
      contribution: 2,
      absoluteContribution: 2,
    },
  ]);

  assert.deepEqual(
    ranked.map((entry) => entry.dimensionName),
    ["dimension.negative", "dimension.positive", "dimension.small"],
  );
});

test("selectTopContributions separates positive and negative effects", () => {
  const selected = selectTopContributions({
    contributions: [
      {
        dimensionName: "negative-large",
        contribution: -3,
        absoluteContribution: 3,
      },
      {
        dimensionName: "negative-small",
        contribution: -1,
        absoluteContribution: 1,
      },
      {
        dimensionName: "positive-large",
        contribution: 2,
        absoluteContribution: 2,
      },
      {
        dimensionName: "positive-small",
        contribution: 0.5,
        absoluteContribution: 0.5,
      },
      {
        dimensionName: "neutral",
        contribution: 0,
        absoluteContribution: 0,
      },
    ],
    count: 1,
  });

  assert.deepEqual(
    selected.mostNegative.map((entry) => entry.dimensionName),
    ["negative-large"],
  );

  assert.deepEqual(
    selected.mostPositive.map((entry) => entry.dimensionName),
    ["positive-large"],
  );

  assert.deepEqual(
    selected.mostInfluential.map((entry) => entry.dimensionName),
    ["negative-large"],
  );
});

test("validateContributionDecomposition reconstructs the score", () => {
  const model = createModel();

  const vector = [0.5, 1, 1];

  const contributions = calculateDimensionContributions({
    model,
    dimensionNames: ["dimension.a", "dimension.b", "dimension.c"],
    vector,
  });

  const validation = validateContributionDecomposition({
    model,
    vector,
    contributions,
  });

  assert.equal(validation.passed, true);

  assert.ok(
    Math.abs(
      validation.directScore -
        (model.bias +
          contributions.reduce(
            (total, entry) => total + entry.contribution,
            0,
          )),
    ) < 1e-12,
  );

  assert.ok(Number.isFinite(validation.reconstructedProbability));
});

test("findEvaluationExample returns the requested sample", () => {
  const example = findEvaluationExample({
    evaluationExamples: [
      {
        recognitionId: "example-1",
        vector: [1],
      },
      {
        recognitionId: "example-2",
        vector: [2],
      },
    ],
    recognitionId: "example-2",
  });

  assert.deepEqual(example.vector, [2]);

  assert.throws(
    () =>
      findEvaluationExample({
        evaluationExamples: [],
        recognitionId: "missing",
      }),
    /Evaluation example not found/,
  );
});

test("evaluateCounterfactualThreshold counts recovered positives", () => {
  const result = evaluateCounterfactualThreshold({
    hybridEvaluation: {
      predictions: [
        {
          label: 1,
          descriptorPrediction: 1,
          mlProbability: 0.02,
          hybridPrediction: 0,
        },
        {
          label: 1,
          descriptorPrediction: 1,
          mlProbability: 0.01,
          hybridPrediction: 0,
        },
        {
          label: 0,
          descriptorPrediction: 1,
          mlProbability: 0.015,
          hybridPrediction: 0,
        },
      ],
    },
    counterfactualThreshold: 0.02,
  });

  assert.equal(result.recoveredPositiveCount, 1);

  assert.equal(result.additionalFalsePositiveCount, 0);
});

test("evaluateCounterfactualThreshold counts additional descriptor FP", () => {
  const result = evaluateCounterfactualThreshold({
    hybridEvaluation: {
      predictions: [
        {
          label: 1,
          descriptorPrediction: 1,
          mlProbability: 0.01,
          hybridPrediction: 0,
        },
        {
          label: 0,
          descriptorPrediction: 1,
          mlProbability: 0.02,
          hybridPrediction: 0,
        },
        {
          label: 0,
          descriptorPrediction: 0,
          mlProbability: 0.9,
          hybridPrediction: 0,
        },
      ],
    },
    counterfactualThreshold: 0.01,
  });

  assert.equal(result.recoveredPositiveCount, 1);

  assert.equal(result.additionalFalsePositiveCount, 1);
});

test("diagnoseFalseNegative builds an explainable diagnosis", () => {
  const runtimeArtifacts = createRuntimeArtifacts();

  const example = runtimeArtifacts.evaluationExamples[0];

  const score =
    runtimeArtifacts.model.bias +
    runtimeArtifacts.model.weights.reduce(
      (total, weight, index) => total + weight * example.vector[index],
      0,
    );

  const probability = 1 / (1 + Math.exp(-score));

  runtimeArtifacts.hybridEvaluation.predictions[0].mlProbability = probability;

  const evidence = {
    heldOutKanji: "木",
    recognitionId: "positive-rejected",
    label: 1,
    classification: "truePositive",
    descriptorPrediction: 1,
    mlProbability: probability,
    thresholdMargin: probability - 0.5,
  };

  const diagnosis = diagnoseFalseNegative({
    evidence,
    runtimeArtifacts,
    selectedThreshold: 0.5,
  });

  assert.equal(diagnosis.heldOutKanji, "木");

  assert.equal(diagnosis.recognitionId, "positive-rejected");

  assert.equal(diagnosis.decomposition.passed, true);

  assert.equal(
    diagnosis.topContributions.mostNegative[0].dimensionName,
    "value.feature.negative",
  );

  assert.equal(diagnosis.counterfactual.recoveredPositiveCount, 1);
});

test("buildSummary aggregates affected kanjis and ranges", () => {
  const summary = buildSummary([
    {
      heldOutKanji: "本",
      mlProbability: 0.02,
      thresholdMargin: -0.01,
    },
    {
      heldOutKanji: "木",
      mlProbability: 0.001,
      thresholdMargin: -0.03,
    },
    {
      heldOutKanji: "木",
      mlProbability: 0.015,
      thresholdMargin: -0.012,
    },
  ]);

  assert.equal(summary.falseNegativeCount, 3);

  assert.deepEqual(summary.affectedKanjis, ["本", "木"]);

  assert.equal(summary.minimumProbability, 0.001);

  assert.equal(summary.maximumProbability, 0.02);

  assert.equal(summary.minimumThresholdMargin, -0.03);

  assert.equal(summary.maximumThresholdMargin, -0.01);
});
