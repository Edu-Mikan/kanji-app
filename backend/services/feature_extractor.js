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

  const intersections = detectStrokeIntersections(userResampled);

  const touches = detectStrokeTouches(userResampled, intersections);

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

    const strokeIntersections = intersections.filter(
      (intersection) =>
        intersection.strokeA === index || intersection.strokeB === index,
    );

    const intersectsWith = [
      ...new Set(
        strokeIntersections.map((intersection) =>
          intersection.strokeA === index
            ? intersection.strokeB
            : intersection.strokeA,
        ),
      ),
    ];

    const strokeTouches = touches.filter(
      (touch) => touch.strokeA === index || touch.strokeB === index,
    );

    const touchesWith = [
      ...new Set(
        strokeTouches.map((touch) =>
          touch.strokeA === index ? touch.strokeB : touch.strokeA,
        ),
      ),
    ];

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

      intersectionCount: strokeIntersections.length,
      intersectsWith,

      touchCount: strokeTouches.length,
      touchesWith,

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
    intersectionCount: intersections.length,
    intersections,
    touchCount: touches.length,
    touches,
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

function getStrokePoint(stroke, index) {
  return {
    x: stroke.x[index],
    y: stroke.y[index],
  };
}

function crossProduct(ax, ay, bx, by) {
  return ax * by - ay * bx;
}

function getSegmentIntersection(p1, p2, q1, q2, epsilon = 1e-9) {
  const rx = p2.x - p1.x;
  const ry = p2.y - p1.y;

  const sx = q2.x - q1.x;
  const sy = q2.y - q1.y;

  const denominator = crossProduct(rx, ry, sx, sy);

  const qpx = q1.x - p1.x;
  const qpy = q1.y - p1.y;

  if (Math.abs(denominator) <= epsilon) {
    return null;
  }

  const t = crossProduct(qpx, qpy, sx, sy) / denominator;
  const u = crossProduct(qpx, qpy, rx, ry) / denominator;

  if (t < -epsilon || t > 1 + epsilon || u < -epsilon || u > 1 + epsilon) {
    return null;
  }

  return {
    x: p1.x + t * rx,
    y: p1.y + t * ry,
  };
}

function pointsAreNear(a, b, tolerance = 0.01) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;

  return Math.sqrt(dx * dx + dy * dy) <= tolerance;
}

function pointDistance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;

  return Math.sqrt(dx * dx + dy * dy);
}

function closestPointOnSegment(point, segmentStart, segmentEnd) {
  const dx = segmentEnd.x - segmentStart.x;
  const dy = segmentEnd.y - segmentStart.y;

  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    return {
      point: {
        x: segmentStart.x,
        y: segmentStart.y,
      },
      distance: pointDistance(point, segmentStart),
      t: 0,
    };
  }

  const projection =
    ((point.x - segmentStart.x) * dx + (point.y - segmentStart.y) * dy) /
    lengthSquared;

  const t = Math.max(0, Math.min(1, projection));

  const closestPoint = {
    x: segmentStart.x + t * dx,
    y: segmentStart.y + t * dy,
  };

  return {
    point: closestPoint,
    distance: pointDistance(point, closestPoint),
    t,
  };
}

function getPointToStrokeDistance(point, stroke) {
  if (
    !point ||
    !stroke ||
    !Array.isArray(stroke.x) ||
    !Array.isArray(stroke.y)
  ) {
    return null;
  }

  const pointCount = Math.min(stroke.x.length, stroke.y.length);

  if (pointCount === 0) {
    return null;
  }

  if (pointCount === 1) {
    const onlyPoint = getStrokePoint(stroke, 0);

    return {
      distance: pointDistance(point, onlyPoint),
      point: onlyPoint,
      segmentIndex: null,
      segmentT: 0,
    };
  }

  let bestResult = null;

  for (let segmentIndex = 0; segmentIndex < pointCount - 1; segmentIndex++) {
    const segmentStart = getStrokePoint(stroke, segmentIndex);
    const segmentEnd = getStrokePoint(stroke, segmentIndex + 1);

    const result = closestPointOnSegment(point, segmentStart, segmentEnd);

    if (!bestResult || result.distance < bestResult.distance) {
      bestResult = {
        distance: result.distance,
        point: result.point,
        segmentIndex,
        segmentT: result.t,
      };
    }
  }

  return bestResult;
}

function getStrokeEndpoints(stroke) {
  if (!stroke || !Array.isArray(stroke.x) || !Array.isArray(stroke.y)) {
    return null;
  }

  const pointCount = Math.min(stroke.x.length, stroke.y.length);

  if (pointCount === 0) {
    return null;
  }

  return {
    start: getStrokePoint(stroke, 0),
    end: getStrokePoint(stroke, pointCount - 1),
  };
}

function getStrokeTouch(strokeA, strokeB, tolerance = 0.07) {
  const endpointsA = getStrokeEndpoints(strokeA);
  const endpointsB = getStrokeEndpoints(strokeB);

  if (!endpointsA || !endpointsB) {
    return null;
  }

  const candidates = [];

  const startAToB = getPointToStrokeDistance(endpointsA.start, strokeB);

  if (startAToB) {
    candidates.push({
      ...startAToB,
      source: "startA",
      endpoint: endpointsA.start,
    });
  }

  const endAToB = getPointToStrokeDistance(endpointsA.end, strokeB);

  if (endAToB) {
    candidates.push({
      ...endAToB,
      source: "endA",
      endpoint: endpointsA.end,
    });
  }

  const startBToA = getPointToStrokeDistance(endpointsB.start, strokeA);

  if (startBToA) {
    candidates.push({
      ...startBToA,
      source: "startB",
      endpoint: endpointsB.start,
    });
  }

  const endBToA = getPointToStrokeDistance(endpointsB.end, strokeA);

  if (endBToA) {
    candidates.push({
      ...endBToA,
      source: "endB",
      endpoint: endpointsB.end,
    });
  }

  candidates.sort((a, b) => a.distance - b.distance);

  const bestCandidate = candidates[0];

  if (!bestCandidate || bestCandidate.distance > tolerance) {
    return null;
  }

  return {
    distance: bestCandidate.distance,
    x: (bestCandidate.endpoint.x + bestCandidate.point.x) / 2,
    y: (bestCandidate.endpoint.y + bestCandidate.point.y) / 2,
    source: bestCandidate.source,
    segmentIndex: bestCandidate.segmentIndex,
    segmentT: bestCandidate.segmentT,
  };
}

function detectStrokeTouches(strokes, intersections = [], tolerance = 0.07) {
  if (!Array.isArray(strokes) || strokes.length < 2) {
    return [];
  }

  const touches = [];

  for (let strokeAIndex = 0; strokeAIndex < strokes.length; strokeAIndex++) {
    for (
      let strokeBIndex = strokeAIndex + 1;
      strokeBIndex < strokes.length;
      strokeBIndex++
    ) {
      const alreadyIntersects = intersections.some(
        (intersection) =>
          intersection.strokeA === strokeAIndex &&
          intersection.strokeB === strokeBIndex,
      );

      if (alreadyIntersects) {
        continue;
      }

      const touch = getStrokeTouch(
        strokes[strokeAIndex],
        strokes[strokeBIndex],
        tolerance,
      );

      if (!touch) {
        continue;
      }

      touches.push({
        strokeA: strokeAIndex,
        strokeB: strokeBIndex,
        distance: touch.distance,
        x: touch.x,
        y: touch.y,
        source: touch.source,
        segmentIndex: touch.segmentIndex,
        segmentT: touch.segmentT,
      });
    }
  }

  return touches;
}

function detectStrokeIntersections(strokes) {
  if (!Array.isArray(strokes) || strokes.length < 2) {
    return [];
  }

  const intersections = [];

  for (let strokeAIndex = 0; strokeAIndex < strokes.length; strokeAIndex++) {
    const strokeA = strokes[strokeAIndex];

    if (!strokeA || !Array.isArray(strokeA.x) || !Array.isArray(strokeA.y)) {
      continue;
    }

    const pointCountA = Math.min(strokeA.x.length, strokeA.y.length);

    for (
      let strokeBIndex = strokeAIndex + 1;
      strokeBIndex < strokes.length;
      strokeBIndex++
    ) {
      const strokeB = strokes[strokeBIndex];

      if (!strokeB || !Array.isArray(strokeB.x) || !Array.isArray(strokeB.y)) {
        continue;
      }

      const pointCountB = Math.min(strokeB.x.length, strokeB.y.length);

      for (
        let segmentAIndex = 0;
        segmentAIndex < pointCountA - 1;
        segmentAIndex++
      ) {
        const p1 = getStrokePoint(strokeA, segmentAIndex);
        const p2 = getStrokePoint(strokeA, segmentAIndex + 1);

        for (
          let segmentBIndex = 0;
          segmentBIndex < pointCountB - 1;
          segmentBIndex++
        ) {
          const q1 = getStrokePoint(strokeB, segmentBIndex);
          const q2 = getStrokePoint(strokeB, segmentBIndex + 1);

          const point = getSegmentIntersection(p1, p2, q1, q2);

          if (!point) {
            continue;
          }

          const alreadyExists = intersections.some(
            (intersection) =>
              intersection.strokeA === strokeAIndex &&
              intersection.strokeB === strokeBIndex &&
              pointsAreNear(intersection, point),
          );

          if (!alreadyExists) {
            intersections.push({
              strokeA: strokeAIndex,
              strokeB: strokeBIndex,
              x: point.x,
              y: point.y,
              segmentA: segmentAIndex,
              segmentB: segmentBIndex,
            });
          }
        }
      }
    }
  }

  return intersections;
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
  computeDirectionChanges,
  getSegmentIntersection,
  detectStrokeIntersections,
  closestPointOnSegment,
  getPointToStrokeDistance,
  getStrokeTouch,
  detectStrokeTouches,
};
