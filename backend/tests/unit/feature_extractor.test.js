const test = require("node:test");
const assert = require("node:assert/strict");

const {
  extractGeometryFeatures,
  computeDirectionChanges,
  computeCornerCount,
  getSegmentIntersection,
  detectStrokeIntersections,
  closestPointOnSegment,
  getStrokeTouch,
  detectStrokeTouches,
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

test("closestPointOnSegment should calculate the nearest point", () => {
  const result = closestPointOnSegment(
    { x: 0.5, y: 0.1 },
    { x: 0, y: 0 },
    { x: 1, y: 0 },
  );

  assert.ok(Math.abs(result.point.x - 0.5) < 1e-9);
  assert.ok(Math.abs(result.point.y) < 1e-9);
  assert.ok(Math.abs(result.distance - 0.1) < 1e-9);
});

test("near stroke endpoints should produce one touch", () => {
  const strokeA = {
    x: [0, 0.5],
    y: [0, 0],
  };

  const strokeB = {
    x: [0.53, 0.53],
    y: [0.02, 0.5],
  };

  const touch = getStrokeTouch(strokeA, strokeB, 0.07);

  assert.ok(touch);
  assert.ok(touch.distance <= 0.07);
});

test("distant strokes should not produce a touch", () => {
  const strokeA = {
    x: [0, 0.5],
    y: [0, 0],
  };

  const strokeB = {
    x: [0.8, 0.8],
    y: [0.3, 1],
  };

  const touch = getStrokeTouch(strokeA, strokeB, 0.07);

  assert.equal(touch, null);
});

test("intersecting strokes should not also be reported as touches", () => {
  const strokes = [
    {
      x: [0, 1],
      y: [0.5, 0.5],
    },
    {
      x: [0.5, 0.5],
      y: [0, 1],
    },
  ];

  const intersections = detectStrokeIntersections(strokes);

  const touches = detectStrokeTouches(strokes, intersections, 0.07);

  assert.equal(intersections.length, 1);
  assert.equal(touches.length, 0);
});

test("each pair of strokes should produce at most one touch", () => {
  const strokes = [
    {
      x: [0, 0.5],
      y: [0, 0],
    },
    {
      x: [0.53, 0.53],
      y: [0.02, 0.5],
    },
  ];

  const touches = detectStrokeTouches(strokes, [], 0.07);

  assert.equal(touches.length, 1);
  assert.equal(touches[0].strokeA, 0);
  assert.equal(touches[0].strokeB, 1);
});

test("straight stroke should have no corners", () => {
  const stroke = {
    x: [0, 0.25, 0.5, 0.75, 1],
    y: [0, 0, 0, 0, 0],
  };

  assert.equal(computeCornerCount(stroke), 0);
});

test("L-shaped stroke should have one corner", () => {
  const stroke = {
    x: [0, 0.25, 0.5, 0.5, 0.5],
    y: [0, 0, 0, 0.25, 0.5],
  };

  assert.equal(computeCornerCount(stroke), 1);
});

test("two-corner stroke should report two corners", () => {
  const stroke = {
    x: [0, 0.5, 1, 1, 1, 0.5, 0],
    y: [0, 0, 0, 0.5, 1, 1, 1],
  };

  assert.equal(computeCornerCount(stroke), 2);
});

test("zig-zag stroke should have multiple corners", () => {
  const stroke = {
    x: [0, 0.2, 0.4, 0.6, 0.8, 1],
    y: [0, 0.5, 0, 0.5, 0, 0.5],
  };

  const cornerCount = computeCornerCount(stroke);

  assert.ok(
    cornerCount >= 3,
    `Expected multiple corners, received ${cornerCount}`,
  );
});

test("short stroke should have no corners", () => {
  const stroke = {
    x: [0, 1],
    y: [0, 1],
  };

  assert.equal(computeCornerCount(stroke), 0);
});

test("cornerCount should not exceed directionChanges", () => {
  const stroke = {
    x: [0, 0.2, 0.4, 0.6, 0.8, 1],
    y: [0, 0.5, 0, 0.5, 0, 0.5],
  };

  const directionChanges = computeDirectionChanges(stroke);

  const cornerCount = computeCornerCount(stroke);

  assert.ok(cornerCount <= directionChanges);
});

test("per-stroke intersection counts should equal twice the global count", () => {
  const features = extractGeometryFeatures(
    [
      {
        x: [0, 0.5, 1],
        y: [0.5, 0.5, 0.5],
      },
      {
        x: [0.5, 0.5, 0.5],
        y: [0, 0.5, 1],
      },
    ],
    [
      {
        x: [0, 0.5, 1],
        y: [0.5, 0.5, 0.5],
      },
      {
        x: [0.5, 0.5, 0.5],
        y: [0, 0.5, 1],
      },
    ],
  );

  const perStrokeTotal = features.perStroke.reduce(
    (sum, stroke) => sum + stroke.intersectionCount,
    0,
  );

  assert.equal(perStrokeTotal, features.intersectionCount * 2);
});

test("per-stroke touch counts should equal twice the global count", () => {
  const strokes = [
    {
      x: [0, 0.5],
      y: [0, 0],
    },
    {
      x: [0.53, 0.53],
      y: [0.02, 0.5],
    },
  ];

  const features = extractGeometryFeatures(strokes, strokes);

  const perStrokeTotal = features.perStroke.reduce(
    (sum, stroke) => sum + stroke.touchCount,
    0,
  );

  assert.equal(perStrokeTotal, features.touchCount * 2);
});
