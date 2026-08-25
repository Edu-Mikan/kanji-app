const fs = require("node:fs");

const path = require("node:path");

const { extractReferenceFeatures } = require("./extract_reference_features");

const {
  compareFeatureSetsByIndex,
} = require("../services/reference_comparator");

const { REFERENCE_CATALOG_PATH } = require("../services/kanji_reference_paths");

const DEFAULT_KANJI_DATASET_PATH = REFERENCE_CATALOG_PATH;

function parseArgs(argv) {
  const options = {
    sampleFilePath: null,
    recognitionId: null,
    kanji: null,
    datasetPath: DEFAULT_KANJI_DATASET_PATH,
    outputPath: null,
    help: false,
  };

  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];

    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }

    if (argument === "--sample-file") {
      options.sampleFilePath = argv[index + 1];

      index++;
      continue;
    }

    if (argument === "--recognition-id") {
      options.recognitionId = argv[index + 1];

      index++;
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
Sample to reference comparator

Usage:
  node scripts/compare_sample_to_reference.js \\
    --sample-file ./kanji_app.feedback_samples.json \\
    --recognition-id <id> \\
    --out-json ./sample_reference_comparison.json

Alternative:
  node scripts/compare_sample_to_reference.js \\
    --sample-file ./kanji_app.feedback_samples.json \\
    --kanji 四

Options:
  --sample-file <path>
      JSON or JSONL file containing feedback samples.

  --recognition-id <id>
      Recognition ID of the sample to compare.

  --kanji <kanji>
      If recognition ID is not provided, compare the first sample
      matching this expected kanji.

  --dataset <path>
      Path to the canonical kanji reference catalog.
      Default: ./data/kanji_reference_catalog.json


  --out-json <path>
      Save the comparison report as JSON.

  --help
      Show this help.
`);
}

function assertFileExists(filePath, label) {
  if (!filePath) {
    throw new Error(`Missing ${label}`);
  }

  const absolutePath = path.resolve(filePath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`${label} not found: ${absolutePath}`);
  }
}

function parseJsonOrJsonLines(content, filePath) {
  try {
    const parsed = JSON.parse(content);

    if (Array.isArray(parsed)) {
      return parsed;
    }

    if (parsed && typeof parsed === "object") {
      return [parsed];
    }

    throw new Error("JSON root must be an object or array.");
  } catch (jsonError) {
    const lines = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    return lines.map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (lineError) {
        throw new Error(
          [
            `Could not parse file: ${filePath}`,
            `JSON error: ${jsonError.message}`,
            `JSONL error at line ${index + 1}: ${lineError.message}`,
          ].join("\n"),
        );
      }
    });
  }
}

function loadSamples(sampleFilePath) {
  const absolutePath = path.resolve(sampleFilePath);

  assertFileExists(absolutePath, "sample file");

  const content = fs.readFileSync(absolutePath, "utf8");

  if (!content.trim()) {
    return [];
  }

  return parseJsonOrJsonLines(content, absolutePath);
}

function loadKanjiDataset(datasetPath) {
  assertFileExists(datasetPath, "kanji dataset");

  return JSON.parse(fs.readFileSync(datasetPath, "utf8"));
}

function getExpectedKanji(sample) {
  return sample.expectedKanji ?? sample.kanji ?? null;
}

function findSample({ samples, recognitionId, kanji }) {
  if (recognitionId) {
    const sample = samples.find(
      (candidate) => candidate.recognitionId === recognitionId,
    );

    if (!sample) {
      throw new Error(`Sample not found for recognitionId: ${recognitionId}`);
    }

    return sample;
  }

  if (kanji) {
    const sample = samples.find(
      (candidate) => getExpectedKanji(candidate) === kanji,
    );

    if (!sample) {
      throw new Error(`Sample not found for kanji: ${kanji}`);
    }

    return sample;
  }

  throw new Error("Provide either --recognition-id or --kanji.");
}

function buildComparisonReport({ sample, referenceFeatures, comparison }) {
  const expectedKanji = getExpectedKanji(sample);

  return {
    generatedAt: new Date().toISOString(),

    mode: "sample_vs_reference",

    assignmentMode: comparison.assignmentMode,

    sample: {
      recognitionId: sample.recognitionId ?? null,

      kanji: sample.kanji ?? null,

      expectedKanji,

      isCorrect: sample.isCorrect ?? null,

      validationStrategy: sample.validationStrategy ?? null,

      validationResult: sample.validationResult ?? null,

      score: sample.score ?? null,
    },

    reference: {
      kanji: referenceFeatures.kanji,

      source: referenceFeatures.source,

      strokeCount: referenceFeatures.strokeCount,
    },

    comparison,
  };
}

function printComparisonReport(report) {
  console.log("");
  console.log("SAMPLE TO REFERENCE COMPARISON");
  console.log("==============================");

  console.log(`Kanji: ${report.sample.expectedKanji}`);

  console.log(`Recognition ID: ${report.sample.recognitionId ?? "-"}`);

  console.log(`Manual label: ${report.sample.isCorrect}`);

  console.log(
    `Stored validation strategy: ${report.sample.validationStrategy ?? "-"}`,
  );

  console.log("");

  console.log(`Assignment mode: ${report.assignmentMode}`);

  console.log(`User strokes: ${report.comparison.userStrokeCount}`);

  console.log(`Reference strokes: ${report.comparison.referenceStrokeCount}`);

  console.log(`Stroke count diff: ${report.comparison.strokeCountDiff}`);

  console.log(`Compared strokes: ${report.comparison.comparedStrokeCount}`);

  console.log(
    `Mean stroke cost: ${formatNumber(report.comparison.meanStrokeCost)}`,
  );

  console.log(
    `Comparison cost: ${formatNumber(report.comparison.comparisonCost)}`,
  );

  console.log("");
  console.log("Per-stroke comparison:");

  for (const strokeComparison of report.comparison.perStrokeComparisons) {
    console.log(
      [
        `  user#${strokeComparison.userStrokeIndex}`,
        `ref#${strokeComparison.referenceStrokeIndex}`,
        `cost=${formatNumber(strokeComparison.comparisonCost)}`,
        `angleDiff=${formatNumber(strokeComparison.metrics.angleAbsDiff)}`,
        `centerDist=${formatNumber(strokeComparison.metrics.centerDistance)}`,
        `widthRelDiff=${formatNumber(strokeComparison.metrics.widthRelativeDiff)}`,
        `heightRelDiff=${formatNumber(strokeComparison.metrics.heightRelativeDiff)}`,
      ].join(" "),
    );
  }
}

function formatNumber(value, digits = 4) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "-";
  }

  return value.toFixed(digits);
}

function validateOptions(options) {
  if (options.help) {
    return;
  }

  if (!options.sampleFilePath) {
    throw new Error("Missing --sample-file <path>");
  }

  if (!options.recognitionId && !options.kanji) {
    throw new Error("Missing --recognition-id <id> or --kanji <kanji>");
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  validateOptions(options);

  if (options.help) {
    printHelp();
    return;
  }

  const samples = loadSamples(options.sampleFilePath);

  const sample = findSample({
    samples,
    recognitionId: options.recognitionId,
    kanji: options.kanji,
  });

  if (!sample.features) {
    throw new Error("Selected sample does not contain features.");
  }

  const expectedKanji = getExpectedKanji(sample);

  if (!expectedKanji) {
    throw new Error("Selected sample does not contain kanji or expectedKanji.");
  }

  const dataset = loadKanjiDataset(options.datasetPath);

  const referenceRawStrokes = dataset[expectedKanji];

  if (!Array.isArray(referenceRawStrokes)) {
    throw new Error(`Reference kanji not found in dataset: ${expectedKanji}`);
  }

  const referenceFeatures = extractReferenceFeatures({
    kanji: expectedKanji,

    rawStrokes: referenceRawStrokes,
  });

  const comparison = compareFeatureSetsByIndex({
    userFeatures: sample.features,

    referenceFeatures: referenceFeatures.features,
  });

  const report = buildComparisonReport({
    sample,
    referenceFeatures,
    comparison,
  });

  printComparisonReport(report);

  if (options.outputPath) {
    fs.writeFileSync(
      options.outputPath,
      JSON.stringify(report, null, 2),
      "utf8",
    );

    console.log("");
    console.log(`JSON report saved to: ${options.outputPath}`);
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
  DEFAULT_KANJI_DATASET_PATH,
  parseArgs,
  getExpectedKanji,
  findSample,
  buildComparisonReport,
};
