const fs = require("node:fs");

const path = require("node:path");

const {
  normalizeStrokes,
  resampleStroke,
} = require("../services/stroke_utils");

const { extractAllFeatures } = require("../services/feature_extractor");

const { REFERENCE_CATALOG_PATH } = require("../services/kanji_reference_paths");

const DEFAULT_KANJI_DATASET_PATH = REFERENCE_CATALOG_PATH;

function parseArgs(argv) {
  const options = {
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
Reference feature extractor

Usage:
  node scripts/extract_reference_features.js \\
    --kanji 四 \\
    --out-json ./four_reference_features.json

Options:
  --kanji <kanji>
      Kanji to extract from the canonical reference catalog.

  --dataset <path>
      Path to the canonical kanji reference catalog.
      Default: ./data/kanji_reference_catalog.json

  --out-json <path>
      Save extracted reference features as JSON.

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

function loadKanjiDataset(datasetPath) {
  assertFileExists(datasetPath, "kanji dataset");

  return JSON.parse(fs.readFileSync(datasetPath, "utf8"));
}

function prepareReferenceStrokes(rawStrokes) {
  const normalized = normalizeStrokes(rawStrokes);

  const resampled = normalized.map((stroke) => resampleStroke(stroke, 20));

  return {
    raw: rawStrokes,

    normalized,

    resampled,
  };
}

function extractReferenceFeatures({
  kanji,
  rawStrokes,
  source = "kanji_reference_catalog.json",
}) {
  const prepared = prepareReferenceStrokes(rawStrokes);

  /*
   * Reutilizamos extractAllFeatures con la referencia como usuario
   * y como referencia. Esto no significa que estemos validando nada;
   * sólo queremos obtener la geometría canónica con el mismo pipeline.
   */
  const features = extractAllFeatures({
    userResampled: prepared.resampled,

    referenceResampled: prepared.resampled,

    userNormalized: prepared.normalized,

    score: 0,
  });

  const result = {
    kanji,

    source,

    generatedAt: new Date().toISOString(),

    strokeCount: rawStrokes.length,

    reference: {
      rawStrokeCount: prepared.raw.length,

      normalizedStrokeCount: prepared.normalized.length,

      resampledStrokeCount: prepared.resampled.length,
    },

    features,
  };

  return {
    ...result,
    quality: analyzeReferenceGeometryQuality(result),
  };
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function analyzeReferenceGeometryQuality(
  referenceFeatures,
  { minLength = 0.001, minSpan = 0.001 } = {},
) {
  const warnings = [];

  const perStroke = referenceFeatures?.features?.geometry?.perStroke ?? [];

  for (const stroke of perStroke) {
    const width = isFiniteNumber(stroke.width) ? stroke.width : 0;

    const height = isFiniteNumber(stroke.height) ? stroke.height : 0;

    const length = isFiniteNumber(stroke.length) ? stroke.length : 0;

    const deltaX = isFiniteNumber(stroke.deltaX) ? stroke.deltaX : 0;

    const deltaY = isFiniteNumber(stroke.deltaY) ? stroke.deltaY : 0;

    const hasNoSpan = width <= minSpan && height <= minSpan;

    const hasNoLength = length <= minLength;

    const hasNoDelta =
      Math.abs(deltaX) <= minSpan && Math.abs(deltaY) <= minSpan;

    if (hasNoSpan || hasNoLength || hasNoDelta) {
      warnings.push({
        type: "degenerate_reference_stroke",

        strokeIndex: stroke.index,

        width: stroke.width,

        height: stroke.height,

        length: stroke.length,

        deltaX: stroke.deltaX,

        deltaY: stroke.deltaY,

        reasons: {
          hasNoSpan,
          hasNoLength,
          hasNoDelta,
        },
      });
    }
  }

  return {
    ok: warnings.length === 0,

    warningCount: warnings.length,

    warnings,
  };
}

function printSummary(result) {
  console.log("");
  console.log("REFERENCE FEATURE EXTRACTION");
  console.log("============================");
  console.log(`Kanji: ${result.kanji}`);
  console.log(`Stroke count: ${result.strokeCount}`);

  const geometry = result.features?.geometry;

  if (!geometry) {
    console.log("Geometry: not available");
    return;
  }

  console.log("");
  console.log("Global geometry:");

  console.log(`  bboxWidth: ${geometry.bboxWidth}`);
  console.log(`  bboxHeight: ${geometry.bboxHeight}`);
  console.log(`  aspectRatio: ${geometry.aspectRatio}`);
  console.log(`  straightnessMean: ${geometry.straightnessMean}`);

  console.log("");
  console.log("Per-stroke geometry:");

  for (const stroke of geometry.perStroke ?? []) {
    console.log(
      [
        `  #${stroke.index}`,
        `angleAbs=${stroke.angleAbs}`,
        `width=${stroke.width}`,
        `height=${stroke.height}`,
        `centerX=${stroke.centerX}`,
        `centerY=${stroke.centerY}`,
        `deltaX=${stroke.deltaX}`,
        `deltaY=${stroke.deltaY}`,
      ].join(" "),
    );
  }

  if (result.quality && !result.quality.ok) {
    console.log("");
    console.log("Reference quality warnings:");

    for (const warning of result.quality.warnings) {
      console.log(
        [
          `  stroke#${warning.strokeIndex}`,
          warning.type,
          `width=${warning.width}`,
          `height=${warning.height}`,
          `length=${warning.length}`,
          `deltaX=${warning.deltaX}`,
          `deltaY=${warning.deltaY}`,
        ].join(" "),
      );
    }
  }
}

function validateOptions(options) {
  if (options.help) {
    return;
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

  const dataset = loadKanjiDataset(options.datasetPath);

  const rawStrokes = dataset[options.kanji];

  if (!rawStrokes) {
    throw new Error(`Kanji not found in dataset: ${options.kanji}`);
  }

  if (!Array.isArray(rawStrokes)) {
    throw new Error(`Invalid stroke data for kanji: ${options.kanji}`);
  }

  const result = extractReferenceFeatures({
    kanji: options.kanji,
    rawStrokes,
    source: path.basename(options.datasetPath),
  });

  printSummary(result);

  if (options.outputPath) {
    fs.writeFileSync(
      options.outputPath,
      JSON.stringify(result, null, 2),
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
  prepareReferenceStrokes,
  extractReferenceFeatures,
  analyzeReferenceGeometryQuality,
};
