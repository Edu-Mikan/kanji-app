const fs = require("node:fs");

const path = require("node:path");

const {
  getMetricValueFromSampleEvaluation,
  classifyOutcome,
  countOriginalClassifications,
} = require("./evaluate_reference_threshold_recommendations");

function parseArgs(argv) {
  const options = {
    calibrationReportPath: null,
    candidatePatchPath: null,
    outputPath: null,
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

    if (argument === "--candidate-patch") {
      options.candidatePatchPath = path.resolve(argv[index + 1]);

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
Evaluate descriptor candidate patch

Usage:
  node scripts/evaluate_descriptor_candidate_patch.js \\
    --calibration-report ./field_after_replacement_calibration_report.json \\
    --candidate-patch ./field_descriptor_candidate_patch.json \\
    --out-json ./field_descriptor_candidate_patch_evaluation_report.json
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

function emptyClassificationCounts() {
  return {
    truePositive: 0,
    falseNegative: 0,
    trueNegative: 0,
    falsePositive: 0,
  };
}

function evaluateReferenceMetricMaxRule({ sampleEvaluation, rule }) {
  const metricValue = getMetricValueFromSampleEvaluation(
    sampleEvaluation,
    rule.metricPath,
  );

  const hasMetric =
    typeof metricValue === "number" && Number.isFinite(metricValue);

  /*
   * Important:
   * If the metric is missing, we do not reject the sample.
   * This keeps the candidate permissive and avoids accidental false negatives.
   */
  const passed = !hasMetric || metricValue <= rule.max;

  return {
    type: rule.type,

    metricPath: rule.metricPath,

    threshold: rule.max,

    metricValue: hasMetric ? metricValue : null,

    hasMetric,

    passed,
  };
}

function evaluateRule({ sampleEvaluation, rule }) {
  if (rule.type === "referenceMetricMax") {
    return evaluateReferenceMetricMaxRule({
      sampleEvaluation,
      rule,
    });
  }

  throw new Error(`Unsupported candidate rule type: ${rule.type}`);
}

function evaluateSampleAgainstPatch({ sampleEvaluation, patch }) {
  const ruleResults = (patch.rules ?? []).map((rule) =>
    evaluateRule({
      sampleEvaluation,
      rule,
    }),
  );

  const allRulesPassed = ruleResults.every((result) => result.passed);

  const originalAccepted = sampleEvaluation.actualAccepted === true;

  const acceptedAfterPatch = originalAccepted && allRulesPassed;

  const afterClassification = classifyOutcome({
    expectedCorrect: sampleEvaluation.expectedCorrect === true,
    accepted: acceptedAfterPatch,
  });

  const failedRules = ruleResults.filter((result) => !result.passed);

  return {
    recognitionId: sampleEvaluation.recognitionId,

    before: sampleEvaluation.classification,

    after: afterClassification,

    expectedCorrect: sampleEvaluation.expectedCorrect === true,

    acceptedBefore: originalAccepted,

    acceptedAfter: acceptedAfterPatch,

    changed: afterClassification !== sampleEvaluation.classification,

    failedRuleCount: failedRules.length,

    failedRules,

    ruleResults,
  };
}

function evaluateCandidatePatch({ calibrationReport, patch }) {
  const sampleEvaluations = calibrationReport.sampleEvaluations ?? [];

  if (!Array.isArray(sampleEvaluations) || sampleEvaluations.length === 0) {
    throw new Error("Calibration report does not contain sampleEvaluations");
  }

  const before = countOriginalClassifications(sampleEvaluations);

  const after = emptyClassificationCounts();

  const sampleResults = sampleEvaluations.map((sampleEvaluation) =>
    evaluateSampleAgainstPatch({
      sampleEvaluation,
      patch,
    }),
  );

  for (const sampleResult of sampleResults) {
    after[sampleResult.after]++;
  }

  const affectedSamples = sampleResults.filter(
    (sampleResult) => sampleResult.changed,
  );

  const falsePositiveReduction = before.falsePositive - after.falsePositive;

  const falseNegativeIncrease = after.falseNegative - before.falseNegative;

  const truePositiveLoss = before.truePositive - after.truePositive;

  const safe = falseNegativeIncrease <= 0 && truePositiveLoss <= 0;

  return {
    before,
    after,

    falsePositiveReduction,
    falseNegativeIncrease,
    truePositiveLoss,

    safe,

    affectedSampleCount: affectedSamples.length,

    affectedSamples,

    sampleResults,
  };
}

function buildCandidatePatchEvaluationReport({ calibrationReport, patch }) {
  const evaluation = evaluateCandidatePatch({
    calibrationReport,
    patch,
  });

  return {
    generatedAt: new Date().toISOString(),

    mode: "descriptor_candidate_patch_evaluation",

    kanji: calibrationReport.kanji,

    patchStatus: patch.status,

    patchAction: patch.action,

    sampleCount: calibrationReport.sampleEvaluations.length,

    ruleCount: patch.ruleCount ?? (patch.rules ?? []).length,

    patchRules: patch.rules ?? [],

    ...evaluation,
  };
}

function printCandidatePatchEvaluationReport(report) {
  console.log("");
  console.log("DESCRIPTOR CANDIDATE PATCH EVALUATION");
  console.log("=====================================");

  console.log(`Kanji: ${report.kanji}`);

  console.log(`Samples: ${report.sampleCount}`);

  console.log(`Rules: ${report.ruleCount}`);

  console.log("");

  console.log("Before:", JSON.stringify(report.before));

  console.log("After:", JSON.stringify(report.after));

  console.log("");

  console.log(`False positive reduction: ${report.falsePositiveReduction}`);

  console.log(`False negative increase: ${report.falseNegativeIncrease}`);

  console.log(`True positive loss: ${report.truePositiveLoss}`);

  console.log(`Safe: ${report.safe}`);

  console.log(`Affected samples: ${report.affectedSampleCount}`);
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

  if (!options.candidatePatchPath) {
    throw new Error("Missing --candidate-patch <path>");
  }

  const calibrationReport = loadJson(
    options.calibrationReportPath,
    "calibration report",
  );

  const patch = loadJson(options.candidatePatchPath, "candidate patch");

  const report = buildCandidatePatchEvaluationReport({
    calibrationReport,
    patch,
  });

  printCandidatePatchEvaluationReport(report);

  if (options.outputPath) {
    fs.writeFileSync(
      options.outputPath,
      JSON.stringify(report, null, 2),
      "utf8",
    );

    console.log("");
    console.log(`Candidate patch evaluation saved to: ${options.outputPath}`);
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
  evaluateReferenceMetricMaxRule,
  evaluateRule,
  evaluateSampleAgainstPatch,
  evaluateCandidatePatch,
  buildCandidatePatchEvaluationReport,
};
