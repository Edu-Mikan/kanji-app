const test = require("node:test");

const assert = require("node:assert/strict");

const {
  classifyRisk,
  buildRecommendation,
  buildThresholdRecommendationsReport,
} = require("../../scripts/recommend_reference_thresholds");

test("buildRecommendation should suggest midpoint threshold", () => {
  const recommendation = buildRecommendation(
    {
      metricPath: "perRole.role_bottomStroke.centerDistance",
      positiveMax: 0.15,
      negativeMin: 0.25,
      gap: 0.1,
      separates: true,
      positiveMedian: 0.1,
      negativeMedian: 0.3,
      medianDelta: 0.2,
    },
    {
      comparisonGroup: "falsePositiveVsTruePositive",
      source: "perRole",
    },
  );

  assert.equal(recommendation.suggestedMax, 0.2);

  assert.equal(recommendation.action, "review");
});

test("buildThresholdRecommendationsReport should include separating metrics only", () => {
  const report = buildThresholdRecommendationsReport({
    separationReport: {
      kanji: "田",

      classifications: {
        truePositive: 12,
        falsePositive: 2,
      },

      global: {
        falsePositiveVsTruePositive: [
          {
            metricPath: "referenceComparison.comparisonCost",
            positiveMax: 0.5,
            negativeMin: 0.4,
            gap: -0.1,
            separates: false,
          },
        ],

        trueNegativeVsTruePositive: [],
      },

      perRole: {
        falsePositiveVsTruePositive: [
          {
            metricPath: "perRole.role_bottomStroke.centerDistance",
            positiveMax: 0.1567,
            negativeMin: 0.2486,
            gap: 0.0919,
            separates: true,
          },
        ],

        trueNegativeVsTruePositive: [],
      },
    },
    minGap: 0,
  });

  assert.equal(report.kanji, "田");

  assert.equal(report.recommendationCount, 1);

  assert.equal(
    report.recommendations[0].metricPath,
    "perRole.role_bottomStroke.centerDistance",
  );
});

test("classifyRisk should classify large gaps as low risk", () => {
  assert.equal(
    classifyRisk({
      gap: 0.2,
      positiveMax: 0.1,
      suggestedMax: 0.2,
    }),
    "low",
  );
});
