const fs = require("node:fs");

const path = require("node:path");

function parseArgs(argv) {
  const options = {
    evaluationReportPath: null,
    outputPath: null,
    minFalsePositiveReduction: 1,
    requireSafe: true,
    help: false,
  };

  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];

    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }

    if (argument === "--evaluation-report") {
      options.evaluationReportPath = path.resolve(argv[index + 1]);

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

    if (argument === "--allow-unsafe") {
      options.requireSafe = false;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return options;
}

function printHelp() {
  console.log(`
Create descriptor candidate patch from threshold evaluation report

Usage:
  node scripts/create_descriptor_candidate_patch.js \\
    --evaluation-report ./field_reference_threshold_evaluation_report.json \\
    --out-json ./field_descriptor_candidate_patch.json

Options:
  --min-fp-reduction <number>
      Minimum false positive reduction required.
      Default: 1.

  --allow-unsafe
      Include recommendations even if safe=false.
      Not recommended for production candidate generation.
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

function isUsefulEvaluation(
  evaluation,
  { minFalsePositiveReduction, requireSafe },
) {
  if (requireSafe && evaluation.safe !== true) {
    return false;
  }

  if (
    typeof evaluation.falsePositiveReduction !== "number" ||
    evaluation.falsePositiveReduction < minFalsePositiveReduction
  ) {
    return false;
  }

  if (evaluation.falseNegativeIncrease > 0) {
    return false;
  }

  if (evaluation.truePositiveLoss > 0) {
    return false;
  }

  return true;
}

function buildCandidateRule(evaluation) {
  return {
    type: "referenceMetricMax",

    metricPath: evaluation.metricPath,

    max: evaluation.suggestedMax,

    source: evaluation.source,

    comparisonGroup: evaluation.comparisonGroup,

    risk: evaluation.risk,

    evidence: {
      falsePositiveReduction: evaluation.falsePositiveReduction,

      falseNegativeIncrease: evaluation.falseNegativeIncrease,

      truePositiveLoss: evaluation.truePositiveLoss,

      safe: evaluation.safe,

      before: evaluation.before,

      after: evaluation.after,

      affectedSampleCount: evaluation.affectedSampleCount,

      affectedSamples: evaluation.affectedSamples,
    },
  };
}

function buildDescriptorCandidatePatch({
  evaluationReport,
  minFalsePositiveReduction = 1,
  requireSafe = true,
}) {
  const usefulEvaluations = (evaluationReport.evaluations ?? []).filter(
    (evaluation) =>
      isUsefulEvaluation(evaluation, {
        minFalsePositiveReduction,
        requireSafe,
      }),
  );

  const rules = usefulEvaluations.map(buildCandidateRule);

  return {
    generatedAt: new Date().toISOString(),

    mode: "descriptor_candidate_patch",

    status: "candidate",

    action: "review",

    kanji: evaluationReport.kanji,

    source: {
      type: "reference_threshold_evaluation",

      sampleCount: evaluationReport.sampleCount,

      originalClassifications: evaluationReport.originalClassifications,

      recommendationCount: evaluationReport.recommendationCount,

      safeCount: evaluationReport.safeCount,

      usefulCount: evaluationReport.usefulCount,
    },

    selectionPolicy: {
      requireSafe,
      minFalsePositiveReduction,
      rejectIfFalseNegativeIncrease: true,

      rejectIfTruePositiveLoss: true,
    },

    ruleCount: rules.length,

    rules,
  };
}

function printCandidatePatch(patch) {
  console.log("");
  console.log("DESCRIPTOR CANDIDATE PATCH");
  console.log("==========================");

  console.log(`Kanji: ${patch.kanji}`);

  console.log(`Status: ${patch.status}`);

  console.log(`Rules: ${patch.ruleCount}`);

  console.log("");

  for (const rule of patch.rules) {
    console.log(
      [
        `  ${rule.metricPath}`,
        `type=${rule.type}`,
        `max=${rule.max.toFixed(4)}`,
        `fpReduction=${rule.evidence.falsePositiveReduction}`,
        `fnIncrease=${rule.evidence.falseNegativeIncrease}`,
        `tpLoss=${rule.evidence.truePositiveLoss}`,
        `risk=${rule.risk}`,
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

  if (!options.evaluationReportPath) {
    throw new Error("Missing --evaluation-report <path>");
  }

  if (!Number.isFinite(options.minFalsePositiveReduction)) {
    throw new Error("--min-fp-reduction must be a finite number");
  }

  const evaluationReport = loadJson(
    options.evaluationReportPath,
    "evaluation report",
  );

  const patch = buildDescriptorCandidatePatch({
    evaluationReport,
    minFalsePositiveReduction: options.minFalsePositiveReduction,
    requireSafe: options.requireSafe,
  });

  printCandidatePatch(patch);

  if (options.outputPath) {
    fs.writeFileSync(
      options.outputPath,
      JSON.stringify(patch, null, 2),
      "utf8",
    );

    console.log("");
    console.log(`Candidate patch saved to: ${options.outputPath}`);
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
  isUsefulEvaluation,
  buildCandidateRule,
  buildDescriptorCandidatePatch,
};
