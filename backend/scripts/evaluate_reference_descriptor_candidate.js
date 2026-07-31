const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");

function parseArgs(argv) {
  const options = {
    kanji: null,
    candidateDescriptorPath: null,
    descriptorPath: null,
    filePath: null,
    datasetPath: null,
    outputDirectory: null,
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

    if (argument === "--candidate-descriptor") {
      options.candidateDescriptorPath = path.resolve(argv[index + 1]);
      index++;
      continue;
    }

    if (argument === "--descriptor-file") {
      options.descriptorPath = path.resolve(argv[index + 1]);
      index++;
      continue;
    }

    if (argument === "--file") {
      options.filePath = path.resolve(argv[index + 1]);
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

    throw new Error(`Unknown argument: ${argument}`);
  }

  return options;
}

function printHelp() {
  console.log(`
Evaluate reference-generated descriptor candidate

Usage:
  node scripts/evaluate_reference_descriptor_candidate.js \\
    --kanji 一 \\
    --candidate-descriptor ./candidate_reports_training/一_descriptor_candidate_from_reference.json \\
    --descriptor-file ./data/kanji_descriptors.json \\
    --file ./training_data.jsonl \\
    --dataset ./kanji_full.json \\
    --out-dir ./candidate_reports_training
`);
}

function validateOptions(options) {
  if (options.help) {
    return;
  }

  if (!options.kanji) {
    throw new Error("Missing --kanji <kanji>");
  }

  if (!options.candidateDescriptorPath) {
    throw new Error("Missing --candidate-descriptor <path>");
  }

  if (!options.descriptorPath) {
    throw new Error("Missing --descriptor-file <path>");
  }

  if (!options.filePath) {
    throw new Error("Missing --file <path>");
  }

  if (!options.datasetPath) {
    throw new Error("Missing --dataset <path>");
  }

  if (!options.outputDirectory) {
    throw new Error("Missing --out-dir <path>");
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function getDescriptorCatalog(descriptorFile) {
  return descriptorFile.descriptors ?? descriptorFile;
}

function buildEvaluationCatalog({
  kanji,
  descriptorFile,
  candidateDescriptor,
}) {
  const hasWrappedCatalog =
    descriptorFile &&
    typeof descriptorFile === "object" &&
    descriptorFile.descriptors &&
    typeof descriptorFile.descriptors === "object";

  const evaluationDescriptor = {
    ...candidateDescriptor,
    kanji,
    enabled: true,
    status: "candidate_evaluation",
  };

  if (hasWrappedCatalog) {
    const descriptors = {
      ...descriptorFile.descriptors,
    };

    descriptors[kanji] = evaluationDescriptor;

    return {
      ...descriptorFile,
      descriptors,
    };
  }

  const catalog = {
    ...descriptorFile,
  };

  catalog[kanji] = evaluationDescriptor;

  return catalog;
}

function buildOutputPaths({ kanji, outputDirectory }) {
  return {
    evaluationDescriptorPath: path.join(
      outputDirectory,
      `${kanji}_reference_candidate_descriptor_catalog.json`,
    ),

    calibrationReportPath: path.join(
      outputDirectory,
      `${kanji}_reference_candidate_calibration_report.json`,
    ),

    summaryPath: path.join(
      outputDirectory,
      `${kanji}_reference_candidate_evaluation_summary.json`,
    ),
  };
}

function runCalibration({
  kanji,
  filePath,
  descriptorPath,
  datasetPath,
  calibrationReportPath,
}) {
  const args = [
    path.join("scripts", "calibrate_kanji_descriptor.js"),
    "--file",
    filePath,
    "--kanji",
    kanji,
    "--descriptor-file",
    descriptorPath,
    "--dataset",
    datasetPath,
    "--out-json",
    calibrationReportPath,
  ];

  console.log("");
  console.log(`> node ${args.join(" ")}`);

  const result = childProcess.spawnSync(process.execPath, args, {
    stdio: "inherit",
    shell: false,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`Calibration failed with exit code ${result.status}`);
  }
}

function buildEvaluationSummary({
  kanji,
  candidateDescriptorPath,
  evaluationDescriptorPath,
  calibrationReportPath,
  calibrationReport,
}) {
  const classifications = calibrationReport.classifications ?? {};

  const truePositive = classifications.truePositive ?? 0;

  const falseNegative = classifications.falseNegative ?? 0;

  const trueNegative = classifications.trueNegative ?? 0;

  const falsePositive = classifications.falsePositive ?? 0;

  let recommendation = "review_required";

  if (falseNegative === 0 && falsePositive === 0) {
    recommendation = "candidate_clean_on_dataset";
  } else if (falseNegative > 0) {
    recommendation = "reject_or_relax_candidate_due_to_false_negatives";
  } else if (falsePositive > 0) {
    recommendation = "candidate_too_permissive_review_constraints";
  }

  return {
    generatedAt: new Date().toISOString(),

    mode: "reference_descriptor_candidate_evaluation",

    kanji,

    candidateDescriptorPath,
    evaluationDescriptorPath,
    calibrationReportPath,

    classifications: {
      truePositive,
      falseNegative,
      trueNegative,
      falsePositive,
    },

    safeAgainstFalseNegatives: falseNegative === 0,

    clean: falseNegative === 0 && falsePositive === 0,

    recommendation,
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  validateOptions(options);

  if (options.help) {
    printHelp();
    return;
  }

  fs.mkdirSync(options.outputDirectory, {
    recursive: true,
  });

  const candidateDescriptor = readJson(options.candidateDescriptorPath);

  const descriptorFile = readJson(options.descriptorPath);

  const evaluationCatalog = buildEvaluationCatalog({
    kanji: options.kanji,
    descriptorFile,
    candidateDescriptor,
  });

  const outputPaths = buildOutputPaths({
    kanji: options.kanji,
    outputDirectory: options.outputDirectory,
  });

  fs.writeFileSync(
    outputPaths.evaluationDescriptorPath,
    JSON.stringify(evaluationCatalog, null, 2),
    "utf8",
  );

  runCalibration({
    kanji: options.kanji,
    filePath: options.filePath,
    descriptorPath: outputPaths.evaluationDescriptorPath,
    datasetPath: options.datasetPath,
    calibrationReportPath: outputPaths.calibrationReportPath,
  });

  const calibrationReport = readJson(outputPaths.calibrationReportPath);

  const summary = buildEvaluationSummary({
    kanji: options.kanji,
    candidateDescriptorPath: options.candidateDescriptorPath,
    evaluationDescriptorPath: outputPaths.evaluationDescriptorPath,
    calibrationReportPath: outputPaths.calibrationReportPath,
    calibrationReport,
  });

  fs.writeFileSync(
    outputPaths.summaryPath,
    JSON.stringify(summary, null, 2),
    "utf8",
  );

  console.log("");
  console.log("REFERENCE DESCRIPTOR CANDIDATE SUMMARY");
  console.log("======================================");
  console.log(`Kanji: ${summary.kanji}`);
  console.log(`TP: ${summary.classifications.truePositive}`);
  console.log(`FN: ${summary.classifications.falseNegative}`);
  console.log(`TN: ${summary.classifications.trueNegative}`);
  console.log(`FP: ${summary.classifications.falsePositive}`);
  console.log(`Recommendation: ${summary.recommendation}`);
  console.log("");
  console.log(`Summary saved to: ${outputPaths.summaryPath}`);
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
  getDescriptorCatalog,
  buildEvaluationCatalog,
  buildOutputPaths,
  buildEvaluationSummary,
};
