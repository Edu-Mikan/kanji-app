// services/simple_kanji_rules.js

const SIMPLE_KANJI_RULES = {
  一: {
    pattern: "single_horizontal_line",
  },
  二: {
    pattern: "two_horizontal_lines",
  },
  三: {
    pattern: "three_horizontal_lines",
  },
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

  if (rule.pattern === "single_horizontal_line") {
    return validateSingleHorizontalLine(features);
  }

  if (rule.pattern === "two_horizontal_lines") {
    return validateTwoHorizontalLines(features);
  }

  if (rule.pattern === "three_horizontal_lines") {
    return validateThreeHorizontalLines(features);
  }

  if (rule.pattern === "four_box_kanji") {
    return validateFourBoxKanji(features);
  }

  return null;
}

/**
 * Validador para 一
 */
function validateSingleHorizontalLine(features) {
  const geometry = features.geometry;

  if (!geometry) {
    return {
      isCorrect: false,
      score: 10,
      strategy: "single_horizontal_line",
      reason: "missing_geometry_features",
    };
  }

  const checks = {
    strokeCount: features.strokeCountUser === 1,
    bboxWidth: geometry.bboxWidth >= 0.7,
    bboxHeight: geometry.bboxHeight <= 0.25,
    aspectRatio: geometry.aspectRatio >= 3.0,
    straightnessMean: geometry.straightnessMean >= 0.88,
    coarseAngleAbsMean: geometry.coarseAngleAbsMean <= 0.3,
  };

  const isCorrect = Object.values(checks).every(Boolean);

  return {
    isCorrect,
    score: isCorrect ? 0.5 : 10,
    strategy: "single_horizontal_line",
    checks,
    thresholds: {
      bboxWidthMin: 0.7,
      bboxHeightMax: 0.25,
      aspectRatioMin: 3.0,
      straightnessMeanMin: 0.88,
      coarseAngleAbsMeanMax: 0.3,
    },
  };
}

/**
 * Validador para 二
 */
function validateTwoHorizontalLines(features) {
  const geometry = features.geometry;

  if (!geometry) {
    return {
      isCorrect: false,
      score: 10,
      strategy: "two_horizontal_lines",
      reason: "missing_geometry_features",
    };
  }

  const perStroke = geometry.perStroke ?? [];

  if (perStroke.length !== 2) {
    return {
      isCorrect: false,
      score: 10,
      strategy: "two_horizontal_lines",
      reason: "invalid_stroke_count",
      checks: {
        strokeCount: features.strokeCountUser === 2,
      },
      thresholds: {
        expectedStrokeCount: 2,
      },
    };
  }

  const sortedByY = [...perStroke].sort((a, b) => a.centerY - b.centerY);
  const top = sortedByY[0];
  const bottom = sortedByY[1];

  const verticalGap = bottom.centerY - top.centerY;

  const bothHorizontal = perStroke.every((stroke) => stroke.angleAbs <= 0.28);
  const bothStraight = perStroke.every((stroke) => stroke.straightness >= 0.85);

  const bottomNotMuchShorter = bottom.width >= top.width * 0.7;

  const checks = {
    strokeCount: features.strokeCountUser === 2,
    referenceStrokeCount: features.strokeCountRef === 2,

    bboxWidth: geometry.bboxWidth >= 0.7,
    bboxHeight: geometry.bboxHeight >= 0.25 && geometry.bboxHeight <= 0.85,
    aspectRatio: geometry.aspectRatio >= 1.1 && geometry.aspectRatio <= 3.2,

    bothHorizontal,
    bothStraight,
    straightnessMean: geometry.straightnessMean >= 0.88,
    coarseAngleAbsMean: geometry.coarseAngleAbsMean <= 0.22,
    coarseAngleAbsMax: geometry.coarseAngleAbsMax <= 0.32,

    topAboveBottom: top.centerY < bottom.centerY,
    verticalGap: verticalGap >= 0.18,
    bottomNotMuchShorter,
  };

  const isCorrect = Object.values(checks).every(Boolean);

  return {
    isCorrect,
    score: isCorrect ? 0.5 : 10,
    strategy: "two_horizontal_lines",
    checks,
    details: {
      top,
      bottom,
      verticalGap,
    },
    thresholds: {
      expectedStrokeCount: 2,
      bboxWidthMin: 0.7,
      bboxHeightMin: 0.25,
      bboxHeightMax: 0.85,
      aspectRatioMin: 1.1,
      aspectRatioMax: 3.2,
      strokeAngleAbsMax: 0.28,
      straightnessPerStrokeMin: 0.85,
      straightnessMeanMin: 0.88,
      coarseAngleAbsMeanMax: 0.22,
      coarseAngleAbsMax: 0.32,
      verticalGapMin: 0.18,
      bottomWidthVsTopWidthMinRatio: 0.7,
    },
  };
}

/**
 * Validador para 三
 *
 * Estructura esperada:
 * - 3 trazos
 * - los 3 horizontales
 * - los 3 bastante rectos
 * - orden vertical correcto: arriba, medio, abajo
 * - separación vertical suficiente
 * - el trazo inferior debe ser el más largo o casi el más largo
 */
function validateThreeHorizontalLines(features) {
  const geometry = features.geometry;

  if (!geometry) {
    return {
      isCorrect: false,
      score: 10,
      strategy: "three_horizontal_lines",
      reason: "missing_geometry_features",
    };
  }

  const perStroke = geometry.perStroke ?? [];

  if (perStroke.length !== 3) {
    return {
      isCorrect: false,
      score: 10,
      strategy: "three_horizontal_lines",
      reason: "invalid_stroke_count",
      checks: {
        strokeCount: features.strokeCountUser === 3,
      },
      thresholds: {
        expectedStrokeCount: 3,
      },
    };
  }

  const sortedByY = [...perStroke].sort((a, b) => a.centerY - b.centerY);

  const top = sortedByY[0];
  const middle = sortedByY[1];
  const bottom = sortedByY[2];

  const gapTopMiddle = middle.centerY - top.centerY;
  const gapMiddleBottom = bottom.centerY - middle.centerY;

  const bothGapsReasonable = gapTopMiddle >= 0.2 && gapMiddleBottom >= 0.2;

  const gapsBalanced =
    gapTopMiddle / (gapMiddleBottom + 1e-6) >= 0.45 &&
    gapTopMiddle / (gapMiddleBottom + 1e-6) <= 1.8;

  const allHorizontal = perStroke.every((stroke) => stroke.angleAbs <= 0.7);
  const allStraight = perStroke.every((stroke) => stroke.straightness >= 0.85);

  const bottomIsLongEnough =
    bottom.width >= top.width * 0.65 && bottom.width >= middle.width * 0.85;

  const middleNotTooShort =
    middle.width >= top.width * 0.35 && middle.width >= bottom.width * 0.18;

  const checks = {
    strokeCount: features.strokeCountUser === 3,
    referenceStrokeCount: features.strokeCountRef === 3,

    // Forma global. En tus datos correctos, aspectRatio ronda aprox 1.0 - 1.45.
    bboxWidth: geometry.bboxWidth >= 0.45,
    bboxHeight: geometry.bboxHeight >= 0.5 && geometry.bboxHeight <= 1.05,
    aspectRatio: geometry.aspectRatio >= 0.45 && geometry.aspectRatio <= 2.2,

    // Trazos horizontales y rectos
    allHorizontal,
    allStraight,
    straightnessMean: geometry.straightnessMean >= 0.88,
    coarseAngleAbsMean: geometry.coarseAngleAbsMean <= 0.55,
    coarseAngleAbsMax: geometry.coarseAngleAbsMax <= 0.7,

    // Estructura vertical
    topAboveMiddle: top.centerY < middle.centerY,
    middleAboveBottom: middle.centerY < bottom.centerY,
    bothGapsReasonable,
    gapsBalanced,

    // Proporción de longitudes
    bottomIsLongEnough,
    middleNotTooShort,
  };

  const isCorrect = Object.values(checks).every(Boolean);

  return {
    isCorrect,
    score: isCorrect ? 0.5 : 10,
    strategy: "three_horizontal_lines",
    checks,
    details: {
      top,
      middle,
      bottom,
      gapTopMiddle,
      gapMiddleBottom,
      gapRatio: gapTopMiddle / (gapMiddleBottom + 1e-6),
    },
    thresholds: {
      expectedStrokeCount: 3,
      bboxWidthMin: 0.45,
      bboxHeightMin: 0.5,
      bboxHeightMax: 1.05,
      aspectRatioMin: 0.45,
      aspectRatioMax: 2.2,

      strokeAngleAbsMax: 0.7,
      straightnessPerStrokeMin: 0.85,
      straightnessMeanMin: 0.88,
      coarseAngleAbsMeanMax: 0.55,
      coarseAngleAbsMax: 0.7,
      verticalGapMin: 0.2,
      gapRatioMin: 0.45,
      gapRatioMax: 1.8,

      bottomWidthVsTopWidthMinRatio: 0.65,
      bottomWidthVsMiddleWidthMinRatio: 0.85,
      middleWidthVsTopWidthMinRatio: 0.35,
      middleWidthVsBottomWidthMinRatio: 0.18,
    },
  };
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
    bboxHeight: geometry.bboxHeight >= 0.7,
    aspectRatio: geometry.aspectRatio >= 0.45 && geometry.aspectRatio <= 1.45,

    // Trazo 0: vertical izquierdo
    leftStrokeIsVertical: s0.angleAbs >= 1.25,
    leftStrokeIsThin: s0.width <= 0.27,
    leftStrokeIsTall: s0.height >= 0.38,
    leftStrokeOnLeft: s0.centerX <= 0.2,
    leftStrokeStraight: s0.straightness >= 0.8,

    // Trazo 1: trazo exterior largo/envolvente.
    // Este trazo suele tener straightness baja porque no es una línea recta.
    outerStrokeIsLarge:
      s1.width >= geometry.bboxWidth * 0.7 &&
      s1.height >= geometry.bboxHeight * 0.7,
    outerStrokeHasBoxLikeAngle: s1.angleAbs >= 0.4 && s1.angleAbs <= 1.35,

    // Trazo 2: vertical interior izquierdo
    innerLeftIsVertical: s2.angleAbs >= 1.1,
    innerLeftIsThin: s2.width <= 0.23,
    innerLeftHasHeight: s2.height >= 0.2,
    innerLeftInExpectedZone: s2.centerX >= 0.12 && s2.centerX <= 0.5,
    innerLeftStraight: s2.straightness >= 0.85,

    // Trazo 3: interior derecho/inclinado
    innerRightHasVerticalComponent: s3.angleAbs >= 0.4 && s3.angleAbs <= 1.65,
    innerRightHasWidth: s3.width >= 0.1 || s3.width >= geometry.bboxWidth * 0.2,
    innerRightHasHeight: s3.height >= 0.22,
    innerRightInExpectedZone: s3.centerX >= 0.25 && s3.centerX <= 0.9,
    innerRightNotTooMessy: s3.straightness >= 0.55,

    // Trazo 4: inferior horizontal
    bottomStrokeIsHorizontal: s4.angleAbs <= 0.3,
    bottomStrokeIsWide:
      s4.width >= 0.35 || s4.width >= geometry.bboxWidth * 0.65,
    bottomStrokeIsFlat: s4.height <= 0.2,
    bottomStrokeIsLow:
      s4.centerY >= 0.58 ||
      (s4.centerY > s2.centerY + 0.25 && s4.centerY > s3.centerY + 0.2),
    bottomStrokeStraight: s4.straightness >= 0.88,
  };

  const isCorrect = Object.values(checks).every(Boolean);

  return {
    isCorrect,
    score: isCorrect ? 0.5 : 10,
    strategy: "four_box_kanji",
    checks,
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
      bboxHeightMin: 0.7,
      aspectRatioMin: 0.45,
      aspectRatioMax: 1.45,

      leftStrokeAngleAbsMin: 1.25,
      leftStrokeWidthMax: 0.27,
      leftStrokeHeightMin: 0.38,
      leftStrokeCenterXMax: 0.2,
      leftStrokeStraightnessMin: 0.8,

      outerStrokeWidthMinRatioVsBBox: 0.7,
      outerStrokeHeightMinRatioVsBBox: 0.7,
      outerStrokeAngleAbsMin: 0.4,
      outerStrokeAngleAbsMax: 1.35,

      innerLeftAngleAbsMin: 1.1,
      innerLeftWidthMax: 0.23,
      innerLeftHeightMin: 0.2,
      innerLeftCenterXMin: 0.12,
      innerLeftCenterXMax: 0.5,
      innerLeftStraightnessMin: 0.85,
      innerRightAngleAbsMin: 0.4,
      innerRightAngleAbsMax: 1.65,
      innerRightWidthMin: 0.1,
      innerRightWidthMinRatioVsBBox: 0.2,
      innerRightHeightMin: 0.22,
      innerRightCenterXMin: 0.25,
      innerRightCenterXMax: 0.9,

      bottomStrokeAngleAbsMax: 0.3,
      bottomStrokeWidthMin: 0.35,
      bottomStrokeWidthMinRatioVsBBox: 0.65,
      bottomStrokeHeightMax: 0.2,
      bottomStrokeCenterYMin: 0.58,
      bottomStrokeStraightnessMin: 0.88,
    },
  };
}

module.exports = {
  validateSimpleKanji,
};
