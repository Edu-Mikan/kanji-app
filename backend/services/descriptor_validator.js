function validateByDescriptor({ kanji, features, descriptor }) {
  if (!descriptor || descriptor.enabled === false) {
    return null;
  }

  if (descriptor.pattern === "three_vertical_zones") {
    return validateThreeVerticalZones({
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

function scoreStrokeAgainstRole(stroke, role) {
  const expected = role.expected ?? {};

  let score = 0;

  score += rangePenalty(stroke.angleAbs, expected.angleAbs, 2.0);
  score += rangePenalty(stroke.width, expected.width, 1.0);
  score += rangePenalty(stroke.height, expected.height, 1.0);
  score += rangePenalty(stroke.centerX, expected.centerX, 1.0);
  score += rangePenalty(stroke.centerY, expected.centerY, 1.0);
  score += rangePenalty(stroke.straightness, expected.straightness, 1.5);

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
  return (
    valueInRange(stroke.angleAbs, expected.angleAbs) &&
    valueInRange(stroke.width, expected.width) &&
    valueInRange(stroke.height, expected.height) &&
    valueInRange(stroke.centerX, expected.centerX) &&
    valueInRange(stroke.centerY, expected.centerY) &&
    valueInRange(stroke.straightness, expected.straightness)
  );
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

function validateRelations({ descriptor, roleMatches, checks, failedChecks }) {
  for (const relation of descriptor.relations ?? []) {
    const checkName = buildRelationCheckName(relation);
    const ok = validateRelation(relation, roleMatches);

    checks[checkName] = ok;

    if (!ok) {
      failedChecks.push(checkName);
    }
  }
}

function buildRelationCheckName(relation) {
  if (relation.stroke) {
    return `${relation.type}.${relation.stroke}`;
  }

  return `${relation.type}.${relation.from}.${relation.to}`;
}

function validateRelation(relation, roleMatches) {
  const from = relation.from ? roleMatches[relation.from]?.stroke : null;
  const to = relation.to ? roleMatches[relation.to]?.stroke : null;
  const stroke = relation.stroke ? roleMatches[relation.stroke]?.stroke : null;

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

    case "crosses":
      return strokesCross(from, to);

    case "overlapsX":
      return Boolean(
        from && to && from.minX <= to.maxX && from.maxX >= to.minX,
      );

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

function strokesCross(a, b) {
  if (!a || !b) {
    return false;
  }

  return (
    b.centerX >= a.minX &&
    b.centerX <= a.maxX &&
    a.centerY >= b.minY &&
    a.centerY <= b.maxY
  );
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

function validateThreeVerticalZones({ kanji, features, descriptor }) {
  const geometry = features.geometry;

  if (!geometry) {
    return {
      isCorrect: false,
      score: 10,
      strategy: "descriptor_three_vertical_zones",
      reason: "missing_geometry_features",
      pattern: descriptor.pattern,
    };
  }

  const perStroke = geometry.perStroke ?? [];
  const rules = descriptor.rules ?? {};
  const expectedStrokeCount = descriptor.expectedStrokeCount ?? 3;

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
      strategy: "descriptor_three_vertical_zones",
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

  const minBboxWidth = rules.minBboxWidth ?? 0.35;
  const minBboxHeight = rules.minBboxHeight ?? 0.55;

  const minVerticalAngleAbs = rules.minVerticalAngleAbs ?? 0.65;
  const minHeightVsWidthRatio = rules.minHeightVsWidthRatio ?? 1.05;

  const minCenterVerticalHeight = rules.minCenterVerticalHeight ?? 0.6;
  const minRightVerticalHeight = rules.minRightVerticalHeight ?? 0.4;

  const centerVerticalCenterXMin = rules.centerVerticalCenterXMin ?? 0.25;
  const centerVerticalCenterXMax = rules.centerVerticalCenterXMax ?? 0.55;

  const rightStrokeCenterXMin = rules.rightStrokeCenterXMin ?? 0.55;
  const minRightCenterGap = rules.minRightCenterGap ?? 0.18;

  const minWideStrokeWidth = rules.minWideStrokeWidth ?? 0.45;
  const wideStrokeMinXMax = rules.wideStrokeMinXMax ?? 0.15;
  const wideStrokeMaxXMin = rules.wideStrokeMaxXMin ?? 0.55;
  const wideStrokeCenterYMin = rules.wideStrokeCenterYMin ?? 0.5;

  const minStraightnessMean = rules.minStraightnessMean ?? 0.55;
  const maxSoftFailures = rules.maxSoftFailures ?? 3;

  const isVerticalish = (stroke) => {
    const heightDominates =
      stroke.height >= stroke.width * minHeightVsWidthRatio;

    const angleLooksVertical = stroke.angleAbs >= minVerticalAngleAbs;

    return heightDominates || angleLooksVertical;
  };

  // En 山 real, uno de los trazos suele ser ancho/inferior.
  // Lo identificamos como el trazo de mayor anchura.
  const sortedByWidth = [...perStroke].sort((a, b) => b.width - a.width);
  const wideStroke = sortedByWidth[0];

  // Los otros dos deberían ser el trazo central y el derecho.
  const remainingStrokes = perStroke
    .filter((stroke) => stroke !== wideStroke)
    .sort((a, b) => a.centerX - b.centerX);

  const centerVerticalStroke = remainingStrokes[0] ?? null;
  const rightVerticalStroke = remainingStrokes[1] ?? null;

  const rightCenterGap =
    centerVerticalStroke && rightVerticalStroke
      ? rightVerticalStroke.centerX - centerVerticalStroke.centerX
      : 0;

  const checks = {
    strokeCount: features.strokeCountUser === expectedStrokeCount,
    referenceStrokeCount: features.strokeCountRef === expectedStrokeCount,

    bboxWidth: geometry.bboxWidth >= minBboxWidth,
    bboxHeight: geometry.bboxHeight >= minBboxHeight,

    hasWideStroke: Boolean(wideStroke),
    hasCenterVerticalStroke: Boolean(centerVerticalStroke),
    hasRightVerticalStroke: Boolean(rightVerticalStroke),

    wideStrokeIsWide:
      Boolean(wideStroke) && wideStroke.width >= minWideStrokeWidth,
    wideStrokeTouchesLeft:
      Boolean(wideStroke) && wideStroke.minX <= wideStrokeMinXMax,
    wideStrokeExtendsRight:
      Boolean(wideStroke) && wideStroke.maxX >= wideStrokeMaxXMin,
    wideStrokeIsLower:
      Boolean(wideStroke) && wideStroke.centerY >= wideStrokeCenterYMin,

    centerVerticalIsVerticalish:
      Boolean(centerVerticalStroke) && isVerticalish(centerVerticalStroke),
    centerVerticalHasHeight:
      Boolean(centerVerticalStroke) &&
      centerVerticalStroke.height >= minCenterVerticalHeight,
    centerVerticalInExpectedZone:
      Boolean(centerVerticalStroke) &&
      centerVerticalStroke.centerX >= centerVerticalCenterXMin &&
      centerVerticalStroke.centerX <= centerVerticalCenterXMax,

    rightVerticalIsVerticalish:
      Boolean(rightVerticalStroke) && isVerticalish(rightVerticalStroke),
    rightVerticalHasHeight:
      Boolean(rightVerticalStroke) &&
      rightVerticalStroke.height >= minRightVerticalHeight,
    rightVerticalInRightZone:
      Boolean(rightVerticalStroke) &&
      rightVerticalStroke.centerX >= rightStrokeCenterXMin,

    rightSeparatedFromCenter: rightCenterGap >= minRightCenterGap,

    straightnessMean: geometry.straightnessMean >= minStraightnessMean,

    // Check blando: el trazo ancho suele estar por debajo del inicio del central.
    wideStrokeStartsBelowCenterTop:
      Boolean(wideStroke) &&
      Boolean(centerVerticalStroke) &&
      wideStroke.minY >= centerVerticalStroke.minY + 0.15,
  };

  const hardCheckNames = [
    "strokeCount",
    "referenceStrokeCount",

    "bboxWidth",
    "bboxHeight",

    "hasWideStroke",
    "hasCenterVerticalStroke",
    "hasRightVerticalStroke",

    "wideStrokeIsWide",
    "wideStrokeTouchesLeft",
    "wideStrokeExtendsRight",
    "wideStrokeIsLower",

    "centerVerticalIsVerticalish",
    "centerVerticalHasHeight",
    "centerVerticalInExpectedZone",

    "rightVerticalIsVerticalish",
    "rightVerticalHasHeight",
    "rightVerticalInRightZone",

    "rightSeparatedFromCenter",
  ];

  const softCheckNames = ["straightnessMean", "wideStrokeStartsBelowCenterTop"];

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
    strategy: "descriptor_three_vertical_zones",
    pattern: descriptor.pattern,
    kanji,

    checks,
    failedChecks,
    hardFailedChecks,
    softFailedChecks,
    descriptorMatchScore,

    descriptor,

    details: {
      wideStroke,
      centerVerticalStroke,
      rightVerticalStroke,
      allStrokes: perStroke,
      rightCenterGap,
    },

    thresholds: {
      expectedStrokeCount,

      minBboxWidth,
      minBboxHeight,

      minVerticalAngleAbs,
      minHeightVsWidthRatio,

      minCenterVerticalHeight,
      minRightVerticalHeight,

      centerVerticalCenterXMin,
      centerVerticalCenterXMax,

      rightStrokeCenterXMin,
      minRightCenterGap,

      minWideStrokeWidth,
      wideStrokeMinXMax,
      wideStrokeMaxXMin,
      wideStrokeCenterYMin,

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
  // validateAboveRelation,
  // strokesCross,
};
