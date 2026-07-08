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

  if (descriptor.pattern === "box_pattern") {
    return validateBoxPattern({
      kanji,
      features,
      descriptor,
    });
  }

  if (descriptor.pattern === "box_with_inner_horizontal") {
    return validateBoxWithInnerHorizontal({
      kanji,
      features,
      descriptor,
    });
  }

  if (descriptor.pattern === "box_with_two_inner_horizontals") {
    return validateBoxWithTwoInnerHorizontals({
      kanji,
      features,
      descriptor,
    });
  }

  if (descriptor.pattern === "box_with_inner_cross") {
    return validateBoxWithInnerCross({
      kanji,
      features,
      descriptor,
    });
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

function validateBoxPattern({ kanji, features, descriptor }) {
  const geometry = features.geometry;

  if (!geometry) {
    return {
      isCorrect: false,
      score: 10,
      strategy: "descriptor_box_pattern",
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
      strategy: "descriptor_box_pattern",
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
  const minBboxHeight = rules.minBboxHeight ?? 0.45;
  const aspectRatioMin = rules.aspectRatioMin ?? 0.45;
  const aspectRatioMax = rules.aspectRatioMax ?? 1.8;

  const minVerticalAngleAbs = rules.minVerticalAngleAbs ?? 0.85;
  const minHorizontalAngleMax = rules.minHorizontalAngleMax ?? 0.55;
  const minHeightVsWidthRatio = rules.minHeightVsWidthRatio ?? 1.4;
  const minWidthVsHeightRatio = rules.minWidthVsHeightRatio ?? 1.4;

  const leftStrokeCenterXMax = rules.leftStrokeCenterXMax ?? 0.38;
  const leftStrokeMinXMax = rules.leftStrokeMinXMax ?? 0.25;
  const leftStrokeMinHeight = rules.leftStrokeMinHeight ?? 0.35;

  const bottomStrokeCenterYMin = rules.bottomStrokeCenterYMin ?? 0.5;
  const bottomStrokeMinWidth = rules.bottomStrokeMinWidth ?? 0.35;
  const bottomStrokeMaxYMin = rules.bottomStrokeMaxYMin ?? 0.55;
  const bottomStrokeDeltaYMin = rules.bottomStrokeDeltaYMin ?? -0.15;

  const outerStrokeMinWidth = rules.outerStrokeMinWidth ?? 0.35;
  const outerStrokeMinHeight = rules.outerStrokeMinHeight ?? 0.35;
  const outerStrokeMinYMax = rules.outerStrokeMinYMax ?? 0.35;
  const outerStrokeMaxXMin = rules.outerStrokeMaxXMin ?? 0.58;
  const outerStrokeMaxYMin = rules.outerStrokeMaxYMin ?? 0.45;
  const outerStrokeMaxStraightness = rules.outerStrokeMaxStraightness ?? 0.88;

  const minBoxHorizontalCoverage = rules.minBoxHorizontalCoverage ?? 0.55;
  const minBoxVerticalCoverage = rules.minBoxVerticalCoverage ?? 0.45;

  const minStraightnessMean = rules.minStraightnessMean ?? 0.5;
  const maxSoftFailures = rules.maxSoftFailures ?? 3;

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

  /*
   * Roles esperados para 口:
   *
   * - leftStroke:
   *   trazo vertical de la izquierda.
   *
   * - bottomStroke:
   *   trazo horizontal/inferior.
   *
   * - outerStroke:
   *   trazo superior + lateral derecho, normalmente más envolvente.
   *
   * No usamos el índice de escritura. Inferimos roles por geometría.
   */

  function rolePenalty(condition, penalty = 1) {
    return condition ? 0 : penalty;
  }

  function scoreLeftStrokeCandidate(stroke) {
    return (
      Math.abs(stroke.centerX - 0.15) * 2 +
      stroke.minX * 2 +
      rolePenalty(isVerticalish(stroke), 2) +
      rolePenalty(stroke.height >= leftStrokeMinHeight, 1.5) +
      rolePenalty(stroke.centerX <= leftStrokeCenterXMax, 1) +
      rolePenalty(stroke.minX <= leftStrokeMinXMax, 1)
    );
  }

  function scoreBottomStrokeCandidate(stroke) {
    return (
      Math.abs(stroke.centerY - 0.78) * 2 +
      Math.max(0, bottomStrokeCenterYMin - stroke.centerY) * 3 +
      Math.max(0, bottomStrokeMaxYMin - stroke.maxY) * 3 +
      rolePenalty(isHorizontalish(stroke), 2) +
      rolePenalty(stroke.width >= bottomStrokeMinWidth, 1.5) +
      rolePenalty(stroke.deltaY >= bottomStrokeDeltaYMin, 1.5)
    );
  }

  function scoreOuterStrokeCandidate(stroke) {
    return (
      Math.abs(stroke.maxX - 1.0) * 2 +
      stroke.minY +
      rolePenalty(stroke.width >= outerStrokeMinWidth, 1.5) +
      rolePenalty(stroke.height >= outerStrokeMinHeight, 1.5) +
      rolePenalty(stroke.minY <= outerStrokeMinYMax, 1) +
      rolePenalty(stroke.maxX >= outerStrokeMaxXMin, 1) +
      rolePenalty(stroke.maxY >= outerStrokeMaxYMin, 1) +
      rolePenalty(stroke.straightness <= outerStrokeMaxStraightness, 2.5)
    );
  }

  let bestRoleAssignment = null;
  let bestRoleAssignmentScore = Infinity;

  for (const leftCandidate of perStroke) {
    for (const bottomCandidate of perStroke) {
      if (bottomCandidate === leftCandidate) {
        continue;
      }

      for (const outerCandidate of perStroke) {
        if (
          outerCandidate === leftCandidate ||
          outerCandidate === bottomCandidate
        ) {
          continue;
        }

        const score =
          scoreLeftStrokeCandidate(leftCandidate) +
          scoreBottomStrokeCandidate(bottomCandidate) +
          scoreOuterStrokeCandidate(outerCandidate);

        if (score < bestRoleAssignmentScore) {
          bestRoleAssignmentScore = score;
          bestRoleAssignment = {
            leftStroke: leftCandidate,
            bottomStroke: bottomCandidate,
            outerStroke: outerCandidate,
          };
        }
      }
    }
  }

  const leftStroke = bestRoleAssignment?.leftStroke ?? null;
  const bottomStroke = bestRoleAssignment?.bottomStroke ?? null;
  const outerStroke = bestRoleAssignment?.outerStroke ?? null;

  const boxMinX = Math.min(...perStroke.map((stroke) => stroke.minX));
  const boxMaxX = Math.max(...perStroke.map((stroke) => stroke.maxX));
  const boxMinY = Math.min(...perStroke.map((stroke) => stroke.minY));
  const boxMaxY = Math.max(...perStroke.map((stroke) => stroke.maxY));

  const boxHorizontalCoverage = boxMaxX - boxMinX;
  const boxVerticalCoverage = boxMaxY - boxMinY;

  const checks = {
    strokeCount: features.strokeCountUser === expectedStrokeCount,
    referenceStrokeCount: features.strokeCountRef === expectedStrokeCount,

    bboxWidth: geometry.bboxWidth >= minBboxWidth,
    bboxHeight: geometry.bboxHeight >= minBboxHeight,
    aspectRatio:
      geometry.aspectRatio >= aspectRatioMin &&
      geometry.aspectRatio <= aspectRatioMax,

    hasLeftStroke: Boolean(leftStroke),
    hasBottomStroke: Boolean(bottomStroke),
    hasOuterStroke: Boolean(outerStroke),

    leftStrokeIsLeft:
      Boolean(leftStroke) &&
      leftStroke.centerX <= leftStrokeCenterXMax &&
      leftStroke.minX <= leftStrokeMinXMax,

    leftStrokeIsVerticalish: Boolean(leftStroke) && isVerticalish(leftStroke),

    leftStrokeHasHeight:
      Boolean(leftStroke) && leftStroke.height >= leftStrokeMinHeight,

    bottomStrokeIsLower:
      Boolean(bottomStroke) && bottomStroke.centerY >= bottomStrokeCenterYMin,

    bottomStrokeIsHorizontalish:
      Boolean(bottomStroke) && isHorizontalish(bottomStroke),

    bottomStrokeHasWidth:
      Boolean(bottomStroke) && bottomStroke.width >= bottomStrokeMinWidth,

    bottomStrokeReachesBottom:
      Boolean(bottomStroke) && bottomStroke.maxY >= bottomStrokeMaxYMin,

    bottomStrokeNotStronglyUpward:
      Boolean(bottomStroke) && bottomStroke.deltaY >= bottomStrokeDeltaYMin,

    outerStrokeHasWidth:
      Boolean(outerStroke) && outerStroke.width >= outerStrokeMinWidth,

    outerStrokeHasHeight:
      Boolean(outerStroke) && outerStroke.height >= outerStrokeMinHeight,

    outerStrokeStartsNearTop:
      Boolean(outerStroke) && outerStroke.minY <= outerStrokeMinYMax,

    outerStrokeExtendsRight:
      Boolean(outerStroke) && outerStroke.maxX >= outerStrokeMaxXMin,

    outerStrokeExtendsDown:
      Boolean(outerStroke) && outerStroke.maxY >= outerStrokeMaxYMin,

    outerStrokeHasCorner:
      Boolean(outerStroke) &&
      outerStroke.straightness <= outerStrokeMaxStraightness,

    boxHasHorizontalCoverage: boxHorizontalCoverage >= minBoxHorizontalCoverage,

    boxHasVerticalCoverage: boxVerticalCoverage >= minBoxVerticalCoverage,

    bottomBelowLeft:
      Boolean(bottomStroke) &&
      Boolean(leftStroke) &&
      bottomStroke.centerY > leftStroke.centerY,

    outerRightOfLeft:
      Boolean(outerStroke) &&
      Boolean(leftStroke) &&
      outerStroke.maxX > leftStroke.centerX,

    straightnessMean: geometry.straightnessMean >= minStraightnessMean,

    // Checks blandos de cierre aproximado.
    leftTouchesTopHalf: Boolean(leftStroke) && leftStroke.minY <= 0.35,

    leftTouchesBottomHalf: Boolean(leftStroke) && leftStroke.maxY >= 0.55,

    bottomTouchesLeftHalf: Boolean(bottomStroke) && bottomStroke.minX <= 0.45,

    bottomTouchesRightHalf: Boolean(bottomStroke) && bottomStroke.maxX >= 0.55,
  };

  const hardCheckNames = [
    "strokeCount",
    "referenceStrokeCount",

    "bboxWidth",
    "bboxHeight",
    "aspectRatio",

    "hasLeftStroke",
    "hasBottomStroke",
    "hasOuterStroke",

    "leftStrokeIsLeft",
    "leftStrokeIsVerticalish",
    "leftStrokeHasHeight",

    "bottomStrokeIsLower",
    "bottomStrokeIsHorizontalish",
    "bottomStrokeHasWidth",
    "bottomStrokeReachesBottom",
    "bottomStrokeNotStronglyUpward",

    "outerStrokeHasWidth",
    "outerStrokeHasHeight",
    "outerStrokeStartsNearTop",
    "outerStrokeExtendsRight",
    "outerStrokeExtendsDown",
    "outerStrokeHasCorner",

    "boxHasHorizontalCoverage",
    "boxHasVerticalCoverage",

    "bottomBelowLeft",
    "outerRightOfLeft",
  ];

  const softCheckNames = [
    "straightnessMean",
    "leftTouchesTopHalf",
    "leftTouchesBottomHalf",
    "bottomTouchesLeftHalf",
    "bottomTouchesRightHalf",
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
    strategy: "descriptor_box_pattern",
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
      bottomStroke,
      outerStroke,
      allStrokes: perStroke,
      boxHorizontalCoverage,
      boxVerticalCoverage,
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

      bottomStrokeCenterYMin,
      bottomStrokeMinWidth,
      bottomStrokeMaxYMin,
      bottomStrokeDeltaYMin,

      outerStrokeMinWidth,
      outerStrokeMinHeight,
      outerStrokeMinYMax,
      outerStrokeMaxXMin,
      outerStrokeMaxYMin,
      outerStrokeMaxStraightness,

      minBoxHorizontalCoverage,
      minBoxVerticalCoverage,

      minStraightnessMean,
      maxSoftFailures,
    },
  };
}

function validateBoxWithInnerHorizontal({ kanji, features, descriptor }) {
  const geometry = features.geometry;

  if (!geometry) {
    return {
      isCorrect: false,
      score: 10,
      strategy: "descriptor_box_with_inner_horizontal",
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
      strategy: "descriptor_box_with_inner_horizontal",
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
  const minHorizontalAngleMax = rules.minHorizontalAngleMax ?? 0.55;
  const minHeightVsWidthRatio = rules.minHeightVsWidthRatio ?? 1.4;
  const minWidthVsHeightRatio = rules.minWidthVsHeightRatio ?? 1.4;

  const leftStrokeCenterXMax = rules.leftStrokeCenterXMax ?? 0.42;
  const leftStrokeMinXMax = rules.leftStrokeMinXMax ?? 0.3;
  const leftStrokeMinHeight = rules.leftStrokeMinHeight ?? 0.45;

  const outerStrokeMinWidth = rules.outerStrokeMinWidth ?? 0.35;
  const outerStrokeMinHeight = rules.outerStrokeMinHeight ?? 0.45;
  const outerStrokeMinYMax = rules.outerStrokeMinYMax ?? 0.35;
  const outerStrokeMaxXMin = rules.outerStrokeMaxXMin ?? 0.58;
  const outerStrokeMaxYMin = rules.outerStrokeMaxYMin ?? 0.55;
  const outerStrokeMaxStraightness = rules.outerStrokeMaxStraightness ?? 0.9;

  const middleStrokeCenterYMin = rules.middleStrokeCenterYMin ?? 0.28;
  const middleStrokeCenterYMax = rules.middleStrokeCenterYMax ?? 0.72;
  const middleStrokeMinWidth = rules.middleStrokeMinWidth ?? 0.3;
  const middleStrokeMaxHeight = rules.middleStrokeMaxHeight ?? 0.25;
  const middleStrokeDeltaYMin = rules.middleStrokeDeltaYMin ?? -0.15;

  const bottomStrokeCenterYMin = rules.bottomStrokeCenterYMin ?? 0.62;
  const bottomStrokeMinWidth = rules.bottomStrokeMinWidth ?? 0.3;
  const bottomStrokeMaxYMin = rules.bottomStrokeMaxYMin ?? 0.65;
  const bottomStrokeDeltaYMin = rules.bottomStrokeDeltaYMin ?? -0.15;

  const minMiddleBottomGap = rules.minMiddleBottomGap ?? 0.08;
  const minMiddleOuterTopGap = rules.minMiddleOuterTopGap ?? 0.08;

  const minBoxHorizontalCoverage = rules.minBoxHorizontalCoverage ?? 0.55;
  const minBoxVerticalCoverage = rules.minBoxVerticalCoverage ?? 0.55;

  const minStraightnessMean = rules.minStraightnessMean ?? 0.5;
  const maxSoftFailures = rules.maxSoftFailures ?? 3;

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
      Math.abs(stroke.centerX - 0.15) * 2 +
      stroke.minX * 2 +
      rolePenalty(isVerticalish(stroke), 2) +
      rolePenalty(stroke.height >= leftStrokeMinHeight, 1.5) +
      rolePenalty(stroke.centerX <= leftStrokeCenterXMax, 1) +
      rolePenalty(stroke.minX <= leftStrokeMinXMax, 1)
    );
  }

  function scoreOuterStrokeCandidate(stroke) {
    return (
      Math.abs(stroke.maxX - 1.0) * 2 +
      stroke.minY +
      rolePenalty(stroke.width >= outerStrokeMinWidth, 1.5) +
      rolePenalty(stroke.height >= outerStrokeMinHeight, 1.5) +
      rolePenalty(stroke.minY <= outerStrokeMinYMax, 1) +
      rolePenalty(stroke.maxX >= outerStrokeMaxXMin, 1) +
      rolePenalty(stroke.maxY >= outerStrokeMaxYMin, 1) +
      rolePenalty(stroke.straightness <= outerStrokeMaxStraightness, 2)
    );
  }

  function scoreMiddleStrokeCandidate(stroke) {
    return (
      Math.abs(stroke.centerY - 0.5) * 2 +
      rolePenalty(isHorizontalish(stroke), 2) +
      rolePenalty(stroke.width >= middleStrokeMinWidth, 1.5) +
      rolePenalty(stroke.height <= middleStrokeMaxHeight, 1) +
      rolePenalty(stroke.centerY >= middleStrokeCenterYMin, 1) +
      rolePenalty(stroke.centerY <= middleStrokeCenterYMax, 1) +
      rolePenalty(stroke.deltaY >= middleStrokeDeltaYMin, 1)
    );
  }

  function scoreBottomStrokeCandidate(stroke) {
    return (
      Math.abs(stroke.centerY - 0.82) * 2 +
      Math.max(0, bottomStrokeCenterYMin - stroke.centerY) * 3 +
      Math.max(0, bottomStrokeMaxYMin - stroke.maxY) * 3 +
      rolePenalty(isHorizontalish(stroke), 2) +
      rolePenalty(stroke.width >= bottomStrokeMinWidth, 1.5) +
      rolePenalty(stroke.deltaY >= bottomStrokeDeltaYMin, 1.5)
    );
  }

  let bestRoleAssignment = null;
  let bestRoleAssignmentScore = Infinity;

  for (const leftCandidate of perStroke) {
    for (const outerCandidate of perStroke) {
      if (outerCandidate === leftCandidate) {
        continue;
      }

      for (const middleCandidate of perStroke) {
        if (
          middleCandidate === leftCandidate ||
          middleCandidate === outerCandidate
        ) {
          continue;
        }

        for (const bottomCandidate of perStroke) {
          if (
            bottomCandidate === leftCandidate ||
            bottomCandidate === outerCandidate ||
            bottomCandidate === middleCandidate
          ) {
            continue;
          }

          const orderPenalty =
            middleCandidate.centerY < bottomCandidate.centerY ? 0 : 3;

          const score =
            scoreLeftStrokeCandidate(leftCandidate) +
            scoreOuterStrokeCandidate(outerCandidate) +
            scoreMiddleStrokeCandidate(middleCandidate) +
            scoreBottomStrokeCandidate(bottomCandidate) +
            orderPenalty;

          if (score < bestRoleAssignmentScore) {
            bestRoleAssignmentScore = score;
            bestRoleAssignment = {
              leftStroke: leftCandidate,
              outerStroke: outerCandidate,
              middleStroke: middleCandidate,
              bottomStroke: bottomCandidate,
            };
          }
        }
      }
    }
  }

  const leftStroke = bestRoleAssignment?.leftStroke ?? null;
  const outerStroke = bestRoleAssignment?.outerStroke ?? null;
  const middleStroke = bestRoleAssignment?.middleStroke ?? null;
  const bottomStroke = bestRoleAssignment?.bottomStroke ?? null;

  const boxMinX = Math.min(...perStroke.map((stroke) => stroke.minX));
  const boxMaxX = Math.max(...perStroke.map((stroke) => stroke.maxX));
  const boxMinY = Math.min(...perStroke.map((stroke) => stroke.minY));
  const boxMaxY = Math.max(...perStroke.map((stroke) => stroke.maxY));

  const boxHorizontalCoverage = boxMaxX - boxMinX;
  const boxVerticalCoverage = boxMaxY - boxMinY;

  const middleBottomGap =
    middleStroke && bottomStroke
      ? bottomStroke.centerY - middleStroke.centerY
      : 0;

  const middleOuterTopGap =
    middleStroke && outerStroke ? middleStroke.centerY - outerStroke.minY : 0;

  const checks = {
    strokeCount: features.strokeCountUser === expectedStrokeCount,
    referenceStrokeCount: features.strokeCountRef === expectedStrokeCount,

    bboxWidth: geometry.bboxWidth >= minBboxWidth,
    bboxHeight: geometry.bboxHeight >= minBboxHeight,
    aspectRatio:
      geometry.aspectRatio >= aspectRatioMin &&
      geometry.aspectRatio <= aspectRatioMax,

    hasLeftStroke: Boolean(leftStroke),
    hasOuterStroke: Boolean(outerStroke),
    hasMiddleStroke: Boolean(middleStroke),
    hasBottomStroke: Boolean(bottomStroke),

    leftStrokeIsLeft:
      Boolean(leftStroke) &&
      leftStroke.centerX <= leftStrokeCenterXMax &&
      leftStroke.minX <= leftStrokeMinXMax,

    leftStrokeIsVerticalish: Boolean(leftStroke) && isVerticalish(leftStroke),

    leftStrokeHasHeight:
      Boolean(leftStroke) && leftStroke.height >= leftStrokeMinHeight,

    outerStrokeHasWidth:
      Boolean(outerStroke) && outerStroke.width >= outerStrokeMinWidth,

    outerStrokeHasHeight:
      Boolean(outerStroke) && outerStroke.height >= outerStrokeMinHeight,

    outerStrokeStartsNearTop:
      Boolean(outerStroke) && outerStroke.minY <= outerStrokeMinYMax,

    outerStrokeExtendsRight:
      Boolean(outerStroke) && outerStroke.maxX >= outerStrokeMaxXMin,

    outerStrokeExtendsDown:
      Boolean(outerStroke) && outerStroke.maxY >= outerStrokeMaxYMin,

    outerStrokeHasCorner:
      Boolean(outerStroke) &&
      outerStroke.straightness <= outerStrokeMaxStraightness,

    middleStrokeIsHorizontalish:
      Boolean(middleStroke) && isHorizontalish(middleStroke),

    middleStrokeHasWidth:
      Boolean(middleStroke) && middleStroke.width >= middleStrokeMinWidth,

    middleStrokeIsThin:
      Boolean(middleStroke) && middleStroke.height <= middleStrokeMaxHeight,

    middleStrokeYInRange:
      Boolean(middleStroke) &&
      middleStroke.centerY >= middleStrokeCenterYMin &&
      middleStroke.centerY <= middleStrokeCenterYMax,

    middleStrokeNotStronglyUpward:
      Boolean(middleStroke) && middleStroke.deltaY >= middleStrokeDeltaYMin,

    bottomStrokeIsLower:
      Boolean(bottomStroke) && bottomStroke.centerY >= bottomStrokeCenterYMin,

    bottomStrokeIsHorizontalish:
      Boolean(bottomStroke) && isHorizontalish(bottomStroke),

    bottomStrokeHasWidth:
      Boolean(bottomStroke) && bottomStroke.width >= bottomStrokeMinWidth,

    bottomStrokeReachesBottom:
      Boolean(bottomStroke) && bottomStroke.maxY >= bottomStrokeMaxYMin,

    bottomStrokeNotStronglyUpward:
      Boolean(bottomStroke) && bottomStroke.deltaY >= bottomStrokeDeltaYMin,

    middleAboveBottom:
      Boolean(middleStroke) &&
      Boolean(bottomStroke) &&
      middleBottomGap >= minMiddleBottomGap,

    middleBelowOuterTop:
      Boolean(middleStroke) &&
      Boolean(outerStroke) &&
      middleOuterTopGap >= minMiddleOuterTopGap,

    middleInsideBoxX:
      Boolean(middleStroke) &&
      Boolean(leftStroke) &&
      Boolean(outerStroke) &&
      middleStroke.maxX > leftStroke.centerX &&
      middleStroke.minX < outerStroke.maxX,

    bottomBelowLeft:
      Boolean(bottomStroke) &&
      Boolean(leftStroke) &&
      bottomStroke.centerY > leftStroke.centerY,

    outerRightOfLeft:
      Boolean(outerStroke) &&
      Boolean(leftStroke) &&
      outerStroke.maxX > leftStroke.centerX,

    boxHasHorizontalCoverage: boxHorizontalCoverage >= minBoxHorizontalCoverage,

    boxHasVerticalCoverage: boxVerticalCoverage >= minBoxVerticalCoverage,

    straightnessMean: geometry.straightnessMean >= minStraightnessMean,

    // Checks blandos de cierre aproximado.
    leftTouchesTopHalf: Boolean(leftStroke) && leftStroke.minY <= 0.35,

    leftTouchesBottomHalf: Boolean(leftStroke) && leftStroke.maxY >= 0.55,

    bottomTouchesLeftHalf: Boolean(bottomStroke) && bottomStroke.minX <= 0.45,

    bottomTouchesRightHalf: Boolean(bottomStroke) && bottomStroke.maxX >= 0.55,

    middleTouchesLeftHalf: Boolean(middleStroke) && middleStroke.minX <= 0.5,

    middleTouchesRightHalf: Boolean(middleStroke) && middleStroke.maxX >= 0.5,
  };

  const hardCheckNames = [
    "strokeCount",
    "referenceStrokeCount",

    "bboxWidth",
    "bboxHeight",
    "aspectRatio",

    "hasLeftStroke",
    "hasOuterStroke",
    "hasMiddleStroke",
    "hasBottomStroke",

    "leftStrokeIsLeft",
    "leftStrokeIsVerticalish",
    "leftStrokeHasHeight",

    "outerStrokeHasWidth",
    "outerStrokeHasHeight",
    "outerStrokeStartsNearTop",
    "outerStrokeExtendsRight",
    "outerStrokeExtendsDown",
    "outerStrokeHasCorner",

    "middleStrokeIsHorizontalish",
    "middleStrokeHasWidth",
    "middleStrokeIsThin",
    "middleStrokeYInRange",
    "middleStrokeNotStronglyUpward",

    "bottomStrokeIsLower",
    "bottomStrokeIsHorizontalish",
    "bottomStrokeHasWidth",
    "bottomStrokeReachesBottom",
    "bottomStrokeNotStronglyUpward",

    "middleAboveBottom",
    "middleBelowOuterTop",
    "middleInsideBoxX",

    "bottomBelowLeft",
    "outerRightOfLeft",

    "boxHasHorizontalCoverage",
    "boxHasVerticalCoverage",
  ];

  const softCheckNames = [
    "straightnessMean",
    "leftTouchesTopHalf",
    "leftTouchesBottomHalf",
    "bottomTouchesLeftHalf",
    "bottomTouchesRightHalf",
    "middleTouchesLeftHalf",
    "middleTouchesRightHalf",
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
    strategy: "descriptor_box_with_inner_horizontal",
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
      outerStroke,
      middleStroke,
      bottomStroke,
      allStrokes: perStroke,
      boxHorizontalCoverage,
      boxVerticalCoverage,
      middleBottomGap,
      middleOuterTopGap,
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

      outerStrokeMinWidth,
      outerStrokeMinHeight,
      outerStrokeMinYMax,
      outerStrokeMaxXMin,
      outerStrokeMaxYMin,
      outerStrokeMaxStraightness,

      middleStrokeCenterYMin,
      middleStrokeCenterYMax,
      middleStrokeMinWidth,
      middleStrokeMaxHeight,
      middleStrokeDeltaYMin,

      bottomStrokeCenterYMin,
      bottomStrokeMinWidth,
      bottomStrokeMaxYMin,
      bottomStrokeDeltaYMin,

      minMiddleBottomGap,
      minMiddleOuterTopGap,

      minBoxHorizontalCoverage,
      minBoxVerticalCoverage,

      minStraightnessMean,
      maxSoftFailures,
    },
  };
}

function validateBoxWithTwoInnerHorizontals({ kanji, features, descriptor }) {
  const geometry = features.geometry;

  if (!geometry) {
    return {
      isCorrect: false,
      score: 10,
      strategy: "descriptor_box_with_two_inner_horizontals",
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
      strategy: "descriptor_box_with_two_inner_horizontals",
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
  const aspectRatioMin = rules.aspectRatioMin ?? 0.4;
  const aspectRatioMax = rules.aspectRatioMax ?? 1.8;

  const minVerticalAngleAbs = rules.minVerticalAngleAbs ?? 0.85;
  const minHorizontalAngleMax = rules.minHorizontalAngleMax ?? 0.6;
  const minHeightVsWidthRatio = rules.minHeightVsWidthRatio ?? 1.35;
  const minWidthVsHeightRatio = rules.minWidthVsHeightRatio ?? 1.35;

  const leftStrokeCenterXMax = rules.leftStrokeCenterXMax ?? 0.42;
  const leftStrokeMinXMax = rules.leftStrokeMinXMax ?? 0.3;
  const leftStrokeMinHeight = rules.leftStrokeMinHeight ?? 0.5;

  const outerStrokeMinWidth = rules.outerStrokeMinWidth ?? 0.35;
  const outerStrokeMinHeight = rules.outerStrokeMinHeight ?? 0.5;
  const outerStrokeMinYMax = rules.outerStrokeMinYMax ?? 0.35;
  const outerStrokeMaxXMin = rules.outerStrokeMaxXMin ?? 0.44;
  const outerStrokeMaxYMin = rules.outerStrokeMaxYMin ?? 0.55;
  const outerStrokeMaxStraightness = rules.outerStrokeMaxStraightness ?? 0.92;

  const upperInnerStrokeCenterYMin = rules.upperInnerStrokeCenterYMin ?? 0.25;
  const upperInnerStrokeCenterYMax = rules.upperInnerStrokeCenterYMax ?? 0.58;
  const upperInnerStrokeMinWidth = rules.upperInnerStrokeMinWidth ?? 0.2;
  const upperInnerStrokeMaxHeight = rules.upperInnerStrokeMaxHeight ?? 0.25;
  const upperInnerStrokeDeltaYMin = rules.upperInnerStrokeDeltaYMin ?? -0.18;

  const lowerInnerStrokeCenterYMin = rules.lowerInnerStrokeCenterYMin ?? 0.38;
  const lowerInnerStrokeCenterYMax = rules.lowerInnerStrokeCenterYMax ?? 0.78;
  const lowerInnerStrokeMinWidth = rules.lowerInnerStrokeMinWidth ?? 0.2;
  const lowerInnerStrokeMaxHeight = rules.lowerInnerStrokeMaxHeight ?? 0.25;
  const lowerInnerStrokeDeltaYMin = rules.lowerInnerStrokeDeltaYMin ?? -0.18;

  const bottomStrokeCenterYMin = rules.bottomStrokeCenterYMin ?? 0.65;
  const bottomStrokeMinWidth = rules.bottomStrokeMinWidth ?? 0.25;
  const bottomStrokeMaxYMin = rules.bottomStrokeMaxYMin ?? 0.65;
  const bottomStrokeDeltaYMin = rules.bottomStrokeDeltaYMin ?? -0.22;

  const minUpperLowerGap = rules.minUpperLowerGap ?? 0.06;
  const minLowerBottomGap = rules.minLowerBottomGap ?? 0.06;
  const minUpperOuterTopGap = rules.minUpperOuterTopGap ?? 0.06;

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
      Math.abs(stroke.centerX - 0.15) * 2 +
      stroke.minX * 2 +
      rolePenalty(isVerticalish(stroke), 2) +
      rolePenalty(stroke.height >= leftStrokeMinHeight, 1.5) +
      rolePenalty(stroke.centerX <= leftStrokeCenterXMax, 1) +
      rolePenalty(stroke.minX <= leftStrokeMinXMax, 1)
    );
  }

  function scoreOuterStrokeCandidate(stroke) {
    return (
      Math.abs(stroke.maxX - 1.0) * 2 +
      stroke.minY +
      rolePenalty(stroke.width >= outerStrokeMinWidth, 1.5) +
      rolePenalty(stroke.height >= outerStrokeMinHeight, 1.5) +
      rolePenalty(stroke.minY <= outerStrokeMinYMax, 1) +
      rolePenalty(stroke.maxX >= outerStrokeMaxXMin, 1) +
      rolePenalty(stroke.maxY >= outerStrokeMaxYMin, 1) +
      rolePenalty(stroke.straightness <= outerStrokeMaxStraightness, 2)
    );
  }

  function scoreUpperInnerStrokeCandidate(stroke) {
    return (
      Math.abs(stroke.centerY - 0.4) * 2 +
      rolePenalty(isHorizontalish(stroke), 2) +
      rolePenalty(stroke.width >= upperInnerStrokeMinWidth, 1.5) +
      rolePenalty(stroke.height <= upperInnerStrokeMaxHeight, 1) +
      rolePenalty(stroke.centerY >= upperInnerStrokeCenterYMin, 1) +
      rolePenalty(stroke.centerY <= upperInnerStrokeCenterYMax, 1) +
      rolePenalty(stroke.deltaY >= upperInnerStrokeDeltaYMin, 1)
    );
  }

  function scoreLowerInnerStrokeCandidate(stroke) {
    return (
      Math.abs(stroke.centerY - 0.58) * 2 +
      rolePenalty(isHorizontalish(stroke), 2) +
      rolePenalty(stroke.width >= lowerInnerStrokeMinWidth, 1.5) +
      rolePenalty(stroke.height <= lowerInnerStrokeMaxHeight, 1) +
      rolePenalty(stroke.centerY >= lowerInnerStrokeCenterYMin, 1) +
      rolePenalty(stroke.centerY <= lowerInnerStrokeCenterYMax, 1) +
      rolePenalty(stroke.deltaY >= lowerInnerStrokeDeltaYMin, 1)
    );
  }

  function scoreBottomStrokeCandidate(stroke) {
    return (
      Math.abs(stroke.centerY - 0.86) * 2 +
      Math.max(0, bottomStrokeCenterYMin - stroke.centerY) * 3 +
      Math.max(0, bottomStrokeMaxYMin - stroke.maxY) * 3 +
      rolePenalty(isHorizontalish(stroke), 2) +
      rolePenalty(stroke.width >= bottomStrokeMinWidth, 1.5) +
      rolePenalty(stroke.deltaY >= bottomStrokeDeltaYMin, 1.5)
    );
  }

  let bestRoleAssignment = null;
  let bestRoleAssignmentScore = Infinity;

  for (const leftCandidate of perStroke) {
    for (const outerCandidate of perStroke) {
      if (outerCandidate === leftCandidate) {
        continue;
      }

      for (const upperInnerCandidate of perStroke) {
        if (
          upperInnerCandidate === leftCandidate ||
          upperInnerCandidate === outerCandidate
        ) {
          continue;
        }

        for (const lowerInnerCandidate of perStroke) {
          if (
            lowerInnerCandidate === leftCandidate ||
            lowerInnerCandidate === outerCandidate ||
            lowerInnerCandidate === upperInnerCandidate
          ) {
            continue;
          }

          for (const bottomCandidate of perStroke) {
            if (
              bottomCandidate === leftCandidate ||
              bottomCandidate === outerCandidate ||
              bottomCandidate === upperInnerCandidate ||
              bottomCandidate === lowerInnerCandidate
            ) {
              continue;
            }

            const upperLowerOrderPenalty =
              upperInnerCandidate.centerY < lowerInnerCandidate.centerY ? 0 : 3;

            const lowerBottomOrderPenalty =
              lowerInnerCandidate.centerY < bottomCandidate.centerY ? 0 : 3;

            const score =
              scoreLeftStrokeCandidate(leftCandidate) +
              scoreOuterStrokeCandidate(outerCandidate) +
              scoreUpperInnerStrokeCandidate(upperInnerCandidate) +
              scoreLowerInnerStrokeCandidate(lowerInnerCandidate) +
              scoreBottomStrokeCandidate(bottomCandidate) +
              upperLowerOrderPenalty +
              lowerBottomOrderPenalty;

            if (score < bestRoleAssignmentScore) {
              bestRoleAssignmentScore = score;
              bestRoleAssignment = {
                leftStroke: leftCandidate,
                outerStroke: outerCandidate,
                upperInnerStroke: upperInnerCandidate,
                lowerInnerStroke: lowerInnerCandidate,
                bottomStroke: bottomCandidate,
              };
            }
          }
        }
      }
    }
  }

  const leftStroke = bestRoleAssignment?.leftStroke ?? null;
  const outerStroke = bestRoleAssignment?.outerStroke ?? null;
  const upperInnerStroke = bestRoleAssignment?.upperInnerStroke ?? null;
  const lowerInnerStroke = bestRoleAssignment?.lowerInnerStroke ?? null;
  const bottomStroke = bestRoleAssignment?.bottomStroke ?? null;

  const boxMinX = Math.min(...perStroke.map((stroke) => stroke.minX));
  const boxMaxX = Math.max(...perStroke.map((stroke) => stroke.maxX));
  const boxMinY = Math.min(...perStroke.map((stroke) => stroke.minY));
  const boxMaxY = Math.max(...perStroke.map((stroke) => stroke.maxY));

  const boxHorizontalCoverage = boxMaxX - boxMinX;
  const boxVerticalCoverage = boxMaxY - boxMinY;

  const upperLowerGap =
    upperInnerStroke && lowerInnerStroke
      ? lowerInnerStroke.centerY - upperInnerStroke.centerY
      : 0;

  const lowerBottomGap =
    lowerInnerStroke && bottomStroke
      ? bottomStroke.centerY - lowerInnerStroke.centerY
      : 0;

  const upperOuterTopGap =
    upperInnerStroke && outerStroke
      ? upperInnerStroke.centerY - outerStroke.minY
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
    hasOuterStroke: Boolean(outerStroke),
    hasUpperInnerStroke: Boolean(upperInnerStroke),
    hasLowerInnerStroke: Boolean(lowerInnerStroke),
    hasBottomStroke: Boolean(bottomStroke),

    leftStrokeIsLeft:
      Boolean(leftStroke) &&
      leftStroke.centerX <= leftStrokeCenterXMax &&
      leftStroke.minX <= leftStrokeMinXMax,

    leftStrokeIsVerticalish: Boolean(leftStroke) && isVerticalish(leftStroke),

    leftStrokeHasHeight:
      Boolean(leftStroke) && leftStroke.height >= leftStrokeMinHeight,

    outerStrokeHasWidth:
      Boolean(outerStroke) && outerStroke.width >= outerStrokeMinWidth,

    outerStrokeHasHeight:
      Boolean(outerStroke) && outerStroke.height >= outerStrokeMinHeight,

    outerStrokeStartsNearTop:
      Boolean(outerStroke) && outerStroke.minY <= outerStrokeMinYMax,

    outerStrokeExtendsRight:
      Boolean(outerStroke) && outerStroke.maxX >= outerStrokeMaxXMin,

    outerStrokeExtendsDown:
      Boolean(outerStroke) && outerStroke.maxY >= outerStrokeMaxYMin,

    outerStrokeHasCorner:
      Boolean(outerStroke) &&
      outerStroke.straightness <= outerStrokeMaxStraightness,

    upperInnerStrokeIsHorizontalish:
      Boolean(upperInnerStroke) && isHorizontalish(upperInnerStroke),

    upperInnerStrokeHasWidth:
      Boolean(upperInnerStroke) &&
      upperInnerStroke.width >= upperInnerStrokeMinWidth,

    upperInnerStrokeIsThin:
      Boolean(upperInnerStroke) &&
      upperInnerStroke.height <= upperInnerStrokeMaxHeight,

    upperInnerStrokeYInRange:
      Boolean(upperInnerStroke) &&
      upperInnerStroke.centerY >= upperInnerStrokeCenterYMin &&
      upperInnerStroke.centerY <= upperInnerStrokeCenterYMax,

    upperInnerStrokeNotStronglyUpward:
      Boolean(upperInnerStroke) &&
      upperInnerStroke.deltaY >= upperInnerStrokeDeltaYMin,

    lowerInnerStrokeIsHorizontalish:
      Boolean(lowerInnerStroke) && isHorizontalish(lowerInnerStroke),

    lowerInnerStrokeHasWidth:
      Boolean(lowerInnerStroke) &&
      lowerInnerStroke.width >= lowerInnerStrokeMinWidth,

    lowerInnerStrokeIsThin:
      Boolean(lowerInnerStroke) &&
      lowerInnerStroke.height <= lowerInnerStrokeMaxHeight,

    lowerInnerStrokeYInRange:
      Boolean(lowerInnerStroke) &&
      lowerInnerStroke.centerY >= lowerInnerStrokeCenterYMin &&
      lowerInnerStroke.centerY <= lowerInnerStrokeCenterYMax,

    lowerInnerStrokeNotStronglyUpward:
      Boolean(lowerInnerStroke) &&
      lowerInnerStroke.deltaY >= lowerInnerStrokeDeltaYMin,

    bottomStrokeIsLower:
      Boolean(bottomStroke) && bottomStroke.centerY >= bottomStrokeCenterYMin,

    bottomStrokeIsHorizontalish:
      Boolean(bottomStroke) && isHorizontalish(bottomStroke),

    bottomStrokeHasWidth:
      Boolean(bottomStroke) && bottomStroke.width >= bottomStrokeMinWidth,

    bottomStrokeReachesBottom:
      Boolean(bottomStroke) && bottomStroke.maxY >= bottomStrokeMaxYMin,

    bottomStrokeNotStronglyUpward:
      Boolean(bottomStroke) && bottomStroke.deltaY >= bottomStrokeDeltaYMin,

    upperAboveLower:
      Boolean(upperInnerStroke) &&
      Boolean(lowerInnerStroke) &&
      upperLowerGap >= minUpperLowerGap,

    lowerAboveBottom:
      Boolean(lowerInnerStroke) &&
      Boolean(bottomStroke) &&
      lowerBottomGap >= minLowerBottomGap,

    upperBelowOuterTop:
      Boolean(upperInnerStroke) &&
      Boolean(outerStroke) &&
      upperOuterTopGap >= minUpperOuterTopGap,

    upperInsideBoxX:
      Boolean(upperInnerStroke) &&
      Boolean(leftStroke) &&
      Boolean(outerStroke) &&
      upperInnerStroke.maxX > leftStroke.centerX &&
      upperInnerStroke.minX < outerStroke.maxX,

    lowerInsideBoxX:
      Boolean(lowerInnerStroke) &&
      Boolean(leftStroke) &&
      Boolean(outerStroke) &&
      lowerInnerStroke.maxX > leftStroke.centerX &&
      lowerInnerStroke.minX < outerStroke.maxX,

    bottomBelowLeft:
      Boolean(bottomStroke) &&
      Boolean(leftStroke) &&
      bottomStroke.centerY > leftStroke.centerY,

    outerRightOfLeft:
      Boolean(outerStroke) &&
      Boolean(leftStroke) &&
      outerStroke.maxX > leftStroke.centerX,

    boxHasHorizontalCoverage: boxHorizontalCoverage >= minBoxHorizontalCoverage,

    boxHasVerticalCoverage: boxVerticalCoverage >= minBoxVerticalCoverage,

    straightnessMean: geometry.straightnessMean >= minStraightnessMean,

    // Checks blandos de cierre aproximado.
    leftTouchesTopHalf: Boolean(leftStroke) && leftStroke.minY <= 0.35,

    leftTouchesBottomHalf: Boolean(leftStroke) && leftStroke.maxY >= 0.55,

    bottomTouchesLeftHalf: Boolean(bottomStroke) && bottomStroke.minX <= 0.45,

    bottomTouchesRightHalf: Boolean(bottomStroke) && bottomStroke.maxX >= 0.55,

    upperTouchesLeftHalf:
      Boolean(upperInnerStroke) && upperInnerStroke.minX <= 0.5,

    upperTouchesRightHalf:
      Boolean(upperInnerStroke) && upperInnerStroke.maxX >= 0.5,

    lowerTouchesLeftHalf:
      Boolean(lowerInnerStroke) && lowerInnerStroke.minX <= 0.5,

    lowerTouchesRightHalf:
      Boolean(lowerInnerStroke) && lowerInnerStroke.maxX >= 0.5,
  };

  const hardCheckNames = [
    "strokeCount",
    "referenceStrokeCount",

    "bboxWidth",
    "bboxHeight",
    "aspectRatio",

    "hasLeftStroke",
    "hasOuterStroke",
    "hasUpperInnerStroke",
    "hasLowerInnerStroke",
    "hasBottomStroke",

    "leftStrokeIsLeft",
    "leftStrokeIsVerticalish",
    "leftStrokeHasHeight",

    "outerStrokeHasWidth",
    "outerStrokeHasHeight",
    "outerStrokeStartsNearTop",
    "outerStrokeExtendsRight",
    "outerStrokeExtendsDown",
    "outerStrokeHasCorner",

    "upperInnerStrokeIsHorizontalish",
    "upperInnerStrokeHasWidth",
    "upperInnerStrokeIsThin",
    "upperInnerStrokeYInRange",
    "upperInnerStrokeNotStronglyUpward",

    "lowerInnerStrokeIsHorizontalish",
    "lowerInnerStrokeHasWidth",
    "lowerInnerStrokeIsThin",
    "lowerInnerStrokeYInRange",
    "lowerInnerStrokeNotStronglyUpward",

    "bottomStrokeIsLower",
    "bottomStrokeIsHorizontalish",
    "bottomStrokeHasWidth",
    "bottomStrokeReachesBottom",
    "bottomStrokeNotStronglyUpward",

    "upperAboveLower",
    "lowerAboveBottom",
    "upperBelowOuterTop",
    "upperInsideBoxX",
    "lowerInsideBoxX",

    "bottomBelowLeft",
    "outerRightOfLeft",

    "boxHasHorizontalCoverage",
    "boxHasVerticalCoverage",
  ];

  const softCheckNames = [
    "straightnessMean",
    "leftTouchesTopHalf",
    "leftTouchesBottomHalf",
    "bottomTouchesLeftHalf",
    "bottomTouchesRightHalf",
    "upperTouchesLeftHalf",
    "upperTouchesRightHalf",
    "lowerTouchesLeftHalf",
    "lowerTouchesRightHalf",
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
    strategy: "descriptor_box_with_two_inner_horizontals",
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
      outerStroke,
      upperInnerStroke,
      lowerInnerStroke,
      bottomStroke,
      allStrokes: perStroke,
      boxHorizontalCoverage,
      boxVerticalCoverage,
      upperLowerGap,
      lowerBottomGap,
      upperOuterTopGap,
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

      outerStrokeMinWidth,
      outerStrokeMinHeight,
      outerStrokeMinYMax,
      outerStrokeMaxXMin,
      outerStrokeMaxYMin,
      outerStrokeMaxStraightness,

      upperInnerStrokeCenterYMin,
      upperInnerStrokeCenterYMax,
      upperInnerStrokeMinWidth,
      upperInnerStrokeMaxHeight,
      upperInnerStrokeDeltaYMin,

      lowerInnerStrokeCenterYMin,
      lowerInnerStrokeCenterYMax,
      lowerInnerStrokeMinWidth,
      lowerInnerStrokeMaxHeight,
      lowerInnerStrokeDeltaYMin,

      bottomStrokeCenterYMin,
      bottomStrokeMinWidth,
      bottomStrokeMaxYMin,
      bottomStrokeDeltaYMin,

      minUpperLowerGap,
      minLowerBottomGap,
      minUpperOuterTopGap,

      minBoxHorizontalCoverage,
      minBoxVerticalCoverage,

      minStraightnessMean,
      maxSoftFailures,
    },
  };
}

function validateBoxWithInnerCross({ kanji, features, descriptor }) {
  const geometry = features.geometry;

  if (!geometry) {
    return {
      isCorrect: false,
      score: 10,
      strategy: "descriptor_box_with_inner_cross",
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
      strategy: "descriptor_box_with_inner_cross",
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
  const minHeightVsWidthRatio = rules.minHeightVsWidthRatio ?? 1.35;
  const minWidthVsHeightRatio = rules.minWidthVsHeightRatio ?? 1.35;

  const leftStrokeCenterXMax = rules.leftStrokeCenterXMax ?? 0.42;
  const leftStrokeMinXMax = rules.leftStrokeMinXMax ?? 0.3;
  const leftStrokeMinHeight = rules.leftStrokeMinHeight ?? 0.45;

  const outerStrokeMinWidth = rules.outerStrokeMinWidth ?? 0.35;
  const outerStrokeMinHeight = rules.outerStrokeMinHeight ?? 0.45;
  const outerStrokeMinYMax = rules.outerStrokeMinYMax ?? 0.35;
  const outerStrokeMaxXMin = rules.outerStrokeMaxXMin ?? 0.44;
  const outerStrokeMaxYMin = rules.outerStrokeMaxYMin ?? 0.55;
  const outerStrokeMaxStraightness = rules.outerStrokeMaxStraightness ?? 0.92;

  const innerHorizontalCenterYMin = rules.innerHorizontalCenterYMin ?? 0.28;
  const innerHorizontalCenterYMax = rules.innerHorizontalCenterYMax ?? 0.72;
  const innerHorizontalMinWidth = rules.innerHorizontalMinWidth ?? 0.22;
  const innerHorizontalMaxHeight = rules.innerHorizontalMaxHeight ?? 0.3;
  const innerHorizontalDeltaYMin = rules.innerHorizontalDeltaYMin ?? -0.22;

  const innerVerticalCenterXMin = rules.innerVerticalCenterXMin ?? 0.25;
  const innerVerticalCenterXMax = rules.innerVerticalCenterXMax ?? 0.75;
  const innerVerticalMinHeight = rules.innerVerticalMinHeight ?? 0.3;
  const innerVerticalMaxWidth = rules.innerVerticalMaxWidth ?? 0.3;

  const bottomStrokeCenterYMin = rules.bottomStrokeCenterYMin ?? 0.62;
  const bottomStrokeMinWidth = rules.bottomStrokeMinWidth ?? 0.25;
  const bottomStrokeMaxYMin = rules.bottomStrokeMaxYMin ?? 0.62;
  const bottomStrokeDeltaYMin = rules.bottomStrokeDeltaYMin ?? -0.22;

  const minHorizontalBottomGap = rules.minHorizontalBottomGap ?? 0.06;
  const minHorizontalOuterTopGap = rules.minHorizontalOuterTopGap ?? 0.06;

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
      Math.abs(stroke.centerX - 0.15) * 2 +
      stroke.minX * 2 +
      rolePenalty(isVerticalish(stroke), 2) +
      rolePenalty(stroke.height >= leftStrokeMinHeight, 1.5) +
      rolePenalty(stroke.centerX <= leftStrokeCenterXMax, 1) +
      rolePenalty(stroke.minX <= leftStrokeMinXMax, 1)
    );
  }

  function scoreOuterStrokeCandidate(stroke) {
    return (
      Math.abs(stroke.maxX - 1.0) * 2 +
      stroke.minY +
      rolePenalty(stroke.width >= outerStrokeMinWidth, 1.5) +
      rolePenalty(stroke.height >= outerStrokeMinHeight, 1.5) +
      rolePenalty(stroke.minY <= outerStrokeMinYMax, 1) +
      rolePenalty(stroke.maxX >= outerStrokeMaxXMin, 1) +
      rolePenalty(stroke.maxY >= outerStrokeMaxYMin, 1) +
      rolePenalty(stroke.straightness <= outerStrokeMaxStraightness, 2)
    );
  }

  function scoreInnerHorizontalStrokeCandidate(stroke) {
    return (
      Math.abs(stroke.centerY - 0.5) * 2 +
      rolePenalty(isHorizontalish(stroke), 2) +
      rolePenalty(stroke.width >= innerHorizontalMinWidth, 1.5) +
      rolePenalty(stroke.height <= innerHorizontalMaxHeight, 1) +
      rolePenalty(stroke.centerY >= innerHorizontalCenterYMin, 1) +
      rolePenalty(stroke.centerY <= innerHorizontalCenterYMax, 1) +
      rolePenalty(stroke.deltaY >= innerHorizontalDeltaYMin, 1)
    );
  }

  function scoreInnerVerticalStrokeCandidate(stroke) {
    return (
      Math.abs(stroke.centerX - 0.5) * 2 +
      rolePenalty(isVerticalish(stroke), 2) +
      rolePenalty(stroke.height >= innerVerticalMinHeight, 1.5) +
      rolePenalty(stroke.width <= innerVerticalMaxWidth, 1) +
      rolePenalty(stroke.centerX >= innerVerticalCenterXMin, 1) +
      rolePenalty(stroke.centerX <= innerVerticalCenterXMax, 1)
    );
  }

  function scoreBottomStrokeCandidate(stroke) {
    return (
      Math.abs(stroke.centerY - 0.84) * 2 +
      Math.max(0, bottomStrokeCenterYMin - stroke.centerY) * 3 +
      Math.max(0, bottomStrokeMaxYMin - stroke.maxY) * 3 +
      rolePenalty(isHorizontalish(stroke), 2) +
      rolePenalty(stroke.width >= bottomStrokeMinWidth, 1.5) +
      rolePenalty(stroke.deltaY >= bottomStrokeDeltaYMin, 1.5)
    );
  }

  let bestRoleAssignment = null;
  let bestRoleAssignmentScore = Infinity;

  for (const leftCandidate of perStroke) {
    for (const outerCandidate of perStroke) {
      if (outerCandidate === leftCandidate) {
        continue;
      }

      for (const innerHorizontalCandidate of perStroke) {
        if (
          innerHorizontalCandidate === leftCandidate ||
          innerHorizontalCandidate === outerCandidate
        ) {
          continue;
        }

        for (const innerVerticalCandidate of perStroke) {
          if (
            innerVerticalCandidate === leftCandidate ||
            innerVerticalCandidate === outerCandidate ||
            innerVerticalCandidate === innerHorizontalCandidate
          ) {
            continue;
          }

          for (const bottomCandidate of perStroke) {
            if (
              bottomCandidate === leftCandidate ||
              bottomCandidate === outerCandidate ||
              bottomCandidate === innerHorizontalCandidate ||
              bottomCandidate === innerVerticalCandidate
            ) {
              continue;
            }

            const horizontalBottomOrderPenalty =
              innerHorizontalCandidate.centerY < bottomCandidate.centerY
                ? 0
                : 3;

            const score =
              scoreLeftStrokeCandidate(leftCandidate) +
              scoreOuterStrokeCandidate(outerCandidate) +
              scoreInnerHorizontalStrokeCandidate(innerHorizontalCandidate) +
              scoreInnerVerticalStrokeCandidate(innerVerticalCandidate) +
              scoreBottomStrokeCandidate(bottomCandidate) +
              horizontalBottomOrderPenalty;

            if (score < bestRoleAssignmentScore) {
              bestRoleAssignmentScore = score;
              bestRoleAssignment = {
                leftStroke: leftCandidate,
                outerStroke: outerCandidate,
                innerHorizontalStroke: innerHorizontalCandidate,
                innerVerticalStroke: innerVerticalCandidate,
                bottomStroke: bottomCandidate,
              };
            }
          }
        }
      }
    }
  }

  const leftStroke = bestRoleAssignment?.leftStroke ?? null;
  const outerStroke = bestRoleAssignment?.outerStroke ?? null;
  const innerHorizontalStroke =
    bestRoleAssignment?.innerHorizontalStroke ?? null;
  const innerVerticalStroke = bestRoleAssignment?.innerVerticalStroke ?? null;
  const bottomStroke = bestRoleAssignment?.bottomStroke ?? null;

  const boxMinX = Math.min(...perStroke.map((stroke) => stroke.minX));
  const boxMaxX = Math.max(...perStroke.map((stroke) => stroke.maxX));
  const boxMinY = Math.min(...perStroke.map((stroke) => stroke.minY));
  const boxMaxY = Math.max(...perStroke.map((stroke) => stroke.maxY));

  const boxHorizontalCoverage = boxMaxX - boxMinX;
  const boxVerticalCoverage = boxMaxY - boxMinY;

  const horizontalBottomGap =
    innerHorizontalStroke && bottomStroke
      ? bottomStroke.centerY - innerHorizontalStroke.centerY
      : 0;

  const horizontalOuterTopGap =
    innerHorizontalStroke && outerStroke
      ? innerHorizontalStroke.centerY - outerStroke.minY
      : 0;

  const innerCrosses =
    Boolean(innerHorizontalStroke) &&
    Boolean(innerVerticalStroke) &&
    innerHorizontalStroke.minX <= innerVerticalStroke.centerX &&
    innerHorizontalStroke.maxX >= innerVerticalStroke.centerX &&
    innerVerticalStroke.minY <= innerHorizontalStroke.centerY &&
    innerVerticalStroke.maxY >= innerHorizontalStroke.centerY;

  const checks = {
    strokeCount: features.strokeCountUser === expectedStrokeCount,
    referenceStrokeCount: features.strokeCountRef === expectedStrokeCount,

    bboxWidth: geometry.bboxWidth >= minBboxWidth,
    bboxHeight: geometry.bboxHeight >= minBboxHeight,
    aspectRatio:
      geometry.aspectRatio >= aspectRatioMin &&
      geometry.aspectRatio <= aspectRatioMax,

    hasLeftStroke: Boolean(leftStroke),
    hasOuterStroke: Boolean(outerStroke),
    hasInnerHorizontalStroke: Boolean(innerHorizontalStroke),
    hasInnerVerticalStroke: Boolean(innerVerticalStroke),
    hasBottomStroke: Boolean(bottomStroke),

    leftStrokeIsLeft:
      Boolean(leftStroke) &&
      leftStroke.centerX <= leftStrokeCenterXMax &&
      leftStroke.minX <= leftStrokeMinXMax,

    leftStrokeIsVerticalish: Boolean(leftStroke) && isVerticalish(leftStroke),

    leftStrokeHasHeight:
      Boolean(leftStroke) && leftStroke.height >= leftStrokeMinHeight,

    outerStrokeHasWidth:
      Boolean(outerStroke) && outerStroke.width >= outerStrokeMinWidth,

    outerStrokeHasHeight:
      Boolean(outerStroke) && outerStroke.height >= outerStrokeMinHeight,

    outerStrokeStartsNearTop:
      Boolean(outerStroke) && outerStroke.minY <= outerStrokeMinYMax,

    outerStrokeExtendsRight:
      Boolean(outerStroke) && outerStroke.maxX >= outerStrokeMaxXMin,

    outerStrokeExtendsDown:
      Boolean(outerStroke) && outerStroke.maxY >= outerStrokeMaxYMin,

    outerStrokeHasCorner:
      Boolean(outerStroke) &&
      outerStroke.straightness <= outerStrokeMaxStraightness,

    innerHorizontalIsHorizontalish:
      Boolean(innerHorizontalStroke) && isHorizontalish(innerHorizontalStroke),

    innerHorizontalHasWidth:
      Boolean(innerHorizontalStroke) &&
      innerHorizontalStroke.width >= innerHorizontalMinWidth,

    innerHorizontalIsThin:
      Boolean(innerHorizontalStroke) &&
      innerHorizontalStroke.height <= innerHorizontalMaxHeight,

    innerHorizontalYInRange:
      Boolean(innerHorizontalStroke) &&
      innerHorizontalStroke.centerY >= innerHorizontalCenterYMin &&
      innerHorizontalStroke.centerY <= innerHorizontalCenterYMax,

    innerHorizontalNotStronglyUpward:
      Boolean(innerHorizontalStroke) &&
      innerHorizontalStroke.deltaY >= innerHorizontalDeltaYMin,

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

    bottomStrokeIsLower:
      Boolean(bottomStroke) && bottomStroke.centerY >= bottomStrokeCenterYMin,

    bottomStrokeIsHorizontalish:
      Boolean(bottomStroke) && isHorizontalish(bottomStroke),

    bottomStrokeHasWidth:
      Boolean(bottomStroke) && bottomStroke.width >= bottomStrokeMinWidth,

    bottomStrokeReachesBottom:
      Boolean(bottomStroke) && bottomStroke.maxY >= bottomStrokeMaxYMin,

    bottomStrokeNotStronglyUpward:
      Boolean(bottomStroke) && bottomStroke.deltaY >= bottomStrokeDeltaYMin,

    innerCrosses,

    horizontalAboveBottom:
      Boolean(innerHorizontalStroke) &&
      Boolean(bottomStroke) &&
      horizontalBottomGap >= minHorizontalBottomGap,

    horizontalBelowOuterTop:
      Boolean(innerHorizontalStroke) &&
      Boolean(outerStroke) &&
      horizontalOuterTopGap >= minHorizontalOuterTopGap,

    innerHorizontalInsideBoxX:
      Boolean(innerHorizontalStroke) &&
      Boolean(leftStroke) &&
      Boolean(outerStroke) &&
      innerHorizontalStroke.maxX > leftStroke.centerX &&
      innerHorizontalStroke.minX < outerStroke.maxX,

    innerVerticalInsideBoxY:
      Boolean(innerVerticalStroke) &&
      Boolean(outerStroke) &&
      Boolean(bottomStroke) &&
      innerVerticalStroke.maxY > outerStroke.minY &&
      innerVerticalStroke.minY < bottomStroke.centerY,

    bottomBelowLeft:
      Boolean(bottomStroke) &&
      Boolean(leftStroke) &&
      bottomStroke.centerY > leftStroke.centerY,

    outerRightOfLeft:
      Boolean(outerStroke) &&
      Boolean(leftStroke) &&
      outerStroke.maxX > leftStroke.centerX,

    boxHasHorizontalCoverage: boxHorizontalCoverage >= minBoxHorizontalCoverage,

    boxHasVerticalCoverage: boxVerticalCoverage >= minBoxVerticalCoverage,

    straightnessMean: geometry.straightnessMean >= minStraightnessMean,

    // Checks blandos de cierre aproximado.
    leftTouchesTopHalf: Boolean(leftStroke) && leftStroke.minY <= 0.35,

    leftTouchesBottomHalf: Boolean(leftStroke) && leftStroke.maxY >= 0.55,

    bottomTouchesLeftHalf: Boolean(bottomStroke) && bottomStroke.minX <= 0.45,

    bottomTouchesRightHalf: Boolean(bottomStroke) && bottomStroke.maxX >= 0.55,

    innerHorizontalTouchesLeftHalf:
      Boolean(innerHorizontalStroke) && innerHorizontalStroke.minX <= 0.5,

    innerHorizontalTouchesRightHalf:
      Boolean(innerHorizontalStroke) && innerHorizontalStroke.maxX >= 0.5,

    innerVerticalTouchesTopHalf:
      Boolean(innerVerticalStroke) && innerVerticalStroke.minY <= 0.5,

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
    "hasOuterStroke",
    "hasInnerHorizontalStroke",
    "hasInnerVerticalStroke",
    "hasBottomStroke",

    "leftStrokeIsLeft",
    "leftStrokeIsVerticalish",
    "leftStrokeHasHeight",

    "outerStrokeHasWidth",
    "outerStrokeHasHeight",
    "outerStrokeStartsNearTop",
    "outerStrokeExtendsRight",
    "outerStrokeExtendsDown",
    "outerStrokeHasCorner",

    "innerHorizontalIsHorizontalish",
    "innerHorizontalHasWidth",
    "innerHorizontalIsThin",
    "innerHorizontalYInRange",
    "innerHorizontalNotStronglyUpward",

    "innerVerticalIsVerticalish",
    "innerVerticalHasHeight",
    "innerVerticalIsThin",
    "innerVerticalXInRange",

    "bottomStrokeIsLower",
    "bottomStrokeIsHorizontalish",
    "bottomStrokeHasWidth",
    "bottomStrokeReachesBottom",
    "bottomStrokeNotStronglyUpward",

    "innerCrosses",
    "horizontalAboveBottom",
    "horizontalBelowOuterTop",
    "innerHorizontalInsideBoxX",
    "innerVerticalInsideBoxY",

    "bottomBelowLeft",
    "outerRightOfLeft",

    "boxHasHorizontalCoverage",
    "boxHasVerticalCoverage",
  ];

  const softCheckNames = [
    "straightnessMean",
    "leftTouchesTopHalf",
    "leftTouchesBottomHalf",
    "bottomTouchesLeftHalf",
    "bottomTouchesRightHalf",
    "innerHorizontalTouchesLeftHalf",
    "innerHorizontalTouchesRightHalf",
    "innerVerticalTouchesTopHalf",
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
    strategy: "descriptor_box_with_inner_cross",
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
      outerStroke,
      innerHorizontalStroke,
      innerVerticalStroke,
      bottomStroke,
      allStrokes: perStroke,
      boxHorizontalCoverage,
      boxVerticalCoverage,
      horizontalBottomGap,
      horizontalOuterTopGap,
      innerCrosses,
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

      outerStrokeMinWidth,
      outerStrokeMinHeight,
      outerStrokeMinYMax,
      outerStrokeMaxXMin,
      outerStrokeMaxYMin,
      outerStrokeMaxStraightness,

      innerHorizontalCenterYMin,
      innerHorizontalCenterYMax,
      innerHorizontalMinWidth,
      innerHorizontalMaxHeight,
      innerHorizontalDeltaYMin,

      innerVerticalCenterXMin,
      innerVerticalCenterXMax,
      innerVerticalMinHeight,
      innerVerticalMaxWidth,

      bottomStrokeCenterYMin,
      bottomStrokeMinWidth,
      bottomStrokeMaxYMin,
      bottomStrokeDeltaYMin,

      minHorizontalBottomGap,
      minHorizontalOuterTopGap,
      minBoxHorizontalCoverage,
      minBoxVerticalCoverage,

      minStraightnessMean,
      maxSoftFailures,
    },
  };
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
  ``;

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
