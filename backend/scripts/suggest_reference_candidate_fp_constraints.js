const fs = require("node:fs");
const path = require("node:path");

function parseArgs(argv) {
  const options = {
    calibrationReportPath: null,
    outputPath: null,
    minFalsePositiveReduction: 1,
    maxSuggestions: 50,
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

    if (argument === "--out-json") {
      options.outputPath = path.resolve(argv[index + 1]);
      index++;
      continue;
    }

    if (argument === "--min-fp-reduction") {
      options.minFalsePositiveReduction = Number(argv[index + 1]);
      index++;
      continue;
    }

    if (argument === "--max-suggestions") {
      options.maxSuggestions = Number(argv[index + 1]);
      index++;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return options;
}

function printHelp() {
  console.log(`
Suggest FP-safe reference constraints for generated descriptor candidates

Usage:
  node scripts/suggest_reference_candidate_fp_constraints.js \\
    --calibration-report ./candidate_reports_training/本_reference_candidate_calibration_report.json \\
    --out-json ./candidate_reports_training/本_reference_candidate_fp_constraint_suggestions.json

Options:
  --min-fp-reduction <number>
      Minimum number of false positives a suggestion must reject.
      Default: 1.

  --max-suggestions <number>
      Maximum number of suggestions to output.
      Default: 50.

The script proposes referenceMetricMax constraints where:
  - max = maximum value observed among true positives
  - truePositiveLoss = 0
  - falsePositiveReduction >= min-fp-reduction
`);
}

function validateOptions(options) {
  if (options.help) {
    return;
  }

  if (!options.calibrationReportPath) {
    throw new Error("Missing --calibration-report <path>");
  }

  if (!options.outputPath) {
    throw new Error("Missing --out-json <path>");
  }

  if (!Number.isFinite(options.minFalsePositiveReduction)) {
    throw new Error("--min-fp-reduction must be a finite number");
  }

  if (!Number.isFinite(options.maxSuggestions)) {
    throw new Error("--max-suggestions must be a finite number");
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function percentile(values, percentileValue) {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);

  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1),
  );

  return sorted[index];
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function collectMetricRows(calibrationReport) {
  const rows = [];

  for (const evaluation of calibrationReport.sampleEvaluations ?? []) {
    const classification = evaluation.classification;

    if (
      classification !== "truePositive" &&
      classification !== "falsePositive"
    ) {
      continue;
    }

    function pushMetric(metricPath, value) {
      if (!isFiniteNumber(value)) {
        return;
      }

      rows.push({
        recognitionId: evaluation.recognitionId,
        classification,
        metricPath,
        value,
      });
    }

    const referenceComparison = evaluation.referenceComparison ?? {};

    for (const metricName of [
      "comparisonCost",
      "meanRoleCost",
      "maxRoleCost",
      "missingRoles",
    ]) {
      pushMetric(
        `referenceComparison.${metricName}`,
        referenceComparison[metricName],
      );
    }

    const perRole = evaluation.perRoleReferenceComparison ?? {};

    for (const [roleKey, metrics] of Object.entries(perRole)) {
      for (const metricName of [
        "comparisonCost",
        "angleAbsDiff",
        "centerDistance",
        "widthRelativeDiff",
        "heightRelativeDiff",
        "deltaXRelativeDiff",
        "deltaYRelativeDiff",
        "straightnessDiff",
      ]) {
        pushMetric(`perRole.${roleKey}.${metricName}`, metrics?.[metricName]);
      }
    }
  }

  return rows;
}

function buildMetricSummary({ metricPath, metricRows }) {
  const truePositiveRows = metricRows.filter(
    (row) =>
      row.metricPath === metricPath && row.classification === "truePositive",
  );

  const falsePositiveRows = metricRows.filter(
    (row) =>
      row.metricPath === metricPath && row.classification === "falsePositive",
  );

  const truePositiveValues = truePositiveRows.map((row) => row.value);

  const falsePositiveValues = falsePositiveRows.map((row) => row.value);

  if (truePositiveValues.length === 0 || falsePositiveValues.length === 0) {
    return null;
  }

  const threshold = Math.max(...truePositiveValues);

  const rejectedTruePositiveRows = truePositiveRows.filter(
    (row) => row.value > threshold,
  );

  const rejectedFalsePositiveRows = falsePositiveRows.filter(
    (row) => row.value > threshold,
  );

  const falsePositiveReduction = rejectedFalsePositiveRows.length;

  const truePositiveLoss = rejectedTruePositiveRows.length;

  const safe = truePositiveLoss === 0;

  return {
    metricPath,
    threshold,
    truePositiveCount: truePositiveRows.length,
    falsePositiveCount: falsePositiveRows.length,
    truePositiveP95: percentile(truePositiveValues, 95),
    truePositiveMax: threshold,
    falsePositiveMin: Math.min(...falsePositiveValues),
    falsePositiveMedian: percentile(falsePositiveValues, 50),
    falsePositiveMax: Math.max(...falsePositiveValues),
    falsePositiveReduction,
    truePositiveLoss,
    safe,
    rejectedFalsePositiveRecognitionIds: rejectedFalsePositiveRows.map(
      (row) => row.recognitionId,
    ),
    rejectedTruePositiveRecognitionIds: rejectedTruePositiveRows.map(
      (row) => row.recognitionId,
    ),
  };
}

function buildConstraintSuggestion(metricSummary) {
  return {
    type: "referenceMetricMax",

    metricPath: metricSummary.metricPath,

    max: metricSummary.threshold,

    severity: "hard",

    status: "candidate",

    source: "auto_fp_reduction_suggestion",

    evidence: {
      truePositiveCount: metricSummary.truePositiveCount,

      falsePositiveCount: metricSummary.falsePositiveCount,

      truePositiveP95: metricSummary.truePositiveP95,

      truePositiveMax: metricSummary.truePositiveMax,

      falsePositiveMin: metricSummary.falsePositiveMin,

      falsePositiveMedian: metricSummary.falsePositiveMedian,

      falsePositiveMax: metricSummary.falsePositiveMax,

      falsePositiveReduction: metricSummary.falsePositiveReduction,

      truePositiveLoss: metricSummary.truePositiveLoss,

      safe: metricSummary.safe,

      rejectedFalsePositiveRecognitionIds:
        metricSummary.rejectedFalsePositiveRecognitionIds,

      rejectedTruePositiveRecognitionIds:
        metricSummary.rejectedTruePositiveRecognitionIds,
    },
  };
}

function suggestReferenceCandidateFpConstraints({
  calibrationReport,
  minFalsePositiveReduction = 1,
  maxSuggestions = 50,
}) {
  const metricRows = collectMetricRows(calibrationReport);

  const metricPaths = [...new Set(metricRows.map((row) => row.metricPath))];

  const metricSummaries = metricPaths
    .map((metricPath) =>
      buildMetricSummary({
        metricPath,
        metricRows,
      }),
    )
    .filter(Boolean);

  const suggestions = metricSummaries
    .filter(
      (summary) =>
        summary.safe &&
        summary.falsePositiveReduction >= minFalsePositiveReduction,
    )
    .sort((left, right) => {
      const reductionDiff =
        right.falsePositiveReduction - left.falsePositiveReduction;

      if (reductionDiff !== 0) {
        return reductionDiff;
      }

      const leftRatio = left.falsePositiveReduction / left.falsePositiveCount;

      const rightRatio =
        right.falsePositiveReduction / right.falsePositiveCount;

      const ratioDiff = rightRatio - leftRatio;

      if (ratioDiff !== 0) {
        return ratioDiff;
      }

      return left.metricPath.localeCompare(right.metricPath);
    })
    .slice(0, maxSuggestions)
    .map(buildConstraintSuggestion);

  return {
    generatedAt: new Date().toISOString(),

    mode: "reference_candidate_fp_constraint_suggestions",

    kanji: calibrationReport.kanji ?? null,

    sampleCount: calibrationReport.sampleCount ?? null,

    classificationSummary: calibrationReport.classifications ?? {},

    metricCount: metricPaths.length,

    suggestionCount: suggestions.length,

    minFalsePositiveReduction,
    maxSuggestions,

    suggestions,
  };
}

function printSuggestionSummary(report) {
  console.log("");
  console.log("REFERENCE CANDIDATE FP CONSTRAINT SUGGESTIONS");
  console.log("=============================================");

  console.log(`Kanji: ${report.kanji}`);
  console.log(`Metric count: ${report.metricCount}`);
  console.log(`Suggestions: ${report.suggestionCount}`);

  console.log("");

  for (const suggestion of report.suggestions.slice(0, 10)) {
    console.log(
      [
        suggestion.metricPath,
        `max=${suggestion.max}`,
        `fpReduction=${suggestion.evidence.falsePositiveReduction}`,
        `tpLoss=${suggestion.evidence.truePositiveLoss}`,
        `safe=${suggestion.evidence.safe}`,
      ].join(" "),
    );
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  validateOptions(options);

  if (options.help) {
    printHelp();
    return;
  }

  const calibrationReport = readJson(options.calibrationReportPath);

  const suggestionReport = suggestReferenceCandidateFpConstraints({
    calibrationReport,
    minFalsePositiveReduction: options.minFalsePositiveReduction,
    maxSuggestions: options.maxSuggestions,
  });

  fs.mkdirSync(path.dirname(options.outputPath), {
    recursive: true,
  });

  fs.writeFileSync(
    options.outputPath,
    JSON.stringify(suggestionReport, null, 2),
    "utf8",
  );

  printSuggestionSummary(suggestionReport);

  console.log("");
  console.log(`Suggestions saved to: ${options.outputPath}`);
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
  validateOptions,
  percentile,
  collectMetricRows,
  buildMetricSummary,
  buildConstraintSuggestion,
  suggestReferenceCandidateFpConstraints,
};
