// services/simple_kanji_rules.js

const SIMPLE_KANJI_RULES = {
  一: {
    pattern: "single_horizontal_line",
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

  return null;
}

/**
 * Validador para 一
 *
 * Según tus datos:
 * - Correctos:
 *   bboxHeight aprox 0.004 - 0.20
 *   aspectRatio > 4.9
 *   coarseAngleAbsMean < 0.20
 *
 * - Incorrectos:
 *   bboxHeight aprox 0.73 - 1.0
 *   aspectRatio muy bajo
 *   coarseAngleAbsMean mucho mayor
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

    // Tras normalizar, una línea horizontal debería ocupar casi todo el ancho
    bboxWidth: geometry.bboxWidth >= 0.85,

    // Para 一, la altura relativa debe ser baja.
    // Usamos 0.25 como margen inicial porque tus correctos llegan aprox a 0.20.
    bboxHeight: geometry.bboxHeight <= 0.25,

    // Relación ancho/alto alta = forma horizontal.
    aspectRatio: geometry.aspectRatio >= 4.0,

    // Rectitud alta. No diferencia horizontal/vertical, pero descarta garabatos.
    straightness: geometry.straightnessMean >= 0.94,

    // Ángulo respecto a horizontal. 0 = horizontal, 1.57 = vertical.
    coarseAngle: geometry.coarseAngleAbsMean <= 0.25,
  };

  const isCorrect = Object.values(checks).every(Boolean);

  return {
    isCorrect,
    strategy: "single_horizontal_line",
    checks,
    thresholds: {
      bboxWidthMin: 0.85,
      bboxHeightMax: 0.25,
      aspectRatioMin: 4.0,
      straightnessMeanMin: 0.94,
      coarseAngleAbsMeanMax: 0.25,
    },
  };
}

module.exports = {
  validateSimpleKanji,
};
