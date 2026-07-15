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
const oneDescriptor = descriptorData.descriptors["一"];
const twoDescriptor = descriptorData.descriptors["二"];
const crossDescriptor = descriptorData.descriptors["十"];
const eightDescriptor = descriptorData.descriptors["八"];
const mountainDescriptor = descriptorData.descriptors["山"];
const boxDescriptor = descriptorData.descriptors["口"];
const sunDescriptor = descriptorData.descriptors["日"];
const eyeDescriptor = descriptorData.descriptors["目"];
const fieldDescriptor = descriptorData.descriptors["田"];
const enclosureDescriptor = descriptorData.descriptors["回"];
const useDescriptor = descriptorData.descriptors["用"];
const treeDescriptor = descriptorData.descriptors["木"];
const rootDescriptor = descriptorData.descriptors["本"];
const notYetDescriptor = descriptorData.descriptors["未"];
const endDescriptor = descriptorData.descriptors["末"];

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

function createUseFeatures({
  upperCenterY = 0.38,
  lowerCenterY = 0.62,
  innerVerticalCenterX = 0.5,
  innerVerticalMinY = 0.2,
  innerVerticalMaxY = 0.78,
  intersections = [],
  touches = [],
} = {}) {
  return {
    strokeCountUser: 5,
    strokeCountRef: 5,
    geometry: {
      bboxWidth: 0.8,
      bboxHeight: 0.82,
      aspectRatio: 0.8 / 0.82,
      straightnessMean: 0.84,
      straightnessMin: 0.66,
      intersections,
      intersectionCount: intersections.length,
      touches,
      touchCount: touches.length,
      perStroke: [
        {
          index: 0,
          angleAbs: Math.PI / 2,
          width: 0.05,
          height: 0.74,
          centerX: 0.12,
          centerY: 0.47,
          minX: 0.1,
          maxX: 0.15,
          minY: 0.1,
          maxY: 0.84,
          straightness: 0.98,
          deltaX: 0.02,
          deltaY: 0.74,
        },
        {
          index: 1,
          angleAbs: 0.75,
          width: 0.75,
          height: 0.74,
          centerX: 0.5,
          centerY: 0.47,
          minX: 0.12,
          maxX: 0.87,
          minY: 0.1,
          maxY: 0.84,
          straightness: 0.66,
          deltaX: 0.75,
          deltaY: 0.74,
        },
        {
          index: 2,
          angleAbs: Math.PI / 2,
          width: 0.05,
          height: innerVerticalMaxY - innerVerticalMinY,
          centerX: innerVerticalCenterX,
          centerY: (innerVerticalMinY + innerVerticalMaxY) / 2,
          minX: innerVerticalCenterX - 0.025,
          maxX: innerVerticalCenterX + 0.025,
          minY: innerVerticalMinY,
          maxY: innerVerticalMaxY,
          straightness: 0.98,
          deltaX: 0.01,
          deltaY: innerVerticalMaxY - innerVerticalMinY,
        },
        {
          index: 3,
          angleAbs: 0.03,
          width: 0.58,
          height: 0.04,
          centerX: 0.49,
          centerY: upperCenterY,
          minX: 0.2,
          maxX: 0.78,
          minY: upperCenterY - 0.02,
          maxY: upperCenterY + 0.02,
          straightness: 0.98,
          deltaX: 0.58,
          deltaY: 0.01,
        },
        {
          index: 4,
          angleAbs: 0.04,
          width: 0.56,
          height: 0.04,
          centerX: 0.49,
          centerY: lowerCenterY,
          minX: 0.21,
          maxX: 0.77,
          minY: lowerCenterY - 0.02,
          maxY: lowerCenterY + 0.02,
          straightness: 0.98,
          deltaX: 0.56,
          deltaY: 0.01,
        },
      ],
    },
  };
}

test("用 descriptor should use declarative open box roles", () => {
  assert.ok(useDescriptor);

  assert.equal(
    useDescriptor.pattern,
    "open_box_with_inner_vertical_and_horizontals",
  );

  assert.equal(useDescriptor.strokeCount, 5);

  assert.deepEqual(
    useDescriptor.strokes.map((stroke) => stroke.id),
    [
      "outerWrappingStroke",
      "leftStroke",
      "innerVerticalStroke",
      "upperInnerHorizontalStroke",
      "lowerInnerHorizontalStroke",
    ],
  );

  assert.equal(useDescriptor.rules, undefined);

  assert.equal(useDescriptor.expectedStrokeCount, undefined);
});

test("用 should pass with two ordered horizontals crossing the inner vertical", () => {
  const features = createUseFeatures();

  const result = validateByDescriptor({
    kanji: "用",
    features,
    descriptor: useDescriptor,
  });

  assert.equal(result.isCorrect, true);
  assert.equal(result.strategy, "descriptor");

  assert.deepEqual(result.hardFailedChecks, []);

  assert.equal(result.roleMatches.outerWrappingStroke.matchedStrokeIndex, 1);

  assert.equal(result.roleMatches.leftStroke.matchedStrokeIndex, 0);

  assert.equal(result.roleMatches.innerVerticalStroke.matchedStrokeIndex, 2);

  assert.equal(
    result.roleMatches.upperInnerHorizontalStroke.matchedStrokeIndex,
    3,
  );

  assert.equal(
    result.roleMatches.lowerInnerHorizontalStroke.matchedStrokeIndex,
    4,
  );

  assert.equal(
    result.checks[
      "above.upperInnerHorizontalStroke.lowerInnerHorizontalStroke"
    ],
    true,
  );

  assert.equal(
    result.checks[
      "orthogonalCross.upperInnerHorizontalStroke.innerVerticalStroke"
    ],
    true,
  );

  assert.equal(
    result.checks[
      "orthogonalCross.lowerInnerHorizontalStroke.innerVerticalStroke"
    ],
    true,
  );

  assert.equal(result.checks["innerStructureInsideOuterBox"], true);
});

test("用 should fail when its inner horizontals are too close", () => {
  const features = createUseFeatures({
    upperCenterY: 0.5,
    lowerCenterY: 0.53,
  });

  const result = validateByDescriptor({
    kanji: "用",
    features,
    descriptor: useDescriptor,
  });

  assert.equal(result.isCorrect, false);

  assert.equal(
    result.checks[
      "above.upperInnerHorizontalStroke.lowerInnerHorizontalStroke"
    ],
    false,
  );

  assert.ok(
    result.hardFailedChecks.includes(
      "above.upperInnerHorizontalStroke.lowerInnerHorizontalStroke",
    ),
  );

  assert.equal(result.score, 10);
});

test("用 should fail when the inner vertical does not cross the horizontals", () => {
  const features = createUseFeatures({
    innerVerticalCenterX: 0.88,
  });

  const result = validateByDescriptor({
    kanji: "用",
    features,
    descriptor: useDescriptor,
  });

  assert.equal(result.isCorrect, false);

  assert.equal(
    result.checks[
      "orthogonalCross.upperInnerHorizontalStroke.innerVerticalStroke"
    ],
    false,
  );

  assert.ok(
    result.hardFailedChecks.includes(
      "orthogonalCross.upperInnerHorizontalStroke.innerVerticalStroke",
    ),
  );
});

test("用 should fail when the lower horizontal is outside the vertical span", () => {
  const features = createUseFeatures({
    lowerCenterY: 0.81,
    innerVerticalMaxY: 0.7,
  });

  const result = validateByDescriptor({
    kanji: "用",
    features,
    descriptor: useDescriptor,
  });

  assert.equal(
    result.checks[
      "orthogonalCross.lowerInnerHorizontalStroke.innerVerticalStroke"
    ],
    false,
  );

  assert.ok(
    result.hardFailedChecks.includes(
      "orthogonalCross.lowerInnerHorizontalStroke.innerVerticalStroke",
    ),
  );

  assert.equal(result.isCorrect, false);
});

test("用 inner structure containment should remain soft", () => {
  assert.equal(
    useDescriptor.hardChecks.includes("innerStructureInsideOuterBox"),
    false,
  );

  assert.equal(
    useDescriptor.relations.some(
      (relation) =>
        relation.id === "innerStructureInsideOuterBox" &&
        relation.type === "containsGroup",
    ),
    true,
  );
});

test("用 should report an inner structure extending outside without making it a hard failure", () => {
  const features = createUseFeatures();

  features.geometry.perStroke[4] = {
    ...features.geometry.perStroke[4],
    width: 0.75,
    centerX: 0.7,
    minX: 0.325,
    maxX: 1.075,
  };

  const result = validateByDescriptor({
    kanji: "用",
    features,
    descriptor: useDescriptor,
  });

  assert.equal(result.checks["innerStructureInsideOuterBox"], false);

  assert.equal(
    result.hardFailedChecks.includes("innerStructureInsideOuterBox"),
    false,
  );
});

test("用 geometric connections should remain soft", () => {
  const connectionCheckNames = [
    "connects.leftStroke.outerWrappingStroke",
    "connects.upperInnerHorizontalStroke.leftStroke",
    "connects.upperInnerHorizontalStroke.outerWrappingStroke",
    "connects.lowerInnerHorizontalStroke.leftStroke",
    "connects.lowerInnerHorizontalStroke.outerWrappingStroke",
    "connects.innerVerticalStroke.outerWrappingStroke",
  ];

  for (const checkName of connectionCheckNames) {
    assert.equal(
      useDescriptor.hardChecks.includes(checkName),
      false,
      `${checkName} should remain soft`,
    );
  }
});

test("用 should accept a recognizable structure without stored connections", () => {
  const features = createUseFeatures();

  const result = validateByDescriptor({
    kanji: "用",
    features,
    descriptor: useDescriptor,
  });

  assert.equal(features.geometry.intersections.length, 0);

  assert.equal(features.geometry.touches.length, 0);

  assert.equal(
    result.checks["connects.upperInnerHorizontalStroke.leftStroke"],
    false,
  );

  assert.equal(
    result.checks[
      "orthogonalCross.upperInnerHorizontalStroke.innerVerticalStroke"
    ],
    true,
  );

  assert.equal(
    result.checks[
      "orthogonalCross.lowerInnerHorizontalStroke.innerVerticalStroke"
    ],
    true,
  );

  assert.deepEqual(result.hardFailedChecks, []);

  assert.equal(result.isCorrect, true);
  assert.equal(result.score, 0.5);
});

test("用 should allow the inner vertical to extend slightly below the outer wrapping stroke", () => {
  const features = createUseFeatures({
    innerVerticalMaxY: 0.845,
  });

  const result = validateByDescriptor({
    kanji: "用",
    features,
    descriptor: useDescriptor,
  });

  assert.equal(features.geometry.perStroke[1].maxY, 0.84);

  assert.equal(features.geometry.perStroke[2].maxY, 0.845);

  assert.equal(result.roleMatches.innerVerticalStroke.matchedStrokeIndex, 2);

  assert.equal(result.checks["innerStructureInsideOuterBox"], true);

  assert.equal(result.isCorrect, true);

  assert.deepEqual(result.hardFailedChecks, []);
});

test("用 should report when the inner vertical extends clearly below the outer wrapping stroke", () => {
  const features = createUseFeatures({
    innerVerticalMaxY: 0.87,
  });

  const result = validateByDescriptor({
    kanji: "用",
    features,
    descriptor: useDescriptor,
  });

  assert.equal(result.checks["innerStructureInsideOuterBox"], false);

  assert.ok(result.failedChecks.includes("innerStructureInsideOuterBox"));

  assert.equal(
    result.hardFailedChecks.includes("innerStructureInsideOuterBox"),
    false,
  );

  assert.equal(result.isCorrect, true);

  assert.equal(result.score, 0.5);
});

test("用 should accept an upper horizontal slightly above centerY 0.20", () => {
  const features = createUseFeatures({
    upperCenterY: 0.198,
    lowerCenterY: 0.42,
  });

  const result = validateByDescriptor({
    kanji: "用",
    features,
    descriptor: useDescriptor,
  });

  assert.equal(
    result.roleMatches.upperInnerHorizontalStroke.matchedStrokeIndex,
    3,
  );

  assert.equal(
    result.roleMatches.lowerInnerHorizontalStroke.matchedStrokeIndex,
    4,
  );

  assert.equal(result.checks["upperInnerHorizontalStroke.matches"], true);

  assert.equal(result.checks["lowerInnerHorizontalStroke.matches"], true);

  assert.equal(
    result.checks[
      "above.upperInnerHorizontalStroke.lowerInnerHorizontalStroke"
    ],
    true,
  );

  assert.deepEqual(result.hardFailedChecks, []);

  assert.equal(result.isCorrect, true);
});

test("用 should accept a recognizable lower horizontal slightly above the initial range", () => {
  const features = createUseFeatures({
    upperCenterY: 0.28,
    lowerCenterY: 0.425,
  });

  const result = validateByDescriptor({
    kanji: "用",
    features,
    descriptor: useDescriptor,
  });

  assert.equal(result.checks["lowerInnerHorizontalStroke.matches"], true);

  assert.equal(
    result.checks[
      "above.upperInnerHorizontalStroke.lowerInnerHorizontalStroke"
    ],
    true,
  );

  assert.equal(result.isCorrect, true);
});
test("用 should accept recognizable inner horizontals separated by slightly more than 0.05", () => {
  const features = createUseFeatures({
    upperCenterY: 0.482,
    lowerCenterY: 0.534,
  });

  const result = validateByDescriptor({
    kanji: "用",
    features,
    descriptor: useDescriptor,
  });

  assert.equal(
    result.checks[
      "above.upperInnerHorizontalStroke.lowerInnerHorizontalStroke"
    ],
    true,
  );

  assert.deepEqual(result.hardFailedChecks, []);

  assert.equal(result.isCorrect, true);
});

test("用 should accept a left-shifted inner vertical that crosses both horizontals", () => {
  const features = createUseFeatures({
    innerVerticalCenterX: 0.228,
  });

  const result = validateByDescriptor({
    kanji: "用",
    features,
    descriptor: useDescriptor,
  });

  assert.equal(result.checks["innerVerticalStroke.matches"], true);

  assert.equal(
    result.checks[
      "orthogonalCross.upperInnerHorizontalStroke.innerVerticalStroke"
    ],
    true,
  );

  assert.equal(
    result.checks[
      "orthogonalCross.lowerInnerHorizontalStroke.innerVerticalStroke"
    ],
    true,
  );

  assert.equal(result.isCorrect, true);
});

test("用 should accept two ordered inner horizontals positioned high in the box", () => {
  const features = createUseFeatures({
    upperCenterY: 0.198,
    lowerCenterY: 0.291,
  });

  const result = validateByDescriptor({
    kanji: "用",
    features,
    descriptor: useDescriptor,
  });

  assert.equal(
    result.roleMatches.upperInnerHorizontalStroke.matchedStrokeIndex,
    3,
  );

  assert.equal(
    result.roleMatches.lowerInnerHorizontalStroke.matchedStrokeIndex,
    4,
  );

  assert.equal(result.checks["upperInnerHorizontalStroke.matches"], true);

  assert.equal(result.checks["lowerInnerHorizontalStroke.matches"], true);

  assert.equal(
    result.checks[
      "above.upperInnerHorizontalStroke.lowerInnerHorizontalStroke"
    ],
    true,
  );

  assert.equal(
    result.checks[
      "orthogonalCross.upperInnerHorizontalStroke.innerVerticalStroke"
    ],
    true,
  );

  assert.equal(
    result.checks[
      "orthogonalCross.lowerInnerHorizontalStroke.innerVerticalStroke"
    ],
    true,
  );

  assert.deepEqual(result.hardFailedChecks, []);

  assert.equal(result.isCorrect, true);
});
test("用 should reject a lower horizontal positioned too high", () => {
  const features = createUseFeatures({
    upperCenterY: 0.18,
    lowerCenterY: 0.25,
  });

  const result = validateByDescriptor({
    kanji: "用",
    features,
    descriptor: useDescriptor,
  });

  assert.equal(result.checks["lowerInnerHorizontalStroke.matches"], false);

  assert.ok(
    result.hardFailedChecks.includes("lowerInnerHorizontalStroke.matches"),
  );

  assert.equal(result.isCorrect, false);

  assert.equal(result.score, 10);
});

function createTreeFeatures({
  horizontalCenterY = 0.3,
  horizontalMinX = 0.15,
  horizontalMaxX = 0.85,
  verticalCenterX = 0.5,
  verticalMinY = 0.08,
  verticalMaxY = 0.92,
  leftCenterX = 0.32,
  leftCenterY = 0.68,
  leftDeltaX = -0.28,
  leftDeltaY = 0.42,
  rightCenterX = 0.68,
  rightCenterY = 0.68,
  rightDeltaX = 0.28,
  rightDeltaY = 0.42,
} = {}) {
  return {
    strokeCountUser: 4,
    strokeCountRef: 4,
    geometry: {
      bboxWidth: 0.8,
      bboxHeight: 0.84,
      aspectRatio: 0.8 / 0.84,
      straightnessMean: 0.92,
      straightnessMin: 0.88,
      intersections: [],
      intersectionCount: 0,
      touches: [],
      touchCount: 0,
      perStroke: [
        {
          index: 0,
          angleAbs: 0.03,
          width: horizontalMaxX - horizontalMinX,
          height: 0.04,
          centerX: (horizontalMinX + horizontalMaxX) / 2,
          centerY: horizontalCenterY,
          minX: horizontalMinX,
          maxX: horizontalMaxX,
          minY: horizontalCenterY - 0.02,
          maxY: horizontalCenterY + 0.02,
          straightness: 0.98,
          deltaX: horizontalMaxX - horizontalMinX,
          deltaY: 0.01,
        },
        {
          index: 1,
          angleAbs: Math.PI / 2,
          width: 0.05,
          height: verticalMaxY - verticalMinY,
          centerX: verticalCenterX,
          centerY: (verticalMinY + verticalMaxY) / 2,
          minX: verticalCenterX - 0.025,
          maxX: verticalCenterX + 0.025,
          minY: verticalMinY,
          maxY: verticalMaxY,
          straightness: 0.98,
          deltaX: 0.01,
          deltaY: verticalMaxY - verticalMinY,
        },
        {
          index: 2,
          angleAbs: 0.98,
          width: Math.abs(leftDeltaX),
          height: leftDeltaY,
          centerX: leftCenterX,
          centerY: leftCenterY,
          minX: leftCenterX - Math.abs(leftDeltaX) / 2,
          maxX: leftCenterX + Math.abs(leftDeltaX) / 2,
          minY: leftCenterY - leftDeltaY / 2,
          maxY: leftCenterY + leftDeltaY / 2,
          straightness: 0.95,
          deltaX: leftDeltaX,
          deltaY: leftDeltaY,
        },
        {
          index: 3,
          angleAbs: 0.98,
          width: Math.abs(rightDeltaX),
          height: rightDeltaY,
          centerX: rightCenterX,
          centerY: rightCenterY,
          minX: rightCenterX - Math.abs(rightDeltaX) / 2,
          maxX: rightCenterX + Math.abs(rightDeltaX) / 2,
          minY: rightCenterY - rightDeltaY / 2,
          maxY: rightCenterY + rightDeltaY / 2,
          straightness: 0.95,
          deltaX: rightDeltaX,
          deltaY: rightDeltaY,
        },
      ],
    },
  };
}

test("木 descriptor should use declarative tree roles", () => {
  assert.ok(treeDescriptor);

  assert.equal(treeDescriptor.pattern, "tree_cross_pattern");

  assert.equal(treeDescriptor.strokeCount, 4);

  assert.deepEqual(
    treeDescriptor.strokes.map((stroke) => stroke.id),
    [
      "horizontalStroke",
      "verticalStroke",
      "leftDiagonalStroke",
      "rightDiagonalStroke",
    ],
  );

  assert.equal(treeDescriptor.rules, undefined);

  assert.equal(treeDescriptor.expectedStrokeCount, undefined);
});

test("木 should pass with a central cross and two outward diagonals", () => {
  const features = createTreeFeatures();

  const result = validateByDescriptor({
    kanji: "木",
    features,
    descriptor: treeDescriptor,
  });

  assert.equal(result.strategy, "descriptor");

  assert.equal(result.isCorrect, true);

  assert.deepEqual(result.hardFailedChecks, []);

  assert.equal(result.roleMatches.horizontalStroke.matchedStrokeIndex, 0);

  assert.equal(result.roleMatches.verticalStroke.matchedStrokeIndex, 1);

  assert.equal(result.roleMatches.leftDiagonalStroke.matchedStrokeIndex, 2);

  assert.equal(result.roleMatches.rightDiagonalStroke.matchedStrokeIndex, 3);

  assert.equal(
    result.checks["orthogonalCross.horizontalStroke.verticalStroke"],
    true,
  );

  assert.equal(result.checks["direction.leftDiagonalStroke"], true);

  assert.equal(result.checks["direction.rightDiagonalStroke"], true);

  assert.equal(result.score, 0.5);
});

test("木 orthogonal cross should not depend on stored intersections", () => {
  const features = createTreeFeatures();

  const result = validateByDescriptor({
    kanji: "木",
    features,
    descriptor: treeDescriptor,
  });

  assert.equal(features.geometry.intersections.length, 0);

  assert.equal(
    result.checks["orthogonalCross.horizontalStroke.verticalStroke"],
    true,
  );

  assert.equal(result.isCorrect, true);
});

test("木 should fail when the vertical does not cross the horizontal", () => {
  const features = createTreeFeatures({
    verticalCenterX: 0.93,
  });

  const result = validateByDescriptor({
    kanji: "木",
    features,
    descriptor: treeDescriptor,
  });

  assert.equal(
    result.checks["orthogonalCross.horizontalStroke.verticalStroke"],
    false,
  );

  assert.ok(
    result.hardFailedChecks.includes(
      "orthogonalCross.horizontalStroke.verticalStroke",
    ),
  );

  assert.equal(result.isCorrect, false);

  assert.equal(result.score, 10);
});

test("木 should fail when the left diagonal descends to the right", () => {
  const features = createTreeFeatures({
    leftDeltaX: 0.28,
  });

  const result = validateByDescriptor({
    kanji: "木",
    features,
    descriptor: treeDescriptor,
  });

  assert.equal(result.checks["direction.leftDiagonalStroke"], false);

  assert.ok(result.hardFailedChecks.includes("direction.leftDiagonalStroke"));

  assert.equal(result.isCorrect, false);
});

test("木 should fail when the right diagonal descends to the left", () => {
  const features = createTreeFeatures({
    rightDeltaX: -0.28,
  });

  const result = validateByDescriptor({
    kanji: "木",
    features,
    descriptor: treeDescriptor,
  });

  assert.equal(result.checks["direction.rightDiagonalStroke"], false);

  assert.ok(result.hardFailedChecks.includes("direction.rightDiagonalStroke"));

  assert.equal(result.isCorrect, false);
});

test("木 should fail when a diagonal is not below the horizontal", () => {
  const features = createTreeFeatures({
    leftCenterY: 0.3,
  });

  const result = validateByDescriptor({
    kanji: "木",
    features,
    descriptor: treeDescriptor,
  });

  assert.equal(
    result.checks["above.horizontalStroke.leftDiagonalStroke"],
    false,
  );

  assert.ok(
    result.hardFailedChecks.includes(
      "above.horizontalStroke.leftDiagonalStroke",
    ),
  );

  assert.equal(result.isCorrect, false);
});

test("木 should fail when the diagonals are too close", () => {
  const features = createTreeFeatures({
    leftCenterX: 0.45,
    rightCenterX: 0.54,
  });

  const result = validateByDescriptor({
    kanji: "木",
    features,
    descriptor: treeDescriptor,
  });

  assert.equal(
    result.checks["centerXGap.leftDiagonalStroke.rightDiagonalStroke"],
    false,
  );

  assert.ok(
    result.hardFailedChecks.includes(
      "centerXGap.leftDiagonalStroke.rightDiagonalStroke",
    ),
  );

  assert.equal(result.isCorrect, false);
});

function createRootFeatures({
  horizontalCenterY = 0.28,
  horizontalMinX = 0.15,
  horizontalMaxX = 0.85,
  verticalCenterX = 0.5,
  verticalMinY = 0.08,
  verticalMaxY = 0.92,
  leftCenterX = 0.32,
  leftCenterY = 0.66,
  leftDeltaX = -0.28,
  leftDeltaY = 0.4,
  rightCenterX = 0.68,
  rightCenterY = 0.66,
  rightDeltaX = 0.28,
  rightDeltaY = 0.4,
  bottomMarkCenterX = 0.5,
  bottomMarkCenterY = 0.72,
  bottomMarkWidth = 0.22,
  bottomMarkHeight = 0.04,
  bottomMarkAngleAbs = 0.03,
} = {}) {
  return {
    strokeCountUser: 5,
    strokeCountRef: 5,
    geometry: {
      bboxWidth: 0.8,
      bboxHeight: 0.84,
      aspectRatio: 0.8 / 0.84,
      straightnessMean: 0.92,
      straightnessMin: 0.88,
      intersections: [],
      intersectionCount: 0,
      touches: [],
      touchCount: 0,
      perStroke: [
        {
          index: 0,
          angleAbs: 0.03,
          width: horizontalMaxX - horizontalMinX,
          height: 0.04,
          centerX: (horizontalMinX + horizontalMaxX) / 2,
          centerY: horizontalCenterY,
          minX: horizontalMinX,
          maxX: horizontalMaxX,
          minY: horizontalCenterY - 0.02,
          maxY: horizontalCenterY + 0.02,
          straightness: 0.98,
          deltaX: horizontalMaxX - horizontalMinX,
          deltaY: 0.01,
        },
        {
          index: 1,
          angleAbs: Math.PI / 2,
          width: 0.05,
          height: verticalMaxY - verticalMinY,
          centerX: verticalCenterX,
          centerY: (verticalMinY + verticalMaxY) / 2,
          minX: verticalCenterX - 0.025,
          maxX: verticalCenterX + 0.025,
          minY: verticalMinY,
          maxY: verticalMaxY,
          straightness: 0.98,
          deltaX: 0.01,
          deltaY: verticalMaxY - verticalMinY,
        },
        {
          index: 2,
          angleAbs: 0.98,
          width: Math.abs(leftDeltaX),
          height: leftDeltaY,
          centerX: leftCenterX,
          centerY: leftCenterY,
          minX: leftCenterX - Math.abs(leftDeltaX) / 2,
          maxX: leftCenterX + Math.abs(leftDeltaX) / 2,
          minY: leftCenterY - leftDeltaY / 2,
          maxY: leftCenterY + leftDeltaY / 2,
          straightness: 0.95,
          deltaX: leftDeltaX,
          deltaY: leftDeltaY,
        },
        {
          index: 3,
          angleAbs: 0.98,
          width: Math.abs(rightDeltaX),
          height: rightDeltaY,
          centerX: rightCenterX,
          centerY: rightCenterY,
          minX: rightCenterX - Math.abs(rightDeltaX) / 2,
          maxX: rightCenterX + Math.abs(rightDeltaX) / 2,
          minY: rightCenterY - rightDeltaY / 2,
          maxY: rightCenterY + rightDeltaY / 2,
          straightness: 0.95,
          deltaX: rightDeltaX,
          deltaY: rightDeltaY,
        },
        {
          index: 4,
          angleAbs: bottomMarkAngleAbs,
          width: bottomMarkWidth,
          height: bottomMarkHeight,
          centerX: bottomMarkCenterX,
          centerY: bottomMarkCenterY,
          minX: bottomMarkCenterX - bottomMarkWidth / 2,
          maxX: bottomMarkCenterX + bottomMarkWidth / 2,
          minY: bottomMarkCenterY - bottomMarkHeight / 2,
          maxY: bottomMarkCenterY + bottomMarkHeight / 2,
          straightness: 0.98,
          deltaX: bottomMarkWidth,
          deltaY: 0.01,
        },
      ],
    },
  };
}

test("本 descriptor should use declarative tree roles with a bottom mark", () => {
  assert.ok(rootDescriptor);

  assert.equal(rootDescriptor.pattern, "tree_with_bottom_mark");

  assert.equal(rootDescriptor.strokeCount, 5);

  assert.deepEqual(
    rootDescriptor.strokes.map((stroke) => stroke.id),
    [
      "horizontalStroke",
      "verticalStroke",
      "leftDiagonalStroke",
      "rightDiagonalStroke",
      "bottomMarkStroke",
    ],
  );

  assert.equal(rootDescriptor.rules, undefined);

  assert.equal(rootDescriptor.expectedStrokeCount, undefined);
});

test("本 should pass with a tree structure and a centered bottom mark", () => {
  const features = createRootFeatures();

  const result = validateByDescriptor({
    kanji: "本",
    features,
    descriptor: rootDescriptor,
  });

  assert.equal(result.strategy, "descriptor");

  assert.equal(result.isCorrect, true);

  assert.deepEqual(result.hardFailedChecks, []);

  assert.equal(result.roleMatches.horizontalStroke.matchedStrokeIndex, 0);

  assert.equal(result.roleMatches.verticalStroke.matchedStrokeIndex, 1);

  assert.equal(result.roleMatches.leftDiagonalStroke.matchedStrokeIndex, 2);

  assert.equal(result.roleMatches.rightDiagonalStroke.matchedStrokeIndex, 3);

  assert.equal(result.roleMatches.bottomMarkStroke.matchedStrokeIndex, 4);

  assert.equal(result.checks["above.horizontalStroke.bottomMarkStroke"], true);

  assert.equal(
    result.checks["centerXDistance.bottomMarkStroke.verticalStroke"],
    true,
  );

  assert.equal(result.score, 0.5);
});

test("本 should fail when the bottom mark is too close to the main horizontal", () => {
  const features = createRootFeatures({
    horizontalCenterY: 0.28,
    bottomMarkCenterY: 0.36,
  });

  const result = validateByDescriptor({
    kanji: "本",
    features,
    descriptor: rootDescriptor,
  });

  assert.equal(result.checks["above.horizontalStroke.bottomMarkStroke"], false);

  assert.ok(
    result.hardFailedChecks.includes("above.horizontalStroke.bottomMarkStroke"),
  );

  assert.equal(result.isCorrect, false);

  assert.equal(result.score, 10);
});

test("本 should fail when the bottom mark is too far from the vertical", () => {
  const features = createRootFeatures({
    bottomMarkCenterX: 0.88,
  });

  const result = validateByDescriptor({
    kanji: "本",
    features,
    descriptor: rootDescriptor,
  });

  assert.equal(
    result.checks["centerXDistance.bottomMarkStroke.verticalStroke"],
    false,
  );

  assert.ok(
    result.hardFailedChecks.includes(
      "centerXDistance.bottomMarkStroke.verticalStroke",
    ),
  );

  assert.equal(result.isCorrect, false);

  assert.equal(result.score, 10);
});

test("本 should fail when the bottom mark is extremely short", () => {
  const features = createRootFeatures({
    bottomMarkWidth: 0.04,
  });

  const result = validateByDescriptor({
    kanji: "本",
    features,
    descriptor: rootDescriptor,
  });

  assert.equal(result.checks["bottomMarkStroke.matches"], false);

  assert.ok(result.hardFailedChecks.includes("bottomMarkStroke.matches"));

  assert.equal(result.isCorrect, false);
});

test("本 should accept a slightly diagonal bottom mark", () => {
  const features = createRootFeatures({
    bottomMarkAngleAbs: 0.75,
    bottomMarkWidth: 0.18,
    bottomMarkHeight: 0.12,
  });

  const result = validateByDescriptor({
    kanji: "本",
    features,
    descriptor: rootDescriptor,
  });

  assert.equal(result.roleMatches.bottomMarkStroke.matchedStrokeIndex, 4);

  assert.equal(result.checks["bottomMarkStroke.matches"], true);

  assert.equal(
    result.checks["centerXDistance.bottomMarkStroke.verticalStroke"],
    true,
  );

  assert.equal(result.isCorrect, true);
});

test("本 should retain both outward diagonal directions", () => {
  const features = createRootFeatures({
    rightDeltaX: -0.28,
  });

  const result = validateByDescriptor({
    kanji: "本",
    features,
    descriptor: rootDescriptor,
  });

  assert.equal(result.checks["direction.rightDiagonalStroke"], false);

  assert.ok(result.hardFailedChecks.includes("direction.rightDiagonalStroke"));

  assert.equal(result.isCorrect, false);
});

test("centerXDistance should pass within the configured maximum", () => {
  const roleMatches = {
    firstStroke: {
      stroke: {
        index: 0,
        centerX: 0.5,
      },
    },
    secondStroke: {
      stroke: {
        index: 1,
        centerX: 0.76,
      },
    },
  };

  const result = validateRelation(
    {
      type: "centerXDistance",
      from: "firstStroke",
      to: "secondStroke",
      max: 0.28,
    },
    roleMatches,
  );

  assert.equal(result, true);
});

test("centerXDistance should fail outside the configured maximum", () => {
  const roleMatches = {
    firstStroke: {
      stroke: {
        index: 0,
        centerX: 0.5,
      },
    },
    secondStroke: {
      stroke: {
        index: 1,
        centerX: 0.8,
      },
    },
  };

  const result = validateRelation(
    {
      type: "centerXDistance",
      from: "firstStroke",
      to: "secondStroke",
      max: 0.28,
    },
    roleMatches,
  );

  assert.equal(result, false);
});

test("本 should accept a right diagonal slightly left of centerX 0.45", () => {
  const features = createRootFeatures({
    verticalCenterX: 0.37,
    rightCenterX: 0.4498,
  });

  const result = validateByDescriptor({
    kanji: "本",
    features,
    descriptor: rootDescriptor,
  });

  assert.equal(result.roleMatches.verticalStroke.matchedStrokeIndex, 1);

  assert.equal(result.roleMatches.rightDiagonalStroke.matchedStrokeIndex, 3);

  assert.equal(result.checks["verticalStroke.matches"], true);

  assert.equal(result.checks["rightDiagonalStroke.matches"], true);

  assert.equal(result.checks["leftOf.leftDiagonalStroke.verticalStroke"], true);

  assert.equal(
    result.checks["leftOf.verticalStroke.rightDiagonalStroke"],
    true,
  );

  assert.equal(
    result.checks["centerXGap.leftDiagonalStroke.rightDiagonalStroke"],
    true,
  );

  assert.equal(result.checks["direction.rightDiagonalStroke"], true);

  assert.deepEqual(result.hardFailedChecks, []);

  assert.equal(result.isCorrect, true);
});

test("本 should reject a right diagonal clearly outside its expected zone", () => {
  const features = createRootFeatures({
    rightCenterX: 0.39,
  });

  const result = validateByDescriptor({
    kanji: "本",
    features,
    descriptor: rootDescriptor,
  });

  assert.equal(result.checks["rightDiagonalStroke.matches"], false);

  assert.ok(result.hardFailedChecks.includes("rightDiagonalStroke.matches"));

  assert.equal(result.isCorrect, false);

  assert.equal(result.score, 10);
});

function createTwoHorizontalTreeFeatures({
  upperCenterY = 0.2,
  upperMinX = 0.25,
  upperMaxX = 0.75,
  lowerCenterY = 0.4,
  lowerMinX = 0.15,
  lowerMaxX = 0.85,
  verticalCenterX = 0.5,
  verticalMinY = 0.05,
  verticalMaxY = 0.95,
  leftCenterX = 0.3,
  leftCenterY = 0.7,
  leftDeltaX = -0.28,
  leftDeltaY = 0.4,
  rightCenterX = 0.7,
  rightCenterY = 0.7,
  rightDeltaX = 0.28,
  rightDeltaY = 0.4,
  rightAngleAbs = 0.95,
} = {}) {
  return {
    strokeCountUser: 5,
    strokeCountRef: 5,
    geometry: {
      bboxWidth: 0.8,
      bboxHeight: 0.9,
      aspectRatio: 0.8 / 0.9,
      straightnessMean: 0.92,
      straightnessMin: 0.88,
      intersections: [],
      intersectionCount: 0,
      touches: [],
      touchCount: 0,
      perStroke: [
        {
          index: 0,
          angleAbs: 0.03,
          width: upperMaxX - upperMinX,
          height: 0.04,
          centerX: (upperMinX + upperMaxX) / 2,
          centerY: upperCenterY,
          minX: upperMinX,
          maxX: upperMaxX,
          minY: upperCenterY - 0.02,
          maxY: upperCenterY + 0.02,
          straightness: 0.98,
          deltaX: upperMaxX - upperMinX,
          deltaY: 0.01,
        },
        {
          index: 1,
          angleAbs: 0.03,
          width: lowerMaxX - lowerMinX,
          height: 0.04,
          centerX: (lowerMinX + lowerMaxX) / 2,
          centerY: lowerCenterY,
          minX: lowerMinX,
          maxX: lowerMaxX,
          minY: lowerCenterY - 0.02,
          maxY: lowerCenterY + 0.02,
          straightness: 0.98,
          deltaX: lowerMaxX - lowerMinX,
          deltaY: 0.01,
        },
        {
          index: 2,
          angleAbs: Math.PI / 2,
          width: 0.05,
          height: verticalMaxY - verticalMinY,
          centerX: verticalCenterX,
          centerY: (verticalMinY + verticalMaxY) / 2,
          minX: verticalCenterX - 0.025,
          maxX: verticalCenterX + 0.025,
          minY: verticalMinY,
          maxY: verticalMaxY,
          straightness: 0.98,
          deltaX: 0.01,
          deltaY: verticalMaxY - verticalMinY,
        },
        {
          index: 3,
          angleAbs: 0.95,
          width: Math.abs(leftDeltaX),
          height: Math.abs(leftDeltaY),
          centerX: leftCenterX,
          centerY: leftCenterY,
          minX: leftCenterX - Math.abs(leftDeltaX) / 2,
          maxX: leftCenterX + Math.abs(leftDeltaX) / 2,
          minY: leftCenterY - Math.abs(leftDeltaY) / 2,
          maxY: leftCenterY + Math.abs(leftDeltaY) / 2,
          straightness: 0.95,
          deltaX: leftDeltaX,
          deltaY: leftDeltaY,
        },
        {
          index: 4,
          angleAbs: rightAngleAbs,
          width: Math.abs(rightDeltaX),
          height: Math.abs(rightDeltaY),
          centerX: rightCenterX,
          centerY: rightCenterY,
          minX: rightCenterX - Math.abs(rightDeltaX) / 2,
          maxX: rightCenterX + Math.abs(rightDeltaX) / 2,
          minY: rightCenterY - Math.abs(rightDeltaY) / 2,
          maxY: rightCenterY + Math.abs(rightDeltaY) / 2,
          straightness: 0.95,
          deltaX: rightDeltaX,
          deltaY: rightDeltaY,
        },
      ],
    },
  };
}

test("未 descriptor should use declarative two-horizontal tree roles", () => {
  assert.ok(notYetDescriptor);

  assert.equal(notYetDescriptor.pattern, "tree_with_two_horizontals");

  assert.equal(notYetDescriptor.strokeCount, 5);

  assert.deepEqual(
    notYetDescriptor.strokes.map((stroke) => stroke.id),
    [
      "upperHorizontalStroke",
      "lowerHorizontalStroke",
      "verticalStroke",
      "leftDiagonalStroke",
      "rightDiagonalStroke",
    ],
  );

  assert.equal(notYetDescriptor.rules, undefined);

  assert.equal(notYetDescriptor.expectedStrokeCount, undefined);
});

test("末 descriptor should use declarative two-horizontal tree roles", () => {
  assert.ok(endDescriptor);

  assert.equal(endDescriptor.pattern, "tree_with_two_horizontals");

  assert.equal(endDescriptor.strokeCount, 5);

  assert.deepEqual(
    endDescriptor.strokes.map((stroke) => stroke.id),
    [
      "upperHorizontalStroke",
      "lowerHorizontalStroke",
      "verticalStroke",
      "leftDiagonalStroke",
      "rightDiagonalStroke",
    ],
  );

  assert.equal(endDescriptor.rules, undefined);

  assert.equal(endDescriptor.expectedStrokeCount, undefined);
});

test("未 should pass with two ordered horizontals and two outward diagonals", () => {
  const features = createTwoHorizontalTreeFeatures();

  const result = validateByDescriptor({
    kanji: "未",
    features,
    descriptor: notYetDescriptor,
  });

  assert.equal(result.strategy, "descriptor");

  assert.equal(result.isCorrect, true);

  assert.deepEqual(result.hardFailedChecks, []);

  assert.equal(result.roleMatches.upperHorizontalStroke.matchedStrokeIndex, 0);

  assert.equal(result.roleMatches.lowerHorizontalStroke.matchedStrokeIndex, 1);

  assert.equal(result.roleMatches.verticalStroke.matchedStrokeIndex, 2);

  assert.equal(result.roleMatches.leftDiagonalStroke.matchedStrokeIndex, 3);

  assert.equal(result.roleMatches.rightDiagonalStroke.matchedStrokeIndex, 4);

  assert.equal(
    result.checks["above.upperHorizontalStroke.lowerHorizontalStroke"],
    true,
  );

  assert.equal(
    result.checks["orthogonalCross.upperHorizontalStroke.verticalStroke"],
    true,
  );

  assert.equal(
    result.checks["orthogonalCross.lowerHorizontalStroke.verticalStroke"],
    true,
  );

  assert.equal(result.score, 0.5);
});

test("末 should pass with two ordered horizontals and two outward diagonals", () => {
  const features = createTwoHorizontalTreeFeatures({
    upperMinX: 0.15,
    upperMaxX: 0.85,
    lowerMinX: 0.27,
    lowerMaxX: 0.73,
  });

  const result = validateByDescriptor({
    kanji: "末",
    features,
    descriptor: endDescriptor,
  });

  assert.equal(result.strategy, "descriptor");

  assert.equal(result.isCorrect, true);

  assert.deepEqual(result.hardFailedChecks, []);

  assert.equal(result.roleMatches.upperHorizontalStroke.matchedStrokeIndex, 0);

  assert.equal(result.roleMatches.lowerHorizontalStroke.matchedStrokeIndex, 1);

  assert.equal(result.roleMatches.verticalStroke.matchedStrokeIndex, 2);

  assert.equal(result.roleMatches.leftDiagonalStroke.matchedStrokeIndex, 3);

  assert.equal(result.roleMatches.rightDiagonalStroke.matchedStrokeIndex, 4);

  assert.equal(
    result.checks["above.upperHorizontalStroke.lowerHorizontalStroke"],
    true,
  );

  assert.equal(
    result.checks["orthogonalCross.upperHorizontalStroke.verticalStroke"],
    true,
  );

  assert.equal(
    result.checks["orthogonalCross.lowerHorizontalStroke.verticalStroke"],
    true,
  );
});

test("未 should fail when its two horizontals are too close", () => {
  const features = createTwoHorizontalTreeFeatures({
    upperCenterY: 0.3,
    lowerCenterY: 0.35,
  });

  const result = validateByDescriptor({
    kanji: "未",
    features,
    descriptor: notYetDescriptor,
  });

  assert.equal(
    result.checks["above.upperHorizontalStroke.lowerHorizontalStroke"],
    false,
  );

  assert.ok(
    result.hardFailedChecks.includes(
      "above.upperHorizontalStroke.lowerHorizontalStroke",
    ),
  );

  assert.equal(result.isCorrect, false);

  assert.equal(result.score, 10);
});

test("未 should fail when the vertical does not cross the upper horizontal", () => {
  const features = createTwoHorizontalTreeFeatures({
    upperCenterY: 0.12,
    upperMinX: 0.7,
    upperMaxX: 0.92,
    lowerCenterY: 0.42,
    lowerMinX: 0.15,
    lowerMaxX: 0.85,
    verticalCenterX: 0.4,
  });

  const result = validateByDescriptor({
    kanji: "未",
    features,
    descriptor: notYetDescriptor,
  });

  assert.equal(result.roleMatches.upperHorizontalStroke.matchedStrokeIndex, 0);

  assert.equal(result.roleMatches.lowerHorizontalStroke.matchedStrokeIndex, 1);

  assert.equal(
    result.checks["orthogonalCross.upperHorizontalStroke.verticalStroke"],
    false,
  );

  assert.equal(
    result.checks["orthogonalCross.lowerHorizontalStroke.verticalStroke"],
    true,
  );

  assert.ok(
    result.hardFailedChecks.includes(
      "orthogonalCross.upperHorizontalStroke.verticalStroke",
    ),
  );

  assert.equal(result.isCorrect, false);

  assert.equal(result.score, 10);
});

test("末 should fail when the vertical does not cross the lower horizontal", () => {
  const features = createTwoHorizontalTreeFeatures({
    lowerMinX: 0.65,
    lowerMaxX: 0.88,
    verticalCenterX: 0.4,
  });

  const result = validateByDescriptor({
    kanji: "末",
    features,
    descriptor: endDescriptor,
  });

  assert.equal(
    result.checks["orthogonalCross.lowerHorizontalStroke.verticalStroke"],
    false,
  );

  assert.ok(
    result.hardFailedChecks.includes(
      "orthogonalCross.lowerHorizontalStroke.verticalStroke",
    ),
  );

  assert.equal(result.isCorrect, false);
});

test("未 should fail when a diagonal is not below the lower horizontal", () => {
  const features = createTwoHorizontalTreeFeatures({
    lowerCenterY: 0.4,
    leftCenterY: 0.41,
  });

  const result = validateByDescriptor({
    kanji: "未",
    features,
    descriptor: notYetDescriptor,
  });

  assert.equal(
    result.checks["above.lowerHorizontalStroke.leftDiagonalStroke"],
    false,
  );

  assert.ok(
    result.hardFailedChecks.includes(
      "above.lowerHorizontalStroke.leftDiagonalStroke",
    ),
  );

  assert.equal(result.isCorrect, false);
});

test("未 should fail when the left diagonal descends to the right", () => {
  const features = createTwoHorizontalTreeFeatures({
    leftDeltaX: 0.28,
  });

  const result = validateByDescriptor({
    kanji: "未",
    features,
    descriptor: notYetDescriptor,
  });

  assert.equal(result.checks["direction.leftDiagonalStroke"], false);

  assert.ok(result.hardFailedChecks.includes("direction.leftDiagonalStroke"));

  assert.equal(result.isCorrect, false);
});

test("末 should fail when the right diagonal descends to the left", () => {
  const features = createTwoHorizontalTreeFeatures({
    rightDeltaX: -0.28,
  });

  const result = validateByDescriptor({
    kanji: "末",
    features,
    descriptor: endDescriptor,
  });

  assert.equal(result.checks["direction.rightDiagonalStroke"], false);

  assert.ok(result.hardFailedChecks.includes("direction.rightDiagonalStroke"));

  assert.equal(result.isCorrect, false);
});

test("未 should fail when the diagonals are too close", () => {
  const features = createTwoHorizontalTreeFeatures({
    leftCenterX: 0.45,
    rightCenterX: 0.54,
  });

  const result = validateByDescriptor({
    kanji: "未",
    features,
    descriptor: notYetDescriptor,
  });

  assert.equal(
    result.checks["centerXGap.leftDiagonalStroke.rightDiagonalStroke"],
    false,
  );

  assert.ok(
    result.hardFailedChecks.includes(
      "centerXGap.leftDiagonalStroke.rightDiagonalStroke",
    ),
  );

  assert.equal(result.isCorrect, false);
});

test("末 should accept a shorter lower horizontal allowed by its descriptor", () => {
  const features = createTwoHorizontalTreeFeatures({
    upperMinX: 0.15,
    upperMaxX: 0.85,
    lowerMinX: 0.405,
    lowerMaxX: 0.595,
  });

  const result = validateByDescriptor({
    kanji: "末",
    features,
    descriptor: endDescriptor,
  });

  assert.equal(result.roleMatches.upperHorizontalStroke.matchedStrokeIndex, 0);

  assert.equal(result.roleMatches.lowerHorizontalStroke.matchedStrokeIndex, 1);

  assert.ok(Math.abs(features.geometry.perStroke[1].width - 0.19) < 1e-9);

  assert.equal(result.checks["lowerHorizontalStroke.matches"], true);

  assert.equal(result.isCorrect, true);

  assert.deepEqual(result.hardFailedChecks, []);
});

test("未 should reject a lower horizontal below its minimum width", () => {
  const features = createTwoHorizontalTreeFeatures({
    lowerMinX: 0.405,
    lowerMaxX: 0.595,
  });

  const result = validateByDescriptor({
    kanji: "未",
    features,
    descriptor: notYetDescriptor,
  });

  assert.equal(result.checks["lowerHorizontalStroke.matches"], false);

  assert.ok(result.hardFailedChecks.includes("lowerHorizontalStroke.matches"));

  assert.equal(result.isCorrect, false);
});

test("末 should accept its more permissive right diagonal angle", () => {
  const features = createTwoHorizontalTreeFeatures({
    rightAngleAbs: 0.22,
  });

  const result = validateByDescriptor({
    kanji: "末",
    features,
    descriptor: endDescriptor,
  });

  assert.equal(result.checks["rightDiagonalStroke.matches"], true);

  assert.equal(result.checks["direction.rightDiagonalStroke"], true);

  assert.equal(result.isCorrect, true);
});

test("未 should reject a right diagonal angle below its configured minimum", () => {
  const features = createTwoHorizontalTreeFeatures({
    rightAngleAbs: 0.22,
  });

  const result = validateByDescriptor({
    kanji: "未",
    features,
    descriptor: notYetDescriptor,
  });

  assert.equal(result.checks["rightDiagonalStroke.matches"], false);

  assert.ok(result.hardFailedChecks.includes("rightDiagonalStroke.matches"));

  assert.equal(result.isCorrect, false);
});

test("未 orthogonal crosses should not depend on stored intersections", () => {
  const features = createTwoHorizontalTreeFeatures();

  const result = validateByDescriptor({
    kanji: "未",
    features,
    descriptor: notYetDescriptor,
  });

  assert.equal(features.geometry.intersections.length, 0);

  assert.equal(
    result.checks["orthogonalCross.upperHorizontalStroke.verticalStroke"],
    true,
  );

  assert.equal(
    result.checks["orthogonalCross.lowerHorizontalStroke.verticalStroke"],
    true,
  );

  assert.equal(result.isCorrect, true);
});

function createOneFeatures({
  angleAbs = 0.03,
  width = 0.82,
  height = 0.08,
  straightness = 0.98,
  bboxWidth = width,
  bboxHeight = height,
  aspectRatio = bboxHeight > 0 ? bboxWidth / bboxHeight : Infinity,
  straightnessMean = straightness,
  strokeCountUser = 1,
  strokeCountRef = 1,
} = {}) {
  return {
    strokeCountUser,
    strokeCountRef,
    geometry: {
      bboxWidth,
      bboxHeight,
      aspectRatio,
      straightnessMean,
      straightnessMin: straightness,
      intersections: [],
      intersectionCount: 0,
      touches: [],
      touchCount: 0,
      perStroke: [
        {
          index: 0,
          angleAbs,
          width,
          height,
          centerX: 0.5,
          centerY: 0.5,
          minX: 0.5 - width / 2,
          maxX: 0.5 + width / 2,
          minY: 0.5 - height / 2,
          maxY: 0.5 + height / 2,
          straightness,
          deltaX: width,
          deltaY: 0.01,
        },
      ],
    },
  };
}

test("一 descriptor should use a declarative single horizontal role", () => {
  assert.ok(oneDescriptor);

  assert.equal(oneDescriptor.pattern, "single_horizontal_line");

  assert.equal(oneDescriptor.strokeCount, 1);

  assert.deepEqual(
    oneDescriptor.strokes.map((stroke) => stroke.id),
    ["horizontalStroke"],
  );

  assert.equal(oneDescriptor.rules, undefined);

  assert.equal(oneDescriptor.expectedStrokeCount, undefined);
});

test("一 should pass with one wide horizontal stroke", () => {
  const features = createOneFeatures();

  const result = validateByDescriptor({
    kanji: "一",
    features,
    descriptor: oneDescriptor,
  });

  assert.equal(result.strategy, "descriptor");

  assert.equal(result.pattern, "single_horizontal_line");

  assert.equal(result.roleMatches.horizontalStroke.matchedStrokeIndex, 0);

  assert.equal(result.checks["horizontalStroke.matches"], true);

  assert.equal(result.checks.bboxWidth, true);

  assert.equal(result.checks.bboxHeight, true);

  assert.equal(result.checks.aspectRatio, true);

  assert.deepEqual(result.hardFailedChecks, []);

  assert.equal(result.isCorrect, true);

  assert.equal(result.score, 0.5);
});

test("一 should fail when its stroke is too inclined", () => {
  const features = createOneFeatures({
    angleAbs: 0.55,
  });

  const result = validateByDescriptor({
    kanji: "一",
    features,
    descriptor: oneDescriptor,
  });

  assert.equal(result.checks["horizontalStroke.matches"], false);

  assert.ok(result.hardFailedChecks.includes("horizontalStroke.matches"));

  assert.equal(result.isCorrect, false);

  assert.equal(result.score, 10);
});

test("一 should fail when its stroke is too short", () => {
  const features = createOneFeatures({
    width: 0.5,
    bboxWidth: 0.5,
    bboxHeight: 0.08,
    aspectRatio: 6.25,
  });

  const result = validateByDescriptor({
    kanji: "一",
    features,
    descriptor: oneDescriptor,
  });

  assert.equal(result.checks["horizontalStroke.matches"], false);

  assert.equal(result.checks.bboxWidth, false);

  assert.ok(result.hardFailedChecks.includes("horizontalStroke.matches"));

  assert.ok(result.hardFailedChecks.includes("bboxWidth"));

  assert.equal(result.isCorrect, false);
});

test("一 should fail when its stroke is too tall", () => {
  const features = createOneFeatures({
    width: 0.82,
    height: 0.32,
    bboxWidth: 0.82,
    bboxHeight: 0.32,
    aspectRatio: 0.82 / 0.32,
  });

  const result = validateByDescriptor({
    kanji: "一",
    features,
    descriptor: oneDescriptor,
  });

  assert.equal(result.checks["horizontalStroke.matches"], false);

  assert.equal(result.checks.bboxHeight, false);

  assert.equal(result.checks.aspectRatio, false);

  assert.equal(result.isCorrect, false);
});

test("一 should fail when its global aspect ratio is too low", () => {
  const features = createOneFeatures({
    width: 0.75,
    height: 0.2,
    bboxWidth: 0.75,
    bboxHeight: 0.3,
    aspectRatio: 2.5,
  });

  const result = validateByDescriptor({
    kanji: "一",
    features,
    descriptor: oneDescriptor,
  });

  assert.equal(result.checks.aspectRatio, false);

  assert.ok(result.hardFailedChecks.includes("aspectRatio"));

  assert.equal(result.isCorrect, false);
});

test("一 straightness should initially remain a soft check", () => {
  assert.equal(oneDescriptor.hardChecks.includes("straightnessMean"), false);

  assert.equal(
    Object.hasOwn(oneDescriptor.globalChecks, "straightnessMean"),
    true,
  );
});

test("一 should report low straightness without making it a hard failure", () => {
  const features = createOneFeatures({
    straightness: 0.5,
    straightnessMean: 0.5,
  });

  const result = validateByDescriptor({
    kanji: "一",
    features,
    descriptor: oneDescriptor,
  });

  assert.equal(result.checks.straightnessMean, false);

  assert.ok(result.failedChecks.includes("straightnessMean"));

  assert.equal(result.hardFailedChecks.includes("straightnessMean"), false);

  assert.equal(result.isCorrect, true);

  assert.equal(result.score, 0.5);
});

test("一 should fail when the user stroke count is not one", () => {
  const features = createOneFeatures({
    strokeCountUser: 2,
  });

  const result = validateByDescriptor({
    kanji: "一",
    features,
    descriptor: oneDescriptor,
  });

  assert.equal(result.checks.strokeCount, false);

  assert.ok(result.hardFailedChecks.includes("strokeCount"));

  assert.equal(result.isCorrect, false);

  assert.equal(result.score, 10);
});

function createTwoFeatures({
  upperCenterY = 0.2,
  upperMinX = 0.2,
  upperMaxX = 0.8,
  upperAngleAbs = 0.03,
  upperHeight = 0.04,
  upperStraightness = 0.98,

  lowerCenterY = 0.75,
  lowerMinX = 0.1,
  lowerMaxX = 0.9,
  lowerAngleAbs = 0.03,
  lowerHeight = 0.04,
  lowerStraightness = 0.98,

  bboxWidth = 0.8,
  bboxHeight = 0.59,
  aspectRatio = bboxHeight > 0 ? bboxWidth / bboxHeight : Infinity,
  straightnessMean = (upperStraightness + lowerStraightness) / 2,

  strokeCountUser = 2,
  strokeCountRef = 2,
  reverseStrokeOrder = false,
} = {}) {
  const upperStroke = {
    index: 0,
    angleAbs: upperAngleAbs,
    width: upperMaxX - upperMinX,
    height: upperHeight,
    centerX: (upperMinX + upperMaxX) / 2,
    centerY: upperCenterY,
    minX: upperMinX,
    maxX: upperMaxX,
    minY: upperCenterY - upperHeight / 2,
    maxY: upperCenterY + upperHeight / 2,
    straightness: upperStraightness,
    deltaX: upperMaxX - upperMinX,
    deltaY: 0.01,
  };

  const lowerStroke = {
    index: 1,
    angleAbs: lowerAngleAbs,
    width: lowerMaxX - lowerMinX,
    height: lowerHeight,
    centerX: (lowerMinX + lowerMaxX) / 2,
    centerY: lowerCenterY,
    minX: lowerMinX,
    maxX: lowerMaxX,
    minY: lowerCenterY - lowerHeight / 2,
    maxY: lowerCenterY + lowerHeight / 2,
    straightness: lowerStraightness,
    deltaX: lowerMaxX - lowerMinX,
    deltaY: 0.01,
  };

  const perStroke = reverseStrokeOrder
    ? [
        {
          ...lowerStroke,
          index: 0,
        },
        {
          ...upperStroke,
          index: 1,
        },
      ]
    : [upperStroke, lowerStroke];

  return {
    strokeCountUser,
    strokeCountRef,
    geometry: {
      bboxWidth,
      bboxHeight,
      aspectRatio,
      straightnessMean,
      straightnessMin: Math.min(upperStraightness, lowerStraightness),
      intersections: [],
      intersectionCount: 0,
      touches: [],
      touchCount: 0,
      perStroke,
    },
  };
}

test("二 descriptor should use two declarative horizontal roles", () => {
  assert.ok(twoDescriptor);

  assert.equal(twoDescriptor.pattern, "two_horizontal_lines");

  assert.equal(twoDescriptor.strokeCount, 2);

  assert.deepEqual(
    twoDescriptor.strokes.map((stroke) => stroke.id),
    ["upperHorizontalStroke", "lowerHorizontalStroke"],
  );

  assert.equal(twoDescriptor.rules, undefined);

  assert.equal(twoDescriptor.expectedStrokeCount, undefined);
});

test("二 should pass with two ordered horizontal strokes", () => {
  const features = createTwoFeatures();

  const result = validateByDescriptor({
    kanji: "二",
    features,
    descriptor: twoDescriptor,
  });

  assert.equal(result.strategy, "descriptor");

  assert.equal(result.pattern, "two_horizontal_lines");

  assert.equal(result.isCorrect, true);

  assert.deepEqual(result.hardFailedChecks, []);

  assert.equal(result.roleMatches.upperHorizontalStroke.matchedStrokeIndex, 0);

  assert.equal(result.roleMatches.lowerHorizontalStroke.matchedStrokeIndex, 1);

  assert.equal(result.checks["upperHorizontalStroke.matches"], true);

  assert.equal(result.checks["lowerHorizontalStroke.matches"], true);

  assert.equal(
    result.checks["above.upperHorizontalStroke.lowerHorizontalStroke"],
    true,
  );

  assert.equal(result.score, 0.5);
});

test("二 should assign its horizontal roles regardless of stroke order", () => {
  const features = createTwoFeatures({
    reverseStrokeOrder: true,
  });

  const result = validateByDescriptor({
    kanji: "二",
    features,
    descriptor: twoDescriptor,
  });

  assert.equal(result.roleMatches.upperHorizontalStroke.matchedStrokeIndex, 1);

  assert.equal(result.roleMatches.lowerHorizontalStroke.matchedStrokeIndex, 0);

  assert.equal(
    result.checks["above.upperHorizontalStroke.lowerHorizontalStroke"],
    true,
  );

  assert.equal(result.isCorrect, true);
});

test("二 should fail when its horizontals are too close", () => {
  const features = createTwoFeatures({
    upperCenterY: 0.38,
    lowerCenterY: 0.5,
  });

  const result = validateByDescriptor({
    kanji: "二",
    features,
    descriptor: twoDescriptor,
  });

  assert.equal(
    result.checks["above.upperHorizontalStroke.lowerHorizontalStroke"],
    false,
  );

  assert.ok(
    result.hardFailedChecks.includes(
      "above.upperHorizontalStroke.lowerHorizontalStroke",
    ),
  );

  assert.equal(result.isCorrect, false);

  assert.equal(result.score, 10);
});

test("二 should fail when one stroke is clearly not horizontal", () => {
  const features = createTwoFeatures({
    lowerAngleAbs: 0.8,
  });

  const result = validateByDescriptor({
    kanji: "二",
    features,
    descriptor: twoDescriptor,
  });

  assert.equal(result.checks["lowerHorizontalStroke.matches"], false);

  assert.ok(result.hardFailedChecks.includes("lowerHorizontalStroke.matches"));

  assert.equal(result.isCorrect, false);
});

test("二 should fail when one horizontal is extremely short", () => {
  const features = createTwoFeatures({
    upperMinX: 0.4,
    upperMaxX: 0.65,
  });

  const result = validateByDescriptor({
    kanji: "二",
    features,
    descriptor: twoDescriptor,
  });

  assert.equal(result.checks["upperHorizontalStroke.matches"], false);

  assert.ok(result.hardFailedChecks.includes("upperHorizontalStroke.matches"));

  assert.equal(result.isCorrect, false);
});

test("二 should fail when the global vertical extent is too small", () => {
  const features = createTwoFeatures({
    upperCenterY: 0.4,
    lowerCenterY: 0.6,
    bboxWidth: 0.8,
    bboxHeight: 0.2,
    aspectRatio: 4,
  });

  const result = validateByDescriptor({
    kanji: "二",
    features,
    descriptor: twoDescriptor,
  });

  assert.equal(result.checks.bboxHeight, false);

  assert.equal(result.checks.aspectRatio, false);

  assert.ok(result.hardFailedChecks.includes("bboxHeight"));

  assert.ok(result.hardFailedChecks.includes("aspectRatio"));

  assert.equal(result.isCorrect, false);
});

test("二 straightness should initially remain a soft check", () => {
  assert.equal(twoDescriptor.hardChecks.includes("straightnessMean"), false);

  assert.equal(
    Object.hasOwn(twoDescriptor.globalChecks, "straightnessMean"),
    true,
  );
});

test("二 should report low mean straightness without making it a hard failure", () => {
  const features = createTwoFeatures({
    upperStraightness: 0.65,
    lowerStraightness: 0.65,
    straightnessMean: 0.65,
  });

  const result = validateByDescriptor({
    kanji: "二",
    features,
    descriptor: twoDescriptor,
  });

  assert.equal(result.checks.straightnessMean, false);

  assert.ok(result.failedChecks.includes("straightnessMean"));

  assert.equal(result.hardFailedChecks.includes("straightnessMean"), false);

  assert.equal(result.isCorrect, true);

  assert.equal(result.score, 0.5);
});

test("二 should fail when the user stroke count is not two", () => {
  const features = createTwoFeatures({
    strokeCountUser: 3,
  });

  const result = validateByDescriptor({
    kanji: "二",
    features,
    descriptor: twoDescriptor,
  });

  assert.equal(result.checks.strokeCount, false);

  assert.ok(result.hardFailedChecks.includes("strokeCount"));

  assert.equal(result.isCorrect, false);

  assert.equal(result.score, 10);
});

test("二 should accept a lower horizontal above absolute centerY 0.5 when sufficiently below the upper stroke", () => {
  const features = createTwoFeatures({
    upperCenterY: 0.03,
    lowerCenterY: 0.36,
    bboxWidth: 1,
    bboxHeight: 0.41,
    aspectRatio: 1 / 0.41,
  });

  const result = validateByDescriptor({
    kanji: "二",
    features,
    descriptor: twoDescriptor,
  });

  assert.equal(result.roleMatches.upperHorizontalStroke.matchedStrokeIndex, 0);

  assert.equal(result.roleMatches.lowerHorizontalStroke.matchedStrokeIndex, 1);

  assert.equal(result.checks["lowerHorizontalStroke.matches"], true);

  assert.equal(
    result.checks["above.upperHorizontalStroke.lowerHorizontalStroke"],
    true,
  );

  assert.deepEqual(result.hardFailedChecks, []);

  assert.equal(result.isCorrect, true);

  assert.equal(result.score, 0.5);
});

test("二 should fail when its horizontals are too close", () => {
  const features = createTwoFeatures({
    upperCenterY: 0.2,
    lowerCenterY: 0.32,
    bboxWidth: 0.8,
    bboxHeight: 0.4,
    aspectRatio: 2,
  });

  const result = validateByDescriptor({
    kanji: "二",
    features,
    descriptor: twoDescriptor,
  });

  assert.equal(
    result.checks["above.upperHorizontalStroke.lowerHorizontalStroke"],
    false,
  );

  assert.ok(
    result.hardFailedChecks.includes(
      "above.upperHorizontalStroke.lowerHorizontalStroke",
    ),
  );

  assert.equal(result.isCorrect, false);
});
