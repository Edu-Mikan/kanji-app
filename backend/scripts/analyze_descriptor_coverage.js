const fs = require("node:fs");
const path = require("node:path");

function parseArgs(argv) {
  const options = {
    filePath: null,
    descriptorPath: null,
    outputPath: null,
    minTotalSamplesForPriority: 5,
    minCorrectSamplesForPriority: 3,
    help: false,
  };

  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];

    if (argument === "--help" || argument === "-h") {
      options.help = true;
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

    if (argument === "--out-json") {
      options.outputPath = path.resolve(argv[index + 1]);
      index++;
      continue;
    }

    if (argument === "--min-total-samples") {
      options.minTotalSamplesForPriority = Number(argv[index + 1]);
      index++;
      continue;
    }

    if (argument === "--min-correct-samples") {
      options.minCorrectSamplesForPriority = Number(argv[index + 1]);
      index++;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return options;
}

function printHelp() {
  console.log(`
Analyze descriptor coverage

Usage:
  node scripts/analyze_descriptor_coverage.js \\
    --file ./training_data.jsonl \\
    --descriptor-file ./data/kanji_descriptors.json \\
    --out-json ./candidate_reports_training/descriptor_coverage_report.json

Options:
  --min-total-samples <number>
      Minimum total samples to mark missing descriptor as priority.
      Default: 5.

  --min-correct-samples <number>
      Minimum correct samples to mark missing descriptor as priority.
      Default: 3.
`);
}

function validateOptions(options) {
  if (options.help) {
    return;
  }

  if (!options.filePath) {
    throw new Error("Missing --file <path>");
  }

  if (!options.descriptorPath) {
    throw new Error("Missing --descriptor-file <path>");
  }

  if (!options.outputPath) {
    throw new Error("Missing --out-json <path>");
  }

  if (!Number.isFinite(options.minTotalSamplesForPriority)) {
    throw new Error("--min-total-samples must be a finite number");
  }

  if (!Number.isFinite(options.minCorrectSamplesForPriority)) {
    throw new Error("--min-correct-samples must be a finite number");
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

function isSampleCorrect(sample) {
  return sample.expectedCorrect === true || sample.isCorrect === true;
}

function buildCoverageRows({
  samples,
  descriptors,
  minTotalSamplesForPriority,
  minCorrectSamplesForPriority,
}) {
  const statsByKanji = new Map();

  for (const sample of samples) {
    const kanji = getExpectedKanjiFromSample(sample);

    if (!kanji) {
      continue;
    }

    if (!statsByKanji.has(kanji)) {
      statsByKanji.set(kanji, {
        kanji,
        totalSamples: 0,
        correctSamples: 0,
        incorrectSamples: 0,
        recognitionIds: [],
      });
    }

    const stats = statsByKanji.get(kanji);

    stats.totalSamples++;
    stats.recognitionIds.push(sample.recognitionId);

    if (isSampleCorrect(sample)) {
      stats.correctSamples++;
    } else {
      stats.incorrectSamples++;
    }
  }

  return [...statsByKanji.values()]
    .sort((left, right) => left.kanji.localeCompare(right.kanji))
    .map((stats) => {
      const descriptor = descriptors[stats.kanji];

      const hasDescriptor = Boolean(descriptor);

      const descriptorEnabled = descriptor?.enabled !== false;

      const descriptorSource = descriptor?.source ?? null;

      const descriptorConfidence = descriptor?.confidence ?? null;

      const isPriorityMissingDescriptor =
        !hasDescriptor &&
        stats.totalSamples >= minTotalSamplesForPriority &&
        stats.correctSamples >= minCorrectSamplesForPriority;

      return {
        kanji: stats.kanji,
        hasDescriptor,
        descriptorEnabled: hasDescriptor ? descriptorEnabled : false,
        descriptorSource,
        descriptorConfidence,
        totalSamples: stats.totalSamples,
        correctSamples: stats.correctSamples,
        incorrectSamples: stats.incorrectSamples,
        isPriorityMissingDescriptor,
        recognitionIds: stats.recognitionIds,
      };
    });
}

function buildCoverageReport({
  samples,
  descriptors,
  minTotalSamplesForPriority,
  minCorrectSamplesForPriority,
}) {
  const rows = buildCoverageRows({
    samples,
    descriptors,
    minTotalSamplesForPriority,
    minCorrectSamplesForPriority,
  });

  const withDescriptor = rows.filter((row) => row.hasDescriptor);

  const withoutDescriptor = rows.filter((row) => !row.hasDescriptor);

  const priorityMissingDescriptors = rows.filter(
    (row) => row.isPriorityMissingDescriptor,
  );

  return {
    generatedAt: new Date().toISOString(),

    mode: "descriptor_coverage_report",

    kanjiCount: rows.length,

    descriptorCoveredKanjiCount: withDescriptor.length,

    missingDescriptorKanjiCount: withoutDescriptor.length,

    priorityMissingDescriptorKanjiCount: priorityMissingDescriptors.length,

    sampleCount: samples.length,

    coveredSampleCount: withDescriptor.reduce(
      (total, row) => total + row.totalSamples,
      0,
    ),

    missingDescriptorSampleCount: withoutDescriptor.reduce(
      (total, row) => total + row.totalSamples,
      0,
    ),

    priorityMissingDescriptorKanjis: priorityMissingDescriptors.map(
      (row) => row.kanji,
    ),

    missingDescriptorKanjis: withoutDescriptor.map((row) => row.kanji),

    rows,
  };
}

function printCoverageReport(report) {
  console.log("");
  console.log("DESCRIPTOR COVERAGE REPORT");
  console.log("==========================");

  console.log(`Kanjis in samples: ${report.kanjiCount}`);
  console.log(`Kanjis with descriptor: ${report.descriptorCoveredKanjiCount}`);
  console.log(
    `Kanjis missing descriptor: ${report.missingDescriptorKanjiCount}`,
  );
  console.log(
    `Priority missing descriptors: ${report.priorityMissingDescriptorKanjiCount}`,
  );
  console.log("");

  if (report.priorityMissingDescriptorKanjis.length > 0) {
    console.log("Priority missing descriptor kanjis:");
    console.log(report.priorityMissingDescriptorKanjis.join(", "));
  } else {
    console.log("No priority missing descriptor kanjis.");
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  validateOptions(options);

  if (options.help) {
    printHelp();
    return;
  }

  const samples = readJsonl(options.filePath);

  const descriptorFile = readJson(options.descriptorPath);

  const descriptors = getDescriptorCatalog(descriptorFile);

  const report = buildCoverageReport({
    samples,
    descriptors,
    minTotalSamplesForPriority: options.minTotalSamplesForPriority,
    minCorrectSamplesForPriority: options.minCorrectSamplesForPriority,
  });

  fs.mkdirSync(path.dirname(options.outputPath), {
    recursive: true,
  });

  fs.writeFileSync(options.outputPath, JSON.stringify(report, null, 2), "utf8");

  printCoverageReport(report);

  console.log("");
  console.log(`Coverage report saved to: ${options.outputPath}`);
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
  readJsonl,
  getExpectedKanjiFromSample,
  isSampleCorrect,
  getDescriptorCatalog,
  buildCoverageRows,
  buildCoverageReport,
};
