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
