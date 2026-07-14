function validateByDescriptor({ kanji, features, descriptor }) {
  if (!descriptor || descriptor.enabled === false) {
    return null;
  }

  if (descriptor.pattern === "nested_box_pattern") {
    return validateNestedBoxPattern({
      kanji,
      features,
      descriptor,
    });
  }

  if (descriptor.pattern === "open_box_with_inner_vertical_and_horizontals") {
    return validateOpenBoxWithInnerVerticalAndHorizontals({
      kanji,
      features,
      descriptor,
    });
  }

  if (descriptor.pattern === "tree_cross_pattern") {
    return validateTreeCrossPattern({
      kanji,
      features,
      descriptor,
    });
  }

  if (descriptor.pattern === "tree_with_bottom_mark") {
    return validateTreeWithBottomMark({
      kanji,
      features,
      descriptor,
    });
  }

  if (descriptor.pattern === "tree_with_two_horizontals") {
    return validateTreeWithTwoHorizontals({
      kanji,
      features,
      descriptor,
    });
  }

  const geometry = features?.geometry;

  if (!geometry) {
    return {
      isCorrect: false,
      score: 10,
      strategy: "descriptor",
      pattern: descriptor.pattern,
      reason: "missing_geometry_features",
      checks: {},
      failedChecks: ["missing_geometry_features"],
      hardFailedChecks: ["missing_geometry_features"],
      roleMatches: {},
      descriptorMatchScore: 0,
      details: {
        kanji,
      },
    };
  }

  const perStroke = geometry.perStroke ?? [];
  const checks = {};
  const failedChecks = [];

  checks.strokeCount = features.strokeCountUser === descriptor.strokeCount;
  checks.referenceStrokeCount =
    features.strokeCountRef === descriptor.strokeCount;

  if (!checks.strokeCount) {
    failedChecks.push("strokeCount");
  }

  if (!checks.referenceStrokeCount) {
    failedChecks.push("referenceStrokeCount");
  }

  if (perStroke.length !== descriptor.strokeCount) {
    return buildDescriptorResult({
      kanji,
      descriptor,
      checks,
      failedChecks,
      roleMatches: {},
      geometry,
      forcedScore: 10,
    });
  }

  const roleMatches = matchStrokesToDescriptorRoles({
    perStroke,
    descriptor,
  });

  validateRoleMatches({
    descriptor,
    roleMatches,
    checks,
    failedChecks,
  });

  validateRelations({
    descriptor,
    roleMatches,
    geometry,
    checks,
    failedChecks,
  });

  validateGlobalChecks({
    descriptor,
    geometry,
    checks,
    failedChecks,
  });

  return buildDescriptorResult({
    kanji,
    descriptor,
    checks,
    failedChecks,
    roleMatches,
    geometry,
  });
}

function matchStrokesToDescriptorRoles({ perStroke, descriptor }) {
  const roles = descriptor.strokes ?? [];
  const availableStrokes = [...perStroke];
  const roleMatches = {};

  for (const role of roles) {
    let bestStroke = null;
    let bestScore = Infinity;

    for (const stroke of availableStrokes) {
      const score = scoreStrokeAgainstRole(stroke, role);

      if (score < bestScore) {
        bestScore = score;
        bestStroke = stroke;
      }
    }

    if (bestStroke) {
      roleMatches[role.id] = {
        role,
        stroke: bestStroke,
        matchScore: bestScore,
      };

      const usedIndex = availableStrokes.indexOf(bestStroke);
      availableStrokes.splice(usedIndex, 1);
    } else {
      roleMatches[role.id] = {
        role,
        stroke: null,
        matchScore: Infinity,
      };
    }
  }

  return roleMatches;
}

const DEFAULT_EXPECTED_RANGE_WEIGHTS = {
  angleAbs: 2.0,
  width: 1.0,
  height: 1.0,
  centerX: 1.0,
  centerY: 1.0,
  straightness: 1.5,
};

function isExpectedRange(range) {
  if (!range || typeof range !== "object" || Array.isArray(range)) {
    return false;
  }

  const hasMin = range.min != null;
  const hasMax = range.max != null;

  if (!hasMin && !hasMax) {
    return false;
  }

  if (hasMin && typeof range.min !== "number") {
    return false;
  }

  if (hasMax && typeof range.max !== "number") {
    return false;
  }

  return true;
}

function getExpectedRangeWeight(featureName, configuredWeights = {}) {
  const configuredWeight = configuredWeights?.[featureName];

  if (isValidExpectedRangeWeight(configuredWeight)) {
    return configuredWeight;
  }

  return DEFAULT_EXPECTED_RANGE_WEIGHTS[featureName] ?? 1;
}

function isValidExpectedRangeWeight(weight) {
  return typeof weight === "number" && Number.isFinite(weight) && weight >= 0;
}

function scoreStrokeAgainstRole(stroke, role) {
  const expected = role?.expected ?? {};
  const configuredWeights = role?.weights ?? {};

  let score = 0;

  for (const [featureName, expectedRange] of Object.entries(expected)) {
    if (!isExpectedRange(expectedRange)) {
      continue;
    }

    const featureValue = stroke?.[featureName];

    const weight = getExpectedRangeWeight(featureName, configuredWeights);

    score += rangePenalty(featureValue, expectedRange, weight);
  }

  return score;
}

function rangePenalty(value, range, weight = 1) {
  if (!range || value == null) {
    return 0;
  }

  let penalty = 0;

  if (range.min != null && value < range.min) {
    penalty += range.min - value;
  }

  if (range.max != null && value > range.max) {
    penalty += value - range.max;
  }

  return penalty * weight;
}

function validateRoleMatches({
  descriptor,
  roleMatches,
  checks,
  failedChecks,
}) {
  for (const role of descriptor.strokes ?? []) {
    const match = roleMatches[role.id];
    const stroke = match?.stroke;

    const checkName = `${role.id}.matches`;

    if (!stroke) {
      checks[checkName] = false;
      failedChecks.push(checkName);
      continue;
    }

    const ok = strokeMatchesExpected(stroke, role.expected ?? {});

    checks[checkName] = ok;

    if (!ok) {
      failedChecks.push(checkName);
    }
  }
}

function strokeMatchesExpected(stroke, expected) {
  for (const [featureName, expectedRange] of Object.entries(expected ?? {})) {
    if (!isExpectedRange(expectedRange)) {
      continue;
    }

    const featureValue = stroke?.[featureName];

    if (!valueInRange(featureValue, expectedRange)) {
      return false;
    }
  }

  return true;
}

function valueInRange(value, range) {
  if (!range || value == null) {
    return true;
  }

  if (range.min != null && value < range.min) {
    return false;
  }

  if (range.max != null && value > range.max) {
    return false;
  }

  return true;
}

function validateRelations({
  descriptor,
  roleMatches,
  geometry,
  checks,
  failedChecks,
}) {
  for (const relation of descriptor.relations ?? []) {
    const checkName = buildRelationCheckName(relation);
    const ok = validateRelation(relation, roleMatches, geometry);

    checks[checkName] = ok;

    if (!ok) {
      failedChecks.push(checkName);
    }
  }
}

function getMatchedStrokeIndex(roleMatches, roleId) {
  const index = roleMatches?.[roleId]?.stroke?.index;

  return Number.isInteger(index) ? index : null;
}

function strokePairMatches(item, firstStrokeIndex, secondStrokeIndex) {
  if (
    !item ||
    !Number.isInteger(firstStrokeIndex) ||
    !Number.isInteger(secondStrokeIndex)
  ) {
    return false;
  }

  return (
    (item.strokeA === firstStrokeIndex && item.strokeB === secondStrokeIndex) ||
    (item.strokeA === secondStrokeIndex && item.strokeB === firstStrokeIndex)
  );
}

function geometryContainsStrokePair(
  items,
  firstStrokeIndex,
  secondStrokeIndex,
) {
  if (!Array.isArray(items)) {
    return false;
  }

  return items.some((item) =>
    strokePairMatches(item, firstStrokeIndex, secondStrokeIndex),
  );
}

function validateIntersectsRelation(fromStrokeIndex, toStrokeIndex, geometry) {
  return geometryContainsStrokePair(
    geometry?.intersections,
    fromStrokeIndex,
    toStrokeIndex,
  );
}

function validateTouchesRelation(fromStrokeIndex, toStrokeIndex, geometry) {
  return geometryContainsStrokePair(
    geometry?.touches,
    fromStrokeIndex,
    toStrokeIndex,
  );
}

function validateConnectsRelation(fromStrokeIndex, toStrokeIndex, geometry) {
  return (
    validateIntersectsRelation(fromStrokeIndex, toStrokeIndex, geometry) ||
    validateTouchesRelation(fromStrokeIndex, toStrokeIndex, geometry)
  );
}

function validateDisconnectedRelation(
  fromStrokeIndex,
  toStrokeIndex,
  geometry,
) {
  if (!Number.isInteger(fromStrokeIndex) || !Number.isInteger(toStrokeIndex)) {
    return false;
  }

  return !validateConnectsRelation(fromStrokeIndex, toStrokeIndex, geometry);
}

function buildRelationCheckName(relation) {
  if (relation.stroke) {
    return `${relation.type}.${relation.stroke}`;
  }

  return `${relation.type}.${relation.from}.${relation.to}`;
}

function validateRelation(relation, roleMatches, geometry = {}) {
  const from = relation.from ? roleMatches[relation.from]?.stroke : null;
  const to = relation.to ? roleMatches[relation.to]?.stroke : null;
  const stroke = relation.stroke ? roleMatches[relation.stroke]?.stroke : null;

  const fromStrokeIndex = relation.from
    ? getMatchedStrokeIndex(roleMatches, relation.from)
    : null;

  const toStrokeIndex = relation.to
    ? getMatchedStrokeIndex(roleMatches, relation.to)
    : null;

  switch (relation.type) {
    case "leftOf":
      return Boolean(from && to && from.centerX < to.centerX);

    case "rightOf":
      return Boolean(from && to && from.centerX > to.centerX);

    case "above":
      return validateAboveRelation(from, to, relation);

    case "centerXGap":
      return Boolean(
        from && to && to.centerX - from.centerX >= (relation.min ?? 0),
      );

    case "heightRatio":
      return Boolean(
        from && to && from.height >= to.height * (relation.min ?? 1),
      );

    case "centerYNotMuchHigher":
      return Boolean(
        from && to && from.centerY >= to.centerY - (relation.tolerance ?? 0),
      );

    case "overlapsX":
      return Boolean(
        from && to && from.minX <= to.maxX && from.maxX >= to.minX,
      );

    case "orthogonalCross":
      return validateOrthogonalCrossRelation(from, to, relation);

    case "startsNearTopZone":
      return Boolean(
        from && to && from.minY <= to.maxY + (relation.toleranceY ?? 0),
      );

    case "extendsDownFrom":
      return Boolean(
        from && to && from.maxY > to.centerY + (relation.minDeltaY ?? 0),
      );

    case "centerXRange":
      return Boolean(
        stroke &&
        stroke.centerX >= (relation.min ?? -Infinity) &&
        stroke.centerX <= (relation.max ?? Infinity),
      );

    case "centerYRange":
      return Boolean(
        stroke &&
        stroke.centerY >= (relation.min ?? -Infinity) &&
        stroke.centerY <= (relation.max ?? Infinity),
      );

    case "belowBBox":
      return Boolean(from && to && from.minY > to.maxY);

    case "direction":
      return validateDirectionRelation(stroke, relation);

    case "intersects":
      return validateIntersectsRelation(
        fromStrokeIndex,
        toStrokeIndex,
        geometry,
      );

    case "touches":
      return validateTouchesRelation(fromStrokeIndex, toStrokeIndex, geometry);

    case "connects":
      return validateConnectsRelation(fromStrokeIndex, toStrokeIndex, geometry);

    case "disconnected":
      return validateDisconnectedRelation(
        fromStrokeIndex,
        toStrokeIndex,
        geometry,
      );

    default:
      console.warn(`Unknown descriptor relation type: ${relation.type}`);
      return true;
  }
}

function validateAboveRelation(from, to, relation) {
  if (!from || !to) {
    return false;
  }

  if (relation.minCenterYGap != null) {
    return from.centerY < to.centerY - relation.minCenterYGap;
  }

  return from.centerY < to.centerY;
}

function validateOrthogonalCrossRelation(
  horizontalStroke,
  verticalStroke,
  relation = {},
) {
  if (!horizontalStroke || !verticalStroke) {
    return false;
  }

  const toleranceX = relation.toleranceX ?? 0;

  const toleranceY = relation.toleranceY ?? 0;

  const horizontalContainsVerticalCenter =
    verticalStroke.centerX >= horizontalStroke.minX - toleranceX &&
    verticalStroke.centerX <= horizontalStroke.maxX + toleranceX;

  const verticalContainsHorizontalCenter =
    horizontalStroke.centerY >= verticalStroke.minY - toleranceY &&
    horizontalStroke.centerY <= verticalStroke.maxY + toleranceY;

  return horizontalContainsVerticalCenter && verticalContainsHorizontalCenter;
}

function validateDirectionRelation(stroke, relation) {
  if (!stroke) {
    return false;
  }

  const deltaX = stroke.deltaX;
  const deltaY = stroke.deltaY;

  if (typeof deltaX !== "number" || typeof deltaY !== "number") {
    return false;
  }

  if (relation.deltaXMin != null && deltaX < relation.deltaXMin) {
    return false;
  }

  if (relation.deltaXMax != null && deltaX > relation.deltaXMax) {
    return false;
  }

  if (relation.deltaYMin != null && deltaY < relation.deltaYMin) {
    return false;
  }

  if (relation.deltaYMax != null && deltaY > relation.deltaYMax) {
    return false;
  }

  return true;
}

function validateGlobalChecks({ descriptor, geometry, checks, failedChecks }) {
  const globalChecks = descriptor.globalChecks ?? {};

  for (const [key, expectedRange] of Object.entries(globalChecks)) {
    const value = geometry[key];
    const ok = valueInRange(value, expectedRange);

    checks[key] = ok;

    if (!ok) {
      failedChecks.push(key);
    }
  }
}

function buildDescriptorResult({
  kanji,
  descriptor,
  checks,
  failedChecks,
  roleMatches,
  geometry,
  forcedScore = null,
}) {
  const hardChecks = descriptor.hardChecks ?? [];
  const hardFailedChecks = failedChecks.filter((checkName) =>
    hardChecks.includes(checkName),
  );

  const hasHardFailure =
    hardFailedChecks.length > 0 ||
    failedChecks.includes("strokeCount") ||
    failedChecks.includes("referenceStrokeCount");

  const totalChecks = Object.keys(checks).length || 1;
  const passedChecks = Object.values(checks).filter(Boolean).length;
  const descriptorMatchScore = passedChecks / totalChecks;

  let score;

  if (forcedScore != null) {
    score = forcedScore;
  } else if (hasHardFailure) {
    score = descriptor.scoring?.hardFailureScore ?? 10;
  } else {
    score = descriptor.scoring?.validScore ?? 0.5;
  }

  return {
    isCorrect: !hasHardFailure,
    score,
    strategy: "descriptor",
    pattern: descriptor.pattern,
    checks,
    failedChecks,
    hardFailedChecks,
    roleMatches: simplifyRoleMatches(roleMatches),
    descriptorMatchScore,
    details: {
      kanji,
      strokeCount: descriptor.strokeCount,
      geometrySummary: {
        bboxWidth: geometry?.bboxWidth,
        bboxHeight: geometry?.bboxHeight,
        aspectRatio: geometry?.aspectRatio,
        straightnessMean: geometry?.straightnessMean,
        straightnessMin: geometry?.straightnessMin,
      },
    },
  };
}

function simplifyRoleMatches(roleMatches) {
  const result = {};

  for (const [roleId, match] of Object.entries(roleMatches ?? {})) {
    result[roleId] = {
      matchedStrokeIndex: match.stroke?.index ?? null,
      matchScore: Number.isFinite(match.matchScore) ? match.matchScore : null,
    };
  }

  return result;
}

function validateNestedBoxPattern({ kanji, features, descriptor }) {
  const geometry = features.geometry;

  if (!geometry) {
    return {
      isCorrect: false,
      score: 10,
      strategy: "descriptor_nested_box_pattern",
      reason: "missing_geometry_features",
      pattern: descriptor.pattern,
    };
  }

  const perStroke = geometry.perStroke ?? [];
  const rules = descriptor.rules ?? {};
  const expectedStrokeCount = descriptor.expectedStrokeCount ?? 6;

  if (perStroke.length !== expectedStrokeCount) {
    const checks = {
      strokeCount: features.strokeCountUser === expectedStrokeCount,
      referenceStrokeCount: features.strokeCountRef === expectedStrokeCount,
    };

    const hardFailedChecks = Object.entries(checks)
      .filter(([, value]) => value === false)
      .map(([checkName]) => checkName);

    return {
      isCorrect: false,
      score: 10,
      strategy: "descriptor_nested_box_pattern",
      reason: "invalid_stroke_count",
      pattern: descriptor.pattern,
      checks,
      failedChecks: hardFailedChecks,
      hardFailedChecks,
      softFailedChecks: [],
      thresholds: {
        expectedStrokeCount,
      },
    };
  }

  const minBboxWidth = rules.minBboxWidth ?? 0.45;
  const minBboxHeight = rules.minBboxHeight ?? 0.55;
  const aspectRatioMin = rules.aspectRatioMin ?? 0.45;
  const aspectRatioMax = rules.aspectRatioMax ?? 1.8;

  const minVerticalAngleAbs = rules.minVerticalAngleAbs ?? 0.85;
  const minHorizontalAngleMax = rules.minHorizontalAngleMax ?? 0.6;
  const minHeightVsWidthRatio = rules.minHeightVsWidthRatio ?? 1.25;
  const minWidthVsHeightRatio = rules.minWidthVsHeightRatio ?? 1.25;

  const outerLeftCenterXMax = rules.outerLeftCenterXMax ?? 0.35;
  const outerLeftMinXMax = rules.outerLeftMinXMax ?? 0.25;
  const outerLeftMinHeight = rules.outerLeftMinHeight ?? 0.45;

  const outerWrappingMinWidth = rules.outerWrappingMinWidth ?? 0.35;
  const outerWrappingMinHeight = rules.outerWrappingMinHeight ?? 0.45;
  const outerWrappingMinYMax = rules.outerWrappingMinYMax ?? 0.35;
  const outerWrappingMaxXMin = rules.outerWrappingMaxXMin ?? 0.44;
  const outerWrappingMaxYMin = rules.outerWrappingMaxYMin ?? 0.48;
  const outerWrappingMaxStraightness =
    rules.outerWrappingMaxStraightness ?? 0.92;

  const outerBottomCenterYMin = rules.outerBottomCenterYMin ?? 0.55;
  const outerBottomMinWidth = rules.outerBottomMinWidth ?? 0.25;
  const outerBottomMaxYMin = rules.outerBottomMaxYMin ?? 0.55;
  const outerBottomDeltaYMin = rules.outerBottomDeltaYMin ?? -0.22;

  const innerLeftCenterXMin = rules.innerLeftCenterXMin ?? 0.2;
  const innerLeftCenterXMax = rules.innerLeftCenterXMax ?? 0.62;
  const innerLeftCenterYMin = rules.innerLeftCenterYMin ?? 0.22;
  const innerLeftCenterYMax = rules.innerLeftCenterYMax ?? 0.75;
  const innerLeftMinHeight = rules.innerLeftMinHeight ?? 0.18;
  const innerLeftMaxWidth = rules.innerLeftMaxWidth ?? 0.28;

  const innerWrappingCenterXMin = rules.innerWrappingCenterXMin ?? 0.35;
  const innerWrappingCenterXMax = rules.innerWrappingCenterXMax ?? 0.85;
  const innerWrappingCenterYMin = rules.innerWrappingCenterYMin ?? 0.2;
  const innerWrappingCenterYMax = rules.innerWrappingCenterYMax ?? 0.75;
  const innerWrappingMinWidth = rules.innerWrappingMinWidth ?? 0.18;
  const innerWrappingMinHeight = rules.innerWrappingMinHeight ?? 0.18;
  const innerWrappingMaxStraightness =
    rules.innerWrappingMaxStraightness ?? 0.95;

  const innerBottomCenterYMin = rules.innerBottomCenterYMin ?? 0.38;
  const innerBottomCenterYMax = rules.innerBottomCenterYMax ?? 0.82;
  const innerBottomMinWidth = rules.innerBottomMinWidth ?? 0.18;
  const innerBottomMaxHeight = rules.innerBottomMaxHeight ?? 0.28;
  const innerBottomDeltaYMin = rules.innerBottomDeltaYMin ?? -0.22;

  const minInnerBoxHorizontalCoverage =
    rules.minInnerBoxHorizontalCoverage ?? 0.18;
  const minInnerBoxVerticalCoverage = rules.minInnerBoxVerticalCoverage ?? 0.18;

  const minOuterInnerLeftGap = rules.minOuterInnerLeftGap ?? 0.05;
  const minOuterInnerTopGap = rules.minOuterInnerTopGap ?? 0.05;
  const minInnerOuterRightGap = rules.minInnerOuterRightGap ?? 0.03;
  const minInnerOuterBottomGap = rules.minInnerOuterBottomGap ?? 0.03;

  const minBoxHorizontalCoverage = rules.minBoxHorizontalCoverage ?? 0.44;
  const minBoxVerticalCoverage = rules.minBoxVerticalCoverage ?? 0.55;

  const minStraightnessMean = rules.minStraightnessMean ?? 0.5;
  const maxSoftFailures = rules.maxSoftFailures ?? 5;

  const isVerticalish = (stroke) => {
    const heightDominates =
      stroke.height >= stroke.width * minHeightVsWidthRatio;

    const angleLooksVertical = stroke.angleAbs >= minVerticalAngleAbs;

    return heightDominates || angleLooksVertical;
  };

  const isHorizontalish = (stroke) => {
    const widthDominates =
      stroke.width >= stroke.height * minWidthVsHeightRatio;

    const angleLooksHorizontal = stroke.angleAbs <= minHorizontalAngleMax;

    return widthDominates || angleLooksHorizontal;
  };

  function rolePenalty(condition, penalty = 1) {
    return condition ? 0 : penalty;
  }

  function scoreOuterLeftCandidate(stroke) {
    return (
      Math.abs(stroke.centerX - 0.12) * 2 +
      stroke.minX * 2 +
      rolePenalty(isVerticalish(stroke), 2) +
      rolePenalty(stroke.height >= outerLeftMinHeight, 1.5) +
      rolePenalty(stroke.centerX <= outerLeftCenterXMax, 1) +
      rolePenalty(stroke.minX <= outerLeftMinXMax, 1)
    );
  }

  function scoreOuterWrappingCandidate(stroke) {
    return (
      Math.abs(stroke.maxX - 1.0) * 2 +
      stroke.minY +
      rolePenalty(stroke.width >= outerWrappingMinWidth, 1.5) +
      rolePenalty(stroke.height >= outerWrappingMinHeight, 1.5) +
      rolePenalty(stroke.minY <= outerWrappingMinYMax, 1) +
      rolePenalty(stroke.maxX >= outerWrappingMaxXMin, 1) +
      rolePenalty(stroke.maxY >= outerWrappingMaxYMin, 1) +
      rolePenalty(stroke.straightness <= outerWrappingMaxStraightness, 2)
    );
  }

  function scoreOuterBottomCandidate(stroke) {
    return (
      Math.abs(stroke.centerY - 0.82) * 2 +
      Math.max(0, outerBottomCenterYMin - stroke.centerY) * 3 +
      Math.max(0, outerBottomMaxYMin - stroke.maxY) * 3 +
      rolePenalty(isHorizontalish(stroke), 2) +
      rolePenalty(stroke.width >= outerBottomMinWidth, 1.5) +
      rolePenalty(stroke.deltaY >= outerBottomDeltaYMin, 1.5)
    );
  }

  function scoreInnerLeftCandidate(stroke) {
    return (
      Math.abs(stroke.centerX - 0.36) * 2 +
      Math.abs(stroke.centerY - 0.48) +
      rolePenalty(isVerticalish(stroke), 2) +
      rolePenalty(stroke.height >= innerLeftMinHeight, 1.5) +
      rolePenalty(stroke.width <= innerLeftMaxWidth, 1) +
      rolePenalty(stroke.centerX >= innerLeftCenterXMin, 1) +
      rolePenalty(stroke.centerX <= innerLeftCenterXMax, 1) +
      rolePenalty(stroke.centerY >= innerLeftCenterYMin, 1) +
      rolePenalty(stroke.centerY <= innerLeftCenterYMax, 1)
    );
  }

  function scoreInnerWrappingCandidate(stroke) {
    return (
      Math.abs(stroke.centerX - 0.58) +
      Math.abs(stroke.centerY - 0.45) +
      rolePenalty(stroke.width >= innerWrappingMinWidth, 1.5) +
      rolePenalty(stroke.height >= innerWrappingMinHeight, 1.5) +
      rolePenalty(stroke.centerX >= innerWrappingCenterXMin, 1) +
      rolePenalty(stroke.centerX <= innerWrappingCenterXMax, 1) +
      rolePenalty(stroke.centerY >= innerWrappingCenterYMin, 1) +
      rolePenalty(stroke.centerY <= innerWrappingCenterYMax, 1) +
      rolePenalty(stroke.straightness <= innerWrappingMaxStraightness, 1.5)
    );
  }

  function scoreInnerBottomCandidate(stroke) {
    return (
      Math.abs(stroke.centerY - 0.62) * 2 +
      rolePenalty(isHorizontalish(stroke), 2) +
      rolePenalty(stroke.width >= innerBottomMinWidth, 1.5) +
      rolePenalty(stroke.height <= innerBottomMaxHeight, 1) +
      rolePenalty(stroke.centerY >= innerBottomCenterYMin, 1) +
      rolePenalty(stroke.centerY <= innerBottomCenterYMax, 1) +
      rolePenalty(stroke.deltaY >= innerBottomDeltaYMin, 1)
    );
  }

  let bestRoleAssignment = null;
  let bestRoleAssignmentScore = Infinity;

  for (const outerLeftCandidate of perStroke) {
    for (const outerWrappingCandidate of perStroke) {
      if (outerWrappingCandidate === outerLeftCandidate) {
        continue;
      }

      for (const outerBottomCandidate of perStroke) {
        if (
          outerBottomCandidate === outerLeftCandidate ||
          outerBottomCandidate === outerWrappingCandidate
        ) {
          continue;
        }

        for (const innerLeftCandidate of perStroke) {
          if (
            innerLeftCandidate === outerLeftCandidate ||
            innerLeftCandidate === outerWrappingCandidate ||
            innerLeftCandidate === outerBottomCandidate
          ) {
            continue;
          }

          for (const innerWrappingCandidate of perStroke) {
            if (
              innerWrappingCandidate === outerLeftCandidate ||
              innerWrappingCandidate === outerWrappingCandidate ||
              innerWrappingCandidate === outerBottomCandidate ||
              innerWrappingCandidate === innerLeftCandidate
            ) {
              continue;
            }

            for (const innerBottomCandidate of perStroke) {
              if (
                innerBottomCandidate === outerLeftCandidate ||
                innerBottomCandidate === outerWrappingCandidate ||
                innerBottomCandidate === outerBottomCandidate ||
                innerBottomCandidate === innerLeftCandidate ||
                innerBottomCandidate === innerWrappingCandidate
              ) {
                continue;
              }

              const outerBottomOrderPenalty =
                outerBottomCandidate.centerY > outerLeftCandidate.centerY
                  ? 0
                  : 2;

              const innerBottomOrderPenalty =
                innerBottomCandidate.centerY > innerLeftCandidate.centerY
                  ? 0
                  : 2;

              const innerInsidePenalty =
                innerLeftCandidate.centerX > outerLeftCandidate.centerX &&
                innerWrappingCandidate.maxX < outerWrappingCandidate.maxX &&
                innerBottomCandidate.centerY < outerBottomCandidate.centerY
                  ? 0
                  : 4;

              const score =
                scoreOuterLeftCandidate(outerLeftCandidate) +
                scoreOuterWrappingCandidate(outerWrappingCandidate) +
                scoreOuterBottomCandidate(outerBottomCandidate) +
                scoreInnerLeftCandidate(innerLeftCandidate) +
                scoreInnerWrappingCandidate(innerWrappingCandidate) +
                scoreInnerBottomCandidate(innerBottomCandidate) +
                outerBottomOrderPenalty +
                innerBottomOrderPenalty +
                innerInsidePenalty;

              if (score < bestRoleAssignmentScore) {
                bestRoleAssignmentScore = score;
                bestRoleAssignment = {
                  outerLeftStroke: outerLeftCandidate,
                  outerWrappingStroke: outerWrappingCandidate,
                  outerBottomStroke: outerBottomCandidate,
                  innerLeftStroke: innerLeftCandidate,
                  innerWrappingStroke: innerWrappingCandidate,
                  innerBottomStroke: innerBottomCandidate,
                };
              }
            }
          }
        }
      }
    }
  }

  const outerLeftStroke = bestRoleAssignment?.outerLeftStroke ?? null;
  const outerWrappingStroke = bestRoleAssignment?.outerWrappingStroke ?? null;
  const outerBottomStroke = bestRoleAssignment?.outerBottomStroke ?? null;
  const innerLeftStroke = bestRoleAssignment?.innerLeftStroke ?? null;
  const innerWrappingStroke = bestRoleAssignment?.innerWrappingStroke ?? null;
  const innerBottomStroke = bestRoleAssignment?.innerBottomStroke ?? null;

  const outerBoxMinX = Math.min(...perStroke.map((stroke) => stroke.minX));
  const outerBoxMaxX = Math.max(...perStroke.map((stroke) => stroke.maxX));
  const outerBoxMinY = Math.min(...perStroke.map((stroke) => stroke.minY));
  const outerBoxMaxY = Math.max(...perStroke.map((stroke) => stroke.maxY));

  const outerBoxHorizontalCoverage = outerBoxMaxX - outerBoxMinX;
  const outerBoxVerticalCoverage = outerBoxMaxY - outerBoxMinY;

  const innerStrokes = [
    innerLeftStroke,
    innerWrappingStroke,
    innerBottomStroke,
  ].filter(Boolean);

  const innerBoxMinX =
    innerStrokes.length > 0
      ? Math.min(...innerStrokes.map((stroke) => stroke.minX))
      : 0;

  const innerBoxMaxX =
    innerStrokes.length > 0
      ? Math.max(...innerStrokes.map((stroke) => stroke.maxX))
      : 0;

  const innerBoxMinY =
    innerStrokes.length > 0
      ? Math.min(...innerStrokes.map((stroke) => stroke.minY))
      : 0;

  const innerBoxMaxY =
    innerStrokes.length > 0
      ? Math.max(...innerStrokes.map((stroke) => stroke.maxY))
      : 0;

  const innerBoxHorizontalCoverage = innerBoxMaxX - innerBoxMinX;
  const innerBoxVerticalCoverage = innerBoxMaxY - innerBoxMinY;

  const checks = {
    strokeCount: features.strokeCountUser === expectedStrokeCount,
    referenceStrokeCount: features.strokeCountRef === expectedStrokeCount,

    bboxWidth: geometry.bboxWidth >= minBboxWidth,
    bboxHeight: geometry.bboxHeight >= minBboxHeight,
    aspectRatio:
      geometry.aspectRatio >= aspectRatioMin &&
      geometry.aspectRatio <= aspectRatioMax,

    hasOuterLeftStroke: Boolean(outerLeftStroke),
    hasOuterWrappingStroke: Boolean(outerWrappingStroke),
    hasOuterBottomStroke: Boolean(outerBottomStroke),
    hasInnerLeftStroke: Boolean(innerLeftStroke),
    hasInnerWrappingStroke: Boolean(innerWrappingStroke),
    hasInnerBottomStroke: Boolean(innerBottomStroke),

    outerLeftIsLeft:
      Boolean(outerLeftStroke) &&
      outerLeftStroke.centerX <= outerLeftCenterXMax &&
      outerLeftStroke.minX <= outerLeftMinXMax,

    outerLeftIsVerticalish:
      Boolean(outerLeftStroke) && isVerticalish(outerLeftStroke),

    outerLeftHasHeight:
      Boolean(outerLeftStroke) && outerLeftStroke.height >= outerLeftMinHeight,

    outerWrappingHasWidth:
      Boolean(outerWrappingStroke) &&
      outerWrappingStroke.width >= outerWrappingMinWidth,

    outerWrappingHasHeight:
      Boolean(outerWrappingStroke) &&
      outerWrappingStroke.height >= outerWrappingMinHeight,

    outerWrappingStartsNearTop:
      Boolean(outerWrappingStroke) &&
      outerWrappingStroke.minY <= outerWrappingMinYMax,

    outerWrappingExtendsRight:
      Boolean(outerWrappingStroke) &&
      outerWrappingStroke.maxX >= outerWrappingMaxXMin,

    outerWrappingExtendsDown:
      Boolean(outerWrappingStroke) &&
      outerWrappingStroke.maxY >= outerWrappingMaxYMin,

    outerWrappingHasCorner:
      Boolean(outerWrappingStroke) &&
      outerWrappingStroke.straightness <= outerWrappingMaxStraightness,

    outerBottomIsLower:
      Boolean(outerBottomStroke) &&
      outerBottomStroke.centerY >= outerBottomCenterYMin,

    outerBottomIsHorizontalish:
      Boolean(outerBottomStroke) && isHorizontalish(outerBottomStroke),

    outerBottomHasWidth:
      Boolean(outerBottomStroke) &&
      outerBottomStroke.width >= outerBottomMinWidth,

    outerBottomReachesBottom:
      Boolean(outerBottomStroke) &&
      outerBottomStroke.maxY >= outerBottomMaxYMin,

    outerBottomNotStronglyUpward:
      Boolean(outerBottomStroke) &&
      outerBottomStroke.deltaY >= outerBottomDeltaYMin,

    innerLeftIsVerticalish:
      Boolean(innerLeftStroke) && isVerticalish(innerLeftStroke),

    innerLeftHasHeight:
      Boolean(innerLeftStroke) && innerLeftStroke.height >= innerLeftMinHeight,

    innerLeftIsThin:
      Boolean(innerLeftStroke) && innerLeftStroke.width <= innerLeftMaxWidth,

    innerLeftXInRange:
      Boolean(innerLeftStroke) &&
      innerLeftStroke.centerX >= innerLeftCenterXMin &&
      innerLeftStroke.centerX <= innerLeftCenterXMax,

    innerLeftYInRange:
      Boolean(innerLeftStroke) &&
      innerLeftStroke.centerY >= innerLeftCenterYMin &&
      innerLeftStroke.centerY <= innerLeftCenterYMax,

    innerWrappingHasWidth:
      Boolean(innerWrappingStroke) &&
      innerWrappingStroke.width >= innerWrappingMinWidth,

    innerWrappingHasHeight:
      Boolean(innerWrappingStroke) &&
      innerWrappingStroke.height >= innerWrappingMinHeight,

    innerWrappingXInRange:
      Boolean(innerWrappingStroke) &&
      innerWrappingStroke.centerX >= innerWrappingCenterXMin &&
      innerWrappingStroke.centerX <= innerWrappingCenterXMax,

    innerWrappingYInRange:
      Boolean(innerWrappingStroke) &&
      innerWrappingStroke.centerY >= innerWrappingCenterYMin &&
      innerWrappingStroke.centerY <= innerWrappingCenterYMax,

    innerWrappingHasCorner:
      Boolean(innerWrappingStroke) &&
      innerWrappingStroke.straightness <= innerWrappingMaxStraightness,

    innerBottomIsHorizontalish:
      Boolean(innerBottomStroke) && isHorizontalish(innerBottomStroke),

    innerBottomHasWidth:
      Boolean(innerBottomStroke) &&
      innerBottomStroke.width >= innerBottomMinWidth,

    innerBottomIsThin:
      Boolean(innerBottomStroke) &&
      innerBottomStroke.height <= innerBottomMaxHeight,

    innerBottomYInRange:
      Boolean(innerBottomStroke) &&
      innerBottomStroke.centerY >= innerBottomCenterYMin &&
      innerBottomStroke.centerY <= innerBottomCenterYMax,

    innerBottomNotStronglyUpward:
      Boolean(innerBottomStroke) &&
      innerBottomStroke.deltaY >= innerBottomDeltaYMin,

    innerBoxHasHorizontalCoverage:
      innerBoxHorizontalCoverage >= minInnerBoxHorizontalCoverage,

    innerBoxHasVerticalCoverage:
      innerBoxVerticalCoverage >= minInnerBoxVerticalCoverage,

    innerBoxInsideOuterBox:
      Boolean(innerLeftStroke) &&
      Boolean(innerWrappingStroke) &&
      Boolean(innerBottomStroke) &&
      Boolean(outerLeftStroke) &&
      Boolean(outerWrappingStroke) &&
      Boolean(outerBottomStroke) &&
      innerBoxMinX >= outerBoxMinX + minOuterInnerLeftGap &&
      innerBoxMinY >= outerBoxMinY + minOuterInnerTopGap &&
      innerBoxMaxX <= outerBoxMaxX - minInnerOuterRightGap &&
      innerBoxMaxY <= outerBoxMaxY - minInnerOuterBottomGap,

    innerBottomBelowInnerLeft:
      Boolean(innerBottomStroke) &&
      Boolean(innerLeftStroke) &&
      innerBottomStroke.centerY > innerLeftStroke.centerY,

    outerBottomBelowOuterLeft:
      Boolean(outerBottomStroke) &&
      Boolean(outerLeftStroke) &&
      outerBottomStroke.centerY > outerLeftStroke.centerY,

    outerRightOfOuterLeft:
      Boolean(outerWrappingStroke) &&
      Boolean(outerLeftStroke) &&
      outerWrappingStroke.maxX > outerLeftStroke.centerX,

    outerBoxHasHorizontalCoverage:
      outerBoxHorizontalCoverage >= minBoxHorizontalCoverage,

    outerBoxHasVerticalCoverage:
      outerBoxVerticalCoverage >= minBoxVerticalCoverage,

    straightnessMean: geometry.straightnessMean >= minStraightnessMean,

    // Checks blandos de cierre aproximado.
    outerLeftTouchesTopHalf:
      Boolean(outerLeftStroke) && outerLeftStroke.minY <= 0.35,

    outerLeftTouchesBottomHalf:
      Boolean(outerLeftStroke) && outerLeftStroke.maxY >= 0.55,

    outerBottomTouchesLeftHalf:
      Boolean(outerBottomStroke) && outerBottomStroke.minX <= 0.45,

    outerBottomTouchesRightHalf:
      Boolean(outerBottomStroke) && outerBottomStroke.maxX >= 0.55,

    innerLeftTouchesTopHalf:
      Boolean(innerLeftStroke) && innerLeftStroke.minY <= 0.65,

    innerBottomTouchesLeftHalf:
      Boolean(innerBottomStroke) && innerBottomStroke.minX <= 0.65,

    innerBottomTouchesRightHalf:
      Boolean(innerBottomStroke) && innerBottomStroke.maxX >= 0.35,
  };

  const hardCheckNames = [
    "strokeCount",
    "referenceStrokeCount",

    "bboxWidth",
    "bboxHeight",
    "aspectRatio",

    "hasOuterLeftStroke",
    "hasOuterWrappingStroke",
    "hasOuterBottomStroke",
    "hasInnerLeftStroke",
    "hasInnerWrappingStroke",
    "hasInnerBottomStroke",

    "outerLeftIsLeft",
    "outerLeftIsVerticalish",
    "outerLeftHasHeight",

    "outerWrappingHasWidth",
    "outerWrappingHasHeight",
    "outerWrappingStartsNearTop",
    "outerWrappingExtendsRight",
    "outerWrappingExtendsDown",
    "outerWrappingHasCorner",

    "outerBottomIsLower",
    "outerBottomIsHorizontalish",
    "outerBottomHasWidth",
    "outerBottomReachesBottom",
    "outerBottomNotStronglyUpward",

    "innerLeftHasHeight",
    "innerLeftIsThin",
    "innerLeftXInRange",
    "innerLeftYInRange",

    "innerWrappingHasWidth",
    "innerWrappingHasHeight",
    "innerWrappingXInRange",
    "innerWrappingYInRange",
    "innerWrappingHasCorner",

    "innerBottomIsHorizontalish",
    "innerBottomHasWidth",
    "innerBottomIsThin",
    "innerBottomYInRange",
    "innerBottomNotStronglyUpward",

    "innerBoxHasHorizontalCoverage",
    "innerBoxHasVerticalCoverage",
    "innerBoxInsideOuterBox",

    //"innerBottomBelowInnerLeft",
    "outerBottomBelowOuterLeft",
    "outerRightOfOuterLeft",

    "outerBoxHasHorizontalCoverage",
    "outerBoxHasVerticalCoverage",
  ];

  const softCheckNames = [
    "straightnessMean",
    "outerLeftTouchesTopHalf",
    "outerLeftTouchesBottomHalf",
    "outerBottomTouchesLeftHalf",
    "outerBottomTouchesRightHalf",
    "innerLeftTouchesTopHalf",
    "innerBottomTouchesLeftHalf",
    "innerBottomTouchesRightHalf",
    "innerBottomBelowInnerLeft",
    "innerLeftIsVerticalish",
  ];

  const hardFailedChecks = hardCheckNames.filter(
    (checkName) => checks[checkName] === false,
  );

  const softFailedChecks = softCheckNames.filter(
    (checkName) => checks[checkName] === false,
  );

  const failedChecks = [...hardFailedChecks, ...softFailedChecks];

  const totalChecks = Object.keys(checks).length || 1;
  const passedChecks = Object.values(checks).filter(Boolean).length;
  const descriptorMatchScore = passedChecks / totalChecks;

  const isCorrect =
    hardFailedChecks.length === 0 && softFailedChecks.length <= maxSoftFailures;

  const hasHardFailure = hardFailedChecks.length > 0;

  return {
    isCorrect,
    score: isCorrect ? 0.5 : hasHardFailure ? 10 : 0.75,
    strategy: "descriptor_nested_box_pattern",
    pattern: descriptor.pattern,
    kanji,

    checks,
    failedChecks,
    hardFailedChecks,
    softFailedChecks,
    descriptorMatchScore,

    descriptor,

    details: {
      outerLeftStroke,
      outerWrappingStroke,
      outerBottomStroke,
      innerLeftStroke,
      innerWrappingStroke,
      innerBottomStroke,
      allStrokes: perStroke,
      outerBoxHorizontalCoverage,
      outerBoxVerticalCoverage,
      innerBoxHorizontalCoverage,
      innerBoxVerticalCoverage,
      innerBoxMinX,
      innerBoxMaxX,
      innerBoxMinY,
      innerBoxMaxY,
      roleAssignmentScore: bestRoleAssignmentScore,
    },

    thresholds: {
      expectedStrokeCount,

      minBboxWidth,
      minBboxHeight,
      aspectRatioMin,
      aspectRatioMax,

      minVerticalAngleAbs,
      minHorizontalAngleMax,
      minHeightVsWidthRatio,
      minWidthVsHeightRatio,

      outerLeftCenterXMax,
      outerLeftMinXMax,
      outerLeftMinHeight,

      outerWrappingMinWidth,
      outerWrappingMinHeight,
      outerWrappingMinYMax,
      outerWrappingMaxXMin,
      outerWrappingMaxYMin,
      outerWrappingMaxStraightness,

      outerBottomCenterYMin,
      outerBottomMinWidth,
      outerBottomMaxYMin,
      outerBottomDeltaYMin,

      innerLeftCenterXMin,
      innerLeftCenterXMax,
      innerLeftCenterYMin,
      innerLeftCenterYMax,
      innerLeftMinHeight,
      innerLeftMaxWidth,

      innerWrappingCenterXMin,
      innerWrappingCenterXMax,
      innerWrappingCenterYMin,
      innerWrappingCenterYMax,
      innerWrappingMinWidth,
      innerWrappingMinHeight,
      innerWrappingMaxStraightness,

      innerBottomCenterYMin,
      innerBottomCenterYMax,
      innerBottomMinWidth,
      innerBottomMaxHeight,
      innerBottomDeltaYMin,

      minInnerBoxHorizontalCoverage,
      minInnerBoxVerticalCoverage,
      minOuterInnerLeftGap,
      minOuterInnerTopGap,
      minInnerOuterRightGap,
      minInnerOuterBottomGap,

      minBoxHorizontalCoverage,
      minBoxVerticalCoverage,

      minStraightnessMean,
      maxSoftFailures,
    },
  };
}

function validateOpenBoxWithInnerVerticalAndHorizontals({
  kanji,
  features,
  descriptor,
}) {
  const geometry = features.geometry;

  if (!geometry) {
    return {
      isCorrect: false,
      score: 10,
      strategy: "descriptor_open_box_with_inner_vertical_and_horizontals",
      reason: "missing_geometry_features",
      pattern: descriptor.pattern,
    };
  }

  const perStroke = geometry.perStroke ?? [];
  const rules = descriptor.rules ?? {};
  const expectedStrokeCount = descriptor.expectedStrokeCount ?? 5;

  if (perStroke.length !== expectedStrokeCount) {
    const checks = {
      strokeCount: features.strokeCountUser === expectedStrokeCount,
      referenceStrokeCount: features.strokeCountRef === expectedStrokeCount,
    };

    const hardFailedChecks = Object.entries(checks)
      .filter(([, value]) => value === false)
      .map(([checkName]) => checkName);

    return {
      isCorrect: false,
      score: 10,
      strategy: "descriptor_open_box_with_inner_vertical_and_horizontals",
      reason: "invalid_stroke_count",
      pattern: descriptor.pattern,
      checks,
      failedChecks: hardFailedChecks,
      hardFailedChecks,
      softFailedChecks: [],
      thresholds: {
        expectedStrokeCount,
      },
    };
  }

  const minBboxWidth = rules.minBboxWidth ?? 0.45;
  const minBboxHeight = rules.minBboxHeight ?? 0.55;
  const aspectRatioMin = rules.aspectRatioMin ?? 0.45;
  const aspectRatioMax = rules.aspectRatioMax ?? 1.9;

  const minVerticalAngleAbs = rules.minVerticalAngleAbs ?? 0.8;
  const minHorizontalAngleMax = rules.minHorizontalAngleMax ?? 0.65;
  const minHeightVsWidthRatio = rules.minHeightVsWidthRatio ?? 1.2;
  const minWidthVsHeightRatio = rules.minWidthVsHeightRatio ?? 1.2;

  const leftStrokeCenterXMax = rules.leftStrokeCenterXMax ?? 0.42;
  const leftStrokeMinXMax = rules.leftStrokeMinXMax ?? 0.3;
  const leftStrokeMinHeight = rules.leftStrokeMinHeight ?? 0.45;

  const outerWrappingMinWidth = rules.outerWrappingMinWidth ?? 0.35;
  const outerWrappingMinHeight = rules.outerWrappingMinHeight ?? 0.45;
  const outerWrappingMinYMax = rules.outerWrappingMinYMax ?? 0.35;
  const outerWrappingMaxXMin = rules.outerWrappingMaxXMin ?? 0.5;
  const outerWrappingMaxYMin = rules.outerWrappingMaxYMin ?? 0.55;
  const outerWrappingMaxStraightness =
    rules.outerWrappingMaxStraightness ?? 0.94;

  const innerVerticalCenterXMin = rules.innerVerticalCenterXMin ?? 0.25;
  const innerVerticalCenterXMax = rules.innerVerticalCenterXMax ?? 0.72;
  const innerVerticalMinHeight = rules.innerVerticalMinHeight ?? 0.35;
  const innerVerticalMaxWidth = rules.innerVerticalMaxWidth ?? 0.32;

  const upperInnerCenterYMin = rules.upperInnerCenterYMin ?? 0.25;
  const upperInnerCenterYMax = rules.upperInnerCenterYMax ?? 0.58;
  const upperInnerMinWidth = rules.upperInnerMinWidth ?? 0.18;
  const upperInnerMaxHeight = rules.upperInnerMaxHeight ?? 0.3;
  const upperInnerDeltaYMin = rules.upperInnerDeltaYMin ?? -0.22;

  const lowerInnerCenterYMin = rules.lowerInnerCenterYMin ?? 0.45;
  const lowerInnerCenterYMax = rules.lowerInnerCenterYMax ?? 0.82;
  const lowerInnerMinWidth = rules.lowerInnerMinWidth ?? 0.18;
  const lowerInnerMaxHeight = rules.lowerInnerMaxHeight ?? 0.3;
  const lowerInnerDeltaYMin = rules.lowerInnerDeltaYMin ?? -0.22;

  const minUpperLowerGap = rules.minUpperLowerGap ?? 0.06;
  const minLowerOuterBottomGap = rules.minLowerOuterBottomGap ?? 0.06;

  const minBoxHorizontalCoverage = rules.minBoxHorizontalCoverage ?? 0.44;
  const minBoxVerticalCoverage = rules.minBoxVerticalCoverage ?? 0.55;

  const minStraightnessMean = rules.minStraightnessMean ?? 0.5;
  const maxSoftFailures = rules.maxSoftFailures ?? 4;

  const isVerticalish = (stroke) => {
    const heightDominates =
      stroke.height >= stroke.width * minHeightVsWidthRatio;

    const angleLooksVertical = stroke.angleAbs >= minVerticalAngleAbs;

    return heightDominates || angleLooksVertical;
  };

  const isHorizontalish = (stroke) => {
    const widthDominates =
      stroke.width >= stroke.height * minWidthVsHeightRatio;

    const angleLooksHorizontal = stroke.angleAbs <= minHorizontalAngleMax;

    return widthDominates || angleLooksHorizontal;
  };

  function rolePenalty(condition, penalty = 1) {
    return condition ? 0 : penalty;
  }

  function scoreLeftStrokeCandidate(stroke) {
    return (
      Math.abs(stroke.centerX - 0.12) * 2 +
      stroke.minX * 2 +
      rolePenalty(isVerticalish(stroke), 2) +
      rolePenalty(stroke.height >= leftStrokeMinHeight, 1.5) +
      rolePenalty(stroke.centerX <= leftStrokeCenterXMax, 1) +
      rolePenalty(stroke.minX <= leftStrokeMinXMax, 1)
    );
  }

  function scoreOuterWrappingCandidate(stroke) {
    return (
      Math.abs(stroke.maxX - 1.0) * 2 +
      stroke.minY +
      rolePenalty(stroke.width >= outerWrappingMinWidth, 1.5) +
      rolePenalty(stroke.height >= outerWrappingMinHeight, 1.5) +
      rolePenalty(stroke.minY <= outerWrappingMinYMax, 1) +
      rolePenalty(stroke.maxX >= outerWrappingMaxXMin, 1) +
      rolePenalty(stroke.maxY >= outerWrappingMaxYMin, 1) +
      rolePenalty(stroke.straightness <= outerWrappingMaxStraightness, 2)
    );
  }

  function scoreInnerVerticalCandidate(stroke) {
    return (
      Math.abs(stroke.centerX - 0.48) * 2 +
      rolePenalty(isVerticalish(stroke), 2) +
      rolePenalty(stroke.height >= innerVerticalMinHeight, 1.5) +
      rolePenalty(stroke.width <= innerVerticalMaxWidth, 1) +
      rolePenalty(stroke.centerX >= innerVerticalCenterXMin, 1) +
      rolePenalty(stroke.centerX <= innerVerticalCenterXMax, 1)
    );
  }

  function scoreUpperInnerCandidate(stroke) {
    return (
      Math.abs(stroke.centerY - 0.42) * 2 +
      rolePenalty(isHorizontalish(stroke), 2) +
      rolePenalty(stroke.width >= upperInnerMinWidth, 1.5) +
      rolePenalty(stroke.height <= upperInnerMaxHeight, 1) +
      rolePenalty(stroke.centerY >= upperInnerCenterYMin, 1) +
      rolePenalty(stroke.centerY <= upperInnerCenterYMax, 1) +
      rolePenalty(stroke.deltaY >= upperInnerDeltaYMin, 1)
    );
  }

  function scoreLowerInnerCandidate(stroke) {
    return (
      Math.abs(stroke.centerY - 0.64) * 2 +
      rolePenalty(isHorizontalish(stroke), 2) +
      rolePenalty(stroke.width >= lowerInnerMinWidth, 1.5) +
      rolePenalty(stroke.height <= lowerInnerMaxHeight, 1) +
      rolePenalty(stroke.centerY >= lowerInnerCenterYMin, 1) +
      rolePenalty(stroke.centerY <= lowerInnerCenterYMax, 1) +
      rolePenalty(stroke.deltaY >= lowerInnerDeltaYMin, 1)
    );
  }

  let bestRoleAssignment = null;
  let bestRoleAssignmentScore = Infinity;

  for (const leftCandidate of perStroke) {
    for (const outerWrappingCandidate of perStroke) {
      if (outerWrappingCandidate === leftCandidate) {
        continue;
      }

      for (const innerVerticalCandidate of perStroke) {
        if (
          innerVerticalCandidate === leftCandidate ||
          innerVerticalCandidate === outerWrappingCandidate
        ) {
          continue;
        }

        for (const upperInnerCandidate of perStroke) {
          if (
            upperInnerCandidate === leftCandidate ||
            upperInnerCandidate === outerWrappingCandidate ||
            upperInnerCandidate === innerVerticalCandidate
          ) {
            continue;
          }

          for (const lowerInnerCandidate of perStroke) {
            if (
              lowerInnerCandidate === leftCandidate ||
              lowerInnerCandidate === outerWrappingCandidate ||
              lowerInnerCandidate === innerVerticalCandidate ||
              lowerInnerCandidate === upperInnerCandidate
            ) {
              continue;
            }

            const upperLowerOrderPenalty =
              upperInnerCandidate.centerY < lowerInnerCandidate.centerY ? 0 : 3;

            const lowerInsideOuterPenalty =
              lowerInnerCandidate.centerY <
              outerWrappingCandidate.maxY - minLowerOuterBottomGap
                ? 0
                : 3;

            const innerVerticalInsidePenalty =
              innerVerticalCandidate.minY >= outerWrappingCandidate.minY &&
              innerVerticalCandidate.maxY <= outerWrappingCandidate.maxY + 0.08
                ? 0
                : 2;

            const score =
              scoreLeftStrokeCandidate(leftCandidate) +
              scoreOuterWrappingCandidate(outerWrappingCandidate) +
              scoreInnerVerticalCandidate(innerVerticalCandidate) +
              scoreUpperInnerCandidate(upperInnerCandidate) +
              scoreLowerInnerCandidate(lowerInnerCandidate) +
              upperLowerOrderPenalty +
              lowerInsideOuterPenalty +
              innerVerticalInsidePenalty;

            if (score < bestRoleAssignmentScore) {
              bestRoleAssignmentScore = score;
              bestRoleAssignment = {
                leftStroke: leftCandidate,
                outerWrappingStroke: outerWrappingCandidate,
                innerVerticalStroke: innerVerticalCandidate,
                upperInnerHorizontalStroke: upperInnerCandidate,
                lowerInnerHorizontalStroke: lowerInnerCandidate,
              };
            }
          }
        }
      }
    }
  }

  const leftStroke = bestRoleAssignment?.leftStroke ?? null;
  const outerWrappingStroke = bestRoleAssignment?.outerWrappingStroke ?? null;
  const innerVerticalStroke = bestRoleAssignment?.innerVerticalStroke ?? null;
  const upperInnerHorizontalStroke =
    bestRoleAssignment?.upperInnerHorizontalStroke ?? null;
  const lowerInnerHorizontalStroke =
    bestRoleAssignment?.lowerInnerHorizontalStroke ?? null;

  const boxMinX = Math.min(...perStroke.map((stroke) => stroke.minX));
  const boxMaxX = Math.max(...perStroke.map((stroke) => stroke.maxX));
  const boxMinY = Math.min(...perStroke.map((stroke) => stroke.minY));
  const boxMaxY = Math.max(...perStroke.map((stroke) => stroke.maxY));

  const boxHorizontalCoverage = boxMaxX - boxMinX;
  const boxVerticalCoverage = boxMaxY - boxMinY;

  const upperLowerGap =
    upperInnerHorizontalStroke && lowerInnerHorizontalStroke
      ? lowerInnerHorizontalStroke.centerY - upperInnerHorizontalStroke.centerY
      : 0;

  const lowerOuterBottomGap =
    lowerInnerHorizontalStroke && outerWrappingStroke
      ? outerWrappingStroke.maxY - lowerInnerHorizontalStroke.centerY
      : 0;

  const checks = {
    strokeCount: features.strokeCountUser === expectedStrokeCount,
    referenceStrokeCount: features.strokeCountRef === expectedStrokeCount,

    bboxWidth: geometry.bboxWidth >= minBboxWidth,
    bboxHeight: geometry.bboxHeight >= minBboxHeight,
    aspectRatio:
      geometry.aspectRatio >= aspectRatioMin &&
      geometry.aspectRatio <= aspectRatioMax,

    hasLeftStroke: Boolean(leftStroke),
    hasOuterWrappingStroke: Boolean(outerWrappingStroke),
    hasInnerVerticalStroke: Boolean(innerVerticalStroke),
    hasUpperInnerHorizontalStroke: Boolean(upperInnerHorizontalStroke),
    hasLowerInnerHorizontalStroke: Boolean(lowerInnerHorizontalStroke),

    leftStrokeIsLeft:
      Boolean(leftStroke) &&
      leftStroke.centerX <= leftStrokeCenterXMax &&
      leftStroke.minX <= leftStrokeMinXMax,

    leftStrokeIsVerticalish: Boolean(leftStroke) && isVerticalish(leftStroke),

    leftStrokeHasHeight:
      Boolean(leftStroke) && leftStroke.height >= leftStrokeMinHeight,

    outerWrappingHasWidth:
      Boolean(outerWrappingStroke) &&
      outerWrappingStroke.width >= outerWrappingMinWidth,

    outerWrappingHasHeight:
      Boolean(outerWrappingStroke) &&
      outerWrappingStroke.height >= outerWrappingMinHeight,

    outerWrappingStartsNearTop:
      Boolean(outerWrappingStroke) &&
      outerWrappingStroke.minY <= outerWrappingMinYMax,

    outerWrappingExtendsRight:
      Boolean(outerWrappingStroke) &&
      outerWrappingStroke.maxX >= outerWrappingMaxXMin,

    outerWrappingExtendsDown:
      Boolean(outerWrappingStroke) &&
      outerWrappingStroke.maxY >= outerWrappingMaxYMin,

    outerWrappingHasCorner:
      Boolean(outerWrappingStroke) &&
      outerWrappingStroke.straightness <= outerWrappingMaxStraightness,

    innerVerticalIsVerticalish:
      Boolean(innerVerticalStroke) && isVerticalish(innerVerticalStroke),

    innerVerticalHasHeight:
      Boolean(innerVerticalStroke) &&
      innerVerticalStroke.height >= innerVerticalMinHeight,

    innerVerticalIsThin:
      Boolean(innerVerticalStroke) &&
      innerVerticalStroke.width <= innerVerticalMaxWidth,

    innerVerticalXInRange:
      Boolean(innerVerticalStroke) &&
      innerVerticalStroke.centerX >= innerVerticalCenterXMin &&
      innerVerticalStroke.centerX <= innerVerticalCenterXMax,

    upperInnerIsHorizontalish:
      Boolean(upperInnerHorizontalStroke) &&
      isHorizontalish(upperInnerHorizontalStroke),

    upperInnerHasWidth:
      Boolean(upperInnerHorizontalStroke) &&
      upperInnerHorizontalStroke.width >= upperInnerMinWidth,

    upperInnerIsThin:
      Boolean(upperInnerHorizontalStroke) &&
      upperInnerHorizontalStroke.height <= upperInnerMaxHeight,

    upperInnerYInRange:
      Boolean(upperInnerHorizontalStroke) &&
      upperInnerHorizontalStroke.centerY >= upperInnerCenterYMin &&
      upperInnerHorizontalStroke.centerY <= upperInnerCenterYMax,

    upperInnerNotStronglyUpward:
      Boolean(upperInnerHorizontalStroke) &&
      upperInnerHorizontalStroke.deltaY >= upperInnerDeltaYMin,

    lowerInnerIsHorizontalish:
      Boolean(lowerInnerHorizontalStroke) &&
      isHorizontalish(lowerInnerHorizontalStroke),

    lowerInnerHasWidth:
      Boolean(lowerInnerHorizontalStroke) &&
      lowerInnerHorizontalStroke.width >= lowerInnerMinWidth,

    lowerInnerIsThin:
      Boolean(lowerInnerHorizontalStroke) &&
      lowerInnerHorizontalStroke.height <= lowerInnerMaxHeight,

    lowerInnerYInRange:
      Boolean(lowerInnerHorizontalStroke) &&
      lowerInnerHorizontalStroke.centerY >= lowerInnerCenterYMin &&
      lowerInnerHorizontalStroke.centerY <= lowerInnerCenterYMax,

    lowerInnerNotStronglyUpward:
      Boolean(lowerInnerHorizontalStroke) &&
      lowerInnerHorizontalStroke.deltaY >= lowerInnerDeltaYMin,

    upperAboveLower:
      Boolean(upperInnerHorizontalStroke) &&
      Boolean(lowerInnerHorizontalStroke) &&
      upperLowerGap >= minUpperLowerGap,

    lowerAboveOuterBottom:
      Boolean(lowerInnerHorizontalStroke) &&
      Boolean(outerWrappingStroke) &&
      lowerOuterBottomGap >= minLowerOuterBottomGap,

    innerVerticalInsideOuter:
      Boolean(innerVerticalStroke) &&
      Boolean(outerWrappingStroke) &&
      innerVerticalStroke.minY >= outerWrappingStroke.minY &&
      innerVerticalStroke.maxY <= outerWrappingStroke.maxY + 0.08,

    upperInsideOuterX:
      Boolean(upperInnerHorizontalStroke) &&
      Boolean(leftStroke) &&
      Boolean(outerWrappingStroke) &&
      upperInnerHorizontalStroke.maxX > leftStroke.centerX &&
      upperInnerHorizontalStroke.minX < outerWrappingStroke.maxX,

    lowerInsideOuterX:
      Boolean(lowerInnerHorizontalStroke) &&
      Boolean(leftStroke) &&
      Boolean(outerWrappingStroke) &&
      lowerInnerHorizontalStroke.maxX > leftStroke.centerX &&
      lowerInnerHorizontalStroke.minX < outerWrappingStroke.maxX,

    outerRightOfLeft:
      Boolean(outerWrappingStroke) &&
      Boolean(leftStroke) &&
      outerWrappingStroke.maxX > leftStroke.centerX,

    boxHasHorizontalCoverage: boxHorizontalCoverage >= minBoxHorizontalCoverage,

    boxHasVerticalCoverage: boxVerticalCoverage >= minBoxVerticalCoverage,

    straightnessMean: geometry.straightnessMean >= minStraightnessMean,

    // Checks blandos.
    leftTouchesTopHalf: Boolean(leftStroke) && leftStroke.minY <= 0.35,

    leftTouchesBottomHalf: Boolean(leftStroke) && leftStroke.maxY >= 0.55,

    upperTouchesRightHalf:
      Boolean(upperInnerHorizontalStroke) &&
      upperInnerHorizontalStroke.maxX >= 0.5,

    lowerTouchesRightHalf:
      Boolean(lowerInnerHorizontalStroke) &&
      lowerInnerHorizontalStroke.maxX >= 0.5,

    innerVerticalTouchesBottomHalf:
      Boolean(innerVerticalStroke) && innerVerticalStroke.maxY >= 0.5,
  };

  const hardCheckNames = [
    "strokeCount",
    "referenceStrokeCount",

    "bboxWidth",
    "bboxHeight",
    "aspectRatio",

    "hasLeftStroke",
    "hasOuterWrappingStroke",
    "hasInnerVerticalStroke",
    "hasUpperInnerHorizontalStroke",
    "hasLowerInnerHorizontalStroke",

    "leftStrokeIsLeft",
    "leftStrokeIsVerticalish",
    "leftStrokeHasHeight",

    "outerWrappingHasWidth",
    "outerWrappingHasHeight",
    "outerWrappingStartsNearTop",
    "outerWrappingExtendsRight",
    "outerWrappingExtendsDown",
    "outerWrappingHasCorner",

    "innerVerticalIsVerticalish",
    "innerVerticalHasHeight",
    "innerVerticalIsThin",
    "innerVerticalXInRange",

    "upperInnerIsHorizontalish",
    "upperInnerHasWidth",
    "upperInnerIsThin",
    "upperInnerYInRange",
    "upperInnerNotStronglyUpward",

    "lowerInnerIsHorizontalish",
    "lowerInnerHasWidth",
    "lowerInnerIsThin",
    "lowerInnerYInRange",
    "lowerInnerNotStronglyUpward",

    "upperAboveLower",
    "lowerAboveOuterBottom",
    "innerVerticalInsideOuter",
    "upperInsideOuterX",
    "lowerInsideOuterX",

    "outerRightOfLeft",

    "boxHasHorizontalCoverage",
    "boxHasVerticalCoverage",
  ];

  const softCheckNames = [
    "straightnessMean",
    "leftTouchesTopHalf",
    "leftTouchesBottomHalf",
    "upperTouchesRightHalf",
    "lowerTouchesRightHalf",
    "innerVerticalTouchesBottomHalf",
  ];

  const hardFailedChecks = hardCheckNames.filter(
    (checkName) => checks[checkName] === false,
  );

  const softFailedChecks = softCheckNames.filter(
    (checkName) => checks[checkName] === false,
  );

  const failedChecks = [...hardFailedChecks, ...softFailedChecks];

  const totalChecks = Object.keys(checks).length || 1;
  const passedChecks = Object.values(checks).filter(Boolean).length;
  const descriptorMatchScore = passedChecks / totalChecks;

  const isCorrect =
    hardFailedChecks.length === 0 && softFailedChecks.length <= maxSoftFailures;

  const hasHardFailure = hardFailedChecks.length > 0;

  return {
    isCorrect,
    score: isCorrect ? 0.5 : hasHardFailure ? 10 : 0.75,
    strategy: "descriptor_open_box_with_inner_vertical_and_horizontals",
    pattern: descriptor.pattern,
    kanji,

    checks,
    failedChecks,
    hardFailedChecks,
    softFailedChecks,
    descriptorMatchScore,

    descriptor,

    details: {
      leftStroke,
      outerWrappingStroke,
      innerVerticalStroke,
      upperInnerHorizontalStroke,
      lowerInnerHorizontalStroke,
      allStrokes: perStroke,
      boxHorizontalCoverage,
      boxVerticalCoverage,
      upperLowerGap,
      lowerOuterBottomGap,
      roleAssignmentScore: bestRoleAssignmentScore,
    },

    thresholds: {
      expectedStrokeCount,

      minBboxWidth,
      minBboxHeight,
      aspectRatioMin,
      aspectRatioMax,

      minVerticalAngleAbs,
      minHorizontalAngleMax,
      minHeightVsWidthRatio,
      minWidthVsHeightRatio,

      leftStrokeCenterXMax,
      leftStrokeMinXMax,
      leftStrokeMinHeight,

      outerWrappingMinWidth,
      outerWrappingMinHeight,
      outerWrappingMinYMax,
      outerWrappingMaxXMin,
      outerWrappingMaxYMin,
      outerWrappingMaxStraightness,

      innerVerticalCenterXMin,
      innerVerticalCenterXMax,
      innerVerticalMinHeight,
      innerVerticalMaxWidth,

      upperInnerCenterYMin,
      upperInnerCenterYMax,
      upperInnerMinWidth,
      upperInnerMaxHeight,
      upperInnerDeltaYMin,

      lowerInnerCenterYMin,
      lowerInnerCenterYMax,
      lowerInnerMinWidth,
      lowerInnerMaxHeight,
      lowerInnerDeltaYMin,

      minUpperLowerGap,
      minLowerOuterBottomGap,

      minBoxHorizontalCoverage,
      minBoxVerticalCoverage,

      minStraightnessMean,
      maxSoftFailures,
    },
  };
}

function validateTreeCrossPattern({ kanji, features, descriptor }) {
  const geometry = features.geometry;

  if (!geometry) {
    return {
      isCorrect: false,
      score: 10,
      strategy: "descriptor_tree_cross_pattern",
      reason: "missing_geometry_features",
      pattern: descriptor.pattern,
    };
  }

  const perStroke = geometry.perStroke ?? [];
  const rules = descriptor.rules ?? {};
  const expectedStrokeCount = descriptor.expectedStrokeCount ?? 4;

  if (perStroke.length !== expectedStrokeCount) {
    const checks = {
      strokeCount: features.strokeCountUser === expectedStrokeCount,
      referenceStrokeCount: features.strokeCountRef === expectedStrokeCount,
    };

    const hardFailedChecks = Object.entries(checks)
      .filter(([, value]) => value === false)
      .map(([checkName]) => checkName);

    return {
      isCorrect: false,
      score: 10,
      strategy: "descriptor_tree_cross_pattern",
      reason: "invalid_stroke_count",
      pattern: descriptor.pattern,
      checks,
      failedChecks: hardFailedChecks,
      hardFailedChecks,
      softFailedChecks: [],
      thresholds: {
        expectedStrokeCount,
      },
    };
  }

  const minBboxWidth = rules.minBboxWidth ?? 0.45;
  const minBboxHeight = rules.minBboxHeight ?? 0.6;
  const aspectRatioMin = rules.aspectRatioMin ?? 0.45;
  const aspectRatioMax = rules.aspectRatioMax ?? 1.9;

  const minVerticalAngleAbs = rules.minVerticalAngleAbs ?? 0.85;
  const minHorizontalAngleMax = rules.minHorizontalAngleMax ?? 0.65;
  const minDiagonalAngleAbs = rules.minDiagonalAngleAbs ?? 0.35;
  const maxDiagonalAngleAbs = rules.maxDiagonalAngleAbs ?? 1.35;

  const minHeightVsWidthRatio = rules.minHeightVsWidthRatio ?? 1.2;
  const minWidthVsHeightRatio = rules.minWidthVsHeightRatio ?? 1.2;

  const horizontalCenterYMin = rules.horizontalCenterYMin ?? 0.12;
  const horizontalCenterYMax = rules.horizontalCenterYMax ?? 0.52;
  const horizontalMinWidth = rules.horizontalMinWidth ?? 0.35;
  const horizontalMaxHeight = rules.horizontalMaxHeight ?? 0.3;
  const horizontalDeltaYMin = rules.horizontalDeltaYMin ?? -0.22;

  const verticalCenterXMin = rules.verticalCenterXMin ?? 0.28;
  const verticalCenterXMax = rules.verticalCenterXMax ?? 0.72;
  const verticalMinHeight = rules.verticalMinHeight ?? 0.55;
  const verticalMaxWidth = rules.verticalMaxWidth ?? 0.35;

  const leftDiagonalCenterXMax = rules.leftDiagonalCenterXMax ?? 0.55;
  const leftDiagonalCenterYMin = rules.leftDiagonalCenterYMin ?? 0.38;
  const leftDiagonalMinWidth = rules.leftDiagonalMinWidth ?? 0.1;
  const leftDiagonalMinHeight = rules.leftDiagonalMinHeight ?? 0.16;
  const leftDiagonalDeltaXMax = rules.leftDiagonalDeltaXMax ?? -0.02;
  const leftDiagonalDeltaYMin = rules.leftDiagonalDeltaYMin ?? 0.08;

  const rightDiagonalCenterXMin = rules.rightDiagonalCenterXMin ?? 0.45;
  const rightDiagonalCenterYMin = rules.rightDiagonalCenterYMin ?? 0.38;
  const rightDiagonalMinWidth = rules.rightDiagonalMinWidth ?? 0.12;
  const rightDiagonalMinHeight = rules.rightDiagonalMinHeight ?? 0.12;
  const rightDiagonalDeltaXMin = rules.rightDiagonalDeltaXMin ?? 0.02;
  const rightDiagonalDeltaYMin = rules.rightDiagonalDeltaYMin ?? 0.08;

  const minDiagonalCenterGap = rules.minDiagonalCenterGap ?? 0.12;
  const minHorizontalVerticalCrossTolerance =
    rules.minHorizontalVerticalCrossTolerance ?? 0.08;
  const minDiagonalBelowHorizontalGap =
    rules.minDiagonalBelowHorizontalGap ?? 0.02;

  const minBoxHorizontalCoverage = rules.minBoxHorizontalCoverage ?? 0.45;
  const minBoxVerticalCoverage = rules.minBoxVerticalCoverage ?? 0.6;

  const minStraightnessMean = rules.minStraightnessMean ?? 0.5;
  const maxSoftFailures = rules.maxSoftFailures ?? 4;

  const isVerticalish = (stroke) => {
    const heightDominates =
      stroke.height >= stroke.width * minHeightVsWidthRatio;

    const angleLooksVertical = stroke.angleAbs >= minVerticalAngleAbs;

    return heightDominates || angleLooksVertical;
  };

  const isHorizontalish = (stroke) => {
    const widthDominates =
      stroke.width >= stroke.height * minWidthVsHeightRatio;

    const angleLooksHorizontal = stroke.angleAbs <= minHorizontalAngleMax;

    return widthDominates || angleLooksHorizontal;
  };

  const genericDiagonalMinWidth = rules.genericDiagonalMinWidth ?? 0.08;
  const genericDiagonalMinHeight = rules.genericDiagonalMinHeight ?? 0.1;

  const isDiagonalish = (stroke) => {
    return (
      stroke.angleAbs >= minDiagonalAngleAbs &&
      stroke.angleAbs <= maxDiagonalAngleAbs &&
      stroke.width >= genericDiagonalMinWidth &&
      stroke.height >= genericDiagonalMinHeight
    );
  };

  function rolePenalty(condition, penalty = 1) {
    return condition ? 0 : penalty;
  }

  function scoreHorizontalCandidate(stroke) {
    return (
      Math.abs(stroke.centerY - 0.28) * 2 +
      rolePenalty(isHorizontalish(stroke), 2) +
      rolePenalty(stroke.width >= horizontalMinWidth, 1.5) +
      rolePenalty(stroke.height <= horizontalMaxHeight, 1) +
      rolePenalty(stroke.centerY >= horizontalCenterYMin, 1) +
      rolePenalty(stroke.centerY <= horizontalCenterYMax, 1) +
      rolePenalty(stroke.deltaY >= horizontalDeltaYMin, 1)
    );
  }

  function scoreVerticalCandidate(stroke) {
    return (
      Math.abs(stroke.centerX - 0.5) * 2 +
      rolePenalty(isVerticalish(stroke), 2) +
      rolePenalty(stroke.height >= verticalMinHeight, 1.5) +
      rolePenalty(stroke.width <= verticalMaxWidth, 1) +
      rolePenalty(stroke.centerX >= verticalCenterXMin, 1) +
      rolePenalty(stroke.centerX <= verticalCenterXMax, 1)
    );
  }

  function scoreLeftDiagonalCandidate(stroke) {
    return (
      Math.abs(stroke.centerX - 0.32) * 2 +
      Math.abs(stroke.centerY - 0.65) +
      rolePenalty(isDiagonalish(stroke), 2) +
      rolePenalty(stroke.centerX <= leftDiagonalCenterXMax, 1) +
      rolePenalty(stroke.centerY >= leftDiagonalCenterYMin, 1) +
      rolePenalty(stroke.width >= leftDiagonalMinWidth, 1.5) +
      rolePenalty(stroke.height >= leftDiagonalMinHeight, 1.5) +
      rolePenalty(stroke.deltaX <= leftDiagonalDeltaXMax, 1.5) +
      rolePenalty(stroke.deltaY >= leftDiagonalDeltaYMin, 1.5)
    );
  }

  function scoreRightDiagonalCandidate(stroke) {
    return (
      Math.abs(stroke.centerX - 0.68) * 2 +
      Math.abs(stroke.centerY - 0.65) +
      rolePenalty(isDiagonalish(stroke), 2) +
      rolePenalty(stroke.centerX >= rightDiagonalCenterXMin, 1) +
      rolePenalty(stroke.centerY >= rightDiagonalCenterYMin, 1) +
      rolePenalty(stroke.width >= rightDiagonalMinWidth, 1.5) +
      rolePenalty(stroke.height >= rightDiagonalMinHeight, 1.5) +
      rolePenalty(stroke.deltaX >= rightDiagonalDeltaXMin, 1.5) +
      rolePenalty(stroke.deltaY >= rightDiagonalDeltaYMin, 1.5)
    );
  }

  let bestRoleAssignment = null;
  let bestRoleAssignmentScore = Infinity;

  for (const horizontalCandidate of perStroke) {
    for (const verticalCandidate of perStroke) {
      if (verticalCandidate === horizontalCandidate) {
        continue;
      }

      for (const leftDiagonalCandidate of perStroke) {
        if (
          leftDiagonalCandidate === horizontalCandidate ||
          leftDiagonalCandidate === verticalCandidate
        ) {
          continue;
        }

        for (const rightDiagonalCandidate of perStroke) {
          if (
            rightDiagonalCandidate === horizontalCandidate ||
            rightDiagonalCandidate === verticalCandidate ||
            rightDiagonalCandidate === leftDiagonalCandidate
          ) {
            continue;
          }

          const diagonalsOrderPenalty =
            leftDiagonalCandidate.centerX < rightDiagonalCandidate.centerX
              ? 0
              : 4;

          const verticalCrossesHorizontalPenalty =
            verticalCandidate.centerX >= horizontalCandidate.minX &&
            verticalCandidate.centerX <= horizontalCandidate.maxX &&
            horizontalCandidate.centerY >=
              verticalCandidate.minY - minHorizontalVerticalCrossTolerance &&
            horizontalCandidate.centerY <=
              verticalCandidate.maxY + minHorizontalVerticalCrossTolerance
              ? 0
              : 4;

          const diagonalsBelowHorizontalPenalty =
            leftDiagonalCandidate.centerY >
              horizontalCandidate.centerY + minDiagonalBelowHorizontalGap &&
            rightDiagonalCandidate.centerY >
              horizontalCandidate.centerY + minDiagonalBelowHorizontalGap
              ? 0
              : 3;

          const score =
            scoreHorizontalCandidate(horizontalCandidate) +
            scoreVerticalCandidate(verticalCandidate) +
            scoreLeftDiagonalCandidate(leftDiagonalCandidate) +
            scoreRightDiagonalCandidate(rightDiagonalCandidate) +
            diagonalsOrderPenalty +
            verticalCrossesHorizontalPenalty +
            diagonalsBelowHorizontalPenalty;

          if (score < bestRoleAssignmentScore) {
            bestRoleAssignmentScore = score;
            bestRoleAssignment = {
              horizontalStroke: horizontalCandidate,
              verticalStroke: verticalCandidate,
              leftDiagonalStroke: leftDiagonalCandidate,
              rightDiagonalStroke: rightDiagonalCandidate,
            };
          }
        }
      }
    }
  }

  const horizontalStroke = bestRoleAssignment?.horizontalStroke ?? null;
  const verticalStroke = bestRoleAssignment?.verticalStroke ?? null;
  const leftDiagonalStroke = bestRoleAssignment?.leftDiagonalStroke ?? null;
  const rightDiagonalStroke = bestRoleAssignment?.rightDiagonalStroke ?? null;

  const boxMinX = Math.min(...perStroke.map((stroke) => stroke.minX));
  const boxMaxX = Math.max(...perStroke.map((stroke) => stroke.maxX));
  const boxMinY = Math.min(...perStroke.map((stroke) => stroke.minY));
  const boxMaxY = Math.max(...perStroke.map((stroke) => stroke.maxY));

  const boxHorizontalCoverage = boxMaxX - boxMinX;
  const boxVerticalCoverage = boxMaxY - boxMinY;

  const diagonalCenterGap =
    leftDiagonalStroke && rightDiagonalStroke
      ? rightDiagonalStroke.centerX - leftDiagonalStroke.centerX
      : 0;

  const horizontalVerticalCrosses =
    Boolean(horizontalStroke) &&
    Boolean(verticalStroke) &&
    verticalStroke.centerX >= horizontalStroke.minX &&
    verticalStroke.centerX <= horizontalStroke.maxX &&
    horizontalStroke.centerY >=
      verticalStroke.minY - minHorizontalVerticalCrossTolerance &&
    horizontalStroke.centerY <=
      verticalStroke.maxY + minHorizontalVerticalCrossTolerance;

  const diagonalsBelowHorizontal =
    Boolean(horizontalStroke) &&
    Boolean(leftDiagonalStroke) &&
    Boolean(rightDiagonalStroke) &&
    leftDiagonalStroke.centerY >=
      horizontalStroke.centerY + minDiagonalBelowHorizontalGap &&
    rightDiagonalStroke.centerY >=
      horizontalStroke.centerY + minDiagonalBelowHorizontalGap;

  const checks = {
    strokeCount: features.strokeCountUser === expectedStrokeCount,
    referenceStrokeCount: features.strokeCountRef === expectedStrokeCount,

    bboxWidth: geometry.bboxWidth >= minBboxWidth,
    bboxHeight: geometry.bboxHeight >= minBboxHeight,
    aspectRatio:
      geometry.aspectRatio >= aspectRatioMin &&
      geometry.aspectRatio <= aspectRatioMax,

    hasHorizontalStroke: Boolean(horizontalStroke),
    hasVerticalStroke: Boolean(verticalStroke),
    hasLeftDiagonalStroke: Boolean(leftDiagonalStroke),
    hasRightDiagonalStroke: Boolean(rightDiagonalStroke),

    horizontalIsHorizontalish:
      Boolean(horizontalStroke) && isHorizontalish(horizontalStroke),

    horizontalHasWidth:
      Boolean(horizontalStroke) && horizontalStroke.width >= horizontalMinWidth,

    horizontalIsThin:
      Boolean(horizontalStroke) &&
      horizontalStroke.height <= horizontalMaxHeight,

    horizontalYInRange:
      Boolean(horizontalStroke) &&
      horizontalStroke.centerY >= horizontalCenterYMin &&
      horizontalStroke.centerY <= horizontalCenterYMax,

    horizontalNotStronglyUpward:
      Boolean(horizontalStroke) &&
      horizontalStroke.deltaY >= horizontalDeltaYMin,

    verticalIsVerticalish:
      Boolean(verticalStroke) && isVerticalish(verticalStroke),

    verticalHasHeight:
      Boolean(verticalStroke) && verticalStroke.height >= verticalMinHeight,

    verticalIsThin:
      Boolean(verticalStroke) && verticalStroke.width <= verticalMaxWidth,

    verticalXInRange:
      Boolean(verticalStroke) &&
      verticalStroke.centerX >= verticalCenterXMin &&
      verticalStroke.centerX <= verticalCenterXMax,

    horizontalVerticalCrosses,

    leftDiagonalIsDiagonalish:
      Boolean(leftDiagonalStroke) && isDiagonalish(leftDiagonalStroke),

    leftDiagonalIsLeft:
      Boolean(leftDiagonalStroke) &&
      leftDiagonalStroke.centerX <= leftDiagonalCenterXMax,

    leftDiagonalIsLower:
      Boolean(leftDiagonalStroke) &&
      leftDiagonalStroke.centerY >= leftDiagonalCenterYMin,

    leftDiagonalHasWidth:
      Boolean(leftDiagonalStroke) &&
      leftDiagonalStroke.width >= leftDiagonalMinWidth,

    leftDiagonalHasHeight:
      Boolean(leftDiagonalStroke) &&
      leftDiagonalStroke.height >= leftDiagonalMinHeight,

    leftDiagonalDirection:
      Boolean(leftDiagonalStroke) &&
      leftDiagonalStroke.deltaX <= leftDiagonalDeltaXMax &&
      leftDiagonalStroke.deltaY >= leftDiagonalDeltaYMin,

    rightDiagonalIsDiagonalish:
      Boolean(rightDiagonalStroke) && isDiagonalish(rightDiagonalStroke),

    rightDiagonalIsRight:
      Boolean(rightDiagonalStroke) &&
      rightDiagonalStroke.centerX >= rightDiagonalCenterXMin,

    rightDiagonalIsLower:
      Boolean(rightDiagonalStroke) &&
      rightDiagonalStroke.centerY >= rightDiagonalCenterYMin,

    rightDiagonalHasWidth:
      Boolean(rightDiagonalStroke) &&
      rightDiagonalStroke.width >= rightDiagonalMinWidth,

    rightDiagonalHasHeight:
      Boolean(rightDiagonalStroke) &&
      rightDiagonalStroke.height >= rightDiagonalMinHeight,

    rightDiagonalDirection:
      Boolean(rightDiagonalStroke) &&
      rightDiagonalStroke.deltaX >= rightDiagonalDeltaXMin &&
      rightDiagonalStroke.deltaY >= rightDiagonalDeltaYMin,

    diagonalsSeparated: diagonalCenterGap >= minDiagonalCenterGap,

    diagonalsBelowHorizontal,

    verticalBetweenDiagonals:
      Boolean(verticalStroke) &&
      Boolean(leftDiagonalStroke) &&
      Boolean(rightDiagonalStroke) &&
      verticalStroke.centerX > leftDiagonalStroke.centerX &&
      verticalStroke.centerX < rightDiagonalStroke.centerX,

    boxHasHorizontalCoverage: boxHorizontalCoverage >= minBoxHorizontalCoverage,

    boxHasVerticalCoverage: boxVerticalCoverage >= minBoxVerticalCoverage,

    straightnessMean: geometry.straightnessMean >= minStraightnessMean,

    // Checks blandos.
    horizontalTouchesLeftHalf:
      Boolean(horizontalStroke) && horizontalStroke.minX <= 0.5,

    horizontalTouchesRightHalf:
      Boolean(horizontalStroke) && horizontalStroke.maxX >= 0.5,

    verticalTouchesTopHalf:
      Boolean(verticalStroke) && verticalStroke.minY <= 0.45,

    verticalTouchesBottomHalf:
      Boolean(verticalStroke) && verticalStroke.maxY >= 0.65,

    leftDiagonalTouchesLeftHalf:
      Boolean(leftDiagonalStroke) && leftDiagonalStroke.minX <= 0.5,

    rightDiagonalTouchesRightHalf:
      Boolean(rightDiagonalStroke) && rightDiagonalStroke.maxX >= 0.5,
  };

  const hardCheckNames = [
    "strokeCount",
    "referenceStrokeCount",

    "bboxWidth",
    "bboxHeight",
    "aspectRatio",

    "hasHorizontalStroke",
    "hasVerticalStroke",
    "hasLeftDiagonalStroke",
    "hasRightDiagonalStroke",

    "horizontalIsHorizontalish",
    "horizontalHasWidth",
    "horizontalIsThin",
    "horizontalYInRange",
    "horizontalNotStronglyUpward",

    "verticalIsVerticalish",
    "verticalHasHeight",
    "verticalIsThin",
    "verticalXInRange",

    "horizontalVerticalCrosses",

    "leftDiagonalIsDiagonalish",
    "leftDiagonalIsLeft",
    "leftDiagonalIsLower",
    "leftDiagonalHasWidth",
    "leftDiagonalHasHeight",
    "leftDiagonalDirection",

    "rightDiagonalIsDiagonalish",
    "rightDiagonalIsRight",
    "rightDiagonalIsLower",
    "rightDiagonalHasWidth",
    "rightDiagonalHasHeight",
    "rightDiagonalDirection",

    "diagonalsSeparated",
    "diagonalsBelowHorizontal",
    "verticalBetweenDiagonals",

    "boxHasHorizontalCoverage",
    "boxHasVerticalCoverage",
  ];

  const softCheckNames = [
    "straightnessMean",
    "horizontalTouchesLeftHalf",
    "horizontalTouchesRightHalf",
    "verticalTouchesTopHalf",
    "verticalTouchesBottomHalf",
    "leftDiagonalTouchesLeftHalf",
    "rightDiagonalTouchesRightHalf",
  ];

  const hardFailedChecks = hardCheckNames.filter(
    (checkName) => checks[checkName] === false,
  );

  const softFailedChecks = softCheckNames.filter(
    (checkName) => checks[checkName] === false,
  );

  const failedChecks = [...hardFailedChecks, ...softFailedChecks];

  const totalChecks = Object.keys(checks).length || 1;
  const passedChecks = Object.values(checks).filter(Boolean).length;
  const descriptorMatchScore = passedChecks / totalChecks;

  const isCorrect =
    hardFailedChecks.length === 0 && softFailedChecks.length <= maxSoftFailures;

  const hasHardFailure = hardFailedChecks.length > 0;

  return {
    isCorrect,
    score: isCorrect ? 0.5 : hasHardFailure ? 10 : 0.75,
    strategy: "descriptor_tree_cross_pattern",
    pattern: descriptor.pattern,
    kanji,

    checks,
    failedChecks,
    hardFailedChecks,
    softFailedChecks,
    descriptorMatchScore,

    descriptor,

    details: {
      horizontalStroke,
      verticalStroke,
      leftDiagonalStroke,
      rightDiagonalStroke,
      allStrokes: perStroke,
      boxHorizontalCoverage,
      boxVerticalCoverage,
      diagonalCenterGap,
      horizontalVerticalCrosses,
      diagonalsBelowHorizontal,
      roleAssignmentScore: bestRoleAssignmentScore,
    },

    thresholds: {
      expectedStrokeCount,

      minBboxWidth,
      minBboxHeight,
      aspectRatioMin,
      aspectRatioMax,

      minVerticalAngleAbs,
      minHorizontalAngleMax,
      minDiagonalAngleAbs,
      maxDiagonalAngleAbs,

      genericDiagonalMinWidth,
      genericDiagonalMinHeight,

      minHeightVsWidthRatio,
      minWidthVsHeightRatio,

      horizontalCenterYMin,
      horizontalCenterYMax,
      horizontalMinWidth,
      horizontalMaxHeight,
      horizontalDeltaYMin,

      verticalCenterXMin,
      verticalCenterXMax,
      verticalMinHeight,
      verticalMaxWidth,

      leftDiagonalCenterXMax,
      leftDiagonalCenterYMin,
      leftDiagonalMinWidth,
      leftDiagonalMinHeight,

      leftDiagonalDeltaXMax,
      leftDiagonalDeltaYMin,
      rightDiagonalDeltaXMin,
      rightDiagonalDeltaYMin,

      rightDiagonalCenterXMin,
      rightDiagonalCenterYMin,
      rightDiagonalMinWidth,
      rightDiagonalMinHeight,

      minDiagonalCenterGap,
      minHorizontalVerticalCrossTolerance,
      minDiagonalBelowHorizontalGap,

      minBoxHorizontalCoverage,
      minBoxVerticalCoverage,

      minStraightnessMean,
      maxSoftFailures,
    },
  };
}

function validateTreeWithBottomMark({ kanji, features, descriptor }) {
  const geometry = features.geometry;

  if (!geometry) {
    return {
      isCorrect: false,
      score: 10,
      strategy: "descriptor_tree_with_bottom_mark",
      reason: "missing_geometry_features",
      pattern: descriptor.pattern,
    };
  }

  const perStroke = geometry.perStroke ?? [];
  const rules = descriptor.rules ?? {};
  const expectedStrokeCount = descriptor.expectedStrokeCount ?? 5;

  if (perStroke.length !== expectedStrokeCount) {
    const checks = {
      strokeCount: features.strokeCountUser === expectedStrokeCount,
      referenceStrokeCount: features.strokeCountRef === expectedStrokeCount,
    };

    const hardFailedChecks = Object.entries(checks)
      .filter(([, value]) => value === false)
      .map(([checkName]) => checkName);

    return {
      isCorrect: false,
      score: 10,
      strategy: "descriptor_tree_with_bottom_mark",
      reason: "invalid_stroke_count",
      pattern: descriptor.pattern,
      checks,
      failedChecks: hardFailedChecks,
      hardFailedChecks,
      softFailedChecks: [],
      thresholds: {
        expectedStrokeCount,
      },
    };
  }

  const minBboxWidth = rules.minBboxWidth ?? 0.45;
  const minBboxHeight = rules.minBboxHeight ?? 0.6;
  const aspectRatioMin = rules.aspectRatioMin ?? 0.45;
  const aspectRatioMax = rules.aspectRatioMax ?? 1.9;

  const minVerticalAngleAbs = rules.minVerticalAngleAbs ?? 0.85;
  const minHorizontalAngleMax = rules.minHorizontalAngleMax ?? 0.65;
  const minDiagonalAngleAbs = rules.minDiagonalAngleAbs ?? 0.3;
  const maxDiagonalAngleAbs = rules.maxDiagonalAngleAbs ?? 1.35;
  const genericDiagonalMinWidth = rules.genericDiagonalMinWidth ?? 0.08;
  const genericDiagonalMinHeight = rules.genericDiagonalMinHeight ?? 0.1;

  const minHeightVsWidthRatio = rules.minHeightVsWidthRatio ?? 1.2;
  const minWidthVsHeightRatio = rules.minWidthVsHeightRatio ?? 1.2;

  const horizontalCenterYMin = rules.horizontalCenterYMin ?? 0.07;
  const horizontalCenterYMax = rules.horizontalCenterYMax ?? 0.52;
  const horizontalMinWidth = rules.horizontalMinWidth ?? 0.28;
  const horizontalMaxHeight = rules.horizontalMaxHeight ?? 0.45;
  const horizontalDeltaYMin = rules.horizontalDeltaYMin ?? -0.45;

  const verticalCenterXMin = rules.verticalCenterXMin ?? 0.25;
  const verticalCenterXMax = rules.verticalCenterXMax ?? 0.72;
  const verticalMinHeight = rules.verticalMinHeight ?? 0.5;
  const verticalMaxWidth = rules.verticalMaxWidth ?? 0.4;

  const leftDiagonalCenterXMax = rules.leftDiagonalCenterXMax ?? 0.55;
  const leftDiagonalCenterYMin = rules.leftDiagonalCenterYMin ?? 0.35;
  const leftDiagonalMinWidth = rules.leftDiagonalMinWidth ?? 0.1;
  const leftDiagonalMinHeight = rules.leftDiagonalMinHeight ?? 0.12;
  const leftDiagonalDeltaXMax = rules.leftDiagonalDeltaXMax ?? -0.02;
  const leftDiagonalDeltaYMin = rules.leftDiagonalDeltaYMin ?? 0.08;

  const rightDiagonalCenterXMin = rules.rightDiagonalCenterXMin ?? 0.45;
  const rightDiagonalCenterYMin = rules.rightDiagonalCenterYMin ?? 0.35;
  const rightDiagonalMinWidth = rules.rightDiagonalMinWidth ?? 0.08;
  const rightDiagonalMinHeight = rules.rightDiagonalMinHeight ?? 0.1;
  const rightDiagonalDeltaXMin = rules.rightDiagonalDeltaXMin ?? 0.02;
  const rightDiagonalDeltaYMin = rules.rightDiagonalDeltaYMin ?? 0.08;

  const bottomMarkCenterXMin = rules.bottomMarkCenterXMin ?? 0.25;
  const bottomMarkCenterXMax = rules.bottomMarkCenterXMax ?? 0.75;
  const bottomMarkCenterYMin = rules.bottomMarkCenterYMin ?? 0.55;
  const bottomMarkCenterYMax = rules.bottomMarkCenterYMax ?? 0.9;
  const bottomMarkMinWidth = rules.bottomMarkMinWidth ?? 0.08;
  const bottomMarkMaxHeight = rules.bottomMarkMaxHeight ?? 0.32;
  const bottomMarkDeltaYMin = rules.bottomMarkDeltaYMin ?? -0.22;
  const bottomMarkAllowDiagonalish = rules.bottomMarkAllowDiagonalish ?? true;
  const bottomMarkMaxAngleAbs = rules.bottomMarkMaxAngleAbs ?? 1.05;

  const minDiagonalCenterGap = rules.minDiagonalCenterGap ?? 0.12;
  const minHorizontalVerticalCrossTolerance =
    rules.minHorizontalVerticalCrossTolerance ?? 0.08;
  const minDiagonalBelowHorizontalGap =
    rules.minDiagonalBelowHorizontalGap ?? 0.02;
  const minBottomMarkBelowHorizontalGap =
    rules.minBottomMarkBelowHorizontalGap ?? 0.12;
  const minBottomMarkNearVerticalTolerance =
    rules.minBottomMarkNearVerticalTolerance ?? 0.28;

  const minBoxHorizontalCoverage = rules.minBoxHorizontalCoverage ?? 0.45;
  const minBoxVerticalCoverage = rules.minBoxVerticalCoverage ?? 0.6;

  const minStraightnessMean = rules.minStraightnessMean ?? 0.5;
  const maxSoftFailures = rules.maxSoftFailures ?? 5;

  const isVerticalish = (stroke) => {
    const heightDominates =
      stroke.height >= stroke.width * minHeightVsWidthRatio;
    const angleLooksVertical = stroke.angleAbs >= minVerticalAngleAbs;

    return heightDominates || angleLooksVertical;
  };

  const isHorizontalish = (stroke) => {
    const widthDominates =
      stroke.width >= stroke.height * minWidthVsHeightRatio;
    const angleLooksHorizontal = stroke.angleAbs <= minHorizontalAngleMax;

    return widthDominates || angleLooksHorizontal;
  };

  const isDiagonalish = (stroke) => {
    return (
      stroke.angleAbs >= minDiagonalAngleAbs &&
      stroke.angleAbs <= maxDiagonalAngleAbs &&
      stroke.width >= genericDiagonalMinWidth &&
      stroke.height >= genericDiagonalMinHeight
    );
  };

  function rolePenalty(condition, penalty = 1) {
    return condition ? 0 : penalty;
  }

  function scoreHorizontalCandidate(stroke) {
    return (
      Math.abs(stroke.centerY - 0.28) * 2 +
      rolePenalty(isHorizontalish(stroke), 2) +
      rolePenalty(stroke.width >= horizontalMinWidth, 1.5) +
      rolePenalty(stroke.height <= horizontalMaxHeight, 1) +
      rolePenalty(stroke.centerY >= horizontalCenterYMin, 1) +
      rolePenalty(stroke.centerY <= horizontalCenterYMax, 1) +
      rolePenalty(stroke.deltaY >= horizontalDeltaYMin, 1)
    );
  }

  function scoreVerticalCandidate(stroke) {
    return (
      Math.abs(stroke.centerX - 0.5) * 2 +
      rolePenalty(isVerticalish(stroke), 2) +
      rolePenalty(stroke.height >= verticalMinHeight, 1.5) +
      rolePenalty(stroke.width <= verticalMaxWidth, 1) +
      rolePenalty(stroke.centerX >= verticalCenterXMin, 1) +
      rolePenalty(stroke.centerX <= verticalCenterXMax, 1)
    );
  }

  function scoreLeftDiagonalCandidate(stroke) {
    return (
      Math.abs(stroke.centerX - 0.32) * 2 +
      Math.abs(stroke.centerY - 0.65) +
      rolePenalty(isDiagonalish(stroke), 2) +
      rolePenalty(stroke.centerX <= leftDiagonalCenterXMax, 1) +
      rolePenalty(stroke.centerY >= leftDiagonalCenterYMin, 1) +
      rolePenalty(stroke.width >= leftDiagonalMinWidth, 1.5) +
      rolePenalty(stroke.height >= leftDiagonalMinHeight, 1.5) +
      rolePenalty(stroke.deltaX <= leftDiagonalDeltaXMax, 1.5) +
      rolePenalty(stroke.deltaY >= leftDiagonalDeltaYMin, 1.5)
    );
  }

  function scoreRightDiagonalCandidate(stroke) {
    return (
      Math.abs(stroke.centerX - 0.68) * 2 +
      Math.abs(stroke.centerY - 0.65) +
      rolePenalty(isDiagonalish(stroke), 2) +
      rolePenalty(stroke.centerX >= rightDiagonalCenterXMin, 1) +
      rolePenalty(stroke.centerY >= rightDiagonalCenterYMin, 1) +
      rolePenalty(stroke.width >= rightDiagonalMinWidth, 1.5) +
      rolePenalty(stroke.height >= rightDiagonalMinHeight, 1.5) +
      rolePenalty(stroke.deltaX >= rightDiagonalDeltaXMin, 1.5) +
      rolePenalty(stroke.deltaY >= rightDiagonalDeltaYMin, 1.5)
    );
  }

  function scoreBottomMarkCandidate(stroke) {
    return (
      Math.abs(stroke.centerX - 0.5) * 2 +
      Math.abs(stroke.centerY - 0.68) * 2 +
      rolePenalty(isHorizontalish(stroke), 2) +
      rolePenalty(stroke.width >= bottomMarkMinWidth, 1.5) +
      rolePenalty(stroke.height <= bottomMarkMaxHeight, 1) +
      rolePenalty(stroke.centerX >= bottomMarkCenterXMin, 1) +
      rolePenalty(stroke.centerX <= bottomMarkCenterXMax, 1) +
      rolePenalty(stroke.centerY >= bottomMarkCenterYMin, 1) +
      rolePenalty(stroke.centerY <= bottomMarkCenterYMax, 1) +
      rolePenalty(stroke.deltaY >= bottomMarkDeltaYMin, 1)
    );
  }

  let bestRoleAssignment = null;
  let bestRoleAssignmentScore = Infinity;

  for (const horizontalCandidate of perStroke) {
    for (const verticalCandidate of perStroke) {
      if (verticalCandidate === horizontalCandidate) {
        continue;
      }

      for (const leftDiagonalCandidate of perStroke) {
        if (
          leftDiagonalCandidate === horizontalCandidate ||
          leftDiagonalCandidate === verticalCandidate
        ) {
          continue;
        }

        for (const rightDiagonalCandidate of perStroke) {
          if (
            rightDiagonalCandidate === horizontalCandidate ||
            rightDiagonalCandidate === verticalCandidate ||
            rightDiagonalCandidate === leftDiagonalCandidate
          ) {
            continue;
          }

          for (const bottomMarkCandidate of perStroke) {
            if (
              bottomMarkCandidate === horizontalCandidate ||
              bottomMarkCandidate === verticalCandidate ||
              bottomMarkCandidate === leftDiagonalCandidate ||
              bottomMarkCandidate === rightDiagonalCandidate
            ) {
              continue;
            }

            const diagonalsOrderPenalty =
              leftDiagonalCandidate.centerX < rightDiagonalCandidate.centerX
                ? 0
                : 4;

            const verticalCrossesHorizontalPenalty =
              verticalCandidate.centerX >= horizontalCandidate.minX &&
              verticalCandidate.centerX <= horizontalCandidate.maxX &&
              horizontalCandidate.centerY >=
                verticalCandidate.minY - minHorizontalVerticalCrossTolerance &&
              horizontalCandidate.centerY <=
                verticalCandidate.maxY + minHorizontalVerticalCrossTolerance
                ? 0
                : 4;

            const diagonalsBelowHorizontalPenalty =
              leftDiagonalCandidate.centerY >
                horizontalCandidate.centerY + minDiagonalBelowHorizontalGap &&
              rightDiagonalCandidate.centerY >
                horizontalCandidate.centerY + minDiagonalBelowHorizontalGap
                ? 0
                : 3;

            const bottomMarkBelowHorizontalPenalty =
              bottomMarkCandidate.centerY >
              horizontalCandidate.centerY + minBottomMarkBelowHorizontalGap
                ? 0
                : 3;

            const bottomMarkNearVerticalPenalty =
              Math.abs(
                bottomMarkCandidate.centerX - verticalCandidate.centerX,
              ) <= minBottomMarkNearVerticalTolerance
                ? 0
                : 2;

            const score =
              scoreHorizontalCandidate(horizontalCandidate) +
              scoreVerticalCandidate(verticalCandidate) +
              scoreLeftDiagonalCandidate(leftDiagonalCandidate) +
              scoreRightDiagonalCandidate(rightDiagonalCandidate) +
              scoreBottomMarkCandidate(bottomMarkCandidate) +
              diagonalsOrderPenalty +
              verticalCrossesHorizontalPenalty +
              diagonalsBelowHorizontalPenalty +
              bottomMarkBelowHorizontalPenalty +
              bottomMarkNearVerticalPenalty;

            if (score < bestRoleAssignmentScore) {
              bestRoleAssignmentScore = score;
              bestRoleAssignment = {
                horizontalStroke: horizontalCandidate,
                verticalStroke: verticalCandidate,
                leftDiagonalStroke: leftDiagonalCandidate,
                rightDiagonalStroke: rightDiagonalCandidate,
                bottomMarkStroke: bottomMarkCandidate,
              };
            }
          }
        }
      }
    }
  }

  const horizontalStroke = bestRoleAssignment?.horizontalStroke ?? null;
  const verticalStroke = bestRoleAssignment?.verticalStroke ?? null;
  const leftDiagonalStroke = bestRoleAssignment?.leftDiagonalStroke ?? null;
  const rightDiagonalStroke = bestRoleAssignment?.rightDiagonalStroke ?? null;
  const bottomMarkStroke = bestRoleAssignment?.bottomMarkStroke ?? null;

  const boxMinX = Math.min(...perStroke.map((stroke) => stroke.minX));
  const boxMaxX = Math.max(...perStroke.map((stroke) => stroke.maxX));
  const boxMinY = Math.min(...perStroke.map((stroke) => stroke.minY));
  const boxMaxY = Math.max(...perStroke.map((stroke) => stroke.maxY));

  const boxHorizontalCoverage = boxMaxX - boxMinX;
  const boxVerticalCoverage = boxMaxY - boxMinY;

  const diagonalCenterGap =
    leftDiagonalStroke && rightDiagonalStroke
      ? rightDiagonalStroke.centerX - leftDiagonalStroke.centerX
      : 0;

  const horizontalVerticalCrosses =
    Boolean(horizontalStroke) &&
    Boolean(verticalStroke) &&
    verticalStroke.centerX >= horizontalStroke.minX &&
    verticalStroke.centerX <= horizontalStroke.maxX &&
    horizontalStroke.centerY >=
      verticalStroke.minY - minHorizontalVerticalCrossTolerance &&
    horizontalStroke.centerY <=
      verticalStroke.maxY + minHorizontalVerticalCrossTolerance;

  const diagonalsBelowHorizontal =
    Boolean(horizontalStroke) &&
    Boolean(leftDiagonalStroke) &&
    Boolean(rightDiagonalStroke) &&
    leftDiagonalStroke.centerY >=
      horizontalStroke.centerY + minDiagonalBelowHorizontalGap &&
    rightDiagonalStroke.centerY >=
      horizontalStroke.centerY + minDiagonalBelowHorizontalGap;

  const bottomMarkBelowHorizontal =
    Boolean(horizontalStroke) &&
    Boolean(bottomMarkStroke) &&
    bottomMarkStroke.centerY >=
      horizontalStroke.centerY + minBottomMarkBelowHorizontalGap;

  const bottomMarkNearVertical =
    Boolean(verticalStroke) &&
    Boolean(bottomMarkStroke) &&
    Math.abs(bottomMarkStroke.centerX - verticalStroke.centerX) <=
      minBottomMarkNearVerticalTolerance;

  const checks = {
    strokeCount: features.strokeCountUser === expectedStrokeCount,
    referenceStrokeCount: features.strokeCountRef === expectedStrokeCount,

    bboxWidth: geometry.bboxWidth >= minBboxWidth,
    bboxHeight: geometry.bboxHeight >= minBboxHeight,
    aspectRatio:
      geometry.aspectRatio >= aspectRatioMin &&
      geometry.aspectRatio <= aspectRatioMax,

    hasHorizontalStroke: Boolean(horizontalStroke),
    hasVerticalStroke: Boolean(verticalStroke),
    hasLeftDiagonalStroke: Boolean(leftDiagonalStroke),
    hasRightDiagonalStroke: Boolean(rightDiagonalStroke),
    hasBottomMarkStroke: Boolean(bottomMarkStroke),

    horizontalIsHorizontalish:
      Boolean(horizontalStroke) && isHorizontalish(horizontalStroke),

    horizontalHasWidth:
      Boolean(horizontalStroke) && horizontalStroke.width >= horizontalMinWidth,

    horizontalIsThin:
      Boolean(horizontalStroke) &&
      horizontalStroke.height <= horizontalMaxHeight,

    horizontalYInRange:
      Boolean(horizontalStroke) &&
      horizontalStroke.centerY >= horizontalCenterYMin &&
      horizontalStroke.centerY <= horizontalCenterYMax,

    horizontalNotStronglyUpward:
      Boolean(horizontalStroke) &&
      horizontalStroke.deltaY >= horizontalDeltaYMin,

    verticalIsVerticalish:
      Boolean(verticalStroke) && isVerticalish(verticalStroke),

    verticalHasHeight:
      Boolean(verticalStroke) && verticalStroke.height >= verticalMinHeight,

    verticalIsThin:
      Boolean(verticalStroke) && verticalStroke.width <= verticalMaxWidth,

    verticalXInRange:
      Boolean(verticalStroke) &&
      verticalStroke.centerX >= verticalCenterXMin &&
      verticalStroke.centerX <= verticalCenterXMax,

    horizontalVerticalCrosses,

    leftDiagonalIsDiagonalish:
      Boolean(leftDiagonalStroke) && isDiagonalish(leftDiagonalStroke),

    leftDiagonalIsLeft:
      Boolean(leftDiagonalStroke) &&
      leftDiagonalStroke.centerX <= leftDiagonalCenterXMax,

    leftDiagonalIsLower:
      Boolean(leftDiagonalStroke) &&
      leftDiagonalStroke.centerY >= leftDiagonalCenterYMin,

    leftDiagonalHasWidth:
      Boolean(leftDiagonalStroke) &&
      leftDiagonalStroke.width >= leftDiagonalMinWidth,

    leftDiagonalHasHeight:
      Boolean(leftDiagonalStroke) &&
      leftDiagonalStroke.height >= leftDiagonalMinHeight,

    leftDiagonalDirection:
      Boolean(leftDiagonalStroke) &&
      leftDiagonalStroke.deltaX <= leftDiagonalDeltaXMax &&
      leftDiagonalStroke.deltaY >= leftDiagonalDeltaYMin,

    rightDiagonalIsDiagonalish:
      Boolean(rightDiagonalStroke) && isDiagonalish(rightDiagonalStroke),

    rightDiagonalIsRight:
      Boolean(rightDiagonalStroke) &&
      rightDiagonalStroke.centerX >= rightDiagonalCenterXMin,

    rightDiagonalIsLower:
      Boolean(rightDiagonalStroke) &&
      rightDiagonalStroke.centerY >= rightDiagonalCenterYMin,

    rightDiagonalHasWidth:
      Boolean(rightDiagonalStroke) &&
      rightDiagonalStroke.width >= rightDiagonalMinWidth,

    rightDiagonalHasHeight:
      Boolean(rightDiagonalStroke) &&
      rightDiagonalStroke.height >= rightDiagonalMinHeight,

    rightDiagonalDirection:
      Boolean(rightDiagonalStroke) &&
      rightDiagonalStroke.deltaX >= rightDiagonalDeltaXMin &&
      rightDiagonalStroke.deltaY >= rightDiagonalDeltaYMin,

    bottomMarkIsHorizontalish:
      Boolean(bottomMarkStroke) &&
      (isHorizontalish(bottomMarkStroke) ||
        (bottomMarkAllowDiagonalish &&
          bottomMarkStroke.angleAbs <= bottomMarkMaxAngleAbs)),

    bottomMarkHasWidth:
      Boolean(bottomMarkStroke) && bottomMarkStroke.width >= bottomMarkMinWidth,

    bottomMarkIsThin:
      Boolean(bottomMarkStroke) &&
      bottomMarkStroke.height <= bottomMarkMaxHeight,

    bottomMarkXInRange:
      Boolean(bottomMarkStroke) &&
      bottomMarkStroke.centerX >= bottomMarkCenterXMin &&
      bottomMarkStroke.centerX <= bottomMarkCenterXMax,

    bottomMarkYInRange:
      Boolean(bottomMarkStroke) &&
      bottomMarkStroke.centerY >= bottomMarkCenterYMin &&
      bottomMarkStroke.centerY <= bottomMarkCenterYMax,

    bottomMarkNotStronglyUpward:
      Boolean(bottomMarkStroke) &&
      bottomMarkStroke.deltaY >= bottomMarkDeltaYMin,

    bottomMarkBelowHorizontal,
    bottomMarkNearVertical,

    diagonalsSeparated: diagonalCenterGap >= minDiagonalCenterGap,

    diagonalsBelowHorizontal,

    verticalBetweenDiagonals:
      Boolean(verticalStroke) &&
      Boolean(leftDiagonalStroke) &&
      Boolean(rightDiagonalStroke) &&
      verticalStroke.centerX > leftDiagonalStroke.centerX &&
      verticalStroke.centerX < rightDiagonalStroke.centerX,

    boxHasHorizontalCoverage: boxHorizontalCoverage >= minBoxHorizontalCoverage,

    boxHasVerticalCoverage: boxVerticalCoverage >= minBoxVerticalCoverage,

    straightnessMean: geometry.straightnessMean >= minStraightnessMean,

    // Checks blandos.
    horizontalTouchesLeftHalf:
      Boolean(horizontalStroke) && horizontalStroke.minX <= 0.5,

    horizontalTouchesRightHalf:
      Boolean(horizontalStroke) && horizontalStroke.maxX >= 0.5,

    verticalTouchesTopHalf:
      Boolean(verticalStroke) && verticalStroke.minY <= 0.45,

    verticalTouchesBottomHalf:
      Boolean(verticalStroke) && verticalStroke.maxY >= 0.65,

    leftDiagonalTouchesLeftHalf:
      Boolean(leftDiagonalStroke) && leftDiagonalStroke.minX <= 0.5,

    rightDiagonalTouchesRightHalf:
      Boolean(rightDiagonalStroke) && rightDiagonalStroke.maxX >= 0.5,

    bottomMarkTouchesCenter:
      Boolean(bottomMarkStroke) &&
      bottomMarkStroke.minX <= 0.6 &&
      bottomMarkStroke.maxX >= 0.4,
  };

  const hardCheckNames = [
    "strokeCount",
    "referenceStrokeCount",

    "bboxWidth",
    "bboxHeight",
    "aspectRatio",

    "hasHorizontalStroke",
    "hasVerticalStroke",
    "hasLeftDiagonalStroke",
    "hasRightDiagonalStroke",
    "hasBottomMarkStroke",

    "horizontalIsHorizontalish",
    "horizontalHasWidth",
    "horizontalIsThin",
    "horizontalYInRange",
    "horizontalNotStronglyUpward",

    "verticalIsVerticalish",
    "verticalHasHeight",
    "verticalIsThin",
    "verticalXInRange",

    "horizontalVerticalCrosses",

    "leftDiagonalIsDiagonalish",
    "leftDiagonalIsLeft",
    "leftDiagonalIsLower",
    "leftDiagonalHasWidth",
    "leftDiagonalHasHeight",
    "leftDiagonalDirection",

    "rightDiagonalIsDiagonalish",
    "rightDiagonalIsRight",
    "rightDiagonalIsLower",
    "rightDiagonalHasWidth",
    "rightDiagonalHasHeight",
    "rightDiagonalDirection",

    "bottomMarkIsHorizontalish",
    "bottomMarkHasWidth",
    "bottomMarkIsThin",
    "bottomMarkXInRange",
    "bottomMarkYInRange",
    "bottomMarkNotStronglyUpward",
    "bottomMarkBelowHorizontal",
    "bottomMarkNearVertical",

    "diagonalsSeparated",
    "diagonalsBelowHorizontal",
    "verticalBetweenDiagonals",

    "boxHasHorizontalCoverage",
    "boxHasVerticalCoverage",
  ];

  const softCheckNames = [
    "straightnessMean",
    "horizontalTouchesLeftHalf",
    "horizontalTouchesRightHalf",
    "verticalTouchesTopHalf",
    "verticalTouchesBottomHalf",
    "leftDiagonalTouchesLeftHalf",
    "rightDiagonalTouchesRightHalf",
    "bottomMarkTouchesCenter",
  ];

  const hardFailedChecks = hardCheckNames.filter(
    (checkName) => checks[checkName] === false,
  );

  const softFailedChecks = softCheckNames.filter(
    (checkName) => checks[checkName] === false,
  );

  const failedChecks = [...hardFailedChecks, ...softFailedChecks];

  const totalChecks = Object.keys(checks).length || 1;
  const passedChecks = Object.values(checks).filter(Boolean).length;
  const descriptorMatchScore = passedChecks / totalChecks;

  const isCorrect =
    hardFailedChecks.length === 0 && softFailedChecks.length <= maxSoftFailures;

  const hasHardFailure = hardFailedChecks.length > 0;

  return {
    isCorrect,
    score: isCorrect ? 0.5 : hasHardFailure ? 10 : 0.75,
    strategy: "descriptor_tree_with_bottom_mark",
    pattern: descriptor.pattern,
    kanji,

    checks,
    failedChecks,
    hardFailedChecks,
    softFailedChecks,
    descriptorMatchScore,

    descriptor,

    details: {
      horizontalStroke,
      verticalStroke,
      leftDiagonalStroke,
      rightDiagonalStroke,
      bottomMarkStroke,
      allStrokes: perStroke,
      boxHorizontalCoverage,
      boxVerticalCoverage,
      diagonalCenterGap,
      horizontalVerticalCrosses,
      diagonalsBelowHorizontal,
      bottomMarkBelowHorizontal,
      bottomMarkNearVertical,
      roleAssignmentScore: bestRoleAssignmentScore,
    },

    thresholds: {
      expectedStrokeCount,

      minBboxWidth,
      minBboxHeight,
      aspectRatioMin,
      aspectRatioMax,

      minVerticalAngleAbs,
      minHorizontalAngleMax,
      minDiagonalAngleAbs,
      maxDiagonalAngleAbs,
      genericDiagonalMinWidth,
      genericDiagonalMinHeight,

      minHeightVsWidthRatio,
      minWidthVsHeightRatio,

      horizontalCenterYMin,
      horizontalCenterYMax,
      horizontalMinWidth,
      horizontalMaxHeight,
      horizontalDeltaYMin,

      verticalCenterXMin,
      verticalCenterXMax,
      verticalMinHeight,
      verticalMaxWidth,

      leftDiagonalCenterXMax,
      leftDiagonalCenterYMin,
      leftDiagonalMinWidth,
      leftDiagonalMinHeight,
      leftDiagonalDeltaXMax,
      leftDiagonalDeltaYMin,

      rightDiagonalCenterXMin,
      rightDiagonalCenterYMin,
      rightDiagonalMinWidth,
      rightDiagonalMinHeight,
      rightDiagonalDeltaXMin,
      rightDiagonalDeltaYMin,

      bottomMarkCenterXMin,
      bottomMarkCenterXMax,
      bottomMarkCenterYMin,
      bottomMarkCenterYMax,
      bottomMarkMinWidth,
      bottomMarkMaxHeight,
      bottomMarkDeltaYMin,
      bottomMarkAllowDiagonalish,
      bottomMarkMaxAngleAbs,

      minDiagonalCenterGap,
      minHorizontalVerticalCrossTolerance,
      minDiagonalBelowHorizontalGap,
      minBottomMarkBelowHorizontalGap,
      minBottomMarkNearVerticalTolerance,

      minBoxHorizontalCoverage,
      minBoxVerticalCoverage,

      minStraightnessMean,
      maxSoftFailures,
    },
  };
}

function validateTreeWithTwoHorizontals({ kanji, features, descriptor }) {
  const geometry = features.geometry;

  if (!geometry) {
    return {
      isCorrect: false,
      score: 10,
      strategy: "descriptor_tree_with_two_horizontals",
      reason: "missing_geometry_features",
      pattern: descriptor.pattern,
    };
  }

  const perStroke = geometry.perStroke ?? [];
  const rules = descriptor.rules ?? {};
  const expectedStrokeCount = descriptor.expectedStrokeCount ?? 5;

  if (perStroke.length !== expectedStrokeCount) {
    const checks = {
      strokeCount: features.strokeCountUser === expectedStrokeCount,
      referenceStrokeCount: features.strokeCountRef === expectedStrokeCount,
    };

    const hardFailedChecks = Object.entries(checks)
      .filter(([, value]) => value === false)
      .map(([checkName]) => checkName);

    return {
      isCorrect: false,
      score: 10,
      strategy: "descriptor_tree_with_two_horizontals",
      reason: "invalid_stroke_count",
      pattern: descriptor.pattern,
      checks,
      failedChecks: hardFailedChecks,
      hardFailedChecks,
      softFailedChecks: [],
      thresholds: {
        expectedStrokeCount,
      },
    };
  }

  const minBboxWidth = rules.minBboxWidth ?? 0.45;
  const minBboxHeight = rules.minBboxHeight ?? 0.6;
  const aspectRatioMin = rules.aspectRatioMin ?? 0.45;
  const aspectRatioMax = rules.aspectRatioMax ?? 1.9;

  const minVerticalAngleAbs = rules.minVerticalAngleAbs ?? 0.85;
  const minHorizontalAngleMax = rules.minHorizontalAngleMax ?? 0.65;
  const minDiagonalAngleAbs = rules.minDiagonalAngleAbs ?? 0.3;
  const maxDiagonalAngleAbs = rules.maxDiagonalAngleAbs ?? 1.35;

  const leftDiagonalMinAngleAbs =
    rules.leftDiagonalMinAngleAbs ?? minDiagonalAngleAbs;
  const leftDiagonalMaxAngleAbs =
    rules.leftDiagonalMaxAngleAbs ?? maxDiagonalAngleAbs;

  const rightDiagonalMinAngleAbs =
    rules.rightDiagonalMinAngleAbs ?? minDiagonalAngleAbs;
  const rightDiagonalMaxAngleAbs =
    rules.rightDiagonalMaxAngleAbs ?? maxDiagonalAngleAbs;

  const genericDiagonalMinWidth = rules.genericDiagonalMinWidth ?? 0.08;
  const genericDiagonalMinHeight = rules.genericDiagonalMinHeight ?? 0.1;

  const minHeightVsWidthRatio = rules.minHeightVsWidthRatio ?? 1.2;
  const minWidthVsHeightRatio = rules.minWidthVsHeightRatio ?? 1.2;

  const upperHorizontalCenterYMin = rules.upperHorizontalCenterYMin ?? 0.05;
  const upperHorizontalCenterYMax = rules.upperHorizontalCenterYMax ?? 0.42;
  const upperHorizontalMinWidth = rules.upperHorizontalMinWidth ?? 0.28;
  const upperHorizontalMaxHeight = rules.upperHorizontalMaxHeight ?? 0.35;
  const upperHorizontalDeltaYMin = rules.upperHorizontalDeltaYMin ?? -0.45;

  const lowerHorizontalCenterYMin = rules.lowerHorizontalCenterYMin ?? 0.25;
  const lowerHorizontalCenterYMax = rules.lowerHorizontalCenterYMax ?? 0.62;
  const lowerHorizontalMinWidth = rules.lowerHorizontalMinWidth ?? 0.22;
  const lowerHorizontalMaxHeight = rules.lowerHorizontalMaxHeight ?? 0.35;
  const lowerHorizontalDeltaYMin = rules.lowerHorizontalDeltaYMin ?? -0.45;

  const verticalCenterXMin = rules.verticalCenterXMin ?? 0.25;
  const verticalCenterXMax = rules.verticalCenterXMax ?? 0.72;
  const verticalMinHeight = rules.verticalMinHeight ?? 0.5;
  const verticalMaxWidth = rules.verticalMaxWidth ?? 0.4;

  const leftDiagonalCenterXMax = rules.leftDiagonalCenterXMax ?? 0.55;
  const leftDiagonalCenterYMin = rules.leftDiagonalCenterYMin ?? 0.38;
  const leftDiagonalMinWidth = rules.leftDiagonalMinWidth ?? 0.1;
  const leftDiagonalMinHeight = rules.leftDiagonalMinHeight ?? 0.12;
  const leftDiagonalDeltaXMax = rules.leftDiagonalDeltaXMax ?? -0.02;
  const leftDiagonalDeltaYMin = rules.leftDiagonalDeltaYMin ?? 0.08;

  const rightDiagonalCenterXMin = rules.rightDiagonalCenterXMin ?? 0.45;
  const rightDiagonalCenterYMin = rules.rightDiagonalCenterYMin ?? 0.38;
  const rightDiagonalMinWidth = rules.rightDiagonalMinWidth ?? 0.08;
  const rightDiagonalMinHeight = rules.rightDiagonalMinHeight ?? 0.1;
  const rightDiagonalDeltaXMin = rules.rightDiagonalDeltaXMin ?? 0.02;
  const rightDiagonalDeltaYMin = rules.rightDiagonalDeltaYMin ?? 0.08;

  const minHorizontalGap = rules.minHorizontalGap ?? 0.08;
  const minDiagonalCenterGap = rules.minDiagonalCenterGap ?? 0.12;
  const minHorizontalVerticalCrossTolerance =
    rules.minHorizontalVerticalCrossTolerance ?? 0.08;
  const minDiagonalBelowLowerHorizontalGap =
    rules.minDiagonalBelowLowerHorizontalGap ?? 0.02;

  const minBoxHorizontalCoverage = rules.minBoxHorizontalCoverage ?? 0.45;
  const minBoxVerticalCoverage = rules.minBoxVerticalCoverage ?? 0.6;

  const minStraightnessMean = rules.minStraightnessMean ?? 0.5;
  const maxSoftFailures = rules.maxSoftFailures ?? 5;

  const isVerticalish = (stroke) => {
    const heightDominates =
      stroke.height >= stroke.width * minHeightVsWidthRatio;
    const angleLooksVertical = stroke.angleAbs >= minVerticalAngleAbs;

    return heightDominates || angleLooksVertical;
  };

  const isHorizontalish = (stroke) => {
    const widthDominates =
      stroke.width >= stroke.height * minWidthVsHeightRatio;
    const angleLooksHorizontal = stroke.angleAbs <= minHorizontalAngleMax;

    return widthDominates || angleLooksHorizontal;
  };

  const isDiagonalishWithin = (stroke, minAngleAbs, maxAngleAbs) => {
    return (
      stroke.angleAbs >= minAngleAbs &&
      stroke.angleAbs <= maxAngleAbs &&
      stroke.width >= genericDiagonalMinWidth &&
      stroke.height >= genericDiagonalMinHeight
    );
  };

  const isLeftDiagonalish = (stroke) => {
    return isDiagonalishWithin(
      stroke,
      leftDiagonalMinAngleAbs,
      leftDiagonalMaxAngleAbs,
    );
  };

  const isRightDiagonalish = (stroke) => {
    return isDiagonalishWithin(
      stroke,
      rightDiagonalMinAngleAbs,
      rightDiagonalMaxAngleAbs,
    );
  };

  function rolePenalty(condition, penalty = 1) {
    return condition ? 0 : penalty;
  }

  function scoreUpperHorizontalCandidate(stroke) {
    return (
      Math.abs(stroke.centerY - 0.22) * 2 +
      rolePenalty(isHorizontalish(stroke), 2) +
      rolePenalty(stroke.width >= upperHorizontalMinWidth, 1.5) +
      rolePenalty(stroke.height <= upperHorizontalMaxHeight, 1) +
      rolePenalty(stroke.centerY >= upperHorizontalCenterYMin, 1) +
      rolePenalty(stroke.centerY <= upperHorizontalCenterYMax, 1) +
      rolePenalty(stroke.deltaY >= upperHorizontalDeltaYMin, 1)
    );
  }

  function scoreLowerHorizontalCandidate(stroke) {
    return (
      Math.abs(stroke.centerY - 0.42) * 2 +
      rolePenalty(isHorizontalish(stroke), 2) +
      rolePenalty(stroke.width >= lowerHorizontalMinWidth, 1.5) +
      rolePenalty(stroke.height <= lowerHorizontalMaxHeight, 1) +
      rolePenalty(stroke.centerY >= lowerHorizontalCenterYMin, 1) +
      rolePenalty(stroke.centerY <= lowerHorizontalCenterYMax, 1) +
      rolePenalty(stroke.deltaY >= lowerHorizontalDeltaYMin, 1)
    );
  }

  function scoreVerticalCandidate(stroke) {
    return (
      Math.abs(stroke.centerX - 0.5) * 2 +
      rolePenalty(isVerticalish(stroke), 2) +
      rolePenalty(stroke.height >= verticalMinHeight, 1.5) +
      rolePenalty(stroke.width <= verticalMaxWidth, 1) +
      rolePenalty(stroke.centerX >= verticalCenterXMin, 1) +
      rolePenalty(stroke.centerX <= verticalCenterXMax, 1)
    );
  }

  function scoreLeftDiagonalCandidate(stroke) {
    return (
      Math.abs(stroke.centerX - 0.32) * 2 +
      Math.abs(stroke.centerY - 0.65) +
      rolePenalty(isLeftDiagonalish(stroke), 2) +
      rolePenalty(stroke.centerX <= leftDiagonalCenterXMax, 1) +
      rolePenalty(stroke.centerY >= leftDiagonalCenterYMin, 1) +
      rolePenalty(stroke.width >= leftDiagonalMinWidth, 1.5) +
      rolePenalty(stroke.height >= leftDiagonalMinHeight, 1.5) +
      rolePenalty(stroke.deltaX <= leftDiagonalDeltaXMax, 1.5) +
      rolePenalty(stroke.deltaY >= leftDiagonalDeltaYMin, 1.5)
    );
  }

  function scoreRightDiagonalCandidate(stroke) {
    return (
      Math.abs(stroke.centerX - 0.68) * 2 +
      Math.abs(stroke.centerY - 0.65) +
      rolePenalty(isRightDiagonalish(stroke), 2) +
      rolePenalty(stroke.centerX >= rightDiagonalCenterXMin, 1) +
      rolePenalty(stroke.centerY >= rightDiagonalCenterYMin, 1) +
      rolePenalty(stroke.width >= rightDiagonalMinWidth, 1.5) +
      rolePenalty(stroke.height >= rightDiagonalMinHeight, 1.5) +
      rolePenalty(stroke.deltaX >= rightDiagonalDeltaXMin, 1.5) +
      rolePenalty(stroke.deltaY >= rightDiagonalDeltaYMin, 1.5)
    );
  }

  let bestRoleAssignment = null;
  let bestRoleAssignmentScore = Infinity;

  for (const upperHorizontalCandidate of perStroke) {
    for (const lowerHorizontalCandidate of perStroke) {
      if (lowerHorizontalCandidate === upperHorizontalCandidate) {
        continue;
      }

      for (const verticalCandidate of perStroke) {
        if (
          verticalCandidate === upperHorizontalCandidate ||
          verticalCandidate === lowerHorizontalCandidate
        ) {
          continue;
        }

        for (const leftDiagonalCandidate of perStroke) {
          if (
            leftDiagonalCandidate === upperHorizontalCandidate ||
            leftDiagonalCandidate === lowerHorizontalCandidate ||
            leftDiagonalCandidate === verticalCandidate
          ) {
            continue;
          }

          for (const rightDiagonalCandidate of perStroke) {
            if (
              rightDiagonalCandidate === upperHorizontalCandidate ||
              rightDiagonalCandidate === lowerHorizontalCandidate ||
              rightDiagonalCandidate === verticalCandidate ||
              rightDiagonalCandidate === leftDiagonalCandidate
            ) {
              continue;
            }

            const horizontalOrderPenalty =
              upperHorizontalCandidate.centerY <
              lowerHorizontalCandidate.centerY
                ? 0
                : 5;

            const horizontalGapPenalty =
              lowerHorizontalCandidate.centerY -
                upperHorizontalCandidate.centerY >=
              minHorizontalGap
                ? 0
                : 3;

            const diagonalsOrderPenalty =
              leftDiagonalCandidate.centerX < rightDiagonalCandidate.centerX
                ? 0
                : 4;

            const verticalCrossesUpperPenalty =
              verticalCandidate.centerX >= upperHorizontalCandidate.minX &&
              verticalCandidate.centerX <= upperHorizontalCandidate.maxX &&
              upperHorizontalCandidate.centerY >=
                verticalCandidate.minY - minHorizontalVerticalCrossTolerance &&
              upperHorizontalCandidate.centerY <=
                verticalCandidate.maxY + minHorizontalVerticalCrossTolerance
                ? 0
                : 4;

            const verticalCrossesLowerPenalty =
              verticalCandidate.centerX >= lowerHorizontalCandidate.minX &&
              verticalCandidate.centerX <= lowerHorizontalCandidate.maxX &&
              lowerHorizontalCandidate.centerY >=
                verticalCandidate.minY - minHorizontalVerticalCrossTolerance &&
              lowerHorizontalCandidate.centerY <=
                verticalCandidate.maxY + minHorizontalVerticalCrossTolerance
                ? 0
                : 4;

            const diagonalsBelowLowerPenalty =
              leftDiagonalCandidate.centerY >
                lowerHorizontalCandidate.centerY +
                  minDiagonalBelowLowerHorizontalGap &&
              rightDiagonalCandidate.centerY >
                lowerHorizontalCandidate.centerY +
                  minDiagonalBelowLowerHorizontalGap
                ? 0
                : 3;

            const score =
              scoreUpperHorizontalCandidate(upperHorizontalCandidate) +
              scoreLowerHorizontalCandidate(lowerHorizontalCandidate) +
              scoreVerticalCandidate(verticalCandidate) +
              scoreLeftDiagonalCandidate(leftDiagonalCandidate) +
              scoreRightDiagonalCandidate(rightDiagonalCandidate) +
              horizontalOrderPenalty +
              horizontalGapPenalty +
              diagonalsOrderPenalty +
              verticalCrossesUpperPenalty +
              verticalCrossesLowerPenalty +
              diagonalsBelowLowerPenalty;

            if (score < bestRoleAssignmentScore) {
              bestRoleAssignmentScore = score;
              bestRoleAssignment = {
                upperHorizontalStroke: upperHorizontalCandidate,
                lowerHorizontalStroke: lowerHorizontalCandidate,
                verticalStroke: verticalCandidate,
                leftDiagonalStroke: leftDiagonalCandidate,
                rightDiagonalStroke: rightDiagonalCandidate,
              };
            }
          }
        }
      }
    }
  }

  const upperHorizontalStroke =
    bestRoleAssignment?.upperHorizontalStroke ?? null;
  const lowerHorizontalStroke =
    bestRoleAssignment?.lowerHorizontalStroke ?? null;
  const verticalStroke = bestRoleAssignment?.verticalStroke ?? null;
  const leftDiagonalStroke = bestRoleAssignment?.leftDiagonalStroke ?? null;
  const rightDiagonalStroke = bestRoleAssignment?.rightDiagonalStroke ?? null;

  const boxMinX = Math.min(...perStroke.map((stroke) => stroke.minX));
  const boxMaxX = Math.max(...perStroke.map((stroke) => stroke.maxX));
  const boxMinY = Math.min(...perStroke.map((stroke) => stroke.minY));
  const boxMaxY = Math.max(...perStroke.map((stroke) => stroke.maxY));

  const boxHorizontalCoverage = boxMaxX - boxMinX;
  const boxVerticalCoverage = boxMaxY - boxMinY;

  const horizontalGap =
    upperHorizontalStroke && lowerHorizontalStroke
      ? lowerHorizontalStroke.centerY - upperHorizontalStroke.centerY
      : 0;

  const diagonalCenterGap =
    leftDiagonalStroke && rightDiagonalStroke
      ? rightDiagonalStroke.centerX - leftDiagonalStroke.centerX
      : 0;

  const verticalCrossesUpper =
    Boolean(upperHorizontalStroke) &&
    Boolean(verticalStroke) &&
    verticalStroke.centerX >= upperHorizontalStroke.minX &&
    verticalStroke.centerX <= upperHorizontalStroke.maxX &&
    upperHorizontalStroke.centerY >=
      verticalStroke.minY - minHorizontalVerticalCrossTolerance &&
    upperHorizontalStroke.centerY <=
      verticalStroke.maxY + minHorizontalVerticalCrossTolerance;

  const verticalCrossesLower =
    Boolean(lowerHorizontalStroke) &&
    Boolean(verticalStroke) &&
    verticalStroke.centerX >= lowerHorizontalStroke.minX &&
    verticalStroke.centerX <= lowerHorizontalStroke.maxX &&
    lowerHorizontalStroke.centerY >=
      verticalStroke.minY - minHorizontalVerticalCrossTolerance &&
    lowerHorizontalStroke.centerY <=
      verticalStroke.maxY + minHorizontalVerticalCrossTolerance;

  const diagonalsBelowLowerHorizontal =
    Boolean(lowerHorizontalStroke) &&
    Boolean(leftDiagonalStroke) &&
    Boolean(rightDiagonalStroke) &&
    leftDiagonalStroke.centerY >=
      lowerHorizontalStroke.centerY + minDiagonalBelowLowerHorizontalGap &&
    rightDiagonalStroke.centerY >=
      lowerHorizontalStroke.centerY + minDiagonalBelowLowerHorizontalGap;

  const checks = {
    strokeCount: features.strokeCountUser === expectedStrokeCount,
    referenceStrokeCount: features.strokeCountRef === expectedStrokeCount,

    bboxWidth: geometry.bboxWidth >= minBboxWidth,
    bboxHeight: geometry.bboxHeight >= minBboxHeight,
    aspectRatio:
      geometry.aspectRatio >= aspectRatioMin &&
      geometry.aspectRatio <= aspectRatioMax,

    hasUpperHorizontalStroke: Boolean(upperHorizontalStroke),
    hasLowerHorizontalStroke: Boolean(lowerHorizontalStroke),
    hasVerticalStroke: Boolean(verticalStroke),
    hasLeftDiagonalStroke: Boolean(leftDiagonalStroke),
    hasRightDiagonalStroke: Boolean(rightDiagonalStroke),

    upperHorizontalIsHorizontalish:
      Boolean(upperHorizontalStroke) && isHorizontalish(upperHorizontalStroke),
    upperHorizontalHasWidth:
      Boolean(upperHorizontalStroke) &&
      upperHorizontalStroke.width >= upperHorizontalMinWidth,
    upperHorizontalIsThin:
      Boolean(upperHorizontalStroke) &&
      upperHorizontalStroke.height <= upperHorizontalMaxHeight,
    upperHorizontalYInRange:
      Boolean(upperHorizontalStroke) &&
      upperHorizontalStroke.centerY >= upperHorizontalCenterYMin &&
      upperHorizontalStroke.centerY <= upperHorizontalCenterYMax,
    upperHorizontalNotStronglyUpward:
      Boolean(upperHorizontalStroke) &&
      upperHorizontalStroke.deltaY >= upperHorizontalDeltaYMin,

    lowerHorizontalIsHorizontalish:
      Boolean(lowerHorizontalStroke) && isHorizontalish(lowerHorizontalStroke),
    lowerHorizontalHasWidth:
      Boolean(lowerHorizontalStroke) &&
      lowerHorizontalStroke.width >= lowerHorizontalMinWidth,
    lowerHorizontalIsThin:
      Boolean(lowerHorizontalStroke) &&
      lowerHorizontalStroke.height <= lowerHorizontalMaxHeight,
    lowerHorizontalYInRange:
      Boolean(lowerHorizontalStroke) &&
      lowerHorizontalStroke.centerY >= lowerHorizontalCenterYMin &&
      lowerHorizontalStroke.centerY <= lowerHorizontalCenterYMax,
    lowerHorizontalNotStronglyUpward:
      Boolean(lowerHorizontalStroke) &&
      lowerHorizontalStroke.deltaY >= lowerHorizontalDeltaYMin,

    upperAboveLower:
      Boolean(upperHorizontalStroke) &&
      Boolean(lowerHorizontalStroke) &&
      horizontalGap >= minHorizontalGap,

    verticalIsVerticalish:
      Boolean(verticalStroke) && isVerticalish(verticalStroke),
    verticalHasHeight:
      Boolean(verticalStroke) && verticalStroke.height >= verticalMinHeight,
    verticalIsThin:
      Boolean(verticalStroke) && verticalStroke.width <= verticalMaxWidth,
    verticalXInRange:
      Boolean(verticalStroke) &&
      verticalStroke.centerX >= verticalCenterXMin &&
      verticalStroke.centerX <= verticalCenterXMax,

    verticalCrossesUpper,
    verticalCrossesLower,

    leftDiagonalIsDiagonalish:
      Boolean(leftDiagonalStroke) && isLeftDiagonalish(leftDiagonalStroke),
    leftDiagonalIsLeft:
      Boolean(leftDiagonalStroke) &&
      leftDiagonalStroke.centerX <= leftDiagonalCenterXMax,
    leftDiagonalIsLower:
      Boolean(leftDiagonalStroke) &&
      leftDiagonalStroke.centerY >= leftDiagonalCenterYMin,
    leftDiagonalHasWidth:
      Boolean(leftDiagonalStroke) &&
      leftDiagonalStroke.width >= leftDiagonalMinWidth,
    leftDiagonalHasHeight:
      Boolean(leftDiagonalStroke) &&
      leftDiagonalStroke.height >= leftDiagonalMinHeight,
    leftDiagonalDirection:
      Boolean(leftDiagonalStroke) &&
      leftDiagonalStroke.deltaX <= leftDiagonalDeltaXMax &&
      leftDiagonalStroke.deltaY >= leftDiagonalDeltaYMin,

    rightDiagonalIsDiagonalish:
      Boolean(rightDiagonalStroke) && isRightDiagonalish(rightDiagonalStroke),
    rightDiagonalIsRight:
      Boolean(rightDiagonalStroke) &&
      rightDiagonalStroke.centerX >= rightDiagonalCenterXMin,
    rightDiagonalIsLower:
      Boolean(rightDiagonalStroke) &&
      rightDiagonalStroke.centerY >= rightDiagonalCenterYMin,
    rightDiagonalHasWidth:
      Boolean(rightDiagonalStroke) &&
      rightDiagonalStroke.width >= rightDiagonalMinWidth,
    rightDiagonalHasHeight:
      Boolean(rightDiagonalStroke) &&
      rightDiagonalStroke.height >= rightDiagonalMinHeight,
    rightDiagonalDirection:
      Boolean(rightDiagonalStroke) &&
      rightDiagonalStroke.deltaX >= rightDiagonalDeltaXMin &&
      rightDiagonalStroke.deltaY >= rightDiagonalDeltaYMin,

    diagonalsSeparated: diagonalCenterGap >= minDiagonalCenterGap,
    diagonalsBelowLowerHorizontal,

    verticalBetweenDiagonals:
      Boolean(verticalStroke) &&
      Boolean(leftDiagonalStroke) &&
      Boolean(rightDiagonalStroke) &&
      verticalStroke.centerX > leftDiagonalStroke.centerX &&
      verticalStroke.centerX < rightDiagonalStroke.centerX,

    boxHasHorizontalCoverage: boxHorizontalCoverage >= minBoxHorizontalCoverage,
    boxHasVerticalCoverage: boxVerticalCoverage >= minBoxVerticalCoverage,

    straightnessMean: geometry.straightnessMean >= minStraightnessMean,

    // Checks blandos.
    upperHorizontalTouchesLeftHalf:
      Boolean(upperHorizontalStroke) && upperHorizontalStroke.minX <= 0.5,
    upperHorizontalTouchesRightHalf:
      Boolean(upperHorizontalStroke) && upperHorizontalStroke.maxX >= 0.5,
    lowerHorizontalTouchesLeftHalf:
      Boolean(lowerHorizontalStroke) && lowerHorizontalStroke.minX <= 0.5,
    lowerHorizontalTouchesRightHalf:
      Boolean(lowerHorizontalStroke) && lowerHorizontalStroke.maxX >= 0.5,
    verticalTouchesTopHalf:
      Boolean(verticalStroke) && verticalStroke.minY <= 0.45,
    verticalTouchesBottomHalf:
      Boolean(verticalStroke) && verticalStroke.maxY >= 0.65,
    leftDiagonalTouchesLeftHalf:
      Boolean(leftDiagonalStroke) && leftDiagonalStroke.minX <= 0.5,
    rightDiagonalTouchesRightHalf:
      Boolean(rightDiagonalStroke) && rightDiagonalStroke.maxX >= 0.5,
  };

  const hardCheckNames = [
    "strokeCount",
    "referenceStrokeCount",

    "bboxWidth",
    "bboxHeight",
    "aspectRatio",

    "hasUpperHorizontalStroke",
    "hasLowerHorizontalStroke",
    "hasVerticalStroke",
    "hasLeftDiagonalStroke",
    "hasRightDiagonalStroke",

    "upperHorizontalIsHorizontalish",
    "upperHorizontalHasWidth",
    "upperHorizontalIsThin",
    "upperHorizontalYInRange",
    "upperHorizontalNotStronglyUpward",

    "lowerHorizontalIsHorizontalish",
    "lowerHorizontalHasWidth",
    "lowerHorizontalIsThin",
    "lowerHorizontalYInRange",
    "lowerHorizontalNotStronglyUpward",

    "upperAboveLower",

    "verticalIsVerticalish",
    "verticalHasHeight",
    "verticalIsThin",
    "verticalXInRange",

    "verticalCrossesUpper",
    "verticalCrossesLower",

    "leftDiagonalIsDiagonalish",
    "leftDiagonalIsLeft",
    "leftDiagonalIsLower",
    "leftDiagonalHasWidth",
    "leftDiagonalHasHeight",
    "leftDiagonalDirection",

    "rightDiagonalIsDiagonalish",
    "rightDiagonalIsRight",
    "rightDiagonalIsLower",
    "rightDiagonalHasWidth",
    "rightDiagonalHasHeight",
    "rightDiagonalDirection",

    "diagonalsSeparated",
    "diagonalsBelowLowerHorizontal",
    "verticalBetweenDiagonals",

    "boxHasHorizontalCoverage",
    "boxHasVerticalCoverage",
  ];

  const softCheckNames = [
    "straightnessMean",
    "upperHorizontalTouchesLeftHalf",
    "upperHorizontalTouchesRightHalf",
    "lowerHorizontalTouchesLeftHalf",
    "lowerHorizontalTouchesRightHalf",
    "verticalTouchesTopHalf",
    "verticalTouchesBottomHalf",
    "leftDiagonalTouchesLeftHalf",
    "rightDiagonalTouchesRightHalf",
  ];

  const hardFailedChecks = hardCheckNames.filter(
    (checkName) => checks[checkName] === false,
  );

  const softFailedChecks = softCheckNames.filter(
    (checkName) => checks[checkName] === false,
  );

  const failedChecks = [...hardFailedChecks, ...softFailedChecks];

  const totalChecks = Object.keys(checks).length || 1;
  const passedChecks = Object.values(checks).filter(Boolean).length;
  const descriptorMatchScore = passedChecks / totalChecks;

  const isCorrect =
    hardFailedChecks.length === 0 && softFailedChecks.length <= maxSoftFailures;

  const hasHardFailure = hardFailedChecks.length > 0;

  return {
    isCorrect,
    score: isCorrect ? 0.5 : hasHardFailure ? 10 : 0.75,
    strategy: "descriptor_tree_with_two_horizontals",
    pattern: descriptor.pattern,
    kanji,

    checks,
    failedChecks,
    hardFailedChecks,
    softFailedChecks,
    descriptorMatchScore,

    descriptor,

    details: {
      upperHorizontalStroke,
      lowerHorizontalStroke,
      verticalStroke,
      leftDiagonalStroke,
      rightDiagonalStroke,
      allStrokes: perStroke,
      boxHorizontalCoverage,
      boxVerticalCoverage,
      horizontalGap,
      diagonalCenterGap,
      verticalCrossesUpper,
      verticalCrossesLower,
      diagonalsBelowLowerHorizontal,
      roleAssignmentScore: bestRoleAssignmentScore,
    },

    thresholds: {
      expectedStrokeCount,

      minBboxWidth,
      minBboxHeight,
      aspectRatioMin,
      aspectRatioMax,

      minVerticalAngleAbs,
      minHorizontalAngleMax,
      minDiagonalAngleAbs,
      maxDiagonalAngleAbs,
      leftDiagonalMinAngleAbs,
      leftDiagonalMaxAngleAbs,
      rightDiagonalMinAngleAbs,
      rightDiagonalMaxAngleAbs,
      genericDiagonalMinWidth,
      genericDiagonalMinHeight,

      minHeightVsWidthRatio,
      minWidthVsHeightRatio,

      upperHorizontalCenterYMin,
      upperHorizontalCenterYMax,
      upperHorizontalMinWidth,
      upperHorizontalMaxHeight,
      upperHorizontalDeltaYMin,

      lowerHorizontalCenterYMin,
      lowerHorizontalCenterYMax,
      lowerHorizontalMinWidth,
      lowerHorizontalMaxHeight,
      lowerHorizontalDeltaYMin,

      verticalCenterXMin,
      verticalCenterXMax,
      verticalMinHeight,
      verticalMaxWidth,

      leftDiagonalCenterXMax,
      leftDiagonalCenterYMin,
      leftDiagonalMinWidth,
      leftDiagonalMinHeight,
      leftDiagonalDeltaXMax,
      leftDiagonalDeltaYMin,

      rightDiagonalCenterXMin,
      rightDiagonalCenterYMin,
      rightDiagonalMinWidth,
      rightDiagonalMinHeight,
      rightDiagonalDeltaXMin,
      rightDiagonalDeltaYMin,

      minHorizontalGap,
      minDiagonalCenterGap,
      minHorizontalVerticalCrossTolerance,
      minDiagonalBelowLowerHorizontalGap,

      minBoxHorizontalCoverage,
      minBoxVerticalCoverage,

      minStraightnessMean,
      maxSoftFailures,
    },
  };
}

module.exports = {
  validateByDescriptor,

  // Exportado para debug/tests futuros.
  scoreStrokeAgainstRole,
  strokeMatchesExpected,
  valueInRange,
  rangePenalty,
  validateRelation,
  buildRelationCheckName,
  validateDirectionRelation,
  isExpectedRange,
  getExpectedRangeWeight,
  isValidExpectedRangeWeight,
  getMatchedStrokeIndex,
  strokePairMatches,
  geometryContainsStrokePair,
  validateIntersectsRelation,
  validateTouchesRelation,
  validateConnectsRelation,
  validateDisconnectedRelation,
  validateOrthogonalCrossRelation,
};
