const test = require("node:test");
const assert = require("node:assert/strict");

const { computeDirectionChanges } = require("../../services/feature_extractor");

test("straight stroke should have no direction changes", () => {
  const straightStroke = {
    x: [0, 0.25, 0.5, 0.75, 1],
    y: [0, 0, 0, 0, 0],
  };

  const result = computeDirectionChanges(straightStroke);

  assert.equal(result, 0);
});

test("L-shaped stroke should have one direction change", () => {
  const lShapedStroke = {
    x: [0, 0.5, 1, 1, 1],
    y: [0, 0, 0, 0.5, 1],
  };

  const result = computeDirectionChanges(lShapedStroke);

  assert.equal(result, 1);
});

test("zig-zag stroke should have multiple direction changes", () => {
  const zigZagStroke = {
    x: [0, 0.25, 0.5, 0.75, 1],
    y: [0, 0.5, 0, 0.5, 0],
  };

  const result = computeDirectionChanges(zigZagStroke);

  assert.ok(
    result >= 3,
    `Expected at least 3 direction changes, received ${result}`,
  );
});

test("stroke with fewer than three points should return zero", () => {
  const shortStroke = {
    x: [0, 1],
    y: [0, 1],
  };

  assert.equal(computeDirectionChanges(shortStroke), 0);
});
