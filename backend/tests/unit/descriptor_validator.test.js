const test = require("node:test");
const assert = require("node:assert/strict");

const {
  scoreStrokeAgainstRole,
  strokeMatchesExpected,
  isExpectedRange,
  isValidExpectedRangeWeight,
  getExpectedRangeWeight,
  validateRelation,
  getMatchedStrokeIndex,
  strokePairMatches,
  geometryContainsStrokePair,
  validateIntersectsRelation,
  validateTouchesRelation,
  validateConnectsRelation,
  validateByDescriptor,
  validateDisconnectedRelation,
  validateOrthogonalCrossRelation,
  buildRelationCheckName,
  calculateCombinedBBox,
  validateContainsGroupRelation,
} = require("../../services/descriptor_validator");

const descriptorData = require("../../data/kanji_descriptors.json");
const crossDescriptor = descriptorData.descriptors["十"];
const eightDescriptor = descriptorData.descriptors["八"];
const mountainDescriptor = descriptorData.descriptors["山"];
const boxDescriptor = descriptorData.descriptors["口"];
const sunDescriptor = descriptorData.descriptors["日"];
const eyeDescriptor = descriptorData.descriptors["目"];
const fieldDescriptor = descriptorData.descriptors["田"];
const enclosureDescriptor = descriptorData.descriptors["回"];

test("isExpectedRange should accept numeric min and max ranges", () => {
  assert.equal(
    isExpectedRange({
      min: 0.2,
    }),
    true,
  );

  assert.equal(
    isExpectedRange({
      max: 0.8,
    }),
    true,
  );

  assert.equal(
    isExpectedRange({
      min: 0.2,
      max: 0.8,
    }),
    true,
  );
});

test("isExpectedRange should reject invalid range definitions", () => {
  assert.equal(isExpectedRange(null), false);
  assert.equal(isExpectedRange({}), false);
  assert.equal(isExpectedRange([]), false);
  assert.equal(isExpectedRange("horizontal"), false);

  assert.equal(
    isExpectedRange({
      min: "0.2",
    }),
    false,
  );
});

test("existing expected range weights should remain stable", () => {
  assert.equal(getExpectedRangeWeight("angleAbs"), 2);

  assert.equal(getExpectedRangeWeight("straightness"), 1.5);

  assert.equal(getExpectedRangeWeight("width"), 1);
});

test("new numeric features should use default weight one", () => {
  assert.equal(getExpectedRangeWeight("cornerCount"), 1);

  assert.equal(getExpectedRangeWeight("relativeLength"), 1);
});

test("strokeMatchesExpected should support new numeric features", () => {
  const stroke = {
    cornerCount: 1,
    directionChanges: 2,
    relativeLength: 0.35,
  };

  const expected = {
    cornerCount: {
      min: 1,
      max: 1,
    },
    directionChanges: {
      min: 1,
      max: 3,
    },
    relativeLength: {
      min: 0.2,
      max: 0.5,
    },
  };

  assert.equal(strokeMatchesExpected(stroke, expected), true);
});

test("strokeMatchesExpected should reject an out-of-range new feature", () => {
  const stroke = {
    cornerCount: 3,
    relativeLength: 0.35,
  };

  const expected = {
    cornerCount: {
      min: 1,
      max: 1,
    },
    relativeLength: {
      min: 0.2,
      max: 0.5,
    },
  };

  assert.equal(strokeMatchesExpected(stroke, expected), false);
});

test("scoreStrokeAgainstRole should penalize new numeric features", () => {
  const stroke = {
    cornerCount: 3,
  };

  const role = {
    expected: {
      cornerCount: {
        min: 1,
        max: 1,
      },
    },
  };

  const score = scoreStrokeAgainstRole(stroke, role);

  assert.equal(score, 2);
});

test("scoreStrokeAgainstRole should preserve existing feature weights", () => {
  const stroke = {
    angleAbs: 0.2,
    straightness: 0.5,
  };

  const role = {
    expected: {
      angleAbs: {
        min: 0.5,
      },
      straightness: {
        min: 0.7,
      },
    },
  };

  const score = scoreStrokeAgainstRole(stroke, role);

  const expectedScore = (0.5 - 0.2) * 2 + (0.7 - 0.5) * 1.5;

  assert.ok(
    Math.abs(score - expectedScore) < 1e-9,
    `Expected ${expectedScore}, received ${score}`,
  );
});

test("isValidExpectedRangeWeight should accept finite non-negative numbers", () => {
  assert.equal(isValidExpectedRangeWeight(0), true);

  assert.equal(isValidExpectedRangeWeight(0.5), true);

  assert.equal(isValidExpectedRangeWeight(2), true);
});

test("isValidExpectedRangeWeight should reject invalid values", () => {
  assert.equal(isValidExpectedRangeWeight(-1), false);

  assert.equal(isValidExpectedRangeWeight("2"), false);

  assert.equal(isValidExpectedRangeWeight(null), false);

  assert.equal(isValidExpectedRangeWeight(NaN), false);

  assert.equal(isValidExpectedRangeWeight(Infinity), false);
});

test("configured expected range weight should override the default", () => {
  const weight = getExpectedRangeWeight("angleAbs", {
    angleAbs: 4,
  });

  assert.equal(weight, 4);
});

test("configured weight should work for new numeric features", () => {
  const weight = getExpectedRangeWeight("cornerCount", {
    cornerCount: 2.5,
  });

  assert.equal(weight, 2.5);
});

test("invalid configured weight should fall back to the default", () => {
  assert.equal(
    getExpectedRangeWeight("angleAbs", {
      angleAbs: -3,
    }),
    2,
  );

  assert.equal(
    getExpectedRangeWeight("cornerCount", {
      cornerCount: "4",
    }),
    1,
  );
});

test("scoreStrokeAgainstRole should apply configured feature weights", () => {
  const stroke = {
    cornerCount: 3,
  };

  const role = {
    expected: {
      cornerCount: {
        min: 1,
        max: 1,
      },
    },
    weights: {
      cornerCount: 2.5,
    },
  };

  const score = scoreStrokeAgainstRole(stroke, role);

  assert.equal(score, 5);
});

test("zero configured weight should remove the scoring penalty", () => {
  const stroke = {
    cornerCount: 5,
  };

  const role = {
    expected: {
      cornerCount: {
        min: 1,
        max: 1,
      },
    },
    weights: {
      cornerCount: 0,
    },
  };

  const score = scoreStrokeAgainstRole(stroke, role);

  assert.equal(score, 0);
});

test("configured weights should not change range validation", () => {
  const stroke = {
    cornerCount: 3,
  };

  const expected = {
    cornerCount: {
      min: 1,
      max: 1,
    },
  };

  assert.equal(strokeMatchesExpected(stroke, expected), false);
});

function createRoleMatches() {
  return {
    horizontal: {
      stroke: {
        index: 0,
      },
    },
    vertical: {
      stroke: {
        index: 1,
      },
    },
    diagonal: {
      stroke: {
        index: 2,
      },
    },
  };
}

function createGeometry() {
  return {
    intersections: [
      {
        strokeA: 0,
        strokeB: 1,
        x: 0.5,
        y: 0.5,
      },
    ],
    touches: [
      {
        strokeA: 1,
        strokeB: 2,
        distance: 0.03,
        x: 0.52,
        y: 0.62,
      },
    ],
  };
}

test("getMatchedStrokeIndex should return the matched stroke index", () => {
  const roleMatches = createRoleMatches();

  assert.equal(getMatchedStrokeIndex(roleMatches, "horizontal"), 0);

  assert.equal(getMatchedStrokeIndex(roleMatches, "vertical"), 1);
});

test("getMatchedStrokeIndex should return null for missing roles", () => {
  const roleMatches = createRoleMatches();

  assert.equal(getMatchedStrokeIndex(roleMatches, "missingRole"), null);
});

test("strokePairMatches should ignore stroke order", () => {
  const item = {
    strokeA: 0,
    strokeB: 1,
  };

  assert.equal(strokePairMatches(item, 0, 1), true);

  assert.equal(strokePairMatches(item, 1, 0), true);

  assert.equal(strokePairMatches(item, 0, 2), false);
});

test("intersects relation should pass for an exact intersection", () => {
  const roleMatches = createRoleMatches();
  const geometry = createGeometry();

  const result = validateRelation(
    {
      type: "intersects",
      from: "horizontal",
      to: "vertical",
    },
    roleMatches,
    geometry,
  );

  assert.equal(result, true);
});

test("intersects relation should fail without an exact intersection", () => {
  const roleMatches = createRoleMatches();
  const geometry = createGeometry();

  const result = validateRelation(
    {
      type: "intersects",
      from: "vertical",
      to: "diagonal",
    },
    roleMatches,
    geometry,
  );

  assert.equal(result, false);
});

test("touches relation should pass for an approximate touch", () => {
  const roleMatches = createRoleMatches();
  const geometry = createGeometry();

  const result = validateRelation(
    {
      type: "touches",
      from: "vertical",
      to: "diagonal",
    },
    roleMatches,
    geometry,
  );

  assert.equal(result, true);
});

test("touches relation should not pass for an exact-only intersection", () => {
  const roleMatches = createRoleMatches();
  const geometry = createGeometry();

  const result = validateRelation(
    {
      type: "touches",
      from: "horizontal",
      to: "vertical",
    },
    roleMatches,
    geometry,
  );

  assert.equal(result, false);
});

test("connects relation should pass for an exact intersection", () => {
  const roleMatches = createRoleMatches();
  const geometry = createGeometry();

  const result = validateRelation(
    {
      type: "connects",
      from: "horizontal",
      to: "vertical",
    },
    roleMatches,
    geometry,
  );

  assert.equal(result, true);
});

test("connects relation should pass for an approximate touch", () => {
  const roleMatches = createRoleMatches();
  const geometry = createGeometry();

  const result = validateRelation(
    {
      type: "connects",
      from: "vertical",
      to: "diagonal",
    },
    roleMatches,
    geometry,
  );

  assert.equal(result, true);
});

test("connects relation should fail for unrelated strokes", () => {
  const roleMatches = createRoleMatches();
  const geometry = createGeometry();

  const result = validateRelation(
    {
      type: "connects",
      from: "horizontal",
      to: "diagonal",
    },
    roleMatches,
    geometry,
  );

  assert.equal(result, false);
});

test("geometric relations should fail safely when geometry is missing", () => {
  const roleMatches = createRoleMatches();

  const result = validateRelation(
    {
      type: "intersects",
      from: "horizontal",
      to: "vertical",
    },
    roleMatches,
  );

  assert.equal(result, false);
});

test("geometric relations should fail when a role has no matched stroke", () => {
  const roleMatches = createRoleMatches();
  const geometry = createGeometry();

  const result = validateRelation(
    {
      type: "connects",
      from: "horizontal",
      to: "missingRole",
    },
    roleMatches,
    geometry,
  );

  assert.equal(result, false);
});

function createCrossFeatures({ intersections = [], touches = [] } = {}) {
  return {
    strokeCountUser: 2,
    strokeCountRef: 2,
    geometry: {
      bboxWidth: 1,
      bboxHeight: 1,
      aspectRatio: 1,
      straightnessMean: 1,
      straightnessMin: 1,
      intersections,
      intersectionCount: intersections.length,
      touches,
      touchCount: touches.length,
      perStroke: [
        {
          index: 0,
          angleAbs: 0,
          width: 1,
          height: 0.04,
          centerX: 0.5,
          centerY: 0.5,
          minX: 0,
          maxX: 1,
          minY: 0.48,
          maxY: 0.52,
          straightness: 1,
        },
        {
          index: 1,
          angleAbs: Math.PI / 2,
          width: 0.04,
          height: 1,
          centerX: 0.5,
          centerY: 0.5,
          minX: 0.48,
          maxX: 0.52,
          minY: 0,
          maxY: 1,
          straightness: 1,
        },
      ],
    },
  };
}

test("十 descriptor should use an exact intersects relation", () => {
  assert.ok(crossDescriptor);

  assert.deepEqual(crossDescriptor.relations, [
    {
      type: "intersects",
      from: "horizontal",
      to: "vertical",
    },
  ]);

  assert.ok(
    crossDescriptor.hardChecks.includes("intersects.horizontal.vertical"),
  );

  assert.equal(
    crossDescriptor.hardChecks.includes("crosses.horizontal.vertical"),
    false,
  );
});

test("十 should pass when horizontal and vertical strokes intersect", () => {
  const features = createCrossFeatures({
    intersections: [
      {
        strokeA: 0,
        strokeB: 1,
        x: 0.5,
        y: 0.5,
      },
    ],
  });

  const result = validateByDescriptor({
    kanji: "十",
    features,
    descriptor: crossDescriptor,
  });

  assert.equal(result.isCorrect, true);

  assert.equal(result.checks["intersects.horizontal.vertical"], true);

  assert.deepEqual(result.hardFailedChecks, []);

  assert.equal(result.roleMatches.horizontal.matchedStrokeIndex, 0);

  assert.equal(result.roleMatches.vertical.matchedStrokeIndex, 1);
});

test("十 should fail when horizontal and vertical strokes do not intersect", () => {
  const features = createCrossFeatures();

  const result = validateByDescriptor({
    kanji: "十",
    features,
    descriptor: crossDescriptor,
  });

  assert.equal(result.isCorrect, false);

  assert.equal(result.checks["intersects.horizontal.vertical"], false);

  assert.ok(result.failedChecks.includes("intersects.horizontal.vertical"));

  assert.ok(result.hardFailedChecks.includes("intersects.horizontal.vertical"));

  assert.equal(result.score, 10);
});

test("十 should not accept an approximate touch as an exact intersection", () => {
  const features = createCrossFeatures({
    touches: [
      {
        strokeA: 0,
        strokeB: 1,
        distance: 0.03,
        x: 0.5,
        y: 0.5,
      },
    ],
  });

  const result = validateByDescriptor({
    kanji: "十",
    features,
    descriptor: crossDescriptor,
  });

  assert.equal(result.isCorrect, false);

  assert.equal(result.checks["intersects.horizontal.vertical"], false);

  assert.ok(result.hardFailedChecks.includes("intersects.horizontal.vertical"));
});

test("十 exact intersection should work regardless of stored stroke order", () => {
  const features = createCrossFeatures({
    intersections: [
      {
        strokeA: 1,
        strokeB: 0,
        x: 0.5,
        y: 0.5,
      },
    ],
  });

  const result = validateByDescriptor({
    kanji: "十",
    features,
    descriptor: crossDescriptor,
  });

  assert.equal(result.isCorrect, true);

  assert.equal(result.checks["intersects.horizontal.vertical"], true);
});

test("disconnected relation should pass for unrelated strokes", () => {
  const roleMatches = createRoleMatches();
  const geometry = createGeometry();

  const result = validateRelation(
    {
      type: "disconnected",
      from: "horizontal",
      to: "diagonal",
    },
    roleMatches,
    geometry,
  );

  assert.equal(result, true);
});

test("disconnected relation should fail for intersecting strokes", () => {
  const roleMatches = createRoleMatches();
  const geometry = createGeometry();

  const result = validateRelation(
    {
      type: "disconnected",
      from: "horizontal",
      to: "vertical",
    },
    roleMatches,
    geometry,
  );

  assert.equal(result, false);
});

test("disconnected relation should fail for touching strokes", () => {
  const roleMatches = createRoleMatches();
  const geometry = createGeometry();

  const result = validateRelation(
    {
      type: "disconnected",
      from: "vertical",
      to: "diagonal",
    },
    roleMatches,
    geometry,
  );

  assert.equal(result, false);
});

test("disconnected relation should fail when a role is missing", () => {
  const roleMatches = createRoleMatches();
  const geometry = createGeometry();

  const result = validateRelation(
    {
      type: "disconnected",
      from: "horizontal",
      to: "missingRole",
    },
    roleMatches,
    geometry,
  );

  assert.equal(result, false);
});

function createEightFeatures({ intersections = [], touches = [] } = {}) {
  return {
    strokeCountUser: 2,
    strokeCountRef: 2,
    geometry: {
      bboxWidth: 1,
      bboxHeight: 0.75,
      aspectRatio: 1.33,
      straightnessMean: 0.95,
      straightnessMin: 0.95,
      intersections,
      intersectionCount: intersections.length,
      touches,
      touchCount: touches.length,
      perStroke: [
        {
          index: 0,
          angleAbs: 1.1,
          width: 0.15,
          height: 0.55,
          centerX: 0.2,
          centerY: 0.52,
          minX: 0.1,
          maxX: 0.25,
          minY: 0.15,
          maxY: 0.7,
          straightness: 0.95,
          deltaX: -0.12,
          deltaY: 0.5,
        },
        {
          index: 1,
          angleAbs: 1.0,
          width: 0.3,
          height: 0.6,
          centerX: 0.75,
          centerY: 0.5,
          minX: 0.55,
          maxX: 0.85,
          minY: 0.1,
          maxY: 0.7,
          straightness: 0.95,
          deltaX: 0.28,
          deltaY: 0.55,
        },
      ],
    },
  };
}

test("八 descriptor should require disconnected strokes", () => {
  assert.ok(eightDescriptor);

  assert.ok(
    eightDescriptor.relations.some(
      (relation) =>
        relation.type === "disconnected" &&
        relation.from === "leftStroke" &&
        relation.to === "rightStroke",
    ),
  );

  assert.ok(
    eightDescriptor.hardChecks.includes("disconnected.leftStroke.rightStroke"),
  );
});

test("八 should pass when both diagonal strokes are disconnected", () => {
  const features = createEightFeatures();

  const result = validateByDescriptor({
    kanji: "八",
    features,
    descriptor: eightDescriptor,
  });

  assert.equal(result.isCorrect, true);

  assert.equal(result.checks["disconnected.leftStroke.rightStroke"], true);

  assert.deepEqual(result.hardFailedChecks, []);

  assert.equal(result.roleMatches.leftStroke.matchedStrokeIndex, 0);

  assert.equal(result.roleMatches.rightStroke.matchedStrokeIndex, 1);
});

test("八 should fail when its diagonal strokes intersect", () => {
  const features = createEightFeatures({
    intersections: [
      {
        strokeA: 0,
        strokeB: 1,
        x: 0.5,
        y: 0.5,
      },
    ],
  });

  const result = validateByDescriptor({
    kanji: "八",
    features,
    descriptor: eightDescriptor,
  });

  assert.equal(result.isCorrect, false);

  assert.equal(result.checks["disconnected.leftStroke.rightStroke"], false);

  assert.ok(
    result.hardFailedChecks.includes("disconnected.leftStroke.rightStroke"),
  );

  assert.equal(result.score, 10);
});

test("八 should fail when its diagonal strokes approximately touch", () => {
  const features = createEightFeatures({
    touches: [
      {
        strokeA: 0,
        strokeB: 1,
        distance: 0.03,
        x: 0.5,
        y: 0.5,
      },
    ],
  });

  const result = validateByDescriptor({
    kanji: "八",
    features,
    descriptor: eightDescriptor,
  });

  assert.equal(result.isCorrect, false);

  assert.equal(result.checks["disconnected.leftStroke.rightStroke"], false);

  assert.ok(
    result.hardFailedChecks.includes("disconnected.leftStroke.rightStroke"),
  );
});

test("no descriptor should use the legacy crosses relation", () => {
  const descriptors = Object.values(descriptorData.descriptors);

  const descriptorsUsingLegacyCrosses = descriptors.filter((descriptor) =>
    (descriptor.relations ?? []).some(
      (relation) => relation.type === "crosses",
    ),
  );

  assert.deepEqual(descriptorsUsingLegacyCrosses, []);
});

function createMountainFeatures({
  centerX = 0.4,
  rightX = 0.75,
  wideCenterY = 0.7,
} = {}) {
  return {
    strokeCountUser: 3,
    strokeCountRef: 3,
    geometry: {
      bboxWidth: 0.85,
      bboxHeight: 0.8,
      aspectRatio: 1.0625,
      straightnessMean: 0.9,
      straightnessMin: 0.85,
      intersections: [],
      intersectionCount: 0,
      touches: [],
      touchCount: 0,
      perStroke: [
        {
          index: 0,
          angleAbs: 0.2,
          width: 0.8,
          height: 0.35,
          centerX: 0.45,
          centerY: wideCenterY,
          minX: 0.05,
          maxX: 0.85,
          minY: 0.5,
          maxY: 0.85,
          straightness: 0.85,
          deltaX: 0.8,
          deltaY: 0.3,
        },
        {
          index: 1,
          angleAbs: 1.5,
          width: 0.05,
          height: 0.7,
          centerX,
          centerY: 0.42,
          minX: centerX - 0.025,
          maxX: centerX + 0.025,
          minY: 0.05,
          maxY: 0.75,
          straightness: 0.95,
          deltaX: 0,
          deltaY: 0.7,
        },
        {
          index: 2,
          angleAbs: 1.45,
          width: 0.06,
          height: 0.4,
          centerX: rightX,
          centerY: 0.5,
          minX: rightX - 0.03,
          maxX: rightX + 0.03,
          minY: 0.25,
          maxY: 0.65,
          straightness: 0.95,
          deltaX: 0,
          deltaY: 0.4,
        },
      ],
    },
  };
}

test("山 descriptor should use declarative stroke roles", () => {
  assert.ok(mountainDescriptor);

  assert.equal(mountainDescriptor.pattern, "three_vertical_zones");

  assert.equal(mountainDescriptor.strokeCount, 3);

  assert.equal(Array.isArray(mountainDescriptor.strokes), true);

  assert.deepEqual(
    mountainDescriptor.strokes.map((stroke) => stroke.id),
    ["wideBaseStroke", "centerVerticalStroke", "rightVerticalStroke"],
  );

  assert.equal(mountainDescriptor.rules, undefined);

  assert.equal(mountainDescriptor.expectedStrokeCount, undefined);
});

test("山 should pass with a wide base and two separated vertical strokes", () => {
  const features = createMountainFeatures();

  const result = validateByDescriptor({
    kanji: "山",
    features,
    descriptor: mountainDescriptor,
  });

  assert.equal(result.isCorrect, true);
  assert.equal(result.strategy, "descriptor");

  assert.deepEqual(result.hardFailedChecks, []);

  assert.equal(result.roleMatches.wideBaseStroke.matchedStrokeIndex, 0);

  assert.equal(result.roleMatches.centerVerticalStroke.matchedStrokeIndex, 1);

  assert.equal(result.roleMatches.rightVerticalStroke.matchedStrokeIndex, 2);

  assert.equal(
    result.checks["leftOf.centerVerticalStroke.rightVerticalStroke"],
    true,
  );

  assert.equal(
    result.checks["centerXGap.centerVerticalStroke.rightVerticalStroke"],
    true,
  );
});

test("山 should fail when the two vertical strokes are too close", () => {
  const features = createMountainFeatures({
    centerX: 0.4,
    rightX: 0.52,
  });

  const result = validateByDescriptor({
    kanji: "山",
    features,
    descriptor: mountainDescriptor,
  });

  assert.equal(result.isCorrect, false);

  assert.equal(
    result.checks["centerXGap.centerVerticalStroke.rightVerticalStroke"],
    false,
  );

  assert.ok(
    result.hardFailedChecks.includes(
      "centerXGap.centerVerticalStroke.rightVerticalStroke",
    ),
  );

  assert.equal(result.score, 10);
});

test("山 should fail without a sufficiently wide base stroke", () => {
  const features = createMountainFeatures();

  features.geometry.perStroke[0] = {
    ...features.geometry.perStroke[0],
    width: 0.2,
    minX: 0.3,
    maxX: 0.5,
  };

  const result = validateByDescriptor({
    kanji: "山",
    features,
    descriptor: mountainDescriptor,
  });

  assert.equal(result.isCorrect, false);

  assert.equal(result.checks["wideBaseStroke.matches"], false);

  assert.ok(result.hardFailedChecks.includes("wideBaseStroke.matches"));
});

test("山 should fail when the center vertical is outside its expected zone", () => {
  const features = createMountainFeatures({
    centerX: 0.15,
    rightX: 0.75,
  });

  const result = validateByDescriptor({
    kanji: "山",
    features,
    descriptor: mountainDescriptor,
  });

  assert.equal(result.isCorrect, false);

  assert.equal(result.checks["centerVerticalStroke.matches"], false);

  assert.ok(result.hardFailedChecks.includes("centerVerticalStroke.matches"));
});

function createBoxFeatures({
  intersections = [
    {
      strokeA: 0,
      strokeB: 1,
      x: 0.12,
      y: 0.12,
    },
    {
      strokeA: 0,
      strokeB: 2,
      x: 0.12,
      y: 0.82,
    },
    {
      strokeA: 1,
      strokeB: 2,
      x: 0.85,
      y: 0.82,
    },
  ],
  touches = [],
} = {}) {
  return {
    strokeCountUser: 3,
    strokeCountRef: 3,
    geometry: {
      bboxWidth: 0.8,
      bboxHeight: 0.75,
      aspectRatio: 0.8 / 0.75,
      straightnessMean: 0.8,
      straightnessMin: 0.65,
      intersections,
      intersectionCount: intersections.length,
      touches,
      touchCount: touches.length,
      perStroke: [
        {
          index: 0,
          angleAbs: Math.PI / 2,
          width: 0.04,
          height: 0.7,
          centerX: 0.12,
          centerY: 0.47,
          minX: 0.1,
          maxX: 0.14,
          minY: 0.12,
          maxY: 0.82,
          straightness: 0.98,
          cornerCount: 0,
          directionChanges: 0,
          deltaX: 0,
          deltaY: 0.7,
        },
        {
          index: 1,
          angleAbs: 0.7,
          width: 0.73,
          height: 0.7,
          centerX: 0.485,
          centerY: 0.47,
          minX: 0.12,
          maxX: 0.85,
          minY: 0.12,
          maxY: 0.82,
          straightness: 0.65,
          cornerCount: 1,
          directionChanges: 1,
          deltaX: 0.73,
          deltaY: 0.7,
        },
        {
          index: 2,
          angleAbs: 0.02,
          width: 0.73,
          height: 0.04,
          centerX: 0.485,
          centerY: 0.82,
          minX: 0.12,
          maxX: 0.85,
          minY: 0.8,
          maxY: 0.84,
          straightness: 0.98,
          cornerCount: 0,
          directionChanges: 0,
          deltaX: 0.73,
          deltaY: 0.02,
        },
      ],
    },
  };
}

test("口 descriptor should use declarative box roles", () => {
  assert.ok(boxDescriptor);

  assert.equal(boxDescriptor.pattern, "box_pattern");

  assert.equal(boxDescriptor.strokeCount, 3);

  assert.equal(Array.isArray(boxDescriptor.strokes), true);

  assert.deepEqual(
    boxDescriptor.strokes.map((stroke) => stroke.id),
    ["outerStroke", "leftStroke", "bottomStroke"],
  );

  assert.equal(boxDescriptor.rules, undefined);

  assert.equal(boxDescriptor.expectedStrokeCount, undefined);
});

test("口 should pass with three connected box strokes", () => {
  const features = createBoxFeatures();

  const result = validateByDescriptor({
    kanji: "口",
    features,
    descriptor: boxDescriptor,
  });

  assert.equal(result.isCorrect, true);

  assert.equal(result.strategy, "descriptor");

  assert.deepEqual(result.hardFailedChecks, []);

  assert.equal(result.roleMatches.outerStroke.matchedStrokeIndex, 1);

  assert.equal(result.roleMatches.leftStroke.matchedStrokeIndex, 0);

  assert.equal(result.roleMatches.bottomStroke.matchedStrokeIndex, 2);

  assert.equal(result.checks["connects.leftStroke.bottomStroke"], true);

  assert.equal(result.checks["connects.outerStroke.bottomStroke"], true);
});

test("口 should report a missing left-bottom connection without making it a hard failure", () => {
  const features = createBoxFeatures({
    intersections: [
      {
        strokeA: 0,
        strokeB: 1,
        x: 0.12,
        y: 0.12,
      },
      {
        strokeA: 1,
        strokeB: 2,
        x: 0.85,
        y: 0.82,
      },
    ],
  });

  const result = validateByDescriptor({
    kanji: "口",
    features,
    descriptor: boxDescriptor,
  });

  assert.equal(result.checks["connects.leftStroke.bottomStroke"], false);

  assert.ok(result.failedChecks.includes("connects.leftStroke.bottomStroke"));

  assert.equal(
    result.hardFailedChecks.includes("connects.leftStroke.bottomStroke"),
    false,
  );

  assert.equal(result.isCorrect, true);
  assert.equal(result.score, 0.5);
});

test("口 should report a missing outer-bottom connection without making it a hard failure", () => {
  const features = createBoxFeatures({
    intersections: [
      {
        strokeA: 0,
        strokeB: 1,
        x: 0.12,
        y: 0.12,
      },
      {
        strokeA: 0,
        strokeB: 2,
        x: 0.12,
        y: 0.82,
      },
    ],
  });

  const result = validateByDescriptor({
    kanji: "口",
    features,
    descriptor: boxDescriptor,
  });

  assert.equal(result.checks["connects.outerStroke.bottomStroke"], false);

  assert.ok(result.failedChecks.includes("connects.outerStroke.bottomStroke"));

  assert.equal(
    result.hardFailedChecks.includes("connects.outerStroke.bottomStroke"),
    false,
  );

  assert.equal(result.isCorrect, true);
  assert.equal(result.score, 0.5);
});

test("口 should accept a bottom closure represented by a touch", () => {
  const features = createBoxFeatures({
    intersections: [
      {
        strokeA: 0,
        strokeB: 1,
        x: 0.12,
        y: 0.12,
      },
      {
        strokeA: 0,
        strokeB: 2,
        x: 0.12,
        y: 0.82,
      },
    ],
    touches: [
      {
        strokeA: 1,
        strokeB: 2,
        distance: 0.03,
        x: 0.85,
        y: 0.82,
      },
    ],
  });

  const result = validateByDescriptor({
    kanji: "口",
    features,
    descriptor: boxDescriptor,
  });

  assert.equal(result.isCorrect, true);

  assert.equal(result.checks["connects.outerStroke.bottomStroke"], true);
});

test("口 should fail when the outer stroke is too straight", () => {
  const features = createBoxFeatures();

  features.geometry.perStroke[1] = {
    ...features.geometry.perStroke[1],
    straightness: 0.98,
    cornerCount: 0,
    directionChanges: 0,
  };

  const result = validateByDescriptor({
    kanji: "口",
    features,
    descriptor: boxDescriptor,
  });

  assert.equal(result.isCorrect, false);

  assert.equal(result.checks["outerStroke.matches"], false);

  assert.ok(result.hardFailedChecks.includes("outerStroke.matches"));
});

test("口 geometric connections should initially be soft checks", () => {
  const connectionCheckNames = [
    "connects.leftStroke.outerStroke",
    "connects.leftStroke.bottomStroke",
    "connects.outerStroke.bottomStroke",
  ];

  for (const checkName of connectionCheckNames) {
    assert.equal(
      boxDescriptor.hardChecks.includes(checkName),
      false,
      `${checkName} should initially remain soft`,
    );
  }
});

function createSunFeatures({
  middleCenterY = 0.48,
  bottomCenterY = 0.82,
  intersections = [],
  touches = [],
} = {}) {
  return {
    strokeCountUser: 4,
    strokeCountRef: 4,
    geometry: {
      bboxWidth: 0.8,
      bboxHeight: 0.8,
      aspectRatio: 1,
      straightnessMean: 0.85,
      straightnessMin: 0.65,
      intersections,
      intersectionCount: intersections.length,
      touches,
      touchCount: touches.length,
      perStroke: [
        {
          index: 0,
          angleAbs: Math.PI / 2,
          width: 0.05,
          height: 0.72,
          centerX: 0.12,
          centerY: 0.46,
          minX: 0.1,
          maxX: 0.15,
          minY: 0.1,
          maxY: 0.82,
          straightness: 0.98,
          deltaX: 0.02,
          deltaY: 0.72,
        },
        {
          index: 1,
          angleAbs: 0.72,
          width: 0.75,
          height: 0.72,
          centerX: 0.5,
          centerY: 0.46,
          minX: 0.12,
          maxX: 0.87,
          minY: 0.1,
          maxY: 0.82,
          straightness: 0.65,
          deltaX: 0.75,
          deltaY: 0.72,
        },
        {
          index: 2,
          angleAbs: 0.03,
          width: 0.65,
          height: 0.04,
          centerX: 0.48,
          centerY: bottomCenterY,
          minX: 0.15,
          maxX: 0.8,
          minY: bottomCenterY - 0.02,
          maxY: bottomCenterY + 0.02,
          straightness: 0.98,
          deltaX: 0.65,
          deltaY: 0.01,
        },
        {
          index: 3,
          angleAbs: 0.02,
          width: 0.58,
          height: 0.04,
          centerX: 0.48,
          centerY: middleCenterY,
          minX: 0.16,
          maxX: 0.74,
          minY: middleCenterY - 0.02,
          maxY: middleCenterY + 0.02,
          straightness: 0.98,
          deltaX: 0.58,
          deltaY: 0.01,
        },
      ],
    },
  };
}

test("日 descriptor should use declarative box roles", () => {
  assert.ok(sunDescriptor);

  assert.equal(sunDescriptor.pattern, "box_with_inner_horizontal");

  assert.equal(sunDescriptor.strokeCount, 4);

  assert.deepEqual(
    sunDescriptor.strokes.map((stroke) => stroke.id),
    ["outerStroke", "leftStroke", "middleStroke", "bottomStroke"],
  );

  assert.equal(sunDescriptor.rules, undefined);

  assert.equal(sunDescriptor.expectedStrokeCount, undefined);
});

test("日 should pass with a middle horizontal above the bottom stroke", () => {
  const features = createSunFeatures();

  const result = validateByDescriptor({
    kanji: "日",
    features,
    descriptor: sunDescriptor,
  });

  assert.equal(result.isCorrect, true);

  assert.equal(result.strategy, "descriptor");

  assert.deepEqual(result.hardFailedChecks, []);

  assert.equal(result.roleMatches.outerStroke.matchedStrokeIndex, 1);

  assert.equal(result.roleMatches.leftStroke.matchedStrokeIndex, 0);

  assert.equal(result.roleMatches.bottomStroke.matchedStrokeIndex, 2);

  assert.equal(result.roleMatches.middleStroke.matchedStrokeIndex, 3);

  assert.equal(result.checks["above.middleStroke.bottomStroke"], true);
});

test("日 should fail when the middle and bottom strokes are too close", () => {
  const features = createSunFeatures({
    middleCenterY: 0.76,
    bottomCenterY: 0.82,
  });

  const result = validateByDescriptor({
    kanji: "日",
    features,
    descriptor: sunDescriptor,
  });

  assert.equal(result.isCorrect, false);

  assert.equal(result.checks["above.middleStroke.bottomStroke"], false);

  assert.ok(
    result.hardFailedChecks.includes("above.middleStroke.bottomStroke"),
  );

  assert.equal(result.score, 10);
});

test("日 should fail when the middle stroke is too short", () => {
  const features = createSunFeatures();

  features.geometry.perStroke[3] = {
    ...features.geometry.perStroke[3],
    width: 0.12,
    minX: 0.42,
    maxX: 0.54,
  };

  const result = validateByDescriptor({
    kanji: "日",
    features,
    descriptor: sunDescriptor,
  });

  assert.equal(result.isCorrect, false);

  assert.equal(result.checks["middleStroke.matches"], false);

  assert.ok(result.hardFailedChecks.includes("middleStroke.matches"));
});

test("日 horizontal connections should initially remain permissive", () => {
  const softStructuralCheckNames = [
    "connects.leftStroke.outerStroke",
    "connects.leftStroke.bottomStroke",
    "connects.outerStroke.bottomStroke",
    "connects.middleStroke.leftStroke",
    "connects.middleStroke.outerStroke",
    "overlapsX.middleStroke.leftStroke",
    "overlapsX.middleStroke.outerStroke",
  ];

  for (const checkName of softStructuralCheckNames) {
    assert.equal(
      sunDescriptor.hardChecks.includes(checkName),
      false,
      `${checkName} should not be a hard check`,
    );
  }
});

test("日 should distinguish a low middle stroke from the bottom stroke", () => {
  const features = createSunFeatures({
    middleCenterY: 0.73,
    bottomCenterY: 0.93,
  });

  const result = validateByDescriptor({
    kanji: "日",
    features,
    descriptor: sunDescriptor,
  });

  assert.equal(result.isCorrect, true);

  assert.equal(result.roleMatches.middleStroke.matchedStrokeIndex, 3);

  assert.equal(result.roleMatches.bottomStroke.matchedStrokeIndex, 2);

  assert.equal(result.checks["above.middleStroke.bottomStroke"], true);
});

test("日 should accept a slightly short but recognizable middle stroke", () => {
  const features = createSunFeatures();

  features.geometry.perStroke[3] = {
    ...features.geometry.perStroke[3],
    width: 0.21,
    minX: 0.3,
    maxX: 0.51,
  };

  const result = validateByDescriptor({
    kanji: "日",
    features,
    descriptor: sunDescriptor,
  });

  assert.equal(result.isCorrect, true);

  assert.equal(result.checks["middleStroke.matches"], true);
});

function createEyeFeatures({
  upperCenterY = 0.38,
  lowerCenterY = 0.62,
  bottomCenterY = 0.88,
  intersections = [],
  touches = [],
} = {}) {
  return {
    strokeCountUser: 5,
    strokeCountRef: 5,
    geometry: {
      bboxWidth: 0.78,
      bboxHeight: 0.88,
      aspectRatio: 0.78 / 0.88,
      straightnessMean: 0.86,
      straightnessMin: 0.68,
      intersections,
      intersectionCount: intersections.length,
      touches,
      touchCount: touches.length,
      perStroke: [
        {
          index: 0,
          angleAbs: Math.PI / 2,
          width: 0.05,
          height: 0.8,
          centerX: 0.12,
          centerY: 0.5,
          minX: 0.1,
          maxX: 0.15,
          minY: 0.1,
          maxY: 0.9,
          straightness: 0.98,
          deltaX: 0.02,
          deltaY: 0.8,
        },
        {
          index: 1,
          angleAbs: 0.75,
          width: 0.75,
          height: 0.8,
          centerX: 0.5,
          centerY: 0.5,
          minX: 0.12,
          maxX: 0.87,
          minY: 0.1,
          maxY: 0.9,
          straightness: 0.68,
          deltaX: 0.75,
          deltaY: 0.8,
        },
        {
          index: 2,
          angleAbs: 0.03,
          width: 0.58,
          height: 0.04,
          centerX: 0.46,
          centerY: upperCenterY,
          minX: 0.17,
          maxX: 0.75,
          minY: upperCenterY - 0.02,
          maxY: upperCenterY + 0.02,
          straightness: 0.98,
          deltaX: 0.58,
          deltaY: 0.01,
        },
        {
          index: 3,
          angleAbs: 0.04,
          width: 0.57,
          height: 0.04,
          centerX: 0.465,
          centerY: lowerCenterY,
          minX: 0.18,
          maxX: 0.75,
          minY: lowerCenterY - 0.02,
          maxY: lowerCenterY + 0.02,
          straightness: 0.98,
          deltaX: 0.57,
          deltaY: 0.01,
        },
        {
          index: 4,
          angleAbs: 0.03,
          width: 0.68,
          height: 0.04,
          centerX: 0.49,
          centerY: bottomCenterY,
          minX: 0.15,
          maxX: 0.83,
          minY: bottomCenterY - 0.02,
          maxY: bottomCenterY + 0.02,
          straightness: 0.98,
          deltaX: 0.68,
          deltaY: 0.01,
        },
      ],
    },
  };
}

test("目 descriptor should use declarative box roles", () => {
  assert.ok(eyeDescriptor);

  assert.equal(eyeDescriptor.pattern, "box_with_two_inner_horizontals");

  assert.equal(eyeDescriptor.strokeCount, 5);

  assert.deepEqual(
    eyeDescriptor.strokes.map((stroke) => stroke.id),
    [
      "outerStroke",
      "leftStroke",
      "upperInnerStroke",
      "lowerInnerStroke",
      "bottomStroke",
    ],
  );

  assert.equal(eyeDescriptor.rules, undefined);

  assert.equal(eyeDescriptor.expectedStrokeCount, undefined);
});

test("目 should pass with two ordered inner horizontals", () => {
  const features = createEyeFeatures();

  const result = validateByDescriptor({
    kanji: "目",
    features,
    descriptor: eyeDescriptor,
  });

  assert.equal(result.isCorrect, true);

  assert.equal(result.strategy, "descriptor");

  assert.deepEqual(result.hardFailedChecks, []);

  assert.equal(result.roleMatches.outerStroke.matchedStrokeIndex, 1);

  assert.equal(result.roleMatches.leftStroke.matchedStrokeIndex, 0);

  assert.equal(result.roleMatches.upperInnerStroke.matchedStrokeIndex, 2);

  assert.equal(result.roleMatches.lowerInnerStroke.matchedStrokeIndex, 3);

  assert.equal(result.roleMatches.bottomStroke.matchedStrokeIndex, 4);

  assert.equal(result.checks["above.upperInnerStroke.lowerInnerStroke"], true);

  assert.equal(result.checks["above.lowerInnerStroke.bottomStroke"], true);
});

test("目 should fail when the two inner horizontals are too close", () => {
  const features = createEyeFeatures({
    upperCenterY: 0.5,
    lowerCenterY: 0.54,
  });

  const result = validateByDescriptor({
    kanji: "目",
    features,
    descriptor: eyeDescriptor,
  });

  assert.equal(result.isCorrect, false);

  assert.equal(result.checks["above.upperInnerStroke.lowerInnerStroke"], false);

  assert.ok(
    result.hardFailedChecks.includes("above.upperInnerStroke.lowerInnerStroke"),
  );

  assert.equal(result.score, 10);
});

test("目 should fail when the lower inner stroke is too close to the bottom stroke", () => {
  const features = createEyeFeatures({
    lowerCenterY: 0.84,
    bottomCenterY: 0.88,
  });

  const result = validateByDescriptor({
    kanji: "目",
    features,
    descriptor: eyeDescriptor,
  });

  assert.equal(result.isCorrect, false);

  assert.equal(result.checks["above.lowerInnerStroke.bottomStroke"], false);

  assert.ok(
    result.hardFailedChecks.includes("above.lowerInnerStroke.bottomStroke"),
  );
});

test("目 should fail when an inner horizontal is clearly too short", () => {
  const features = createEyeFeatures();

  features.geometry.perStroke[2] = {
    ...features.geometry.perStroke[2],
    width: 0.1,
    minX: 0.41,
    maxX: 0.51,
  };

  const result = validateByDescriptor({
    kanji: "目",
    features,
    descriptor: eyeDescriptor,
  });

  assert.equal(result.isCorrect, false);

  assert.equal(result.checks["upperInnerStroke.matches"], false);

  assert.ok(result.hardFailedChecks.includes("upperInnerStroke.matches"));
});

test("目 geometric connections should remain soft", () => {
  const connectionCheckNames = [
    "connects.leftStroke.outerStroke",
    "connects.leftStroke.bottomStroke",
    "connects.outerStroke.bottomStroke",
    "connects.upperInnerStroke.leftStroke",
    "connects.upperInnerStroke.outerStroke",
    "connects.lowerInnerStroke.leftStroke",
    "connects.lowerInnerStroke.outerStroke",
  ];

  for (const checkName of connectionCheckNames) {
    assert.equal(
      eyeDescriptor.hardChecks.includes(checkName),
      false,
      `${checkName} should remain soft`,
    );
  }
});

test("目 should accept recognizable disconnected inner horizontals", () => {
  const features = createEyeFeatures();

  const result = validateByDescriptor({
    kanji: "目",
    features,
    descriptor: eyeDescriptor,
  });

  assert.equal(result.checks["connects.upperInnerStroke.leftStroke"], false);
  assert.equal(result.checks["connects.lowerInnerStroke.outerStroke"], false);

  assert.equal(
    result.hardFailedChecks.includes("connects.upperInnerStroke.leftStroke"),
    false,
  );

  assert.equal(
    result.hardFailedChecks.includes("connects.lowerInnerStroke.outerStroke"),
    false,
  );

  assert.equal(result.isCorrect, true);
});

test("目 should accept a short but recognizable lower inner stroke", () => {
  const features = createEyeFeatures();

  features.geometry.perStroke[3] = {
    ...features.geometry.perStroke[3],
    width: 0.155,
    minX: 0.35,
    maxX: 0.505,
  };

  const result = validateByDescriptor({
    kanji: "目",
    features,
    descriptor: eyeDescriptor,
  });

  assert.equal(result.isCorrect, true);

  assert.equal(result.checks["lowerInnerStroke.matches"], true);

  assert.equal(result.roleMatches.lowerInnerStroke.matchedStrokeIndex, 3);
});

test("目 should fail when the lower inner stroke is extremely short", () => {
  const features = createEyeFeatures();

  features.geometry.perStroke[3] = {
    ...features.geometry.perStroke[3],
    width: 0.08,
    minX: 0.42,
    maxX: 0.5,
  };

  const result = validateByDescriptor({
    kanji: "目",
    features,
    descriptor: eyeDescriptor,
  });

  assert.equal(result.isCorrect, false);

  assert.equal(result.checks["lowerInnerStroke.matches"], false);

  assert.ok(result.hardFailedChecks.includes("lowerInnerStroke.matches"));
});

function createFieldFeatures({
  includeInnerIntersection = true,
  innerHorizontalCenterY = 0.5,
  bottomCenterY = 0.86,
  intersections = [],
  touches = [],
} = {}) {
  const effectiveIntersections = [...intersections];

  if (includeInnerIntersection) {
    effectiveIntersections.push({
      strokeA: 2,
      strokeB: 3,
      x: 0.5,
      y: innerHorizontalCenterY,
    });
  }

  return {
    strokeCountUser: 5,
    strokeCountRef: 5,
    geometry: {
      bboxWidth: 0.8,
      bboxHeight: 0.82,
      aspectRatio: 0.8 / 0.82,
      straightnessMean: 0.85,
      straightnessMin: 0.68,
      intersections: effectiveIntersections,
      intersectionCount: effectiveIntersections.length,
      touches,
      touchCount: touches.length,
      perStroke: [
        {
          index: 0,
          angleAbs: Math.PI / 2,
          width: 0.05,
          height: 0.75,
          centerX: 0.12,
          centerY: 0.48,
          minX: 0.1,
          maxX: 0.15,
          minY: 0.1,
          maxY: 0.85,
          straightness: 0.98,
          deltaX: 0.02,
          deltaY: 0.75,
        },
        {
          index: 1,
          angleAbs: 0.75,
          width: 0.75,
          height: 0.75,
          centerX: 0.5,
          centerY: 0.48,
          minX: 0.12,
          maxX: 0.87,
          minY: 0.1,
          maxY: 0.85,
          straightness: 0.68,
          deltaX: 0.75,
          deltaY: 0.75,
        },
        {
          index: 2,
          angleAbs: Math.PI / 2,
          width: 0.05,
          height: 0.58,
          centerX: 0.5,
          centerY: 0.49,
          minX: 0.475,
          maxX: 0.525,
          minY: 0.2,
          maxY: 0.78,
          straightness: 0.98,
          deltaX: 0.01,
          deltaY: 0.58,
        },
        {
          index: 3,
          angleAbs: 0.03,
          width: 0.58,
          height: 0.04,
          centerX: 0.5,
          centerY: innerHorizontalCenterY,
          minX: 0.21,
          maxX: 0.79,
          minY: innerHorizontalCenterY - 0.02,
          maxY: innerHorizontalCenterY + 0.02,
          straightness: 0.98,
          deltaX: 0.58,
          deltaY: 0.01,
        },
        {
          index: 4,
          angleAbs: 0.03,
          width: 0.68,
          height: 0.04,
          centerX: 0.49,
          centerY: bottomCenterY,
          minX: 0.15,
          maxX: 0.83,
          minY: bottomCenterY - 0.02,
          maxY: bottomCenterY + 0.02,
          straightness: 0.98,
          deltaX: 0.68,
          deltaY: 0.01,
        },
      ],
    },
  };
}

test("田 descriptor should use declarative cross-box roles", () => {
  assert.ok(fieldDescriptor);

  assert.equal(fieldDescriptor.pattern, "box_with_inner_cross");

  assert.equal(fieldDescriptor.strokeCount, 5);

  assert.deepEqual(
    fieldDescriptor.strokes.map((stroke) => stroke.id),
    [
      "outerStroke",
      "leftStroke",
      "innerVerticalStroke",
      "innerHorizontalStroke",
      "bottomStroke",
    ],
  );

  assert.equal(fieldDescriptor.rules, undefined);

  assert.equal(fieldDescriptor.expectedStrokeCount, undefined);
});

test("田 should pass with an orthogonal inner cross", () => {
  const features = createFieldFeatures();

  const result = validateByDescriptor({
    kanji: "田",
    features,
    descriptor: fieldDescriptor,
  });

  assert.equal(result.isCorrect, true);

  assert.equal(result.strategy, "descriptor");

  assert.deepEqual(result.hardFailedChecks, []);

  assert.equal(result.roleMatches.outerStroke.matchedStrokeIndex, 1);

  assert.equal(result.roleMatches.leftStroke.matchedStrokeIndex, 0);

  assert.equal(result.roleMatches.innerVerticalStroke.matchedStrokeIndex, 2);

  assert.equal(result.roleMatches.innerHorizontalStroke.matchedStrokeIndex, 3);

  assert.equal(result.roleMatches.bottomStroke.matchedStrokeIndex, 4);

  result.checks["orthogonalCross.innerHorizontalStroke.innerVerticalStroke"];
});

test("田 should fail when the inner strokes do not form an orthogonal cross", () => {
  const features = createFieldFeatures({
    includeInnerIntersection: false,
  });

  features.geometry.perStroke[3] = {
    ...features.geometry.perStroke[3],
    minX: 0.58,
    maxX: 0.88,
    width: 0.3,
    centerX: 0.73,
  };

  const result = validateByDescriptor({
    kanji: "田",
    features,
    descriptor: fieldDescriptor,
  });

  assert.equal(result.isCorrect, false);

  assert.equal(
    result.checks["orthogonalCross.innerHorizontalStroke.innerVerticalStroke"],
    false,
  );

  assert.ok(
    result.hardFailedChecks.includes(
      "orthogonalCross.innerHorizontalStroke.innerVerticalStroke",
    ),
  );

  assert.equal(result.score, 10);
});

test("田 orthogonal cross should not depend on stored intersections", () => {
  const features = createFieldFeatures({
    includeInnerIntersection: false,
  });

  const result = validateByDescriptor({
    kanji: "田",
    features,
    descriptor: fieldDescriptor,
  });

  assert.equal(result.isCorrect, true);

  assert.equal(
    result.checks["orthogonalCross.innerHorizontalStroke.innerVerticalStroke"],
    true,
  );

  assert.equal(features.geometry.intersections.length, 0);
});

test("田 should fail when the inner horizontal is too close to the bottom stroke", () => {
  const features = createFieldFeatures({
    innerHorizontalCenterY: 0.82,
    bottomCenterY: 0.86,
  });

  const result = validateByDescriptor({
    kanji: "田",
    features,
    descriptor: fieldDescriptor,
  });

  assert.equal(result.isCorrect, false);

  assert.equal(
    result.checks["above.innerHorizontalStroke.bottomStroke"],
    false,
  );

  assert.ok(
    result.hardFailedChecks.includes(
      "above.innerHorizontalStroke.bottomStroke",
    ),
  );
});

test("田 should fail when the inner vertical is outside the central zone", () => {
  const features = createFieldFeatures();

  features.geometry.perStroke[2] = {
    ...features.geometry.perStroke[2],
    centerX: 0.82,
    minX: 0.795,
    maxX: 0.845,
  };

  const result = validateByDescriptor({
    kanji: "田",
    features,
    descriptor: fieldDescriptor,
  });

  assert.equal(result.isCorrect, false);

  assert.equal(result.checks["innerVerticalStroke.matches"], false);

  assert.ok(result.hardFailedChecks.includes("innerVerticalStroke.matches"));
});

test("田 box connections should remain soft", () => {
  const connectionCheckNames = [
    "connects.leftStroke.outerStroke",
    "connects.leftStroke.bottomStroke",
    "connects.outerStroke.bottomStroke",
    "connects.innerHorizontalStroke.leftStroke",
    "connects.innerHorizontalStroke.outerStroke",
    "connects.innerVerticalStroke.outerStroke",
    "connects.innerVerticalStroke.bottomStroke",
  ];

  for (const checkName of connectionCheckNames) {
    assert.equal(
      fieldDescriptor.hardChecks.includes(checkName),
      false,
      `${checkName} should remain soft`,
    );
  }
});

test("田 should accept a recognizable box with soft closure gaps", () => {
  const features = createFieldFeatures();

  const result = validateByDescriptor({
    kanji: "田",
    features,
    descriptor: fieldDescriptor,
  });

  assert.equal(result.checks["connects.leftStroke.outerStroke"], false);

  assert.equal(result.checks["connects.outerStroke.bottomStroke"], false);

  assert.equal(
    result.hardFailedChecks.includes("connects.leftStroke.outerStroke"),
    false,
  );

  assert.equal(
    result.hardFailedChecks.includes("connects.outerStroke.bottomStroke"),
    false,
  );

  assert.equal(result.isCorrect, true);
});
test("orthogonalCross should pass when both stroke spans cross", () => {
  const horizontalStroke = {
    minX: 0.2,
    maxX: 0.8,
    centerY: 0.5,
  };

  const verticalStroke = {
    minY: 0.2,
    maxY: 0.8,
    centerX: 0.5,
  };

  assert.equal(
    validateOrthogonalCrossRelation(horizontalStroke, verticalStroke),
    true,
  );
});

test("orthogonalCross should fail when the vertical is outside the horizontal span", () => {
  const horizontalStroke = {
    minX: 0.2,
    maxX: 0.6,
    centerY: 0.5,
  };

  const verticalStroke = {
    minY: 0.2,
    maxY: 0.8,
    centerX: 0.75,
  };

  assert.equal(
    validateOrthogonalCrossRelation(horizontalStroke, verticalStroke),
    false,
  );
});

test("orthogonalCross should fail when the horizontal is outside the vertical span", () => {
  const horizontalStroke = {
    minX: 0.2,
    maxX: 0.8,
    centerY: 0.85,
  };

  const verticalStroke = {
    minY: 0.2,
    maxY: 0.7,
    centerX: 0.5,
  };

  assert.equal(
    validateOrthogonalCrossRelation(horizontalStroke, verticalStroke),
    false,
  );
});

test("orthogonalCross should support configurable tolerances", () => {
  const horizontalStroke = {
    minX: 0.2,
    maxX: 0.48,
    centerY: 0.5,
  };

  const verticalStroke = {
    minY: 0.2,
    maxY: 0.8,
    centerX: 0.5,
  };

  assert.equal(
    validateOrthogonalCrossRelation(horizontalStroke, verticalStroke),
    false,
  );

  assert.equal(
    validateOrthogonalCrossRelation(horizontalStroke, verticalStroke, {
      toleranceX: 0.03,
    }),
    true,
  );
});
function createNestedBoxRoleMatches() {
  return {
    outerWrappingStroke: {
      stroke: {
        index: 1,
        minX: 0.1,
        maxX: 0.9,
        minY: 0.1,
        maxY: 0.9,
      },
    },

    outerLeftStroke: {
      stroke: {
        index: 0,
        minX: 0.1,
        maxX: 0.15,
        minY: 0.1,
        maxY: 0.9,
      },
    },

    outerBottomStroke: {
      stroke: {
        index: 5,
        minX: 0.1,
        maxX: 0.9,
        minY: 0.85,
        maxY: 0.9,
      },
    },

    innerWrappingStroke: {
      stroke: {
        index: 3,
        minX: 0.3,
        maxX: 0.7,
        minY: 0.3,
        maxY: 0.7,
      },
    },

    innerLeftStroke: {
      stroke: {
        index: 2,
        minX: 0.3,
        maxX: 0.35,
        minY: 0.3,
        maxY: 0.7,
      },
    },

    innerBottomStroke: {
      stroke: {
        index: 4,
        minX: 0.3,
        maxX: 0.7,
        minY: 0.65,
        maxY: 0.7,
      },
    },
  };
}

function createContainsGroupRelation({
  margin = {
    left: 0.05,
    top: 0.05,
    right: 0.05,
    bottom: 0.05,
  },
} = {}) {
  return {
    id: "innerBoxInsideOuterBox",
    type: "containsGroup",
    outer: ["outerWrappingStroke", "outerLeftStroke", "outerBottomStroke"],
    inner: ["innerWrappingStroke", "innerLeftStroke", "innerBottomStroke"],
    margin,
  };
}
test("containsGroup should pass when the inner group is inside the outer group", () => {
  const roleMatches = createNestedBoxRoleMatches();

  const relation = createContainsGroupRelation();

  assert.equal(validateContainsGroupRelation(relation, roleMatches), true);

  assert.equal(validateRelation(relation, roleMatches), true);
});

test("containsGroup should fail when the inner group extends outside the outer group", () => {
  const roleMatches = createNestedBoxRoleMatches();

  roleMatches.innerWrappingStroke.stroke.maxX = 0.95;

  const relation = createContainsGroupRelation();

  assert.equal(validateRelation(relation, roleMatches), false);
});

test("containsGroup should fail safely when a role is missing", () => {
  const roleMatches = createNestedBoxRoleMatches();

  delete roleMatches.innerBottomStroke;

  const relation = createContainsGroupRelation();

  assert.equal(validateRelation(relation, roleMatches), false);
});

test("containsGroup should respect configured margins", () => {
  const roleMatches = createNestedBoxRoleMatches();

  roleMatches.innerLeftStroke.stroke.minX = 0.12;

  const noMarginRelation = createContainsGroupRelation({
    margin: {
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
    },
  });

  const marginRelation = createContainsGroupRelation();

  assert.equal(validateRelation(noMarginRelation, roleMatches), true);

  assert.equal(validateRelation(marginRelation, roleMatches), false);
});

test("containsGroup should use its configured id as check name", () => {
  const relation = createContainsGroupRelation();

  assert.equal(buildRelationCheckName(relation), "innerBoxInsideOuterBox");
});

function createEnclosureFeatures({
  innerLeftX = 0.34,
  innerRightX = 0.68,
  innerTopY = 0.32,
  innerBottomY = 0.66,
  outerBottomY = 0.88,
  intersections = [],
  touches = [],
} = {}) {
  return {
    strokeCountUser: 6,
    strokeCountRef: 6,
    geometry: {
      bboxWidth: 0.82,
      bboxHeight: 0.82,
      aspectRatio: 1,
      straightnessMean: 0.83,
      straightnessMin: 0.65,
      intersections,
      intersectionCount: intersections.length,
      touches,
      touchCount: touches.length,
      perStroke: [
        {
          index: 0,
          angleAbs: Math.PI / 2,
          width: 0.05,
          height: 0.78,
          centerX: 0.12,
          centerY: 0.49,
          minX: 0.1,
          maxX: 0.15,
          minY: 0.1,
          maxY: 0.88,
          straightness: 0.98,
          deltaX: 0.02,
          deltaY: 0.78,
        },
        {
          index: 1,
          angleAbs: 0.75,
          width: 0.78,
          height: 0.78,
          centerX: 0.5,
          centerY: 0.49,
          minX: 0.1,
          maxX: 0.88,
          minY: 0.1,
          maxY: 0.88,
          straightness: 0.65,
          deltaX: 0.78,
          deltaY: 0.78,
        },
        {
          index: 2,
          angleAbs: Math.PI / 2,
          width: 0.04,
          height: innerBottomY - innerTopY,
          centerX: innerLeftX,
          centerY: (innerTopY + innerBottomY) / 2,
          minX: innerLeftX - 0.02,
          maxX: innerLeftX + 0.02,
          minY: innerTopY,
          maxY: innerBottomY,
          straightness: 0.98,
          deltaX: 0.01,
          deltaY: innerBottomY - innerTopY,
        },
        {
          index: 3,
          angleAbs: 0.75,
          width: innerRightX - innerLeftX,
          height: innerBottomY - innerTopY,
          centerX: (innerLeftX + innerRightX) / 2,
          centerY: (innerTopY + innerBottomY) / 2,
          minX: innerLeftX,
          maxX: innerRightX,
          minY: innerTopY,
          maxY: innerBottomY,
          straightness: 0.72,
          deltaX: innerRightX - innerLeftX,
          deltaY: innerBottomY - innerTopY,
        },
        {
          index: 4,
          angleAbs: 0.03,
          width: innerRightX - innerLeftX,
          height: 0.04,
          centerX: (innerLeftX + innerRightX) / 2,
          centerY: innerBottomY,
          minX: innerLeftX,
          maxX: innerRightX,
          minY: innerBottomY - 0.02,
          maxY: innerBottomY + 0.02,
          straightness: 0.98,
          deltaX: innerRightX - innerLeftX,
          deltaY: 0.01,
        },
        {
          index: 5,
          angleAbs: 0.03,
          width: 0.7,
          height: 0.04,
          centerX: 0.5,
          centerY: outerBottomY,
          minX: 0.15,
          maxX: 0.85,
          minY: outerBottomY - 0.02,
          maxY: outerBottomY + 0.02,
          straightness: 0.98,
          deltaX: 0.7,
          deltaY: 0.01,
        },
      ],
    },
  };
}

test("回 descriptor should use declarative nested box roles", () => {
  assert.ok(enclosureDescriptor);

  assert.equal(enclosureDescriptor.pattern, "nested_box_pattern");

  assert.equal(enclosureDescriptor.strokeCount, 6);

  assert.deepEqual(
    enclosureDescriptor.strokes.map((stroke) => stroke.id),
    [
      "outerWrappingStroke",
      "outerLeftStroke",
      "innerWrappingStroke",
      "innerLeftStroke",
      "innerBottomStroke",
      "outerBottomStroke",
    ],
  );

  assert.equal(enclosureDescriptor.rules, undefined);

  assert.equal(enclosureDescriptor.expectedStrokeCount, undefined);
});

test("回 should pass with an inner box contained in the outer box", () => {
  const features = createEnclosureFeatures();

  const result = validateByDescriptor({
    kanji: "回",
    features,
    descriptor: enclosureDescriptor,
  });

  assert.equal(result.isCorrect, true);

  assert.equal(result.strategy, "descriptor");

  assert.deepEqual(result.hardFailedChecks, []);

  assert.equal(result.roleMatches.outerWrappingStroke.matchedStrokeIndex, 1);

  assert.equal(result.roleMatches.outerLeftStroke.matchedStrokeIndex, 0);

  assert.equal(result.roleMatches.innerWrappingStroke.matchedStrokeIndex, 3);

  assert.equal(result.roleMatches.innerLeftStroke.matchedStrokeIndex, 2);

  assert.equal(result.roleMatches.innerBottomStroke.matchedStrokeIndex, 4);

  assert.equal(result.roleMatches.outerBottomStroke.matchedStrokeIndex, 5);

  assert.equal(result.checks["innerBoxInsideOuterBox"], true);
});

test("回 should fail when the inner box extends outside the outer box", () => {
  const features = createEnclosureFeatures({
    innerRightX: 0.9,
  });

  const result = validateByDescriptor({
    kanji: "回",
    features,
    descriptor: enclosureDescriptor,
  });

  assert.equal(result.isCorrect, false);

  assert.equal(result.checks["innerBoxInsideOuterBox"], false);

  assert.ok(result.hardFailedChecks.includes("innerBoxInsideOuterBox"));

  assert.equal(result.score, 10);
});

test("回 should enforce the configured top containment margin", () => {
  const features = createEnclosureFeatures({
    innerTopY: 0.12,
  });

  const result = validateByDescriptor({
    kanji: "回",
    features,
    descriptor: enclosureDescriptor,
  });

  assert.equal(result.isCorrect, false);

  assert.equal(result.checks["innerBoxInsideOuterBox"], false);
});

test("回 should fail when the inner bottom is too close to the outer bottom", () => {
  const features = createEnclosureFeatures({
    innerBottomY: 0.86,
    outerBottomY: 0.88,
  });

  const result = validateByDescriptor({
    kanji: "回",
    features,
    descriptor: enclosureDescriptor,
  });

  assert.equal(result.isCorrect, false);

  assert.equal(
    result.checks["above.innerBottomStroke.outerBottomStroke"],
    false,
  );

  assert.ok(
    result.hardFailedChecks.includes(
      "above.innerBottomStroke.outerBottomStroke",
    ),
  );
});

test("回 box connections should remain soft", () => {
  const connectionCheckNames = [
    "connects.outerLeftStroke.outerWrappingStroke",
    "connects.outerLeftStroke.outerBottomStroke",
    "connects.outerWrappingStroke.outerBottomStroke",
    "connects.innerLeftStroke.innerWrappingStroke",
    "connects.innerLeftStroke.innerBottomStroke",
    "connects.innerWrappingStroke.innerBottomStroke",
  ];

  for (const checkName of connectionCheckNames) {
    assert.equal(
      enclosureDescriptor.hardChecks.includes(checkName),
      false,
      `${checkName} should remain soft`,
    );
  }
});

test("回 should accept recognizable nested boxes with soft closure gaps", () => {
  const features = createEnclosureFeatures();

  const result = validateByDescriptor({
    kanji: "回",
    features,
    descriptor: enclosureDescriptor,
  });

  assert.equal(
    result.checks["connects.outerLeftStroke.outerWrappingStroke"],
    false,
  );

  assert.equal(
    result.checks["connects.innerLeftStroke.innerBottomStroke"],
    false,
  );

  assert.equal(
    result.hardFailedChecks.includes(
      "connects.outerLeftStroke.outerWrappingStroke",
    ),
    false,
  );

  assert.equal(result.isCorrect, true);
});

test("回 inner left and bottom relative position should remain soft", () => {
  assert.equal(
    enclosureDescriptor.hardChecks.includes(
      "above.innerLeftStroke.innerBottomStroke",
    ),
    false,
  );

  assert.equal(
    enclosureDescriptor.relations.some(
      (relation) =>
        relation.type === "above" &&
        relation.from === "innerLeftStroke" &&
        relation.to === "innerBottomStroke",
    ),
    true,
  );
});

test("回 should accept an inner box close to the left outer border when still contained", () => {
  const features = createEnclosureFeatures({
    innerLeftX: 0.17,
    innerRightX: 0.52,
  });

  const result = validateByDescriptor({
    kanji: "回",
    features,
    descriptor: enclosureDescriptor,
  });

  assert.equal(result.roleMatches.innerWrappingStroke.matchedStrokeIndex, 3);

  assert.equal(result.checks["innerWrappingStroke.matches"], true);

  assert.equal(result.checks["innerBoxInsideOuterBox"], true);

  assert.deepEqual(result.hardFailedChecks, []);

  assert.equal(result.isCorrect, true);

  assert.equal(result.score, 0.5);
});
