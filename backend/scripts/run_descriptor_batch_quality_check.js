const path = require("node:path");
const childProcess = require("node:child_process");

function parseArgs(argv) {
  const options = {
    kanjiList: null,
    filePath: null,
    descriptorPath: null,
    datasetPath: null,
    outputDirectory: null,
    acceptedFalsePositivesPath: path.resolve(
      "./data/accepted_false_positives.json",
    ),
    minGap: 0.05,
    comparisonGroup: "falsePositiveVsTruePositive",
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
      options.kanjiList = argv[index + 1];
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

    if (argument === "--accepted-false-positives") {
      options.acceptedFalsePositivesPath = path.resolve(argv[index + 1]);
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
Run descriptor batch quality check

Usage:
  node scripts/run_descriptor_batch_quality_check.js \\
    --kanji-list 田,山,四,口,日,目,回,用,木,本,未,末,七,六 \\
    --file ./training_data.jsonl \\
    --descriptor-file ./data/kanji_descriptors.json \\
    --dataset ./kanji_full.json \\
    --out-dir ./candidate_reports_training \\
    --continue-on-error

This script runs:
  1. scripts/run_descriptor_candidate_pipeline_batch.js
  2. scripts/validate_descriptor_batch_quality_gate.js

The quality gate fails when:
  - errorCount > 0
  - falseNegativeKanjiCount > 0
  - unexpectedFalsePositiveCount > 0
`);
}

function validateOptions(options) {
  if (options.help) {
    return;
  }

  if (!options.kanjiList) {
    throw new Error("Missing --kanji-list <kanji1,kanji2,...>");
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
  const args = [
    "--kanji-list",
    options.kanjiList,
    "--file",
    options.filePath,
    "--descriptor-file",
    options.descriptorPath,
    "--dataset",
    options.datasetPath,
    "--out-dir",
    options.outputDirectory,
    "--accepted-false-positives",
    options.acceptedFalsePositivesPath,
    "--min-gap",
    String(options.minGap),
    "--comparison-group",
    options.comparisonGroup,
  ];

  if (options.continueOnError) {
    args.push("--continue-on-error");
  }

  return args;
}

function buildQualityGateArgs(options) {
  return [
    "--summary",
    path.join(options.outputDirectory, "pipeline_batch_summary.json"),
  ];
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  validateOptions(options);

  if (options.help) {
    printHelp();
    return;
  }

  console.log("");
  console.log("DESCRIPTOR BATCH QUALITY CHECK");
  console.log("==============================");

  runNodeScript(
    path.join("scripts", "run_descriptor_candidate_pipeline_batch.js"),
    buildBatchArgs(options),
  );

  runNodeScript(
    path.join("scripts", "validate_descriptor_batch_quality_gate.js"),
    buildQualityGateArgs(options),
  );

  console.log("");
  console.log("Descriptor batch quality check completed successfully.");
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
  buildBatchArgs,
  buildQualityGateArgs,
};
