const test = require("node:test");

const assert = require("node:assert/strict");

const {
  analyzeSummarySeparation,
  buildSeparationReport,
} = require("../../scripts/analyze_reference_separation");

test("analyzeSummarySeparation should detect clean separation", () => {
  const result = analyzeSummarySeparation({
    metricPath: "metric",
    positiveSummary: {
      max: 0.4,
      median: 0.2,
    },
    negativeSummary: {
      min: 0.6,
      median: 0.8,
    },
  });

  assert.equal(result.separates, true);

  assert.equal(result.gap, 0.19999999999999996);
});

test("analyzeSummarySeparation should detect overlap", () => {
  const result = analyzeSummarySeparation({
    metricPath: "metric",
    positiveSummary: {
      max: 0.8,
      median: 0.5,
    },
    negativeSummary: {
      min: 0.6,
      median: 0.7,
    },
  });

  assert.equal(result.separates, false);

  assert.equal(result.gap, -0.20000000000000007);
});

test("buildSeparationReport should analyze global summaries", () => {
  const report = buildSeparationReport({
    kanji: "田",

    classifications: {
      truePositive: 1,
      falsePositive: 1,
    },

    referenceComparison: {
      truePositive: {
        comparisonCost: {
          max: 0.4,
          median: 0.3,
        },
      },

      falsePositive: {
        comparisonCost: {
          min: 0.6,
          median: 0.7,
        },
      },
    },

    perStrokeReferenceComparison: {},
  });

  assert.equal(report.kanji, "田");

  assert.equal(report.global.falsePositiveVsTruePositive[0].separates, true);
});
