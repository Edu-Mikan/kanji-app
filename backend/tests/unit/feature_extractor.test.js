const test = require("node:test");
const assert = require("node:assert/strict");

const {
  computeDirectionChanges,
  getSegmentIntersection,
  detectStrokeIntersections,
} = require("../../services/feature_extractor");

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

test("crossing segments should return their intersection point", () => {
  const intersection = getSegmentIntersection(
    { x: 0, y: 0.5 },
    { x: 1, y: 0.5 },
    { x: 0.5, y: 0 },
    { x: 0.5, y: 1 },
  );

  assert.ok(intersection);
  assert.ok(Math.abs(intersection.x - 0.5) < 1e-9);
  assert.ok(Math.abs(intersection.y - 0.5) < 1e-9);
});

test("separated segments should not intersect", () => {
  const intersection = getSegmentIntersection(
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: 1, y: 1 },
  );

  assert.equal(intersection, null);
});

test("cross-shaped strokes should contain one intersection", () => {
  const strokes = [
    {
      x: [0, 0.5, 1],
      y: [0.5, 0.5, 0.5],
    },
    {
      x: [0.5, 0.5, 0.5],
      y: [0, 0.5, 1],
    },
  ];

  const intersections = detectStrokeIntersections(strokes);

  assert.equal(intersections.length, 1);
  assert.equal(intersections[0].strokeA, 0);
  assert.equal(intersections[0].strokeB, 1);
  assert.ok(Math.abs(intersections[0].x - 0.5) < 0.01);
  assert.ok(Math.abs(intersections[0].y - 0.5) < 0.01);
});

test("parallel strokes should contain no intersections", () => {
  const strokes = [
    {
      x: [0, 0.5, 1],
      y: [0.25, 0.25, 0.25],
    },
    {
      x: [0, 0.5, 1],
      y: [0.75, 0.75, 0.75],
    },
  ];

  const intersections = detectStrokeIntersections(strokes);

  assert.equal(intersections.length, 0);
});
