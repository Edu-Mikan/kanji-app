// services/simple_kanji_rules.js

const SIMPLE_KANJI_RULES = {
  一: {
    pattern: "single_horizontal_line",
  },
  二: {
    pattern: "two_horizontal_lines",
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
 *
 * Estructura esperada:
 * - 2 trazos
 * - ambos horizontales
 * - ambos bastante rectos
 * - un trazo arriba y otro abajo
 * - separación vertical razonable
 * - el trazo inferior no debería ser mucho más corto que el superior
 */
function validateTwoHorizontalLines(features) {
  const geometry = features.geometry;

  if (!geometry) {
    return {
      isCorrect: false,
      strategy: "two_horizontal_lines",
      reason: "missing_geometry_features",
    };
  }

  const perStroke = geometry.perStroke ?? [];

  if (perStroke.length !== 2) {
    return {
      isCorrect: false,
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

    // Forma global de 二
    bboxWidth: geometry.bboxWidth >= 0.7,
    bboxHeight: geometry.bboxHeight >= 0.25 && geometry.bboxHeight <= 0.85,
    aspectRatio: geometry.aspectRatio >= 1.1 && geometry.aspectRatio <= 3.2,

    // Trazos horizontales y rectos
    bothHorizontal,
    bothStraight,
    straightnessMean: geometry.straightnessMean >= 0.88,
    coarseAngleAbsMean: geometry.coarseAngleAbsMean <= 0.22,
    coarseAngleAbsMax: geometry.coarseAngleAbsMax <= 0.32,

    // Estructura interna
    topAboveBottom: top.centerY < bottom.centerY,
    verticalGap: verticalGap >= 0.18,
    bottomNotMuchShorter,
  };

  const isCorrect = Object.values(checks).every(Boolean);

  return {
    isCorrect,
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

module.exports = {
  validateSimpleKanji,
};
