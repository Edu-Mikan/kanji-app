const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");

function parseArgs(argv) {
  const options = {
    kanji: null,
    filePath: null,
    descriptorPath: null,
    datasetPath: null,
    outputDirectory: null,
    minGap: 0.05,
    comparisonGroup: "falsePositiveVsTruePositive",
    help: false,
  };

  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];

    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }

    if (argument === "--kanji") {
      options.kanji = argv[index + 1];
      index++;
      continue;
    }

    if (argument === "--file") {
      options.filePath = path.resolve(argv[index + 1]);
      index++;
      continue;
    }

    if (argument === "--descriptor-file") {
      options.descriptorPath = path.resolve(argv[index + 1]);
      index++;
      continue;
    }

    if (argument === "--dataset") {
      options.datasetPath = path.resolve(argv[index + 1]);
      index++;
      continue;
    }

    if (argument === "--out-dir") {
      options.outputDirectory = path.resolve(argv[index + 1]);
      index++;
      continue;
    }

    if (argument === "--min-gap") {
      options.minGap = Number(argv[index + 1]);
      index++;
      continue;
    }

    if (argument === "--comparison-group") {
      options.comparisonGroup = argv[index + 1];
      index++;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return options;
}

function printHelp() {
  console.log(`
Run descriptor candidate pipeline

Usage:
  node scripts/run_descriptor_candidate_pipeline.js \\
    --kanji 田 \\
    --file ./tests/fixtures/global_baseline.jsonl \\
    --descriptor-file ./data/kanji_descriptors.json \\
    --dataset ./kanji_full.json \\
    --out-dir ./candidate_reports

Options:
  --min-gap <number>
      Minimum separation gap for recommendations.
      Default: 0.05.

  --comparison-group <name>
      Recommendation group to evaluate.
      Default: falsePositiveVsTruePositive.
`);
}

function validateOptions(options) {
  if (options.help) {
    return;
  }

  if (!options.kanji) {
    throw new Error("Missing --kanji <kanji>");
  }

  if (!options.filePath) {
    throw new Error("Missing --file <path>");
  }

  if (!options.descriptorPath) {
    throw new Error("Missing --descriptor-file <path>");
  }

  if (!options.datasetPath) {
    throw new Error("Missing --dataset <path>");
  }

  if (!options.outputDirectory) {
    throw new Error("Missing --out-dir <path>");
  }

  if (!Number.isFinite(options.minGap)) {
    throw new Error("--min-gap must be a finite number");
  }
}

function ensureDirectory(directoryPath) {
  fs.mkdirSync(directoryPath, {
    recursive: true,
  });
}

function runNodeScript(scriptPath, args) {
  const commandArgs = [scriptPath, ...args];

  console.log("");
  console.log(`> node ${commandArgs.join(" ")}`);

  const result = childProcess.spawnSync(process.execPath, commandArgs, {
    stdio: "inherit",
    shell: false,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      `Script failed with exit code ${result.status}: ${scriptPath}`,
    );
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function buildOutputPaths({ kanji, outputDirectory }) {
  const prefix = path.join(outputDirectory, kanji);

  return {
    calibrationReport: `${prefix}_calibration_report.json`,

    separationReport: `${prefix}_reference_separation_report.json`,

    recommendations: `${prefix}_threshold_recommendations.json`,

    thresholdEvaluation: `${prefix}_threshold_evaluation_report.json`,

    candidatePatch: `${prefix}_descriptor_candidate_patch.json`,

    patchEvaluation: `${prefix}_descriptor_candidate_patch_evaluation_report.json`,

    candidateDescriptors: `${prefix}_kanji_descriptors_candidate.json`,

    summary: `${prefix}_pipeline_summary.json`,
  };
}

function buildPipelineSummary({ kanji, paths }) {
  const calibrationReport = readJson(paths.calibrationReport);

  const recommendations = readJson(paths.recommendations);

  const thresholdEvaluation = readJson(paths.thresholdEvaluation);

  const candidatePatch = readJson(paths.candidatePatch);

  const patchEvaluation = readJson(paths.patchEvaluation);

  return {
    generatedAt: new Date().toISOString(),

    mode: "descriptor_candidate_pipeline_summary",

    kanji,

    classifications: calibrationReport.classifications,

    recommendationCount: recommendations.recommendationCount,

    thresholdEvaluation: {
      recommendationCount: thresholdEvaluation.recommendationCount,

      safeCount: thresholdEvaluation.safeCount,

      usefulCount: thresholdEvaluation.usefulCount,
    },

    candidatePatch: {
      status: candidatePatch.status,

      action: candidatePatch.action,

      ruleCount: candidatePatch.ruleCount,
    },

    patchEvaluation: {
      before: patchEvaluation.before,

      after: patchEvaluation.after,

      falsePositiveReduction: patchEvaluation.falsePositiveReduction,

      falseNegativeIncrease: patchEvaluation.falseNegativeIncrease,

      truePositiveLoss: patchEvaluation.truePositiveLoss,

      safe: patchEvaluation.safe,

      affectedSampleCount: patchEvaluation.affectedSampleCount,
    },

    readyForManualPromotion:
      patchEvaluation.safe === true &&
      patchEvaluation.falseNegativeIncrease === 0 &&
      patchEvaluation.truePositiveLoss === 0 &&
      patchEvaluation.falsePositiveReduction > 0,

    outputs: paths,
  };
}

function printPipelineSummary(summary) {
  console.log("");
  console.log("DESCRIPTOR CANDIDATE PIPELINE SUMMARY");
  console.log("=====================================");

  console.log(`Kanji: ${summary.kanji}`);

  console.log("");
  console.log("Calibration:");
  console.log(JSON.stringify(summary.classifications));

  console.log("");
  console.log(`Recommendation count: ${summary.recommendationCount}`);

  console.log(`Candidate rules: ${summary.candidatePatch.ruleCount}`);

  console.log("");
  console.log("Patch evaluation:");
  console.log(
    `  falsePositiveReduction=${summary.patchEvaluation.falsePositiveReduction}`,
  );
  console.log(
    `  falseNegativeIncrease=${summary.patchEvaluation.falseNegativeIncrease}`,
  );
  console.log(`  truePositiveLoss=${summary.patchEvaluation.truePositiveLoss}`);
  console.log(`  safe=${summary.patchEvaluation.safe}`);

  console.log("");
  console.log(`Ready for manual promotion: ${summary.readyForManualPromotion}`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  validateOptions(options);

  if (options.help) {
    printHelp();
    return;
  }

  ensureDirectory(options.outputDirectory);

  const paths = buildOutputPaths({
    kanji: options.kanji,
    outputDirectory: options.outputDirectory,
  });

  runNodeScript(path.join("scripts", "calibrate_kanji_descriptor.js"), [
    "--file",
    options.filePath,
    "--kanji",
    options.kanji,
    "--descriptor-file",
    options.descriptorPath,
    "--dataset",
    options.datasetPath,
    "--out-json",
    paths.calibrationReport,
  ]);

  runNodeScript(path.join("scripts", "analyze_reference_separation.js"), [
    "--report",
    paths.calibrationReport,
    "--out-json",
    paths.separationReport,
  ]);

  runNodeScript(path.join("scripts", "recommend_reference_thresholds.js"), [
    "--report",
    paths.separationReport,
    "--min-gap",
    String(options.minGap),
    "--out-json",
    paths.recommendations,
  ]);

  runNodeScript(
    path.join("scripts", "evaluate_reference_threshold_recommendations.js"),
    [
      "--calibration-report",
      paths.calibrationReport,
      "--recommendations",
      paths.recommendations,
      "--comparison-group",
      options.comparisonGroup,
      "--out-json",
      paths.thresholdEvaluation,
    ],
  );

  runNodeScript(path.join("scripts", "create_descriptor_candidate_patch.js"), [
    "--evaluation-report",
    paths.thresholdEvaluation,
    "--out-json",
    paths.candidatePatch,
  ]);

  runNodeScript(
    path.join("scripts", "evaluate_descriptor_candidate_patch.js"),
    [
      "--calibration-report",
      paths.calibrationReport,
      "--candidate-patch",
      paths.candidatePatch,
      "--out-json",
      paths.patchEvaluation,
    ],
  );

  runNodeScript(path.join("scripts", "apply_descriptor_candidate_patch.js"), [
    "--descriptor-file",
    options.descriptorPath,
    "--candidate-patch",
    paths.candidatePatch,
    "--out-json",
    paths.candidateDescriptors,
  ]);

  const summary = buildPipelineSummary({
    kanji: options.kanji,
    paths,
  });

  fs.writeFileSync(paths.summary, JSON.stringify(summary, null, 2), "utf8");

  printPipelineSummary(summary);

  console.log("");
  console.log(`Pipeline summary saved to: ${paths.summary}`);
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
  buildOutputPaths,
  buildPipelineSummary,
};
