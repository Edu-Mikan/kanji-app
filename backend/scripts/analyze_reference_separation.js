const fs = require("node:fs");

const path = require("node:path");

function parseArgs(argv) {
  const options = {
    reportPath: null,
    outputPath: null,
    help: false,
  };

  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];

    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }

    if (argument === "--report") {
      options.reportPath = path.resolve(argv[index + 1]);

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
Analyze reference comparison separation

Usage:
  node scripts/analyze_reference_separation.js \\
    --report ./field_after_replacement_calibration_report.json \\
    --out-json ./field_reference_separation_report.json
`);
}

function assertFileExists(filePath, label) {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error(`${label} not found: ${filePath}`);
  }
}

function loadJson(filePath) {
  assertFileExists(filePath, "report");

  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function analyzeSummarySeparation({
  metricPath,
  positiveSummary,
  negativeSummary,
}) {
  if (
    !positiveSummary ||
    !negativeSummary ||
    typeof positiveSummary.max !== "number" ||
    typeof negativeSummary.min !== "number"
  ) {
    return null;
  }

  const positiveMax = positiveSummary.max;

  const negativeMin = negativeSummary.min;

  const gap = negativeMin - positiveMax;

  const separates = gap > 0;

  const positiveMedian = positiveSummary.median;

  const negativeMedian = negativeSummary.median;

  const medianDelta =
    typeof positiveMedian === "number" && typeof negativeMedian === "number"
      ? negativeMedian - positiveMedian
      : null;

  return {
    metricPath,
    positiveMax,
    negativeMin,
    gap,
    separates,
    positiveMedian,
    negativeMedian,
    medianDelta,
  };
}

function analyzeGlobalReferenceSeparation(calibrationReport) {
  const referenceComparison = calibrationReport.referenceComparison ?? {};

  const truePositive = referenceComparison.truePositive ?? {};

  const falsePositive = referenceComparison.falsePositive ?? {};

  const trueNegative = referenceComparison.trueNegative ?? {};

  const metricNames = Array.from(
    new Set([
      ...Object.keys(truePositive),
      ...Object.keys(falsePositive),
      ...Object.keys(trueNegative),
    ]),
  );

  const falsePositiveComparisons = [];
  const trueNegativeComparisons = [];

  for (const metricName of metricNames) {
    const fpAnalysis = analyzeSummarySeparation({
      metricPath: `referenceComparison.${metricName}`,
      positiveSummary: truePositive[metricName],
      negativeSummary: falsePositive[metricName],
    });

    if (fpAnalysis) {
      falsePositiveComparisons.push(fpAnalysis);
    }

    const tnAnalysis = analyzeSummarySeparation({
      metricPath: `referenceComparison.${metricName}`,
      positiveSummary: truePositive[metricName],
      negativeSummary: trueNegative[metricName],
    });

    if (tnAnalysis) {
      trueNegativeComparisons.push(tnAnalysis);
    }
  }

  return {
    falsePositiveVsTruePositive: falsePositiveComparisons,

    trueNegativeVsTruePositive: trueNegativeComparisons,
  };
}

function analyzePerRoleReferenceSeparation(calibrationReport) {
  const perStroke = calibrationReport.perStrokeReferenceComparison ?? {};

  const truePositive = perStroke.truePositive ?? {};

  const falsePositive = perStroke.falsePositive ?? {};

  const trueNegative = perStroke.trueNegative ?? {};

  const roleIds = Array.from(
    new Set([
      ...Object.keys(truePositive),
      ...Object.keys(falsePositive),
      ...Object.keys(trueNegative),
    ]),
  );

  const falsePositiveComparisons = [];
  const trueNegativeComparisons = [];

  for (const roleId of roleIds) {
    const positiveRole = truePositive[roleId] ?? {};

    const falsePositiveRole = falsePositive[roleId] ?? {};

    const trueNegativeRole = trueNegative[roleId] ?? {};

    const metricNames = Array.from(
      new Set([
        ...Object.keys(positiveRole),
        ...Object.keys(falsePositiveRole),
        ...Object.keys(trueNegativeRole),
      ]),
    );

    for (const metricName of metricNames) {
      const fpAnalysis = analyzeSummarySeparation({
        metricPath: `perRole.${roleId}.${metricName}`,
        positiveSummary: positiveRole[metricName],
        negativeSummary: falsePositiveRole[metricName],
      });

      if (fpAnalysis) {
        falsePositiveComparisons.push(fpAnalysis);
      }

      const tnAnalysis = analyzeSummarySeparation({
        metricPath: `perRole.${roleId}.${metricName}`,
        positiveSummary: positiveRole[metricName],
        negativeSummary: trueNegativeRole[metricName],
      });

      if (tnAnalysis) {
        trueNegativeComparisons.push(tnAnalysis);
      }
    }
  }

  return {
    falsePositiveVsTruePositive: falsePositiveComparisons,

    trueNegativeVsTruePositive: trueNegativeComparisons,
  };
}

function sortSeparationResults(results) {
  return [...results].sort((left, right) => right.gap - left.gap);
}

function buildSeparationReport(calibrationReport) {
  const global = analyzeGlobalReferenceSeparation(calibrationReport);

  const perRole = analyzePerRoleReferenceSeparation(calibrationReport);

  return {
    generatedAt: new Date().toISOString(),

    mode: "reference_separation_analysis",

    kanji: calibrationReport.kanji,

    classifications: calibrationReport.classifications,

    global: {
      falsePositiveVsTruePositive: sortSeparationResults(
        global.falsePositiveVsTruePositive,
      ),

      trueNegativeVsTruePositive: sortSeparationResults(
        global.trueNegativeVsTruePositive,
      ),
    },

    perRole: {
      falsePositiveVsTruePositive: sortSeparationResults(
        perRole.falsePositiveVsTruePositive,
      ),

      trueNegativeVsTruePositive: sortSeparationResults(
        perRole.trueNegativeVsTruePositive,
      ),
    },
  };
}

function printTopResults(title, results, limit = 10) {
  console.log("");
  console.log(title);

  for (const result of results.slice(0, limit)) {
    console.log(
      [
        `  ${result.metricPath}`,
        `gap=${result.gap.toFixed(4)}`,
        `separates=${result.separates}`,
        `positiveMax=${result.positiveMax.toFixed(4)}`,
        `negativeMin=${result.negativeMin.toFixed(4)}`,
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

  if (!options.reportPath) {
    throw new Error("Missing --report <path>");
  }

  const calibrationReport = loadJson(options.reportPath);

  const separationReport = buildSeparationReport(calibrationReport);

  console.log("");
  console.log("REFERENCE SEPARATION ANALYSIS");
  console.log("=============================");
  console.log(`Kanji: ${separationReport.kanji}`);

  printTopResults(
    "Global falsePositive vs truePositive",
    separationReport.global.falsePositiveVsTruePositive,
  );

  printTopResults(
    "Per-role falsePositive vs truePositive",
    separationReport.perRole.falsePositiveVsTruePositive,
  );

  printTopResults(
    "Global trueNegative vs truePositive",
    separationReport.global.trueNegativeVsTruePositive,
  );

  printTopResults(
    "Per-role trueNegative vs truePositive",
    separationReport.perRole.trueNegativeVsTruePositive,
  );

  if (options.outputPath) {
    fs.writeFileSync(
      options.outputPath,
      JSON.stringify(separationReport, null, 2),
      "utf8",
    );

    console.log("");
    console.log(`Separation report saved to: ${options.outputPath}`);
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
  analyzeSummarySeparation,
  analyzeGlobalReferenceSeparation,
  analyzePerRoleReferenceSeparation,
  buildSeparationReport,
};
