const path = require("node:path");
const childProcess = require("node:child_process");
const { REFERENCE_CATALOG_PATH } = require("../services/kanji_reference_paths");

const DEFAULT_KANJI_DATASET_PATH = REFERENCE_CATALOG_PATH;

function parseArgs(argv) {
  const options = {
    datasetPath: DEFAULT_KANJI_DATASET_PATH,
    descriptorPath: null,
    filePath: null,
    outputDirectory: null,
    mlDatasetPath: null,
    mlSummaryPath: null,
    continueOnError: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];

    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }

    if (argument === "--dataset") {
      options.datasetPath = path.resolve(argv[index + 1]);
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

    if (argument === "--out-dir") {
      options.outputDirectory = path.resolve(argv[index + 1]);
      index++;
      continue;
    }

    if (argument === "--out-jsonl") {
      options.mlDatasetPath = path.resolve(argv[index + 1]);
      index++;
      continue;
    }

    if (argument === "--out-summary") {
      options.mlSummaryPath = path.resolve(argv[index + 1]);
      index++;
      continue;
    }

    if (argument === "--continue-on-error") {
      options.continueOnError = true;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return options;
}

function printHelp() {
  console.log(`
Run reference candidate ML dataset quality check

Usage:
  node scripts/run_reference_candidate_ml_dataset_quality_check.js \\
    --dataset ./data/kanji_reference_catalog.json \\
    --dataset <path> \\
        Path to the canonical kanji reference catalog. \\
        Default: ./data/kanji_reference_catalog.json \\
    --descriptor-file ./data/kanji_descriptors.json \\
    --file ./training_data.jsonl \\
    --out-dir ./candidate_reports_training \\
    --out-jsonl ./ml_datasets/reference_candidate_binary_dataset.jsonl \\
    --out-summary ./ml_datasets/reference_candidate_binary_dataset_summary.json \\
    --continue-on-error

This script runs:
  1. scripts/run_reference_descriptor_candidate_quality_check.js
  2. scripts/export_reference_candidate_ml_dataset.js
  3. scripts/validate_reference_candidate_ml_dataset_quality_gate.js
`);
}

function validateOptions(options) {
  if (options.help) {
    return;
  }

  if (!options.descriptorPath) {
    throw new Error("Missing --descriptor-file <path>");
  }

  if (!options.filePath) {
    throw new Error("Missing --file <path>");
  }

  if (!options.outputDirectory) {
    throw new Error("Missing --out-dir <path>");
  }

  if (!options.mlDatasetPath) {
    throw new Error("Missing --out-jsonl <path>");
  }

  if (!options.mlSummaryPath) {
    throw new Error("Missing --out-summary <path>");
  }
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

function buildReferenceCandidateQualityArgs(options) {
  const args = [
    "--all-covered",
    "--dataset",
    options.datasetPath,
    "--descriptor-file",
    options.descriptorPath,
    "--file",
    options.filePath,
    "--out-dir",
    options.outputDirectory,
  ];

  if (options.continueOnError) {
    args.push("--continue-on-error");
  }

  return args;
}

function buildMlDatasetExportArgs(options) {
  return [
    "--batch-summary",
    path.join(
      options.outputDirectory,
      "reference_descriptor_candidate_pipeline_batch_summary.json",
    ),
    "--reports-dir",
    options.outputDirectory,
    "--file",
    options.filePath,
    "--out-jsonl",
    options.mlDatasetPath,
    "--out-summary",
    options.mlSummaryPath,
    "--safe-only",
  ];
}

function buildMlDatasetQualityGateArgs(options) {
  return [
    "--dataset",
    options.mlDatasetPath,
    "--summary",
    options.mlSummaryPath,
  ];
}

function runQualityCheck(options) {
  console.log("");
  console.log("REFERENCE CANDIDATE ML DATASET QUALITY CHECK");
  console.log("============================================");

  runNodeScript(
    path.join("scripts", "run_reference_descriptor_candidate_quality_check.js"),
    buildReferenceCandidateQualityArgs(options),
  );

  runNodeScript(
    path.join("scripts", "export_reference_candidate_ml_dataset.js"),
    buildMlDatasetExportArgs(options),
  );

  runNodeScript(
    path.join(
      "scripts",
      "validate_reference_candidate_ml_dataset_quality_gate.js",
    ),
    buildMlDatasetQualityGateArgs(options),
  );

  console.log("");
  console.log(
    "Reference candidate ML dataset quality check completed successfully.",
  );
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  validateOptions(options);

  if (options.help) {
    printHelp();
    return;
  }

  runQualityCheck(options);
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
  DEFAULT_KANJI_DATASET_PATH,
  parseArgs,
  validateOptions,
  buildReferenceCandidateQualityArgs,
  buildMlDatasetExportArgs,
  buildMlDatasetQualityGateArgs,
};
