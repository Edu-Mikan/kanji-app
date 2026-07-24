const {
  compareFeatureSetsByDescriptorRoles,
} = require("./reference_comparator");

function validateByDescriptor({
  kanji,
  features,
  descriptor,
  referenceFeatures = null,
}) {
  if (!descriptor || descriptor.enabled === false) {
    return null;
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
      referenceConstraintResults: [],
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

  const { referenceConstraintResults, referenceConstraintHardFailedChecks } =
    validateReferenceConstraints({
      descriptor,
      features,
      referenceFeatures,
      roleMatches,
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
    additionalHardFailedChecks: referenceConstraintHardFailedChecks,
    referenceConstraintResults,
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

    case "centerXDistance":
      return Boolean(
        from &&
        to &&
        Math.abs(from.centerX - to.centerX) <= (relation.max ?? Infinity),
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

function hasReferenceConstraints(descriptor) {
  return (
    Array.isArray(descriptor?.referenceConstraints) &&
    descriptor.referenceConstraints.length > 0
  );
}

function getNestedValue(source, pathParts) {
  let current = source;

  for (const pathPart of pathParts) {
    if (
      current == null ||
      typeof current !== "object" ||
      !(pathPart in current)
    ) {
      return undefined;
    }

    current = current[pathPart];
  }

  return current;
}

function findRoleComparison(referenceComparison, roleKey) {
  const comparisons =
    referenceComparison?.perRoleComparisons ??
    referenceComparison?.perStrokeComparisons ??
    [];

  return comparisons.find((comparison) => {
    if (comparison.roleId) {
      return `role_${comparison.roleId}` === roleKey;
    }

    return `referenceStroke_${comparison.referenceStrokeIndex}` === roleKey;
  });
}

function getReferenceMetricValue(referenceComparison, metricPath) {
  const parts = metricPath.split(".");

  if (parts[0] === "referenceComparison") {
    return getNestedValue(referenceComparison, parts.slice(1));
  }

  if (parts[0] === "perRole") {
    const roleKey = parts[1];
    const metricName = parts[2];

    if (!roleKey || !metricName) {
      return undefined;
    }

    const roleComparison = findRoleComparison(referenceComparison, roleKey);

    if (!roleComparison) {
      return undefined;
    }

    if (metricName === "comparisonCost") {
      return roleComparison.comparisonCost;
    }

    return roleComparison.metrics?.[metricName];
  }

  return undefined;
}

function evaluateReferenceMetricMaxConstraint({
  constraint,
  referenceComparison,
}) {
  const metricValue = getReferenceMetricValue(
    referenceComparison,
    constraint.metricPath,
  );

  const hasMetric =
    typeof metricValue === "number" && Number.isFinite(metricValue);

  /*
   * Si falta la métrica, no penalizamos.
   * Esto conserva un comportamiento permisivo y evita falsos negativos accidentales.
   */
  const passed = !hasMetric || metricValue <= constraint.max;

  return {
    type: constraint.type,

    metricPath: constraint.metricPath,

    threshold: constraint.max,

    metricValue: hasMetric ? metricValue : null,

    hasMetric,

    passed,

    severity: constraint.severity ?? "soft",

    status: constraint.status ?? null,

    source: constraint.source ?? null,
  };
}

function evaluateReferenceConstraint({ constraint, referenceComparison }) {
  if (constraint.type === "referenceMetricMax") {
    return evaluateReferenceMetricMaxConstraint({
      constraint,
      referenceComparison,
    });
  }

  /*
   * Tipo desconocido:
   * no bloqueamos para no romper producción.
   * Lo marcamos para diagnóstico.
   */
  return {
    type: constraint.type,

    metricPath: constraint.metricPath ?? null,

    threshold: constraint.max ?? null,

    metricValue: null,

    hasMetric: false,

    passed: true,

    severity: constraint.severity ?? "soft",

    status: constraint.status ?? null,

    source: constraint.source ?? null,

    unsupported: true,
  };
}

function validateReferenceConstraints({
  descriptor,
  features,
  referenceFeatures,
  roleMatches,
  checks,
  failedChecks,
}) {
  if (!hasReferenceConstraints(descriptor) || !referenceFeatures?.features) {
    return {
      referenceConstraintResults: [],
      referenceConstraintHardFailedChecks: [],
    };
  }

  const descriptorValidation = {
    roleMatches: simplifyRoleMatches(roleMatches),
  };

  const referenceComparison = compareFeatureSetsByDescriptorRoles({
    userFeatures: features,
    referenceFeatures: referenceFeatures.features,
    descriptor,
    descriptorValidation,
  });

  const referenceConstraintResults = [];
  const referenceConstraintHardFailedChecks = [];

  for (let index = 0; index < descriptor.referenceConstraints.length; index++) {
    const constraint = descriptor.referenceConstraints[index];

    const result = evaluateReferenceConstraint({
      constraint,
      referenceComparison,
    });

    const checkName = `referenceConstraints.${index}.${constraint.type}.${constraint.metricPath}`;

    checks[checkName] = result.passed;

    if (!result.passed) {
      failedChecks.push(checkName);

      if ((constraint.severity ?? "soft") === "hard") {
        referenceConstraintHardFailedChecks.push(checkName);
      }
    }

    referenceConstraintResults.push({
      checkName,
      ...result,
    });
  }

  return {
    referenceConstraintResults,
    referenceConstraintHardFailedChecks,
  };
}

function buildDescriptorResult({
  kanji,
  descriptor,
  checks,
  failedChecks,
  roleMatches,
  geometry,
  forcedScore = null,
  additionalHardFailedChecks = [],
  referenceConstraintResults = [],
}) {
  const hardChecks = descriptor.hardChecks ?? [];

  const hardFailedChecks = [
    ...failedChecks.filter((checkName) => hardChecks.includes(checkName)),
    ...additionalHardFailedChecks,
  ];

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
    referenceConstraintResults,
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
  hasReferenceConstraints,
  getNestedValue,
  findRoleComparison,
  getReferenceMetricValue,
  evaluateReferenceMetricMaxConstraint,
  evaluateReferenceConstraint,
  validateReferenceConstraints,
};
