const fs = require("node:fs");

const path = require("node:path");

const { validateByDescriptor } = require("../services/descriptor_validator");

const DEFAULT_DESCRIPTOR_PATH = path.resolve(
  __dirname,
  "../data/kanji_descriptors.json",
);

const DEFAULT_NUMERIC_FEATURES = [
  "angleAbs",
  "width",
  "height",
  "centerX",
  "centerY",
  "minX",
  "maxX",
  "minY",
  "maxY",
  "straightness",
  "deltaX",
  "deltaY",
];

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
  distributions,
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
    distributions,
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

  printDistributionSummary({
    report,
    classification: "truePositive",
  });

  printDistributionSummary({
    report,
    classification: "falseNegative",
  });

  printDistributionSummary({
    report,
    classification: "falsePositive",
  });

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

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function calculateMedian(values) {
  if (values.length === 0) {
    return null;
  }

  const sortedValues = [...values].sort((left, right) => left - right);

  const middleIndex = Math.floor(sortedValues.length / 2);

  if (sortedValues.length % 2 === 1) {
    return sortedValues[middleIndex];
  }

  return (sortedValues[middleIndex - 1] + sortedValues[middleIndex]) / 2;
}

function calculateMean(values) {
  if (values.length === 0) {
    return null;
  }

  const sum = values.reduce((total, value) => total + value, 0);

  return sum / values.length;
}

function calculatePercentile(values, percentile) {
  if (values.length === 0) {
    return null;
  }

  if (percentile < 0 || percentile > 1) {
    throw new Error(`Invalid percentile: ${percentile}`);
  }

  const sortedValues = [...values].sort((left, right) => left - right);

  if (sortedValues.length === 1) {
    return sortedValues[0];
  }

  const position = (sortedValues.length - 1) * percentile;

  const lowerIndex = Math.floor(position);

  const upperIndex = Math.ceil(position);

  if (lowerIndex === upperIndex) {
    return sortedValues[lowerIndex];
  }

  const fraction = position - lowerIndex;

  return (
    sortedValues[lowerIndex] * (1 - fraction) +
    sortedValues[upperIndex] * fraction
  );
}

function summarizeNumericValues(values) {
  const numericValues = values.filter(isFiniteNumber);

  if (numericValues.length === 0) {
    return null;
  }

  return {
    count: numericValues.length,

    min: Math.min(...numericValues),

    p05: calculatePercentile(numericValues, 0.05),

    p25: calculatePercentile(numericValues, 0.25),

    median: calculateMedian(numericValues),

    mean: calculateMean(numericValues),

    p75: calculatePercentile(numericValues, 0.75),

    p95: calculatePercentile(numericValues, 0.95),

    max: Math.max(...numericValues),
  };
}

function getMatchedStroke({ evaluation, roleId }) {
  const roleMatch = evaluation.validation?.roleMatches?.[roleId];

  const matchedStrokeIndex = roleMatch?.matchedStrokeIndex;

  if (!Number.isInteger(matchedStrokeIndex)) {
    return null;
  }

  const strokes = evaluation.sample?.features?.geometry?.perStroke;

  if (!Array.isArray(strokes)) {
    return null;
  }

  return (
    strokes.find((stroke) => stroke.index === matchedStrokeIndex) ??
    strokes[matchedStrokeIndex] ??
    null
  );
}

function createEmptyClassificationGroups() {
  return {
    truePositive: {},
    falseNegative: {},
    trueNegative: {},
    falsePositive: {},
  };
}

function addNumericValue({ target, roleId, featureName, value }) {
  if (!isFiniteNumber(value)) {
    return;
  }

  target[roleId] ??= {};
  target[roleId][featureName] ??= [];

  target[roleId][featureName].push(value);
}

function collectRoleFeatureValues({
  evaluations,
  descriptor,
  featureNames = DEFAULT_NUMERIC_FEATURES,
}) {
  const valuesByClassification = createEmptyClassificationGroups();

  const roles = descriptor.strokes ?? [];

  for (const evaluation of evaluations) {
    const classificationTarget =
      valuesByClassification[evaluation.classification];

    for (const role of roles) {
      const matchedStroke = getMatchedStroke({
        evaluation,
        roleId: role.id,
      });

      if (!matchedStroke) {
        continue;
      }

      for (const featureName of featureNames) {
        addNumericValue({
          target: classificationTarget,

          roleId: role.id,

          featureName,

          value: matchedStroke[featureName],
        });
      }
    }
  }

  return valuesByClassification;
}

function summarizeRoleFeatureValues(valuesByClassification) {
  const distributions = {};

  for (const [classification, roleValues] of Object.entries(
    valuesByClassification,
  )) {
    distributions[classification] = {};

    for (const [roleId, featureValues] of Object.entries(roleValues)) {
      distributions[classification][roleId] = {};

      for (const [featureName, values] of Object.entries(featureValues)) {
        const summary = summarizeNumericValues(values);

        if (summary) {
          distributions[classification][roleId][featureName] = summary;
        }
      }
    }
  }

  return distributions;
}

function formatNumber(value, digits = 4) {
  if (!isFiniteNumber(value)) {
    return "-";
  }

  return value.toFixed(digits);
}

function printDistributionSummary({ report, classification }) {
  const roleDistributions = report.distributions?.[classification];

  if (!roleDistributions) {
    return;
  }

  console.log("");
  console.log(`Distributions: ${classification}`);

  for (const [roleId, featureDistributions] of Object.entries(
    roleDistributions,
  )) {
    console.log(`  Role: ${roleId}`);

    for (const [featureName, summary] of Object.entries(featureDistributions)) {
      console.log(
        [
          `    ${featureName}:`,
          `count=${summary.count}`,
          `min=${formatNumber(summary.min)}`,
          `p05=${formatNumber(summary.p05)}`,
          `median=${formatNumber(summary.median)}`,
          `p95=${formatNumber(summary.p95)}`,
          `max=${formatNumber(summary.max)}`,
        ].join(" "),
      );
    }
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

  const roleFeatureValues = collectRoleFeatureValues({
    evaluations,
    descriptor,
  });

  const distributions = summarizeRoleFeatureValues(roleFeatureValues);

  const report = buildBaseReport({
    kanji: options.kanji,

    descriptorPath: options.descriptorPath,

    sampleFilePath: options.filePath,

    evaluations,

    distributions,
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
  isFiniteNumber,
  calculateMedian,
  calculateMean,
  calculatePercentile,
  summarizeNumericValues,
  getMatchedStroke,
  collectRoleFeatureValues,
  summarizeRoleFeatureValues,
};
