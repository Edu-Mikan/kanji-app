// services/simple_kanji_rules.js

const SIMPLE_KANJI_RULES = {
  四: {
    pattern: "four_box_kanji",
  },
};

/**
 * Valida si existe una regla estructural simple para el kanji.
 *
 * Devuelve:
 * - null si el kanji no tiene regla simple
 * - un objeto con resultado si sí tiene regla simple
 */
function validateSimpleKanji({ kanji, features }) {
  const rule = SIMPLE_KANJI_RULES[kanji];

  if (!rule) {
    return null;
  }

  if (rule.pattern === "four_box_kanji") {
    return validateFourBoxKanji(features);
  }

  // if (rule.pattern === "hachi_kanji") {
  //   return validateHachiKanji(features);
  // }

  // if (rule.pattern === "cross_kanji") {
  //   return validateCrossKanji(features);
  // }

  return null;
}

/**
 * Validador para 四
 *
 * Estructura esperada:
 * - 5 trazos
 * - forma global de caja
 * - trazo 0: vertical izquierdo
 * - trazo 1: caja exterior / trazo largo envolvente
 * - trazo 2: trazo interior izquierdo/vertical
 * - trazo 3: trazo interior derecho/inclinado
 * - trazo 4: trazo inferior horizontal
 */
function validateFourBoxKanji(features) {
  const geometry = features.geometry;
  if (!geometry) {
    return {
      isCorrect: false,
      score: 10,
      strategy: "four_box_kanji",
      reason: "missing_geometry_features",
    };
  }

  const perStroke = geometry.perStroke ?? [];

  if (perStroke.length !== 5) {
    return {
      isCorrect: false,
      score: 10,
      strategy: "four_box_kanji",
      reason: "invalid_stroke_count",
      checks: {
        strokeCount: features.strokeCountUser === 5,
        referenceStrokeCount: features.strokeCountRef === 5,
      },
      thresholds: {
        expectedStrokeCount: 5,
      },
    };
  }

  const s0 = perStroke[0];
  const s1 = perStroke[1];
  const s2 = perStroke[2];
  const s3 = perStroke[3];
  const s4 = perStroke[4];

  const checks = {
    strokeCount: features.strokeCountUser === 5,
    referenceStrokeCount: features.strokeCountRef === 5,

    // Forma global de caja. En tus datos correctos, aspectRatio ronda aprox 0.84 - 1.12.
    bboxWidth: geometry.bboxWidth >= 0.45,
    bboxHeight: geometry.bboxHeight >= 0.5,
    aspectRatio: geometry.aspectRatio >= 0.45 && geometry.aspectRatio <= 2.05,

    // Trazo 0: vertical izquierdo
    leftStrokeIsVertical: s0.angleAbs >= 0.95,
    leftStrokeIsThin: s0.width <= 0.34,
    leftStrokeIsTall: s0.height >= 0.38,
    leftStrokeOnLeft: s0.minX <= 0.15 && s0.centerX <= 0.28,
    leftStrokeStraight: s0.straightness >= 0.8,

    // Trazo 1: trazo exterior largo/envolvente.
    // Este trazo suele tener straightness baja porque no es una línea recta.
    outerStrokeIsLarge:
      s1.width >= geometry.bboxWidth * 0.7 &&
      s1.height >= geometry.bboxHeight * 0.7,
    outerStrokeHasBoxLikeAngle: s1.angleAbs >= 0.4 && s1.angleAbs <= 1.35,

    // Trazo 2: vertical interior izquierdo
    innerLeftIsVertical: s2.angleAbs >= 0.8,
    innerLeftIsThin: s2.width <= 0.32,
    innerLeftHasHeight: s2.height >= 0.2,
    innerLeftInExpectedZone: s2.centerX >= 0.12 && s2.centerX <= 0.5,
    innerLeftStraight: s2.straightness >= 0.85,

    // Trazo 3: interior derecho/inclinado
    innerRightHasVerticalComponent: s3.angleAbs >= 0.35 && s3.angleAbs <= 1.65,
    innerRightHasWidth: s3.width >= 0.1 || s3.width >= geometry.bboxWidth * 0.2,
    innerRightHasHeight: s3.height >= 0.18,
    innerRightInExpectedZone: s3.centerX >= 0.25 && s3.centerX <= 0.9,
    innerRightNotTooMessy: s3.straightness >= 0.55,

    // Trazo 4: inferior horizontal
    bottomStrokeIsHorizontal: s4.angleAbs <= 0.3,

    bottomStrokeHasMinimumWidth: s4.width >= 0.2,
    bottomStrokeIsWide: s4.width >= 0.3,

    bottomStrokeIsFlat: s4.height <= 0.2,

    bottomStrokeIsLow:
      s4.centerY >= 0.58 ||
      (s4.centerY > s2.centerY + 0.25 && s4.centerY > s3.centerY + 0.2),

    bottomStrokeStraight: s4.straightness >= 0.88,
  };

  const hardCheckNames = [
    "strokeCount",
    "referenceStrokeCount",

    "bboxWidth",

    "leftStrokeIsTall",
    "leftStrokeOnLeft",
    "leftStrokeStraight",

    "outerStrokeIsLarge",
    "outerStrokeHasBoxLikeAngle",

    "innerLeftHasHeight",
    "innerLeftInExpectedZone",
    "innerLeftStraight",

    "innerRightHasWidth",
    "innerRightInExpectedZone",

    "bottomStrokeIsHorizontal",
    "bottomStrokeHasMinimumWidth",
    "bottomStrokeIsFlat",
    "bottomStrokeIsLow",
    "bottomStrokeStraight",
  ];

  const softCheckNames = [
    "bboxHeight",
    "aspectRatio",

    "leftStrokeIsVertical",
    "leftStrokeIsThin",

    "innerLeftIsVertical",
    "innerLeftIsThin",

    "innerRightHasVerticalComponent",
    "innerRightHasHeight",
    "innerRightNotTooMessy",
    "bottomStrokeIsWide",
  ];

  const hardFailedChecks = hardCheckNames.filter(
    (checkName) => checks[checkName] === false,
  );

  const softFailedChecks = softCheckNames.filter(
    (checkName) => checks[checkName] === false,
  );

  const isCorrect =
    hardFailedChecks.length === 0 && softFailedChecks.length <= 3;

  return {
    isCorrect,
    score: isCorrect ? 0.5 : 10,
    strategy: "four_box_kanji",
    checks,
    hardFailedChecks,
    softFailedChecks,
    details: {
      leftStroke: s0,
      outerStroke: s1,
      innerLeftStroke: s2,
      innerRightStroke: s3,
      bottomStroke: s4,
    },
    thresholds: {
      expectedStrokeCount: 5,

      bboxWidthMin: 0.45,
      bboxHeightMin: 0.5,
      aspectRatioMin: 0.45,
      aspectRatioMax: 2.05,

      leftStrokeAngleAbsMin: 0.95,
      leftStrokeWidthMax: 0.34,
      leftStrokeHeightMin: 0.38,
      leftStrokeMinXMax: 0.15,
      leftStrokeCenterXMax: 0.28,
      leftStrokeStraightnessMin: 0.8,

      outerStrokeWidthMinRatioVsBBox: 0.7,
      outerStrokeHeightMinRatioVsBBox: 0.7,
      outerStrokeAngleAbsMin: 0.4,
      outerStrokeAngleAbsMax: 1.35,

      innerLeftAngleAbsMin: 0.8,
      innerLeftWidthMax: 0.32,
      innerLeftHeightMin: 0.2,
      innerLeftCenterXMin: 0.12,
      innerLeftCenterXMax: 0.5,
      innerLeftStraightnessMin: 0.85,

      innerRightAngleAbsMin: 0.35,
      innerRightAngleAbsMax: 1.65,
      innerRightWidthMin: 0.1,
      innerRightWidthMinRatioVsBBox: 0.2,
      innerRightHeightMin: 0.18,
      innerRightCenterXMin: 0.25,
      innerRightCenterXMax: 0.9,
      innerRightStraightnessMin: 0.55,

      bottomStrokeAngleAbsMax: 0.3,
      bottomStrokeMinimumWidthMin: 0.2,
      bottomStrokeWidthMin: 0.3,
      bottomStrokeHeightMax: 0.2,
      bottomStrokeCenterYMin: 0.58,
      bottomStrokeStraightnessMin: 0.88,
    },
  };
}

function validateCrossKanji(features) {
  const geometry = features.geometry;

  if (!geometry) {
    return {
      isCorrect: false,
      score: 10,
      strategy: "cross_kanji",
      reason: "missing_geometry_features",
    };
  }

  const perStroke = geometry.perStroke ?? [];

  if (perStroke.length !== 2) {
    return {
      isCorrect: false,
      score: 10,
      strategy: "cross_kanji",
      reason: "invalid_stroke_count",
      checks: {
        strokeCount: features.strokeCountUser === 2,
        referenceStrokeCount: features.strokeCountRef === 2,
      },
      thresholds: {
        expectedStrokeCount: 2,
      },
    };
  }

  const s0 = perStroke[0];
  const s1 = perStroke[1];

  const horizontal = [s0, s1].find(
    (s) =>
      s.angleAbs <= 0.35 &&
      s.width >= 0.45 &&
      s.height <= 0.28 &&
      s.straightness >= 0.85,
  );

  const vertical = [s0, s1].find(
    (s) =>
      s !== horizontal &&
      s.angleAbs >= 1.15 &&
      (s.height >= 0.45 || s.height >= geometry.bboxHeight * 0.8) &&
      s.width <= 0.35 &&
      s.straightness >= 0.85,
  );

  const hasHorizontal = Boolean(horizontal);
  const hasVertical = Boolean(vertical);

  const crosses =
    hasHorizontal &&
    hasVertical &&
    vertical.centerX >= horizontal.minX &&
    vertical.centerX <= horizontal.maxX &&
    horizontal.centerY >= vertical.minY &&
    horizontal.centerY <= vertical.maxY;

  const verticalNearCenter =
    hasVertical && vertical.centerX >= 0.25 && vertical.centerX <= 0.75;

  const horizontalNearCenter =
    hasHorizontal && horizontal.centerY >= 0.2 && horizontal.centerY <= 0.75;

  const checks = {
    strokeCount: features.strokeCountUser === 2,
    referenceStrokeCount: features.strokeCountRef === 2,

    hasHorizontal,
    hasVertical,
    crosses,
    verticalNearCenter,
    horizontalNearCenter,
  };

  const isCorrect = Object.values(checks).every(Boolean);

  return {
    isCorrect,
    score: isCorrect ? 0.5 : 10,
    strategy: "cross_kanji",
    checks,
    details: {
      horizontalStroke: horizontal ?? null,
      verticalStroke: vertical ?? null,
      stroke0: s0,
      stroke1: s1,
    },
    thresholds: {
      expectedStrokeCount: 2,
      horizontalAngleAbsMax: 0.35,
      horizontalWidthMin: 0.45,
      horizontalHeightMax: 0.28,
      verticalAngleAbsMin: 1.15,
      verticalHeightMin: 0.45,
      verticalHeightMinRatioVsBBox: 0.8,
      verticalWidthMax: 0.35,
      straightnessMin: 0.85,
    },
  };
}

function validateHachiKanji(features) {
  const geometry = features.geometry;

  if (!geometry) {
    return {
      isCorrect: false,
      score: 10,
      strategy: "hachi_kanji",
      reason: "missing_geometry_features",
    };
  }

  const perStroke = geometry.perStroke ?? [];

  if (perStroke.length !== 2) {
    return {
      isCorrect: false,
      score: 10,
      strategy: "hachi_kanji",
      reason: "invalid_stroke_count",
      checks: {
        strokeCount: features.strokeCountUser === 2,
        referenceStrokeCount: features.strokeCountRef === 2,
      },
      thresholds: {
        expectedStrokeCount: 2,
      },
    };
  }

  // No asumimos orden de escritura.
  // Ordenamos por posición horizontal.
  const [leftStroke, rightStroke] = [...perStroke].sort(
    (a, b) => a.centerX - b.centerX,
  );

  const strokeCount = features.strokeCountUser === 2;
  const referenceStrokeCount = features.strokeCountRef === 2;

  const leftOnLeft = leftStroke.centerX <= 0.35;
  const rightOnRight = rightStroke.centerX >= 0.5;

  const leftRightSeparated = rightStroke.centerX - leftStroke.centerX >= 0.35;

  const leftDiagonal =
    leftStroke.angleAbs >= 0.85 &&
    leftStroke.angleAbs <= 1.55 &&
    leftStroke.height >= 0.35 &&
    leftStroke.width >= 0.05 &&
    leftStroke.straightness >= 0.9;

  const rightDiagonal =
    rightStroke.angleAbs >= 0.8 &&
    rightStroke.angleAbs <= 1.35 &&
    rightStroke.height >= 0.45 &&
    rightStroke.width >= 0.15 &&
    rightStroke.straightness >= 0.75;

  const rightTallerOrSimilar = rightStroke.height >= leftStroke.height * 0.75;

  const notTooHorizontal = geometry.bboxHeight >= 0.5;

  // Check blando/informativo: NO lo usamos para isCorrect.
  const leftNotMuchHigherThanRight =
    leftStroke.centerY >= rightStroke.centerY - 0.06;

  const directionAvailable =
    typeof leftStroke.deltaX === "number" &&
    typeof leftStroke.deltaY === "number" &&
    typeof rightStroke.deltaX === "number" &&
    typeof rightStroke.deltaY === "number";

  // En 八 correcto:
  // - el trazo izquierdo debe bajar hacia la izquierda: deltaX negativo, deltaY positivo
  // - el trazo derecho debe bajar hacia la derecha: deltaX positivo, deltaY positivo
  //
  // Si la muestra es antigua y no tiene deltaX/deltaY, no la rechazamos aquí.
  const leftStrokeDirection =
    !directionAvailable ||
    (leftStroke.deltaX <= -0.05 && leftStroke.deltaY >= 0.2);

  const rightStrokeDirection =
    !directionAvailable ||
    (rightStroke.deltaX >= 0.05 && rightStroke.deltaY >= 0.2);

  const checks = {
    strokeCount,
    referenceStrokeCount,

    leftOnLeft,
    rightOnRight,
    leftRightSeparated,

    leftDiagonal,
    rightDiagonal,

    rightTallerOrSimilar,
    notTooHorizontal,

    leftStrokeDirection,
    rightStrokeDirection,
  };

  const softChecks = {
    leftNotMuchHigherThanRight,
    directionAvailable,
  };

  const isCorrect = Object.values(checks).every(Boolean);

  return {
    isCorrect,
    score: isCorrect ? 0.5 : 10,
    strategy: "hachi_kanji",
    checks,
    softChecks,
    details: {
      leftStroke,
      rightStroke,
      allStrokes: perStroke,
    },
    thresholds: {
      expectedStrokeCount: 2,

      leftCenterXMax: 0.35,
      rightCenterXMin: 0.5,
      centerXGapMin: 0.35,

      leftAngleAbsMin: 0.85,
      leftAngleAbsMax: 1.55,
      leftHeightMin: 0.35,
      leftWidthMin: 0.05,
      leftStraightnessMin: 0.9,

      rightAngleAbsMin: 0.8,
      rightAngleAbsMax: 1.35,
      rightHeightMin: 0.45,
      rightWidthMin: 0.15,
      rightStraightnessMin: 0.75,

      rightHeightRatioVsLeftMin: 0.75,
      bboxHeightMin: 0.5,

      leftDeltaXMax: -0.05,
      rightDeltaXMin: 0.05,
      deltaYMin: 0.2,

      leftCenterYMinVsRightCenterY: -0.06,
    },
  };
}

module.exports = {
  validateSimpleKanji,
};
