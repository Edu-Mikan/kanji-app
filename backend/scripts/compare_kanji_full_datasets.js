const fs = require("node:fs");

const path = require("node:path");

const { extractReferenceFeatures } = require("./extract_reference_features");

function parseArgs(argv) {
  const options = {
    baselinePath: null,
    candidatePath: null,
    kanjiList: null,
    outputPath: null,
    help: false,
  };

  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];

    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }

    if (argument === "--baseline") {
      options.baselinePath = path.resolve(argv[index + 1]);

      index++;
      continue;
    }

    if (argument === "--candidate") {
      options.candidatePath = path.resolve(argv[index + 1]);

      index++;
      continue;
    }

    if (argument === "--kanji-list") {
      options.kanjiList = argv[index + 1]
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);

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
Compare two kanji_full datasets

Usage:
  node scripts/compare_kanji_full_datasets.js \\
    --baseline ./kanji_full.json \\
    --candidate ./kanji_full_candidate_all.json \\
    --out-json ./kanji_full_dataset_comparison_report.json

Optional:
  --kanji-list 一,二,三,四,田
      Compare only these kanjis.
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

function validateOptions(options) {
  if (options.help) {
    return;
  }

  if (!options.baselinePath) {
    throw new Error("Missing --baseline <path>");
  }

  if (!options.candidatePath) {
    throw new Error("Missing --candidate <path>");
  }
}

function getStrokeCount(dataset, kanji) {
  const strokes = dataset[kanji];

  return Array.isArray(strokes) ? strokes.length : null;
}

function getQualitySummary(dataset, kanji) {
  const rawStrokes = dataset[kanji];

  if (!Array.isArray(rawStrokes)) {
    return {
      exists: false,
      ok: false,
      strokeCount: null,
      warningCount: 1,
      warnings: [
        {
          type: "missing_kanji_entry",
          kanji,
        },
      ],
    };
  }

  const referenceFeatures = extractReferenceFeatures({
    kanji,
    rawStrokes,
  });

  return {
    exists: true,
    ok: referenceFeatures.quality?.ok === true,

    strokeCount: referenceFeatures.strokeCount,

    warningCount: referenceFeatures.quality?.warningCount ?? 0,

    warnings: referenceFeatures.quality?.warnings ?? [],
  };
}

function compareKanjiEntry({ kanji, baseline, candidate }) {
  const baselineQuality = getQualitySummary(baseline, kanji);

  const candidateQuality = getQualitySummary(candidate, kanji);

  const existsInBaseline = baselineQuality.exists;

  const existsInCandidate = candidateQuality.exists;

  const baselineStrokeCount = getStrokeCount(baseline, kanji);

  const candidateStrokeCount = getStrokeCount(candidate, kanji);

  const strokeCountChanged =
    existsInBaseline &&
    existsInCandidate &&
    baselineStrokeCount !== candidateStrokeCount;

  const excludedFromCandidate = existsInBaseline && !existsInCandidate;

  const improved =
    existsInBaseline &&
    existsInCandidate &&
    baselineQuality.ok === false &&
    candidateQuality.ok === true;

  const regressed =
    existsInBaseline &&
    existsInCandidate &&
    baselineQuality.ok === true &&
    candidateQuality.ok === false;

  return {
    kanji,

    existsInBaseline,
    existsInCandidate,

    baselineStrokeCount,
    candidateStrokeCount,
    strokeCountChanged,

    excludedFromCandidate,

    baselineQuality,
    candidateQuality,

    improved,
    regressed,
  };
}

function buildComparisonReport({
  baselinePath,
  candidatePath,
  baseline,
  candidate,
  kanjiList,
}) {
  const baselineKeys = Object.keys(baseline);

  const candidateKeys = Object.keys(candidate);

  const allKanjis =
    kanjiList ??
    Array.from(new Set([...baselineKeys, ...candidateKeys])).sort(
      (left, right) => left.codePointAt(0) - right.codePointAt(0),
    );

  const results = allKanjis.map((kanji) =>
    compareKanjiEntry({
      kanji,
      baseline,
      candidate,
    }),
  );

  const onlyInBaseline = results.filter(
    (result) => result.existsInBaseline && !result.existsInCandidate,
  );

  const onlyInCandidate = results.filter(
    (result) => !result.existsInBaseline && result.existsInCandidate,
  );

  const inBoth = results.filter(
    (result) => result.existsInBaseline && result.existsInCandidate,
  );

  const strokeCountChanged = results.filter(
    (result) => result.strokeCountChanged,
  );

  const excludedFromCandidate = results.filter(
    (result) => result.excludedFromCandidate,
  );

  const improved = results.filter((result) => result.improved);

  const regressed = results.filter((result) => result.regressed);

  const candidateInvalid = results.filter(
    (result) =>
      result.existsInCandidate && result.candidateQuality.ok === false,
  );

  return {
    generatedAt: new Date().toISOString(),

    mode: "kanji_full_dataset_comparison",

    baselinePath: path.resolve(baselinePath),

    candidatePath: path.resolve(candidatePath),

    counts: {
      baseline: baselineKeys.length,

      candidate: candidateKeys.length,

      compared: results.length,

      inBoth: inBoth.length,

      onlyInBaseline: onlyInBaseline.length,

      onlyInCandidate: onlyInCandidate.length,

      strokeCountChanged: strokeCountChanged.length,

      excludedFromCandidate: excludedFromCandidate.length,

      improved: improved.length,

      regressed: regressed.length,

      candidateInvalid: candidateInvalid.length,
    },

    ok: regressed.length === 0 && candidateInvalid.length === 0,

    results,
  };
}

function printComparisonReport(report) {
  console.log("");
  console.log("KANJI FULL DATASET COMPARISON");
  console.log("=============================");

  console.log(`Baseline: ${report.baselinePath}`);

  console.log(`Candidate: ${report.candidatePath}`);

  console.log("");

  for (const [key, value] of Object.entries(report.counts)) {
    console.log(`${key}: ${value}`);
  }

  console.log("");
  console.log(`OK: ${report.ok}`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  validateOptions(options);

  if (options.help) {
    printHelp();
    return;
  }

  const baseline = loadJson(options.baselinePath, "baseline");

  const candidate = loadJson(options.candidatePath, "candidate");

  const report = buildComparisonReport({
    baselinePath: options.baselinePath,

    candidatePath: options.candidatePath,

    baseline,

    candidate,

    kanjiList: options.kanjiList,
  });

  printComparisonReport(report);

  if (options.outputPath) {
    fs.writeFileSync(
      options.outputPath,
      JSON.stringify(report, null, 2),
      "utf8",
    );

    console.log("");
    console.log(`Comparison report saved to: ${options.outputPath}`);
  }

  if (!report.ok) {
    process.exitCode = 1;
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
  parseArgs,
  getStrokeCount,
  getQualitySummary,
  compareKanjiEntry,
  buildComparisonReport,
};
