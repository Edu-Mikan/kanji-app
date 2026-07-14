function validateByDescriptor({ kanji, features, descriptor }) {
  if (!descriptor || descriptor.enabled === false) {
    return null;
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
  if (relation.type === "containsGroup") {
    return relation.id ?? "containsGroup";
  }

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

    case "containsGroup":
      return validateContainsGroupRelation(relation, roleMatches);

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

function getMatchedStrokes(roleMatches, roleIds) {
  if (!Array.isArray(roleIds)) {
    return [];
  }

  return roleIds
    .map((roleId) => roleMatches?.[roleId]?.stroke ?? null)
    .filter(Boolean);
}

function calculateCombinedBBox(strokes) {
  if (!Array.isArray(strokes) || strokes.length === 0) {
    return null;
  }

  const hasValidGeometry = strokes.every(
    (stroke) =>
      Number.isFinite(stroke.minX) &&
      Number.isFinite(stroke.maxX) &&
      Number.isFinite(stroke.minY) &&
      Number.isFinite(stroke.maxY),
  );

  if (!hasValidGeometry) {
    return null;
  }

  return {
    minX: Math.min(...strokes.map((stroke) => stroke.minX)),
    maxX: Math.max(...strokes.map((stroke) => stroke.maxX)),
    minY: Math.min(...strokes.map((stroke) => stroke.minY)),
    maxY: Math.max(...strokes.map((stroke) => stroke.maxY)),
  };
}

function validateContainsGroupRelation(relation, roleMatches) {
  const outerRoleIds = relation.outer ?? [];

  const innerRoleIds = relation.inner ?? [];

  if (outerRoleIds.length === 0 || innerRoleIds.length === 0) {
    return false;
  }

  const outerStrokes = getMatchedStrokes(roleMatches, outerRoleIds);

  const innerStrokes = getMatchedStrokes(roleMatches, innerRoleIds);

  if (
    outerStrokes.length !== outerRoleIds.length ||
    innerStrokes.length !== innerRoleIds.length
  ) {
    return false;
  }

  const outerBBox = calculateCombinedBBox(outerStrokes);

  const innerBBox = calculateCombinedBBox(innerStrokes);

  if (!outerBBox || !innerBBox) {
    return false;
  }

  const margin = relation.margin ?? {};

  const leftMargin = margin.left ?? 0;

  const topMargin = margin.top ?? 0;

  const rightMargin = margin.right ?? 0;

  const bottomMargin = margin.bottom ?? 0;

  return (
    innerBBox.minX >= outerBBox.minX + leftMargin &&
    innerBBox.minY >= outerBBox.minY + topMargin &&
    innerBBox.maxX <= outerBBox.maxX - rightMargin &&
    innerBBox.maxY <= outerBBox.maxY - bottomMargin
  );
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
  getMatchedStrokes,
  calculateCombinedBBox,
  validateContainsGroupRelation,
};
