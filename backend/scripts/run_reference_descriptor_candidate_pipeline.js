const path = require("node:path");
const childProcess = require("node:child_process");
const fs = require("node:fs");

function parseArgs(argv) {
  const options = {
    kanji: null,
    datasetPath: null,
    descriptorPath: null,
    filePath: null,
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

    throw new Error(`Unknown argument: ${argument}`);
  }

  return options;
}

function printHelp() {
  console.log(`
Run reference descriptor candidate pipeline

Usage:
  node scripts/run_reference_descriptor_candidate_pipeline.js \\
    --kanji 一 \\
    --dataset ./kanji_full.json \\
    --descriptor-file ./data/kanji_descriptors.json \\
    --file ./training_data.jsonl \\
    --out-dir ./candidate_reports_training

This script runs:
  1. generate_descriptor_candidate_from_reference.js
  2. evaluate_reference_descriptor_candidate.js
`);
}

function validateOptions(options) {
  if (options.help) {
    return;
  }

  if (!options.kanji) {
    throw new Error("Missing --kanji <kanji>");
  }

  if (!options.datasetPath) {
    throw new Error("Missing --dataset <path>");
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

function buildOutputPaths({ kanji, outputDirectory }) {
  return {
    candidateDescriptorPath: path.join(
      outputDirectory,
      `${kanji}_descriptor_candidate_from_reference.json`,
    ),

    evaluationSummaryPath: path.join(
      outputDirectory,
      `${kanji}_reference_candidate_evaluation_summary.json`,
    ),
  };
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

function printFinalSummary(summaryPath) {
  const summary = readJson(summaryPath);

  console.log("");
  console.log("REFERENCE DESCRIPTOR CANDIDATE PIPELINE SUMMARY");
  console.log("===============================================");
  console.log(`Kanji: ${summary.kanji}`);
  console.log(`TP: ${summary.classifications.truePositive}`);
  console.log(`FN: ${summary.classifications.falseNegative}`);
  console.log(`TN: ${summary.classifications.trueNegative}`);
  console.log(`FP: ${summary.classifications.falsePositive}`);
  console.log(`Clean: ${summary.clean}`);
  console.log(
    `Safe against false negatives: ${summary.safeAgainstFalseNegatives}`,
  );
  console.log(`Recommendation: ${summary.recommendation}`);
}

function runPipeline(options) {
  fs.mkdirSync(options.outputDirectory, {
    recursive: true,
  });

  const outputPaths = buildOutputPaths({
    kanji: options.kanji,
    outputDirectory: options.outputDirectory,
  });

  runNodeScript(
    path.join("scripts", "generate_descriptor_candidate_from_reference.js"),
    [
      "--kanji",
      options.kanji,
      "--dataset",
      options.datasetPath,
      "--out-json",
      outputPaths.candidateDescriptorPath,
    ],
  );

  runNodeScript(
    path.join("scripts", "evaluate_reference_descriptor_candidate.js"),
    [
      "--kanji",
      options.kanji,
      "--candidate-descriptor",
      outputPaths.candidateDescriptorPath,
      "--descriptor-file",
      options.descriptorPath,
      "--file",
      options.filePath,
      "--dataset",
      options.datasetPath,
      "--out-dir",
      options.outputDirectory,
    ],
  );

  printFinalSummary(outputPaths.evaluationSummaryPath);
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  validateOptions(options);

  if (options.help) {
    printHelp();
    return;
  }

  runPipeline(options);
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
};
