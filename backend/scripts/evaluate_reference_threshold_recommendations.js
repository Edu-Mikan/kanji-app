const fs = require("node:fs");

const path = require("node:path");

function parseArgs(argv) {
  const options = {
    calibrationReportPath: null,
    recommendationsPath: null,
    outputPath: null,
    comparisonGroup: null,
    help: false,
  };

  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];

    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }

    if (argument === "--calibration-report") {
      options.calibrationReportPath = path.resolve(argv[index + 1]);

      index++;
      continue;
    }

    if (argument === "--recommendations") {
      options.recommendationsPath = path.resolve(argv[index + 1]);

      index++;
      continue;
    }

    if (argument === "--comparison-group") {
      options.comparisonGroup = argv[index + 1];

      index++;
      continue;
    }

    if (argument === "--out-json") {
      options.outputPath = path.resolve(argv[index + 1]);

      index++;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return options;
}

function printHelp() {
  console.log(`
Evaluate reference threshold recommendations

Usage:
  node scripts/evaluate_reference_threshold_recommendations.js \\
    --calibration-report ./field_after_replacement_calibration_report.json \\
    --recommendations ./field_reference_threshold_recommendations.json \\
    --out-json ./field_reference_threshold_evaluation_report.json

Optional:
  --comparison-group falsePositiveVsTruePositive
      Evaluate only recommendations from this comparison group.
`);
}

function assertFileExists(filePath, label) {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error(`${label} not found: ${filePath}`);
  }
}

function loadJson(filePath, label) {
  assertFileExists(filePath, label);

  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function getNestedValue(source, pathParts) {
  let current = source;

  for (const pathPart of pathParts) {
    if (
      current == null ||
      typeof current !== "object" ||
      !(pathPart in current)
    ) {
      return undefined;
    }

    current = current[pathPart];
  }

  return current;
}

function getMetricValueFromSampleEvaluation(sampleEvaluation, metricPath) {
  const parts = metricPath.split(".");

  if (parts[0] === "referenceComparison") {
    return getNestedValue(sampleEvaluation.referenceComparison, parts.slice(1));
  }

  if (parts[0] === "perRole") {
    const roleKey = parts[1];

    const metricName = parts[2];

    if (!roleKey || !metricName) {
      return undefined;
    }

    return getNestedValue(sampleEvaluation.perRoleReferenceComparison, [
      roleKey,
      metricName,
    ]);
  }

  return undefined;
}

function emptyClassificationCounts() {
  return {
    truePositive: 0,
    falseNegative: 0,
    trueNegative: 0,
    falsePositive: 0,
  };
}

function classifyOutcome({ expectedCorrect, accepted }) {
  if (expectedCorrect && accepted) {
    return "truePositive";
  }

  if (expectedCorrect && !accepted) {
    return "falseNegative";
  }

  if (!expectedCorrect && accepted) {
    return "falsePositive";
  }

  return "trueNegative";
}

function countOriginalClassifications(sampleEvaluations) {
  const counts = emptyClassificationCounts();

  for (const sampleEvaluation of sampleEvaluations) {
    if (sampleEvaluation.classification in counts) {
      counts[sampleEvaluation.classification]++;
    }
  }

  return counts;
}

function evaluateRecommendationAgainstSamples({
  recommendation,
  sampleEvaluations,
}) {
  const before = countOriginalClassifications(sampleEvaluations);

  const after = emptyClassificationCounts();

  const affectedSamples = [];

  let missingMetricCount = 0;

  for (const sampleEvaluation of sampleEvaluations) {
    const metricValue = getMetricValueFromSampleEvaluation(
      sampleEvaluation,
      recommendation.metricPath,
    );

    const hasMetric =
      typeof metricValue === "number" && Number.isFinite(metricValue);

    if (!hasMetric) {
      missingMetricCount++;
    }

    const thresholdPassed =
      !hasMetric || metricValue <= recommendation.suggestedMax;

    const originalAccepted = sampleEvaluation.actualAccepted === true;

    const acceptedAfter = originalAccepted && thresholdPassed;

    const afterClassification = classifyOutcome({
      expectedCorrect: sampleEvaluation.expectedCorrect === true,
      accepted: acceptedAfter,
    });

    after[afterClassification]++;

    if (afterClassification !== sampleEvaluation.classification) {
      affectedSamples.push({
        recognitionId: sampleEvaluation.recognitionId,

        before: sampleEvaluation.classification,

        after: afterClassification,

        metricValue: hasMetric ? metricValue : null,

        threshold: recommendation.suggestedMax,
      });
    }
  }

  const falsePositiveReduction = before.falsePositive - after.falsePositive;

  const falseNegativeIncrease = after.falseNegative - before.falseNegative;

  const truePositiveLoss = before.truePositive - after.truePositive;

  const safe = falseNegativeIncrease <= 0 && truePositiveLoss <= 0;

  return {
    metricPath: recommendation.metricPath,

    comparisonGroup: recommendation.comparisonGroup,

    source: recommendation.source,

    suggestedMax: recommendation.suggestedMax,

    positiveMax: recommendation.positiveMax,

    negativeMin: recommendation.negativeMin,

    gap: recommendation.gap,

    risk: recommendation.risk,

    before,

    after,

    falsePositiveReduction,

    falseNegativeIncrease,

    truePositiveLoss,

    missingMetricCount,

    affectedSampleCount: affectedSamples.length,

    affectedSamples,

    safe,
  };
}

function buildEvaluationReport({
  calibrationReport,
  recommendationsReport,
  comparisonGroup,
}) {
  const sampleEvaluations = calibrationReport.sampleEvaluations ?? [];

  if (!Array.isArray(sampleEvaluations) || sampleEvaluations.length === 0) {
    throw new Error("Calibration report does not contain sampleEvaluations");
  }

  let recommendations = recommendationsReport.recommendations ?? [];

  if (comparisonGroup) {
    recommendations = recommendations.filter(
      (recommendation) => recommendation.comparisonGroup === comparisonGroup,
    );
  }

  const evaluations = recommendations.map((recommendation) =>
    evaluateRecommendationAgainstSamples({
      recommendation,
      sampleEvaluations,
    }),
  );

  const safeEvaluations = evaluations.filter((evaluation) => evaluation.safe);

  const usefulEvaluations = evaluations.filter(
    (evaluation) => evaluation.safe && evaluation.falsePositiveReduction > 0,
  );

  return {
    generatedAt: new Date().toISOString(),

    mode: "reference_threshold_recommendation_evaluation",

    kanji: calibrationReport.kanji,

    sampleCount: sampleEvaluations.length,

    comparisonGroup: comparisonGroup ?? null,

    recommendationCount: recommendations.length,

    safeCount: safeEvaluations.length,

    usefulCount: usefulEvaluations.length,

    originalClassifications: countOriginalClassifications(sampleEvaluations),

    evaluations,
  };
}

function printEvaluationReport(report) {
  console.log("");
  console.log("REFERENCE THRESHOLD EVALUATION");
  console.log("==============================");

  console.log(`Kanji: ${report.kanji}`);

  console.log(`Samples: ${report.sampleCount}`);

  console.log(`Recommendations: ${report.recommendationCount}`);

  console.log(`Safe: ${report.safeCount}`);

  console.log(`Useful: ${report.usefulCount}`);

  console.log("");

  for (const evaluation of report.evaluations.slice(0, 20)) {
    console.log(
      [
        `  ${evaluation.metricPath}`,
        `group=${evaluation.comparisonGroup}`,
        `suggestedMax=${evaluation.suggestedMax.toFixed(4)}`,
        `fpReduction=${evaluation.falsePositiveReduction}`,
        `fnIncrease=${evaluation.falseNegativeIncrease}`,
        `tpLoss=${evaluation.truePositiveLoss}`,
        `safe=${evaluation.safe}`,
      ].join(" "),
    );
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  if (!options.calibrationReportPath) {
    throw new Error("Missing --calibration-report <path>");
  }

  if (!options.recommendationsPath) {
    throw new Error("Missing --recommendations <path>");
  }

  const calibrationReport = loadJson(
    options.calibrationReportPath,
    "calibration report",
  );

  const recommendationsReport = loadJson(
    options.recommendationsPath,
    "recommendations report",
  );

  const report = buildEvaluationReport({
    calibrationReport,
    recommendationsReport,
    comparisonGroup: options.comparisonGroup,
  });

  printEvaluationReport(report);

  if (options.outputPath) {
    fs.writeFileSync(
      options.outputPath,
      JSON.stringify(report, null, 2),
      "utf8",
    );

    console.log("");
    console.log(`Evaluation report saved to: ${options.outputPath}`);
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error("");
    console.error("ERROR");
    console.error("-----");
    console.error(error.message);

    process.exitCode = 1;
  }
}

module.exports = {
  getNestedValue,
  getMetricValueFromSampleEvaluation,
  classifyOutcome,
  countOriginalClassifications,
  evaluateRecommendationAgainstSamples,
  buildEvaluationReport,
};
