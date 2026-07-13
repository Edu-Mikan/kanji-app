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

function strokeCurvature(stroke) {
  if (!stroke || !stroke.x || stroke.x.length < 3) {
    return {
      mean: 0,
      max: 0,
    };
  }

  const curvatures = [];

  for (let i = 1; i < stroke.x.length - 1; i++) {
    const dx1 = stroke.x[i] - stroke.x[i - 1];
    const dy1 = stroke.y[i] - stroke.y[i - 1];

    const dx2 = stroke.x[i + 1] - stroke.x[i];
    const dy2 = stroke.y[i + 1] - stroke.y[i];

    const angle1 = Math.atan2(dy1, dx1);
    const angle2 = Math.atan2(dy2, dx2);

    let diff = Math.abs(angle2 - angle1);

    if (diff > Math.PI) {
      diff = 2 * Math.PI - diff;
    }

    curvatures.push(diff);
  }

  return {
    mean: curvatures.reduce((a, b) => a + b, 0) / (curvatures.length || 1),

    max: curvatures.length > 0 ? Math.max(...curvatures) : 0,
  };
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
  const strokeLengths = userResampled.map((stroke) => strokeLength(stroke));

  const totalLength = strokeLengths.reduce((sum, len) => sum + len, 0) || 1;

  const perStroke = userNormalized.map((normalizedStroke, index) => {
    const resampledStroke = userResampled[index] ?? normalizedStroke;
    const strokeBox = strokeBoundingBox(normalizedStroke);

    const width = strokeBox.maxX - strokeBox.minX;
    const height = strokeBox.maxY - strokeBox.minY;

    const pointCount = Math.min(
      normalizedStroke.x?.length ?? 0,
      normalizedStroke.y?.length ?? 0,
    );

    const startX = pointCount > 0 ? normalizedStroke.x[0] : null;
    const startY = pointCount > 0 ? normalizedStroke.y[0] : null;
    const endX = pointCount > 0 ? normalizedStroke.x[pointCount - 1] : null;
    const endY = pointCount > 0 ? normalizedStroke.y[pointCount - 1] : null;

    const deltaX = startX != null && endX != null ? endX - startX : null;
    const deltaY = startY != null && endY != null ? endY - startY : null;

    const relativeLength = (strokeLengths[index] ?? 0) / totalLength;

    const curvature = strokeCurvature(resampledStroke);

    const directionChanges = computeDirectionChanges(resampledStroke);

    return {
      index,
      minX: strokeBox.minX,
      maxX: strokeBox.maxX,
      minY: strokeBox.minY,
      maxY: strokeBox.maxY,
      width,
      height,
      centerX: (strokeBox.minX + strokeBox.maxX) / 2,
      centerY: (strokeBox.minY + strokeBox.maxY) / 2,
      angleAbs: normalizeAngleAbs(getStrokeAngle(resampledStroke)),
      straightness: strokeStraightness(resampledStroke),

      length: strokeLength(resampledStroke),
      relativeLength,

      curvatureMean: curvature.mean,
      curvatureMax: curvature.max,

      directionChanges,

      startX,
      startY,
      endX,
      endY,
      deltaX,
      deltaY,
      directionX:
        deltaX == null
          ? "unknown"
          : deltaX > 0.05
            ? "right"
            : deltaX < -0.05
              ? "left"
              : "neutral",

      directionY:
        deltaY == null
          ? "unknown"
          : deltaY > 0.05
            ? "down"
            : deltaY < -0.05
              ? "up"
              : "neutral",
    };
  });

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
    perStroke,
  };
}

function computeDirectionChanges(stroke, threshold = 0.45) {
  if (!stroke || !Array.isArray(stroke.x) || !Array.isArray(stroke.y)) {
    return 0;
  }

  const pointCount = Math.min(stroke.x.length, stroke.y.length);

  if (pointCount < 3) {
    return 0;
  }

  let changes = 0;

  for (let i = 1; i < pointCount - 1; i++) {
    const dx1 = stroke.x[i] - stroke.x[i - 1];
    const dy1 = stroke.y[i] - stroke.y[i - 1];

    const dx2 = stroke.x[i + 1] - stroke.x[i];
    const dy2 = stroke.y[i + 1] - stroke.y[i];

    const angle1 = Math.atan2(dy1, dx1);
    const angle2 = Math.atan2(dy2, dx2);

    let delta = Math.abs(angle2 - angle1);

    if (delta > Math.PI) {
      delta = 2 * Math.PI - delta;
    }

    if (delta >= threshold) {
      changes++;
    }
  }

  return changes;
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
  strokeCurvature,
  strokeStraightness,
  getStrokesBoundingBox,
  computeDirectionChanges,
};
