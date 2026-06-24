const {
  getStrokeAngle,
  angleDifference,
  strokeLength,
  strokeBoundingBox,
} = require("./stroke_utils");

// ================= BASE FEATURES =================
function extractBaseFeatures(userResampled, referenceResampled, score) {
  const strokeErrors = [];
  const angleDiffs = [];

  for (
    let i = 0;
    i < Math.min(userResampled.length, referenceResampled.length);
    i++
  ) {
    const u = userResampled[i];
    const r = referenceResampled[i];

    const len = Math.min(u.x.length, r.x.length);

    let error = 0;

    for (let k = 0; k < len; k++) {
      const dx = u.x[k] - r.x[k];
      const dy = u.y[k] - r.y[k];

      error += dx * dx + dy * dy;
    }

    error = Math.sqrt(error / (len || 1));
    strokeErrors.push(error);

    const aDiff = angleDifference(getStrokeAngle(u), getStrokeAngle(r));
    angleDiffs.push(aDiff);
  }

  return {
    strokeCountUser: userResampled.length,
    strokeCountRef: referenceResampled.length,

    totalError: score,

    meanStrokeError:
      strokeErrors.reduce((a, b) => a + b, 0) / (strokeErrors.length || 1),

    maxStrokeError: Math.max(...strokeErrors, 0),

    angleDiffMean:
      angleDiffs.reduce((a, b) => a + b, 0) / (angleDiffs.length || 1),

    angleDiffMax: Math.max(...angleDiffs, 0),

    unusedStrokes: Math.abs(userResampled.length - referenceResampled.length),
  };
}

// ================= GLOBAL BOUNDING BOX =================
function getStrokesBoundingBox(strokes) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const stroke of strokes) {
    const box = strokeBoundingBox(stroke);

    if (box.minX < minX) minX = box.minX;
    if (box.maxX > maxX) maxX = box.maxX;
    if (box.minY < minY) minY = box.minY;
    if (box.maxY > maxY) maxY = box.maxY;
  }

  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

// ================= STRAIGHTNESS =================
function strokeStraightness(stroke) {
  if (!stroke || !stroke.x || !stroke.y || stroke.x.length < 2) {
    return 0;
  }

  const startX = stroke.x[0];
  const startY = stroke.y[0];

  const endX = stroke.x[stroke.x.length - 1];
  const endY = stroke.y[stroke.y.length - 1];

  const dx = endX - startX;
  const dy = endY - startY;

  const directDistance = Math.sqrt(dx * dx + dy * dy);
  const pathLength = strokeLength(stroke);

  if (pathLength === 0) return 0;

  return directDistance / pathLength;
}

// ================= ANGLE NORMALIZATION =================
function normalizeAngleAbs(angle) {
  let a = Math.abs(angle);

  if (a > Math.PI) {
    a = 2 * Math.PI - a;
  }

  if (a > Math.PI / 2) {
    a = Math.PI - a;
  }

  return a;
}

// ================= GEOMETRY FEATURES =================
function extractGeometryFeatures(userNormalized, userResampled) {
  const box = getStrokesBoundingBox(userNormalized);

  const bboxWidth = box.width;
  const bboxHeight = box.height;

  const aspectRatio = bboxWidth / (bboxHeight + 1e-6);

  const straightnessValues = userResampled.map(strokeStraightness);

  const coarseAngles = userResampled.map((stroke) =>
    normalizeAngleAbs(getStrokeAngle(stroke)),
  );

  return {
    bboxWidth,
    bboxHeight,
    aspectRatio,

    straightnessMean:
      straightnessValues.reduce((a, b) => a + b, 0) /
      (straightnessValues.length || 1),

    straightnessMin:
      straightnessValues.length > 0 ? Math.min(...straightnessValues) : 0,

    coarseAngleAbsMean:
      coarseAngles.reduce((a, b) => a + b, 0) / (coarseAngles.length || 1),

    coarseAngleAbsMax: coarseAngles.length > 0 ? Math.max(...coarseAngles) : 0,
  };
}

// ================= ALL FEATURES =================
function extractAllFeatures({
  userResampled,
  referenceResampled,
  userNormalized,
  score,
}) {
  const base = extractBaseFeatures(userResampled, referenceResampled, score);
  const geometry = extractGeometryFeatures(userNormalized, userResampled);

  return {
    ...base,
    geometry,
  };
}

module.exports = {
  extractBaseFeatures,
  extractGeometryFeatures,
  extractAllFeatures,
};
