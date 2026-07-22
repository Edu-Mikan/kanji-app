const EPSILON = 1e-9;
const DEFAULT_MIN_RELATIVE_DENOMINATOR = 0.05;

const DEFAULT_MAX_RELATIVE_DIFFERENCE = 2;

const DEFAULT_STROKE_COMPARISON_WEIGHTS = {
  angleAbsDiff: 1.5,
  centerDistance: 2,
  widthRelativeDiff: 1,
  heightRelativeDiff: 1,
  deltaXRelativeDiff: 0.75,
  deltaYRelativeDiff: 0.75,
  straightnessDiff: 0.5,
};

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function absoluteDifference(left, right) {
  if (!isFiniteNumber(left) || !isFiniteNumber(right)) {
    return null;
  }

  return Math.abs(left - right);
}

function relativeDifference(
  value,
  reference,
  {
    minDenominator = DEFAULT_MIN_RELATIVE_DENOMINATOR,

    maxDifference = DEFAULT_MAX_RELATIVE_DIFFERENCE,
  } = {},
) {
  if (!isFiniteNumber(value) || !isFiniteNumber(reference)) {
    return null;
  }

  const denominator = Math.max(Math.abs(reference), minDenominator, EPSILON);

  const difference = Math.abs(value - reference) / denominator;

  if (isFiniteNumber(maxDifference)) {
    return Math.min(difference, maxDifference);
  }

  return difference;
}

function centerDistance(userStroke, referenceStroke) {
  if (
    !isFiniteNumber(userStroke.centerX) ||
    !isFiniteNumber(userStroke.centerY) ||
    !isFiniteNumber(referenceStroke.centerX) ||
    !isFiniteNumber(referenceStroke.centerY)
  ) {
    return null;
  }

  const deltaX = userStroke.centerX - referenceStroke.centerX;

  const deltaY = userStroke.centerY - referenceStroke.centerY;

  return Math.sqrt(deltaX * deltaX + deltaY * deltaY);
}

function weightedAverage(metrics, weights = DEFAULT_STROKE_COMPARISON_WEIGHTS) {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const [metricName, metricValue] of Object.entries(metrics)) {
    if (!isFiniteNumber(metricValue)) {
      continue;
    }

    const weight = weights[metricName] ?? 1;

    weightedSum += metricValue * weight;

    totalWeight += weight;
  }

  if (totalWeight === 0) {
    return null;
  }

  return weightedSum / totalWeight;
}

function compareStrokeFeatures({
  userStroke,
  referenceStroke,
  weights = DEFAULT_STROKE_COMPARISON_WEIGHTS,
}) {
  const metrics = {
    angleAbsDiff: absoluteDifference(
      userStroke.angleAbs,
      referenceStroke.angleAbs,
    ),

    centerDistance: centerDistance(userStroke, referenceStroke),

    widthRelativeDiff: relativeDifference(
      userStroke.width,
      referenceStroke.width,
    ),

    heightRelativeDiff: relativeDifference(
      userStroke.height,
      referenceStroke.height,
    ),

    deltaXRelativeDiff: relativeDifference(
      userStroke.deltaX,
      referenceStroke.deltaX,
    ),

    deltaYRelativeDiff: relativeDifference(
      userStroke.deltaY,
      referenceStroke.deltaY,
    ),

    straightnessDiff: absoluteDifference(
      userStroke.straightness,
      referenceStroke.straightness,
    ),
  };

  return {
    userStrokeIndex: userStroke.index,

    referenceStrokeIndex: referenceStroke.index,

    metrics,

    comparisonCost: weightedAverage(metrics, weights),
  };
}

function getPerStroke(features) {
  const perStroke = features?.geometry?.perStroke;

  if (!Array.isArray(perStroke)) {
    return [];
  }

  return perStroke;
}

function mean(values) {
  const numericValues = values.filter(isFiniteNumber);

  if (numericValues.length === 0) {
    return null;
  }

  return (
    numericValues.reduce((total, value) => total + value, 0) /
    numericValues.length
  );
}

function compareFeatureSetsByIndex({
  userFeatures,
  referenceFeatures,
  weights = DEFAULT_STROKE_COMPARISON_WEIGHTS,
}) {
  const userStrokes = getPerStroke(userFeatures);

  const referenceStrokes = getPerStroke(referenceFeatures);

  const comparedStrokeCount = Math.min(
    userStrokes.length,
    referenceStrokes.length,
  );

  const perStrokeComparisons = [];

  for (let index = 0; index < comparedStrokeCount; index++) {
    perStrokeComparisons.push(
      compareStrokeFeatures({
        userStroke: userStrokes[index],

        referenceStroke: referenceStrokes[index],

        weights,
      }),
    );
  }

  const strokeCosts = perStrokeComparisons.map(
    (comparison) => comparison.comparisonCost,
  );

  const meanStrokeCost = mean(strokeCosts);

  const strokeCountDiff = Math.abs(
    userStrokes.length - referenceStrokes.length,
  );

  const comparisonCost =
    meanStrokeCost === null
      ? strokeCountDiff
      : meanStrokeCost + strokeCountDiff;

  return {
    assignmentMode: "index",

    userStrokeCount: userStrokes.length,

    referenceStrokeCount: referenceStrokes.length,

    strokeCountDiff,

    comparedStrokeCount,

    perStrokeComparisons,

    meanStrokeCost,

    comparisonCost,
  };
}

module.exports = {
  DEFAULT_STROKE_COMPARISON_WEIGHTS,
  isFiniteNumber,
  absoluteDifference,
  relativeDifference,
  centerDistance,
  weightedAverage,
  compareStrokeFeatures,
  compareFeatureSetsByIndex,
};
