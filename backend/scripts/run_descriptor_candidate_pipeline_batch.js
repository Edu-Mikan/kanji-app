const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");

function parseArgs(argv) {
  const options = {
    kanjiList: [],
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
      options.kanjiList = argv[index + 1]
        .split(",")
        .map((kanji) => kanji.trim())
        .filter(Boolean);

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

    if (argument === "--continue-on-error") {
      options.continueOnError = true;
      continue;
    }

    if (argument === "--accepted-false-positives") {
      options.acceptedFalsePositivesPath = path.resolve(argv[index + 1]);
      index++;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return options;
}

function printHelp() {
  console.log(`
Run descriptor candidate pipeline batch

Usage:
  node scripts/run_descriptor_candidate_pipeline_batch.js \\
    --kanji-list 田,山,四 \\
    --file ./training_data.jsonl \\
    --descriptor-file ./data/kanji_descriptors.json \\
    --dataset ./kanji_full.json \\
    --out-dir ./candidate_reports_training \\
    --accepted-false-positives <path>
      JSON file with accepted false positive recognition IDs.
      Default: ./data/accepted_false_positives.json.

Options:
  --min-gap <number>
      Minimum separation gap for recommendations.
      Default: 0.05.

  --comparison-group <name>
      Recommendation group to evaluate.
      Default: falsePositiveVsTruePositive.

  --continue-on-error
      Continue processing remaining kanjis if one pipeline fails.
`);
}

function validateOptions(options) {
  if (options.help) {
    return;
  }

  if (!Array.isArray(options.kanjiList) || options.kanjiList.length === 0) {
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

function ensureDirectory(directoryPath) {
  fs.mkdirSync(directoryPath, {
    recursive: true,
  });
}

function runPipelineForKanji({
  kanji,
  filePath,
  descriptorPath,
  datasetPath,
  outputDirectory,
  minGap,
  comparisonGroup,
}) {
  const scriptPath = path.join(
    "scripts",
    "run_descriptor_candidate_pipeline.js",
  );

  const args = [
    scriptPath,
    "--kanji",
    kanji,
    "--file",
    filePath,
    "--descriptor-file",
    descriptorPath,
    "--dataset",
    datasetPath,
    "--out-dir",
    outputDirectory,
    "--min-gap",
    String(minGap),
    "--comparison-group",
    comparisonGroup,
  ];

  console.log("");
  console.log("========================================");
  console.log(`Running descriptor pipeline for kanji: ${kanji}`);
  console.log("========================================");
  console.log(`> node ${args.join(" ")}`);

  const result = childProcess.spawnSync(process.execPath, args, {
    stdio: "inherit",
    shell: false,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      `Pipeline failed for kanji ${kanji} with exit code ${result.status}`,
    );
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function loadAcceptedFalsePositives(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return {
      acceptedFalsePositiveIds: new Set(),
      acceptedFalsePositiveEntries: [],
    };
  }

  const data = readJson(filePath);

  const entries = Array.isArray(data.acceptedFalsePositives)
    ? data.acceptedFalsePositives
    : [];

  const activeEntries = entries.filter(
    (entry) =>
      entry &&
      typeof entry.recognitionId === "string" &&
      entry.status !== "rejected",
  );

  return {
    acceptedFalsePositiveIds: new Set(
      activeEntries.map((entry) => entry.recognitionId),
    ),

    acceptedFalsePositiveEntries: activeEntries,
  };
}

function getCalibrationReportPath({ kanji, outputDirectory }) {
  return path.join(outputDirectory, `${kanji}_calibration_report.json`);
}

function getFalsePositiveRecognitionIdsFromCalibrationReport(
  calibrationReport,
) {
  return (calibrationReport.sampleEvaluations ?? [])
    .filter((entry) => entry.classification === "falsePositive")
    .map((entry) => entry.recognitionId)
    .filter(Boolean);
}

function buildFalsePositiveBreakdown({
  falsePositiveRecognitionIds,
  acceptedFalsePositiveIds,
}) {
  const acceptedFalsePositiveRecognitionIds =
    falsePositiveRecognitionIds.filter((recognitionId) =>
      acceptedFalsePositiveIds.has(recognitionId),
    );

  const unexpectedFalsePositiveRecognitionIds =
    falsePositiveRecognitionIds.filter(
      (recognitionId) => !acceptedFalsePositiveIds.has(recognitionId),
    );

  return {
    falsePositiveRecognitionIds,
    acceptedFalsePositiveRecognitionIds,
    unexpectedFalsePositiveRecognitionIds,
    acceptedFalsePositiveCount: acceptedFalsePositiveRecognitionIds.length,
    unexpectedFalsePositiveCount: unexpectedFalsePositiveRecognitionIds.length,
  };
}

function getPipelineSummaryPath({ kanji, outputDirectory }) {
  return path.join(outputDirectory, `${kanji}_pipeline_summary.json`);
}

function buildBatchRowFromSummary(summary) {
  const classifications = summary.classifications ?? {};

  const patchEvaluation = summary.patchEvaluation ?? {};

  return {
    kanji: summary.kanji,

    truePositive: classifications.truePositive ?? 0,

    falseNegative: classifications.falseNegative ?? 0,

    trueNegative: classifications.trueNegative ?? 0,

    falsePositive: classifications.falsePositive ?? 0,

    recommendationCount: summary.recommendationCount ?? 0,

    candidateRuleCount: summary.candidatePatch?.ruleCount ?? 0,

    falsePositiveReduction: patchEvaluation.falsePositiveReduction ?? 0,

    falseNegativeIncrease: patchEvaluation.falseNegativeIncrease ?? 0,

    truePositiveLoss: patchEvaluation.truePositiveLoss ?? 0,

    safe: patchEvaluation.safe === true,

    affectedSampleCount: patchEvaluation.affectedSampleCount ?? 0,

    readyForManualPromotion: summary.readyForManualPromotion === true,
  };
}

function buildBatchSummary({
  kanjiList,
  outputDirectory,
  acceptedFalsePositiveIds = new Set(),
  errors = [],
}) {
  const rows = [];

  for (const kanji of kanjiList) {
    const summaryPath = getPipelineSummaryPath({
      kanji,
      outputDirectory,
    });

    if (!fs.existsSync(summaryPath)) {
      rows.push({
        kanji,
        status: "missing_summary",
        error: `Summary file not found: ${summaryPath}`,
      });

      continue;
    }

    const summary = readJson(summaryPath);

    const calibrationReportPath = getCalibrationReportPath({
      kanji,
      outputDirectory,
    });

    const calibrationReport = fs.existsSync(calibrationReportPath)
      ? readJson(calibrationReportPath)
      : null;

    const falsePositiveRecognitionIds = calibrationReport
      ? getFalsePositiveRecognitionIdsFromCalibrationReport(calibrationReport)
      : [];

    const falsePositiveBreakdown = buildFalsePositiveBreakdown({
      falsePositiveRecognitionIds,
      acceptedFalsePositiveIds,
    });

    rows.push({
      status: "ok",
      ...buildBatchRowFromSummary(summary),
      ...falsePositiveBreakdown,
      summaryPath,
      calibrationReportPath,
    });
  }

  const readyForManualPromotion = rows.filter(
    (row) => row.status === "ok" && row.readyForManualPromotion === true,
  );

  const withFalseNegatives = rows.filter(
    (row) => row.status === "ok" && row.falseNegative > 0,
  );

  const withFalsePositives = rows.filter(
    (row) => row.status === "ok" && row.falsePositive > 0,
  );

  const withUnexpectedFalsePositives = rows.filter(
    (row) => row.status === "ok" && row.unexpectedFalsePositiveCount > 0,
  );

  const acceptedFalsePositiveCount = rows.reduce(
    (total, row) => total + (row.acceptedFalsePositiveCount ?? 0),
    0,
  );

  const unexpectedFalsePositiveCount = rows.reduce(
    (total, row) => total + (row.unexpectedFalsePositiveCount ?? 0),
    0,
  );

  return {
    generatedAt: new Date().toISOString(),

    mode: "descriptor_candidate_pipeline_batch_summary",

    kanjiCount: kanjiList.length,

    processedCount: rows.filter((row) => row.status === "ok").length,

    errorCount:
      errors.length + rows.filter((row) => row.status !== "ok").length,

    readyForManualPromotionCount: readyForManualPromotion.length,

    falseNegativeKanjiCount: withFalseNegatives.length,

    falsePositiveKanjiCount: withFalsePositives.length,

    acceptedFalsePositiveCount,
    unexpectedFalsePositiveCount,

    unexpectedFalsePositiveKanjiCount: withUnexpectedFalsePositives.length,

    unexpectedFalsePositiveKanjis: withUnexpectedFalsePositives.map(
      (row) => row.kanji,
    ),

    readyForManualPromotion: readyForManualPromotion.map((row) => row.kanji),

    falseNegativeKanjis: withFalseNegatives.map((row) => row.kanji),

    falsePositiveKanjis: withFalsePositives.map((row) => row.kanji),

    rows,

    errors,
  };
}

function printBatchSummary(summary) {
  console.log("");
  console.log("DESCRIPTOR CANDIDATE PIPELINE BATCH SUMMARY");
  console.log("===========================================");

  console.log(`Kanjis: ${summary.kanjiCount}`);
  console.log(`Processed: ${summary.processedCount}`);
  console.log(`Errors: ${summary.errorCount}`);
  console.log(
    `Ready for manual promotion: ${summary.readyForManualPromotionCount}`,
  );
  console.log(
    `Kanjis with false negatives: ${summary.falseNegativeKanjiCount}`,
  );
  console.log(
    `Kanjis with false positives: ${summary.falsePositiveKanjiCount}`,
  );

  console.log(
    `Accepted false positives: ${summary.acceptedFalsePositiveCount}`,
  );

  console.log(
    `Unexpected false positives: ${summary.unexpectedFalsePositiveCount}`,
  );

  console.log(
    `Kanjis with unexpected false positives: ${summary.unexpectedFalsePositiveKanjiCount}`,
  );

  console.log("");

  for (const row of summary.rows) {
    if (row.status !== "ok") {
      console.log(`${row.kanji}: status=${row.status} error=${row.error}`);
      continue;
    }

    console.log(
      [
        `${row.kanji}:`,
        `TP=${row.truePositive}`,
        `FN=${row.falseNegative}`,
        `TN=${row.trueNegative}`,
        `FP=${row.falsePositive}`,
        `acceptedFP=${row.acceptedFalsePositiveCount}`,
        `unexpectedFP=${row.unexpectedFalsePositiveCount}`,
        `rules=${row.candidateRuleCount}`,
        `fpReduction=${row.falsePositiveReduction}`,
        `fnIncrease=${row.falseNegativeIncrease}`,
        `tpLoss=${row.truePositiveLoss}`,
        `ready=${row.readyForManualPromotion}`,
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

  ensureDirectory(options.outputDirectory);

  const errors = [];

  const { acceptedFalsePositiveIds } = loadAcceptedFalsePositives(
    options.acceptedFalsePositivesPath,
  );

  for (const kanji of options.kanjiList) {
    try {
      runPipelineForKanji({
        kanji,
        filePath: options.filePath,
        descriptorPath: options.descriptorPath,
        datasetPath: options.datasetPath,
        outputDirectory: options.outputDirectory,
        minGap: options.minGap,
        comparisonGroup: options.comparisonGroup,
      });
    } catch (error) {
      errors.push({
        kanji,
        message: error.message,
      });

      if (!options.continueOnError) {
        throw error;
      }

      console.error("");
      console.error(
        `Pipeline failed for kanji ${kanji}, continuing because --continue-on-error was provided.`,
      );
      console.error(error.message);
    }
  }

  const summary = buildBatchSummary({
    kanjiList: options.kanjiList,
    outputDirectory: options.outputDirectory,
    acceptedFalsePositiveIds,
    errors,
  });

  const summaryPath = path.join(
    options.outputDirectory,
    "pipeline_batch_summary.json",
  );

  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), "utf8");

  printBatchSummary(summary);

  console.log("");
  console.log(`Batch summary saved to: ${summaryPath}`);
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
  getPipelineSummaryPath,
  buildBatchRowFromSummary,
  buildBatchSummary,
  loadAcceptedFalsePositives,
  getCalibrationReportPath,
  getFalsePositiveRecognitionIdsFromCalibrationReport,
  buildFalsePositiveBreakdown,
};
