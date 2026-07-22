const fs = require("node:fs");

const path = require("node:path");

function parseArgs(argv) {
  const options = {
    separationReportPath: null,
    outputPath: null,
    minGap: 0,
    help: false,
  };

  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];

    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }

    if (argument === "--report") {
      options.separationReportPath = path.resolve(argv[index + 1]);

      index++;
      continue;
    }

    if (argument === "--out-json") {
      options.outputPath = path.resolve(argv[index + 1]);

      index++;
      continue;
    }

    if (argument === "--min-gap") {
      options.minGap = Number(argv[index + 1]);

      index++;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return options;
}

function printHelp() {
  console.log(`
Recommend reference thresholds from separation report

Usage:
  node scripts/recommend_reference_thresholds.js \\
    --report ./field_reference_separation_report.json \\
    --out-json ./field_reference_threshold_recommendations.json

Options:
  --min-gap <number>
      Minimum separation gap required.
      Default: 0.
`);
}

function assertFileExists(filePath, label) {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error(`${label} not found: ${filePath}`);
  }
}

function loadJson(filePath) {
  assertFileExists(filePath, "separation report");

  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function classifyRisk(recommendation) {
  const gap = recommendation.gap;

  const positiveMax = recommendation.positiveMax;

  if (gap >= 0.15) {
    return "low";
  }

  if (gap >= 0.05 && positiveMax < recommendation.suggestedMax) {
    return "medium";
  }

  return "high";
}

function buildRecommendation(separation, { comparisonGroup, source }) {
  const suggestedMax = (separation.positiveMax + separation.negativeMin) / 2;

  const recommendation = {
    source,
    comparisonGroup,

    metricPath: separation.metricPath,

    suggestedMax,

    positiveMax: separation.positiveMax,

    negativeMin: separation.negativeMin,

    gap: separation.gap,

    positiveMedian: separation.positiveMedian,

    negativeMedian: separation.negativeMedian,

    medianDelta: separation.medianDelta,

    separates: separation.separates,

    action: "review",
  };

  return {
    ...recommendation,
    risk: classifyRisk(recommendation),
  };
}

function collectRecommendationsFromGroup({
  items,
  comparisonGroup,
  source,
  minGap,
}) {
  return items
    .filter(
      (item) =>
        item.separates === true &&
        typeof item.gap === "number" &&
        item.gap >= minGap,
    )
    .map((item) =>
      buildRecommendation(item, {
        comparisonGroup,
        source,
      }),
    );
}

function buildThresholdRecommendationsReport({ separationReport, minGap = 0 }) {
  const recommendations = [
    ...collectRecommendationsFromGroup({
      items: separationReport.global?.falsePositiveVsTruePositive ?? [],

      comparisonGroup: "falsePositiveVsTruePositive",

      source: "global",

      minGap,
    }),

    ...collectRecommendationsFromGroup({
      items: separationReport.perRole?.falsePositiveVsTruePositive ?? [],

      comparisonGroup: "falsePositiveVsTruePositive",

      source: "perRole",

      minGap,
    }),

    ...collectRecommendationsFromGroup({
      items: separationReport.global?.trueNegativeVsTruePositive ?? [],

      comparisonGroup: "trueNegativeVsTruePositive",

      source: "global",

      minGap,
    }),

    ...collectRecommendationsFromGroup({
      items: separationReport.perRole?.trueNegativeVsTruePositive ?? [],

      comparisonGroup: "trueNegativeVsTruePositive",

      source: "perRole",

      minGap,
    }),
  ];

  const sortedRecommendations = recommendations.sort(
    (left, right) => right.gap - left.gap,
  );

  return {
    generatedAt: new Date().toISOString(),

    mode: "reference_threshold_recommendations",

    kanji: separationReport.kanji,

    classifications: separationReport.classifications,

    minGap,

    recommendationCount: sortedRecommendations.length,

    recommendations: sortedRecommendations,
  };
}

function printRecommendationsReport(report) {
  console.log("");
  console.log("REFERENCE THRESHOLD RECOMMENDATIONS");
  console.log("===================================");

  console.log(`Kanji: ${report.kanji}`);

  console.log(`Recommendations: ${report.recommendationCount}`);

  console.log("");

  for (const recommendation of report.recommendations.slice(0, 20)) {
    console.log(
      [
        `  ${recommendation.metricPath}`,
        `group=${recommendation.comparisonGroup}`,
        `suggestedMax=${recommendation.suggestedMax.toFixed(4)}`,
        `gap=${recommendation.gap.toFixed(4)}`,
        `risk=${recommendation.risk}`,
        `action=${recommendation.action}`,
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

  if (!options.separationReportPath) {
    throw new Error("Missing --report <path>");
  }

  if (!Number.isFinite(options.minGap)) {
    throw new Error("--min-gap must be a finite number");
  }

  const separationReport = loadJson(options.separationReportPath);

  const report = buildThresholdRecommendationsReport({
    separationReport,
    minGap: options.minGap,
  });

  printRecommendationsReport(report);

  if (options.outputPath) {
    fs.writeFileSync(
      options.outputPath,
      JSON.stringify(report, null, 2),
      "utf8",
    );

    console.log("");
    console.log(`Recommendations report saved to: ${options.outputPath}`);
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
  parseArgs,
  classifyRisk,
  buildRecommendation,
  collectRecommendationsFromGroup,
  buildThresholdRecommendationsReport,
};
