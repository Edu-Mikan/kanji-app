const fs = require("node:fs");

const path = require("node:path");

const { validateByDescriptor } = require("../services/descriptor_validator");

const DEFAULT_DESCRIPTOR_PATH = path.resolve(
  __dirname,
  "../data/kanji_descriptors.json",
);

function parseArgs(argv) {
  const options = {
    filePath: null,
    kanji: null,
    descriptorPath: DEFAULT_DESCRIPTOR_PATH,
    outputPath: null,
    help: false,
  };

  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];

    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }

    if (argument === "--file") {
      options.filePath = argv[index + 1];

      index++;
      continue;
    }

    if (argument === "--kanji") {
      options.kanji = argv[index + 1];

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

    throw new Error(`Unknown argument: ${argument}`);
  }

  return options;
}

function printHelp() {
  console.log(`
Kanji descriptor calibrator

Usage:
  node scripts/calibrate_kanji_descriptor.js \\
    --file ./kanji_app.feedback_samples.json \\
    --kanji 四

Options:
  --file <path>
      JSON or JSONL file containing feedback samples.

  --kanji <kanji>
      Kanji to analyze.

  --descriptor-file <path>
      Descriptor catalog.
      Default: data/kanji_descriptors.json

  --out-json <path>
      Save the calibration report as JSON.

  --help
      Show this help.
`);
}

function assertFileExists(filePath, label) {
  if (!filePath) {
    throw new Error(`Missing ${label}`);
  }

  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} not found: ${filePath}`);
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

    throw new Error("JSON root must be an object or array");
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
            `Could not parse ${filePath}`,
            `JSON error: ${jsonError.message}`,
            `JSONL error at line ${index + 1}: ${lineError.message}`,
          ].join("\n"),
        );
      }
    });
  }
}

function loadSamples(filePath) {
  const absolutePath = path.resolve(filePath);

  assertFileExists(absolutePath, "sample file");

  const content = fs.readFileSync(absolutePath, "utf8");

  if (!content.trim()) {
    return [];
  }

  return parseJsonOrJsonLines(content, absolutePath);
}

function loadDescriptorCatalog(descriptorPath) {
  assertFileExists(descriptorPath, "descriptor file");

  const parsed = JSON.parse(fs.readFileSync(descriptorPath, "utf8"));

  return parsed.descriptors ?? parsed;
}

function getExpectedKanji(sample) {
  return sample.expectedKanji ?? sample.kanji ?? null;
}

function classifySample({ sample, validation }) {
  const manuallyCorrect = sample.isCorrect === true;

  const automaticallyCorrect = validation.isCorrect === true;

  if (manuallyCorrect && automaticallyCorrect) {
    return "truePositive";
  }

  if (manuallyCorrect && !automaticallyCorrect) {
    return "falseNegative";
  }

  if (!manuallyCorrect && automaticallyCorrect) {
    return "falsePositive";
  }

  return "trueNegative";
}

function revalidateSamples({ samples, kanji, descriptor }) {
  const relevantSamples = samples.filter(
    (sample) => getExpectedKanji(sample) === kanji,
  );

  return relevantSamples
    .filter((sample) => sample.features?.geometry)
    .map((sample) => {
      const validation = validateByDescriptor({
        kanji,
        features: sample.features,
        descriptor,
      });

      return {
        sample,
        validation,
        classification: classifySample({
          sample,
          validation,
        }),
      };
    });
}

function countClassifications(evaluations) {
  const counts = {
    truePositive: 0,
    falseNegative: 0,
    trueNegative: 0,
    falsePositive: 0,
  };

  for (const evaluation of evaluations) {
    counts[evaluation.classification]++;
  }

  return counts;
}

function buildBaseReport({
  kanji,
  descriptorPath,
  sampleFilePath,
  evaluations,
}) {
  const classifications = countClassifications(evaluations);

  return {
    generatedAt: new Date().toISOString(),

    mode: "analysis_only",

    kanji,

    sources: {
      descriptorPath: path.resolve(descriptorPath),

      sampleFilePath: path.resolve(sampleFilePath),
    },

    sampleCount: evaluations.length,

    classifications,

    metrics: {
      falseNegativeCount: classifications.falseNegative,

      falsePositiveCount: classifications.falsePositive,
    },

    examples: {
      falseNegatives: evaluations
        .filter((evaluation) => evaluation.classification === "falseNegative")
        .map((evaluation) => ({
          recognitionId: evaluation.sample.recognitionId,

          hardFailedChecks: evaluation.validation.hardFailedChecks ?? [],

          roleMatches: evaluation.validation.roleMatches ?? {},
        })),

      falsePositives: evaluations
        .filter((evaluation) => evaluation.classification === "falsePositive")
        .map((evaluation) => ({
          recognitionId: evaluation.sample.recognitionId,

          hardFailedChecks: evaluation.validation.hardFailedChecks ?? [],

          roleMatches: evaluation.validation.roleMatches ?? {},
        })),
    },
  };
}

function printBaseReport(report) {
  console.log("");
  console.log("KANJI DESCRIPTOR CALIBRATION");
  console.log("============================");

  console.log(`Kanji: ${report.kanji}`);

  console.log(`Mode: ${report.mode}`);

  console.log(`Samples: ${report.sampleCount}`);

  console.log("");

  console.log(`True positives: ${report.classifications.truePositive}`);

  console.log(`False negatives: ${report.classifications.falseNegative}`);

  console.log(`True negatives: ${report.classifications.trueNegative}`);

  console.log(`False positives: ${report.classifications.falsePositive}`);

  console.log("");

  console.log("No descriptors were modified.");
}

function validateOptions(options) {
  if (options.help) {
    return;
  }

  if (!options.filePath) {
    throw new Error("Missing --file <path>");
  }

  if (!options.kanji) {
    throw new Error("Missing --kanji <kanji>");
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  validateOptions(options);

  if (options.help) {
    printHelp();
    return;
  }

  const samples = loadSamples(options.filePath);

  const descriptors = loadDescriptorCatalog(options.descriptorPath);

  const descriptor = descriptors[options.kanji];

  if (!descriptor) {
    throw new Error(`Descriptor not found for kanji: ${options.kanji}`);
  }

  const evaluations = revalidateSamples({
    samples,
    kanji: options.kanji,
    descriptor,
  });

  const report = buildBaseReport({
    kanji: options.kanji,

    descriptorPath: options.descriptorPath,

    sampleFilePath: options.filePath,

    evaluations,
  });

  printBaseReport(report);

  if (options.outputPath) {
    fs.writeFileSync(
      options.outputPath,
      JSON.stringify(report, null, 2),
      "utf8",
    );

    console.log(`Report saved to: ${options.outputPath}`);
  }
}

try {
  main();
} catch (error) {
  console.error("");
  console.error("ERROR");

  console.error("-----");

  console.error(error.message);

  process.exitCode = 1;
}
