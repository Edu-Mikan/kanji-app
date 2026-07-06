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
