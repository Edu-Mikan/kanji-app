const test = require("node:test");

const assert = require("node:assert/strict");

const {
  calculateMedian,
  calculateMean,
  calculatePercentile,
  summarizeNumericValues,
} = require("../../scripts/calibrate_kanji_descriptor");

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
