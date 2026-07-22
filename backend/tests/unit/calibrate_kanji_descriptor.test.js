const test = require("node:test");

const assert = require("node:assert/strict");

const {
  calculateMedian,
  calculateMean,
  calculatePercentile,
  summarizeNumericValues,
  collectReferenceComparisonValues,
  summarizeReferenceComparisonValues,
  collectPerStrokeReferenceComparisonValues,
  summarizePerStrokeReferenceComparisonValues,
} = require("../../scripts/calibrate_kanji_descriptor");

function assertApproximatelyEqual(actual, expected, epsilon = 1e-9) {
  assert.ok(
    Math.abs(actual - expected) < epsilon,
    `Expected ${actual} to be approximately ${expected}`,
  );
}

test("calculateMedian should support odd value counts", () => {
  assert.equal(calculateMedian([3, 1, 2]), 2);
});

test("calculateMedian should support even value counts", () => {
  assert.equal(calculateMedian([4, 1, 3, 2]), 2.5);
});

test("calculateMean should calculate the numeric average", () => {
  assert.equal(calculateMean([1, 2, 3, 4]), 2.5);
});

test("calculatePercentile should interpolate values", () => {
  assert.equal(calculatePercentile([0, 10], 0.25), 2.5);
});

test("summarizeNumericValues should ignore invalid values", () => {
  const summary = summarizeNumericValues([
    1,
    2,
    null,
    undefined,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    3,
  ]);

  assert.deepEqual(summary, {
    count: 3,
    min: 1,
    p05: 1.1,
    p25: 1.5,
    median: 2,
    mean: 2,
    p75: 2.5,
    p95: 2.9,
    max: 3,
  });
});

test("summarizeNumericValues should return null without numeric values", () => {
  assert.equal(summarizeNumericValues([null, undefined, Number.NaN]), null);
});

test("collectReferenceComparisonValues should group global comparison metrics by classification", () => {
  const values = collectReferenceComparisonValues([
    {
      classification: "truePositive",
      referenceComparison: {
        comparisonCost: 0.1,
        meanStrokeCost: 0.1,
        strokeCountDiff: 0,
      },
    },
    {
      classification: "falsePositive",
      referenceComparison: {
        comparisonCost: 0.8,
        meanStrokeCost: 0.8,
        strokeCountDiff: 0,
      },
    },
  ]);

  assert.deepEqual(values.truePositive.comparisonCost, [0.1]);

  assert.deepEqual(values.falsePositive.comparisonCost, [0.8]);
});

test("summarizeReferenceComparisonValues should summarize comparison metrics", () => {
  const summary = summarizeReferenceComparisonValues({
    truePositive: {
      comparisonCost: [0.1, 0.2],
      meanStrokeCost: [0.1, 0.2],
      strokeCountDiff: [0, 0],
    },
    falseNegative: {
      comparisonCost: [],
      meanStrokeCost: [],
      strokeCountDiff: [],
    },
    trueNegative: {
      comparisonCost: [],
      meanStrokeCost: [],
      strokeCountDiff: [],
    },
    falsePositive: {
      comparisonCost: [],
      meanStrokeCost: [],
      strokeCountDiff: [],
    },
  });

  assert.equal(summary.truePositive.comparisonCost.count, 2);

  assertApproximatelyEqual(summary.truePositive.comparisonCost.median, 0.15);
});

test("collectPerStrokeReferenceComparisonValues should group metrics by reference stroke", () => {
  const values = collectPerStrokeReferenceComparisonValues([
    {
      classification: "truePositive",
      referenceComparison: {
        perStrokeComparisons: [
          {
            referenceStrokeIndex: 0,
            comparisonCost: 0.1,
            metrics: {
              angleAbsDiff: 0.01,
              centerDistance: 0.02,
            },
          },
        ],
      },
    },
  ]);

  assert.deepEqual(values.truePositive.referenceStroke_0.comparisonCost, [0.1]);

  assert.deepEqual(values.truePositive.referenceStroke_0.angleAbsDiff, [0.01]);
});

test("summarizePerStrokeReferenceComparisonValues should summarize per-stroke metrics", () => {
  const summary = summarizePerStrokeReferenceComparisonValues({
    truePositive: {
      referenceStroke_0: {
        comparisonCost: [0.1, 0.3],
        angleAbsDiff: [0.01, 0.03],
        centerDistance: [],
        widthRelativeDiff: [],
        heightRelativeDiff: [],
        deltaXRelativeDiff: [],
        deltaYRelativeDiff: [],
        straightnessDiff: [],
      },
    },
    falseNegative: {},
    trueNegative: {},
    falsePositive: {},
  });

  assert.equal(
    summary.truePositive.referenceStroke_0.comparisonCost.median,
    0.2,
  );

  assert.equal(summary.truePositive.referenceStroke_0.angleAbsDiff.max, 0.03);
});
