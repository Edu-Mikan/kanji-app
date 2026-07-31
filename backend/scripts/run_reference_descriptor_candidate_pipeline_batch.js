const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");

function parseArgs(argv) {
  const options = {
    kanjiList: [],
    allCovered: false,
    datasetPath: null,
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

    if (argument === "--all-covered") {
      options.allCovered = true;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return options;
}

function printHelp() {
  console.log(`
Run reference descriptor candidate pipeline batch

Usage:
  node scripts/run_reference_descriptor_candidate_pipeline_batch.js \\
    --kanji-list 一,二,三,七,六 \\
    --dataset ./kanji_full.json \\
    --descriptor-file ./data/kanji_descriptors.json \\
    --file ./training_data.jsonl \\
    --out-dir ./candidate_reports_training \\
    --continue-on-error

Alternative:
  node scripts/run_reference_descriptor_candidate_pipeline_batch.js \\
    --all-covered \\
    --dataset ./kanji_full.json \\
    --descriptor-file ./data/kanji_descriptors.json \\
    --file ./training_data.jsonl \\
    --out-dir ./candidate_reports_training \\
    --continue-on-error

--all-covered processes all kanjis present in the training file that also have descriptors.
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

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readJsonl(filePath) {
  const content = fs.readFileSync(filePath, "utf8").trim();

  if (!content) {
    return [];
  }

  return content.split(/\r?\n/).filter(Boolean).map(JSON.parse);
}

function getDescriptorCatalog(descriptorFile) {
  return descriptorFile.descriptors ?? descriptorFile;
}

function getExpectedKanjiFromSample(sample) {
  return sample.expectedKanji ?? sample.kanji ?? null;
}

function resolveAllCoveredKanjis({ filePath, descriptorPath }) {
  const samples = readJsonl(filePath);

  const descriptorFile = readJson(descriptorPath);

  const descriptors = getDescriptorCatalog(descriptorFile);

  const sampleKanjis = [
    ...new Set(samples.map(getExpectedKanjiFromSample).filter(Boolean)),
  ].sort();

  const targetKanjis = sampleKanjis.filter((kanji) => descriptors[kanji]);

  const skippedNoDescriptorKanjis = sampleKanjis.filter(
    (kanji) => !descriptors[kanji],
  );

  return {
    targetKanjis,
    skippedNoDescriptorKanjis,
  };
}

function getSummaryPath({ kanji, outputDirectory }) {
  return path.join(
    outputDirectory,
    `${kanji}_reference_candidate_evaluation_summary.json`,
  );
}

function getBatchSummaryPath(outputDirectory) {
  return path.join(
    outputDirectory,
    "reference_descriptor_candidate_pipeline_batch_summary.json",
  );
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

function runSinglePipeline({
  kanji,
  datasetPath,
  descriptorPath,
  filePath,
  outputDirectory,
}) {
  runNodeScript(
    path.join("scripts", "run_reference_descriptor_candidate_pipeline.js"),
    [
      "--kanji",
      kanji,
      "--dataset",
      datasetPath,
      "--descriptor-file",
      descriptorPath,
      "--file",
      filePath,
      "--out-dir",
      outputDirectory,
    ],
  );
}

function buildRowFromSummary(summary) {
  const classifications = summary.classifications ?? {};

  return {
    kanji: summary.kanji,

    status: "ok",

    truePositive: classifications.truePositive ?? 0,

    falseNegative: classifications.falseNegative ?? 0,

    trueNegative: classifications.trueNegative ?? 0,

    falsePositive: classifications.falsePositive ?? 0,

    clean: summary.clean === true,

    safeAgainstFalseNegatives: summary.safeAgainstFalseNegatives === true,

    recommendation: summary.recommendation ?? "unknown",
  };
}

function buildBatchSummary({
  kanjiList,
  rows,
  skippedNoDescriptorKanjis = [],
  errors = [],
}) {
  const okRows = rows.filter((row) => row.status === "ok");

  const cleanRows = okRows.filter((row) => row.clean);

  const safeRows = okRows.filter((row) => row.safeAgainstFalseNegatives);

  const unsafeRows = okRows.filter((row) => !row.safeAgainstFalseNegatives);

  const permissiveRows = okRows.filter(
    (row) =>
      row.safeAgainstFalseNegatives && !row.clean && row.falsePositive > 0,
  );

  return {
    generatedAt: new Date().toISOString(),

    mode: "reference_descriptor_candidate_pipeline_batch_summary",

    kanjiCount: kanjiList.length,

    skippedNoDescriptorCount: skippedNoDescriptorKanjis.length,

    skippedNoDescriptorKanjis,

    processedCount: okRows.length,

    errorCount: errors.length,

    cleanCandidateCount: cleanRows.length,

    safeCandidateCount: safeRows.length,

    unsafeCandidateCount: unsafeRows.length,

    permissiveCandidateCount: permissiveRows.length,

    cleanKanjis: cleanRows.map((row) => row.kanji),

    safeKanjis: safeRows.map((row) => row.kanji),

    unsafeKanjis: unsafeRows.map((row) => row.kanji),

    permissiveKanjis: permissiveRows.map((row) => row.kanji),

    rows,
    errors,
  };
}

function printBatchSummary(summary) {
  console.log("");
  console.log("REFERENCE DESCRIPTOR CANDIDATE PIPELINE BATCH");
  console.log("=============================================");
  console.log(`Kanjis: ${summary.kanjiCount}`);
  console.log(`Processed: ${summary.processedCount}`);
  console.log(
    `Skipped without descriptor: ${summary.skippedNoDescriptorCount ?? 0}`,
  );
  console.log(`Errors: ${summary.errorCount}`);
  console.log(`Clean candidates: ${summary.cleanCandidateCount}`);
  console.log(`Safe candidates: ${summary.safeCandidateCount}`);
  console.log(`Unsafe candidates: ${summary.unsafeCandidateCount}`);
  console.log(`Permissive candidates: ${summary.permissiveCandidateCount}`);

  console.log("");

  for (const row of summary.rows) {
    if (row.status !== "ok") {
      console.log(`${row.kanji}: ERROR ${row.errorMessage}`);
      continue;
    }

    console.log(
      [
        `${row.kanji}:`,
        `TP=${row.truePositive}`,
        `FN=${row.falseNegative}`,
        `TN=${row.trueNegative}`,
        `FP=${row.falsePositive}`,
        `clean=${row.clean}`,
        `safe=${row.safeAgainstFalseNegatives}`,
        `recommendation=${row.recommendation}`,
      ].join(" "),
    );
  }
}

function runBatch(options) {
  fs.mkdirSync(options.outputDirectory, {
    recursive: true,
  });

  const resolvedTargets = options.allCovered
    ? resolveAllCoveredKanjis({
        filePath: options.filePath,
        descriptorPath: options.descriptorPath,
      })
    : {
        targetKanjis: options.kanjiList,
        skippedNoDescriptorKanjis: [],
      };

  const targetKanjis = resolvedTargets.targetKanjis;

  const skippedNoDescriptorKanjis = resolvedTargets.skippedNoDescriptorKanjis;

  const rows = [];
  const errors = [];

  for (const kanji of targetKanjis) {
    try {
      runSinglePipeline({
        kanji,
        datasetPath: options.datasetPath,
        descriptorPath: options.descriptorPath,
        filePath: options.filePath,
        outputDirectory: options.outputDirectory,
      });

      const summaryPath = getSummaryPath({
        kanji,
        outputDirectory: options.outputDirectory,
      });

      const summary = readJson(summaryPath);

      rows.push(buildRowFromSummary(summary));
    } catch (error) {
      const errorEntry = {
        kanji,
        message: error.message,
      };

      errors.push(errorEntry);

      rows.push({
        kanji,
        status: "error",
        errorMessage: error.message,
      });

      if (!options.continueOnError) {
        throw error;
      }
    }
  }

  const batchSummary = buildBatchSummary({
    kanjiList: targetKanjis,
    rows,
    skippedNoDescriptorKanjis,
    errors,
  });

  const batchSummaryPath = getBatchSummaryPath(options.outputDirectory);

  fs.writeFileSync(
    batchSummaryPath,
    JSON.stringify(batchSummary, null, 2),
    "utf8",
  );

  printBatchSummary(batchSummary);

  console.log("");
  console.log(`Batch summary saved to: ${batchSummaryPath}`);

  return batchSummary;
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  validateOptions(options);

  if (options.help) {
    printHelp();
    return;
  }

  runBatch(options);
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
  getSummaryPath,
  getBatchSummaryPath,
  buildRowFromSummary,
  buildBatchSummary,
  readJsonl,
  getDescriptorCatalog,
  getExpectedKanjiFromSample,
  resolveAllCoveredKanjis,
};
