const test = require("node:test");

const assert = require("node:assert/strict");

const {
  getMetricValueFromSampleEvaluation,
  classifyOutcome,
  evaluateRecommendationAgainstSamples,
  buildEvaluationReport,
} = require("../../scripts/evaluate_reference_threshold_recommendations");

test("getMetricValueFromSampleEvaluation should read per-role metric paths", () => {
  const value = getMetricValueFromSampleEvaluation(
    {
      perRoleReferenceComparison: {
        role_bottomStroke: {
          centerDistance: 0.25,
        },
      },
    },
    "perRole.role_bottomStroke.centerDistance",
  );

  assert.equal(value, 0.25);
});

test("getMetricValueFromSampleEvaluation should read global metric paths", () => {
  const value = getMetricValueFromSampleEvaluation(
    {
      referenceComparison: {
        comparisonCost: 0.42,
      },
    },
    "referenceComparison.comparisonCost",
  );

  assert.equal(value, 0.42);
});

test("classifyOutcome should classify binary outcomes", () => {
  assert.equal(
    classifyOutcome({
      expectedCorrect: true,
      accepted: true,
    }),
    "truePositive",
  );

  assert.equal(
    classifyOutcome({
      expectedCorrect: true,
      accepted: false,
    }),
    "falseNegative",
  );

  assert.equal(
    classifyOutcome({
      expectedCorrect: false,
      accepted: true,
    }),
    "falsePositive",
  );

  assert.equal(
    classifyOutcome({
      expectedCorrect: false,
      accepted: false,
    }),
    "trueNegative",
  );
});

test("evaluateRecommendationAgainstSamples should reduce false positives without false negatives", () => {
  const evaluation = evaluateRecommendationAgainstSamples({
    recommendation: {
      metricPath: "perRole.role_bottomStroke.centerDistance",
      comparisonGroup: "falsePositiveVsTruePositive",
      source: "perRole",
      suggestedMax: 0.2,
      positiveMax: 0.15,
      negativeMin: 0.25,
      gap: 0.1,
      risk: "medium",
    },

    sampleEvaluations: [
      {
        recognitionId: "tp-1",
        classification: "truePositive",
        expectedCorrect: true,
        actualAccepted: true,
        perRoleReferenceComparison: {
          role_bottomStroke: {
            centerDistance: 0.1,
          },
        },
      },
      {
        recognitionId: "fp-1",
        classification: "falsePositive",
        expectedCorrect: false,
        actualAccepted: true,
        perRoleReferenceComparison: {
          role_bottomStroke: {
            centerDistance: 0.3,
          },
        },
      },
    ],
  });

  assert.equal(evaluation.before.falsePositive, 1);

  assert.equal(evaluation.after.falsePositive, 0);

  assert.equal(evaluation.after.trueNegative, 1);

  assert.equal(evaluation.falsePositiveReduction, 1);

  assert.equal(evaluation.falseNegativeIncrease, 0);

  assert.equal(evaluation.safe, true);
});

test("buildEvaluationReport should evaluate recommendations", () => {
  const report = buildEvaluationReport({
    calibrationReport: {
      kanji: "田",
      sampleEvaluations: [
        {
          recognitionId: "tp-1",
          classification: "truePositive",
          expectedCorrect: true,
          actualAccepted: true,
          perRoleReferenceComparison: {
            role_bottomStroke: {
              centerDistance: 0.1,
            },
          },
        },
        {
          recognitionId: "fp-1",
          classification: "falsePositive",
          expectedCorrect: false,
          actualAccepted: true,
          perRoleReferenceComparison: {
            role_bottomStroke: {
              centerDistance: 0.3,
            },
          },
        },
      ],
    },

    recommendationsReport: {
      recommendations: [
        {
          metricPath: "perRole.role_bottomStroke.centerDistance",
          comparisonGroup: "falsePositiveVsTruePositive",
          source: "perRole",
          suggestedMax: 0.2,
          positiveMax: 0.15,
          negativeMin: 0.25,
          gap: 0.1,
          risk: "medium",
        },
      ],
    },
  });

  assert.equal(report.kanji, "田");

  assert.equal(report.recommendationCount, 1);

  assert.equal(report.usefulCount, 1);
});
