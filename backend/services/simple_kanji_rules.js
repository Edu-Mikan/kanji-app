// services/simple_kanji_rules.js

const SIMPLE_KANJI_RULES = {};

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

  // if (rule.pattern === "hachi_kanji") {
  //   return validateHachiKanji(features);
  // }

  // if (rule.pattern === "cross_kanji") {
  //   return validateCrossKanji(features);
  // }

  return null;
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
