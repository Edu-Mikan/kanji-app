const test = require("node:test");

const assert = require("node:assert/strict");

const {
  absoluteDifference,
  relativeDifference,
  centerDistance,
  weightedAverage,
  compareStrokeFeatures,
  compareFeatureSetsByIndex,
  compareFeatureSetsByDescriptorRoles,
} = require("../../services/reference_comparator");

function createStroke({
  index = 0,
  angleAbs = 0,
  width = 1,
  height = 0.1,
  centerX = 0.5,
  centerY = 0.5,
  deltaX = 1,
  deltaY = 0,
  straightness = 1,
} = {}) {
  return {
    index,
    angleAbs,
    width,
    height,
    centerX,
    centerY,
    deltaX,
    deltaY,
    straightness,
  };
}

function createFeatures(strokes) {
  return {
    geometry: {
      perStroke: strokes,
    },
  };
}

function assertApproximatelyEqual(actual, expected, epsilon = 1e-9) {
  assert.ok(
    Math.abs(actual - expected) < epsilon,
    `Expected ${actual} to be approximately ${expected}`,
  );
}

test("absoluteDifference should return null for invalid numbers", () => {
  assert.equal(absoluteDifference(1, undefined), null);

  assert.equal(absoluteDifference(Number.NaN, 1), null);
});

test("absoluteDifference should calculate numeric difference", () => {
  assert.equal(absoluteDifference(1.5, 1), 0.5);
});

test("relativeDifference should calculate normalized difference", () => {
  assert.equal(relativeDifference(12, 10), 0.2);
});

test("centerDistance should calculate euclidean distance", () => {
  const userStroke = createStroke({
    centerX: 0,
    centerY: 0,
  });

  const referenceStroke = createStroke({
    centerX: 3,
    centerY: 4,
  });

  assert.equal(centerDistance(userStroke, referenceStroke), 5);
});

test("weightedAverage should ignore null metrics", () => {
  const result = weightedAverage(
    {
      a: 1,
      b: null,
      c: 3,
    },
    {
      a: 1,
      b: 100,
      c: 1,
    },
  );

  assert.equal(result, 2);
});

test("compareStrokeFeatures should return zero cost for identical strokes", () => {
  const stroke = createStroke();

  const result = compareStrokeFeatures({
    userStroke: stroke,

    referenceStroke: stroke,
  });

  assert.equal(result.comparisonCost, 0);

  assert.equal(result.metrics.angleAbsDiff, 0);

  assert.equal(result.metrics.centerDistance, 0);

  assert.equal(result.metrics.widthRelativeDiff, 0);
});

test("compareStrokeFeatures should detect changed stroke geometry", () => {
  const userStroke = createStroke({
    angleAbs: 0.2,
    width: 0.8,
    centerX: 0.6,
  });

  const referenceStroke = createStroke({
    angleAbs: 0,
    width: 1,
    centerX: 0.5,
  });

  const result = compareStrokeFeatures({
    userStroke,
    referenceStroke,
  });

  assert.ok(result.comparisonCost > 0);

  assert.equal(result.metrics.angleAbsDiff, 0.2);

  assert.ok(Math.abs(result.metrics.widthRelativeDiff - 0.2) < 1e-9);

  assert.ok(result.metrics.centerDistance > 0);
});

test("compareFeatureSetsByIndex should compare strokes by index", () => {
  const userFeatures = createFeatures([
    createStroke({
      index: 0,
    }),
    createStroke({
      index: 1,
      centerX: 0.7,
    }),
  ]);

  const referenceFeatures = createFeatures([
    createStroke({
      index: 0,
    }),
    createStroke({
      index: 1,
      centerX: 0.5,
    }),
  ]);

  const result = compareFeatureSetsByIndex({
    userFeatures,
    referenceFeatures,
  });

  assert.equal(result.assignmentMode, "index");

  assert.equal(result.userStrokeCount, 2);

  assert.equal(result.referenceStrokeCount, 2);

  assert.equal(result.strokeCountDiff, 0);

  assert.equal(result.perStrokeComparisons.length, 2);

  assert.ok(result.comparisonCost > 0);
});

test("compareFeatureSetsByIndex should penalize stroke count differences", () => {
  const userFeatures = createFeatures([
    createStroke({
      index: 0,
    }),
  ]);

  const referenceFeatures = createFeatures([
    createStroke({
      index: 0,
    }),
    createStroke({
      index: 1,
    }),
  ]);

  const result = compareFeatureSetsByIndex({
    userFeatures,
    referenceFeatures,
  });

  assert.equal(result.strokeCountDiff, 1);

  assert.equal(result.comparisonCost, 1);
});

test("relativeDifference should avoid exploding when reference is zero", () => {
  assertApproximatelyEqual(relativeDifference(0.01, 0), 0.2);
});

test("relativeDifference should cap very large differences", () => {
  assert.equal(relativeDifference(0.5, 0), 2);
});

test("compareFeatureSetsByDescriptorRoles should compare user strokes assigned to descriptor roles", () => {
  const descriptor = {
    strokes: [
      {
        id: "leftStroke",
      },
      {
        id: "rightStroke",
      },
    ],
  };

  const descriptorValidation = {
    roleMatches: {
      leftStroke: {
        matchedStrokeIndex: 1,
      },
      rightStroke: {
        matchedStrokeIndex: 0,
      },
    },
  };

  const userFeatures = createFeatures([
    createStroke({
      index: 0,
      centerX: 0.8,
    }),
    createStroke({
      index: 1,
      centerX: 0.2,
    }),
  ]);

  const referenceFeatures = createFeatures([
    createStroke({
      index: 0,
      centerX: 0.2,
    }),
    createStroke({
      index: 1,
      centerX: 0.8,
    }),
  ]);

  const result = compareFeatureSetsByDescriptorRoles({
    userFeatures,
    referenceFeatures,
    descriptor,
    descriptorValidation,
  });

  assert.equal(result.assignmentMode, "descriptorRole");

  assert.equal(result.comparedRoleCount, 2);

  assert.equal(result.missingRoleCount, 0);

  assert.equal(result.perRoleComparisons[0].roleId, "leftStroke");

  assert.equal(result.perRoleComparisons[0].userStrokeIndex, 1);

  assert.equal(result.perRoleComparisons[0].referenceStrokeIndex, 0);

  assert.equal(result.perRoleComparisons[1].roleId, "rightStroke");

  assert.equal(result.perRoleComparisons[1].userStrokeIndex, 0);

  assert.equal(result.perRoleComparisons[1].referenceStrokeIndex, 1);
});

test("compareFeatureSetsByDescriptorRoles should respect explicit referenceIndex", () => {
  const descriptor = {
    strokes: [
      {
        id: "innerStroke",
        referenceIndex: 2,
      },
    ],
  };

  const descriptorValidation = {
    roleMatches: {
      innerStroke: {
        matchedStrokeIndex: 0,
      },
    },
  };

  const userFeatures = createFeatures([
    createStroke({
      index: 0,
      centerX: 0.5,
    }),
  ]);

  const referenceFeatures = createFeatures([
    createStroke({
      index: 0,
      centerX: 0.1,
    }),
    createStroke({
      index: 1,
      centerX: 0.2,
    }),
    createStroke({
      index: 2,
      centerX: 0.5,
    }),
  ]);

  const result = compareFeatureSetsByDescriptorRoles({
    userFeatures,
    referenceFeatures,
    descriptor,
    descriptorValidation,
  });

  assert.equal(result.perRoleComparisons[0].referenceStrokeIndex, 2);

  assert.equal(result.perRoleComparisons[0].comparisonCost, 0);
});

test("compareFeatureSetsByDescriptorRoles should report missing role comparisons", () => {
  const descriptor = {
    strokes: [
      {
        id: "missingStroke",
      },
    ],
  };

  const descriptorValidation = {
    roleMatches: {},
  };

  const userFeatures = createFeatures([]);

  const referenceFeatures = createFeatures([
    createStroke({
      index: 0,
    }),
  ]);

  const result = compareFeatureSetsByDescriptorRoles({
    userFeatures,
    referenceFeatures,
    descriptor,
    descriptorValidation,
  });

  assert.equal(result.comparedRoleCount, 0);

  assert.equal(result.missingRoleCount, 1);

  assert.equal(result.missingRoleComparisons[0].roleId, "missingStroke");

  assert.equal(result.comparisonCost, 2);
});
