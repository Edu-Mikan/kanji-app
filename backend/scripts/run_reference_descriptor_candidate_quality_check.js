const path = require("node:path");
const childProcess = require("node:child_process");
const { REFERENCE_CATALOG_PATH } = require("../services/kanji_reference_paths");

const DEFAULT_KANJI_DATASET_PATH = REFERENCE_CATALOG_PATH;

function parseArgs(argv) {
  const options = {
    kanjiList: [],
    allCovered: false,
    datasetPath: DEFAULT_KANJI_DATASET_PATH,
    descriptorPath: null,
    filePath: null,
    outputDirectory: null,
    continueOnError: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];

    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }

    if (argument === "--kanji-list") {
      options.kanjiList = argv[index + 1]
        .split(",")
        .map((kanji) => kanji.trim())
        .filter(Boolean);

      index++;
      continue;
    }

    if (argument === "--all-covered") {
      options.allCovered = true;
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
Run reference descriptor candidate quality check

Usage:
  node scripts/run_reference_descriptor_candidate_quality_check.js \\
    --all-covered \\
    --dataset ./data/kanji_reference_catalog.json \\
    --descriptor-file ./data/kanji_descriptors.json \\
    --file ./training_data.jsonl \\
    --out-dir ./candidate_reports_training \\
    --continue-on-error

Alternative:
  node scripts/run_reference_descriptor_candidate_quality_check.js \\
    --kanji-list 一,二,三,七,六 \\
    --dataset ./kanji_full.json \\
    --descriptor-file ./data/kanji_descriptors.json \\
    --file ./training_data.jsonl \\
    --out-dir ./candidate_reports_training \\
    --continue-on-error

This script runs:
  1. scripts/run_reference_descriptor_candidate_pipeline_batch.js
  2. scripts/validate_reference_descriptor_candidate_batch_quality_gate.js

The quality gate fails when:
  - errorCount > 0
  - unsafeCandidateCount > 0

Permissive candidates do not fail this gate.
`);
}

function validateOptions(options) {
  if (options.help) {
    return;
  }

  const hasExplicitKanjiList =
    Array.isArray(options.kanjiList) && options.kanjiList.length > 0;

  if (!options.allCovered && !hasExplicitKanjiList) {
    throw new Error(
      "Missing --kanji-list <kanji1,kanji2,...> or --all-covered",
    );
  }

  if (options.allCovered && hasExplicitKanjiList) {
    throw new Error("Use either --kanji-list or --all-covered, not both");
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

function buildBatchArgs(options) {
  const args = [];

  if (options.allCovered) {
    args.push("--all-covered");
  } else {
    args.push("--kanji-list", options.kanjiList.join(","));
  }

  args.push(
    "--dataset",
    options.datasetPath,
    "--descriptor-file",
    options.descriptorPath,
    "--file",
    options.filePath,
    "--out-dir",
    options.outputDirectory,
  );

  if (options.continueOnError) {
    args.push("--continue-on-error");
  }

  return args;
}

function buildQualityGateArgs(options) {
  return [
    "--summary",
    path.join(
      options.outputDirectory,
      "reference_descriptor_candidate_pipeline_batch_summary.json",
    ),
  ];
}

function runQualityCheck(options) {
  console.log("");
  console.log("REFERENCE DESCRIPTOR CANDIDATE QUALITY CHECK");
  console.log("============================================");

  runNodeScript(
    path.join(
      "scripts",
      "run_reference_descriptor_candidate_pipeline_batch.js",
    ),
    buildBatchArgs(options),
  );

  runNodeScript(
    path.join(
      "scripts",
      "validate_reference_descriptor_candidate_batch_quality_gate.js",
    ),
    buildQualityGateArgs(options),
  );

  console.log("");
  console.log(
    "Reference descriptor candidate quality check completed successfully.",
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
  buildBatchArgs,
  buildQualityGateArgs,
};
