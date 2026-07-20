// backend/scripts/analyze_feedback_samples.js

const fs = require("fs");
const path = require("path");
const { MongoClient } = require("mongodb");

const DEFAULT_DB_NAME = "kanji_app";
const DEFAULT_COLLECTION_NAME = "feedback_samples";

const DEFAULT_FALSE_NEGATIVE_SCORE_THRESHOLD = 0.75;
const DEFAULT_FALSE_POSITIVE_SCORE_THRESHOLD = 0.75;

function parseArgs(argv) {
  const args = {
    mode: null,
    filePath: null,
    dbName: DEFAULT_DB_NAME,
    collectionName: DEFAULT_COLLECTION_NAME,
    falseNegativeScoreThreshold: DEFAULT_FALSE_NEGATIVE_SCORE_THRESHOLD,
    falsePositiveScoreThreshold: DEFAULT_FALSE_POSITIVE_SCORE_THRESHOLD,
    kanjiFilter: null,
    outputJsonPath: null,
    help: false,
    revalidate: false,
    descriptorFilePath: null,
    validatorFilePath: null,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "--help" || arg === "-h") {
      args.help = true;
      continue;
    }

    if (arg === "--mongo") {
      args.mode = "mongo";
      continue;
    }

    if (arg === "--file") {
      args.mode = "file";
      args.filePath = argv[i + 1];
      i++;
      continue;
    }

    if (arg === "--db") {
      args.dbName = argv[i + 1];
      i++;
      continue;
    }

    if (arg === "--collection") {
      args.collectionName = argv[i + 1];
      i++;
      continue;
    }

    if (arg === "--fn-threshold") {
      args.falseNegativeScoreThreshold = Number(argv[i + 1]);
      i++;
      continue;
    }

    if (arg === "--fp-threshold") {
      args.falsePositiveScoreThreshold = Number(argv[i + 1]);
      i++;
      continue;
    }

    if (arg === "--kanji") {
      args.kanjiFilter = argv[i + 1];
      i++;
      continue;
    }

    if (arg === "--out-json") {
      args.outputJsonPath = argv[i + 1];
      i++;
      continue;
    }

    if (arg === "--revalidate") {
      args.revalidate = true;
      continue;
    }

    if (arg === "--descriptor-file") {
      args.descriptorFilePath = argv[i + 1];
      i++;
      continue;
    }

    if (arg === "--validator-file") {
      args.validatorFilePath = argv[i + 1];
      i++;
      continue;
    }
  }

  return args;
}

function printHelp() {
  console.log(`
Kanji feedback analyzer

Usage:

  node scripts/analyze_feedback_samples.js --mongo

  node scripts/analyze_feedback_samples.js --file ./kanji_app.feedback_samples.json

Options:

  --mongo
      Load feedback samples directly from MongoDB Atlas using MONGO_URI.

  --file <path>
      Load feedback samples from a local JSON export.

  --db <name>
      MongoDB database name.
      Default: ${DEFAULT_DB_NAME}

  --collection <name>
      MongoDB collection name.
      Default: ${DEFAULT_COLLECTION_NAME}

  --fn-threshold <number>
      Score threshold for false negatives.
      Manual correct + score >= threshold.
      Default: ${DEFAULT_FALSE_NEGATIVE_SCORE_THRESHOLD}

  --fp-threshold <number>
      Score threshold for false positives.
      Manual incorrect + score <= threshold.
      Default: ${DEFAULT_FALSE_POSITIVE_SCORE_THRESHOLD}

  --kanji <kanji>
      Analyze only one kanji.

  --out-json <path>
      Save the full report as JSON.

  --revalidate
      Recalculate descriptor validation using the current descriptor_validator.js
      and kanji_descriptors.json instead of using the stored score/checks.

  --descriptor-file <path>
      Path to kanji_descriptors.json.
      Optional when --revalidate is used.

  --validator-file <path>
      Path to descriptor_validator.js.
      Optional when --revalidate is used.

Examples:

  node scripts/analyze_feedback_samples.js --mongo

  node scripts/analyze_feedback_samples.js --file ./kanji_app.feedback_samples.json

  node scripts/analyze_feedback_samples.js --mongo --kanji 山

  node scripts/analyze_feedback_samples.js --mongo --out-json ./feedback_report.json

  node scripts/analyze_feedback_samples.js --file ./training_data.jsonl --kanji 木 --revalidate
  
  node scripts/analyze_feedback_samples.js --file ./training_data.jsonl --kanji 木 --revalidate --descriptor-file ./kanji_descriptors.json --validator-file ./descriptor_validator.js
`);
}

async function loadSamplesFromMongo({ dbName, collectionName }) {
  const mongoUri = process.env.MONGO_URI;

  if (!mongoUri) {
    throw new Error(
      "MONGO_URI is not configured. Set it before running with --mongo.",
    );
  }

  const client = new MongoClient(mongoUri, {
    serverSelectionTimeoutMS: 10000,
  });

  try {
    await client.connect();

    const db = client.db(dbName);
    const collection = db.collection(collectionName);

    const samples = await collection.find({}).toArray();

    return samples;
  } finally {
    await client.close();
  }
}

function loadSamplesFromFile(filePath) {
  if (!filePath) {
    throw new Error("Missing file path. Use --file ./path/to/file.json");
  }

  const absolutePath = path.resolve(filePath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`File not found: ${absolutePath}`);
  }

  const content = fs.readFileSync(absolutePath, "utf-8").trim();

  if (!content) {
    return [];
  }

  return parseSamplesFileContent(content, absolutePath);
}

function findFirstExistingPath(candidatePaths) {
  for (const candidatePath of candidatePaths) {
    if (!candidatePath) {
      continue;
    }

    const absolutePath = path.resolve(candidatePath);

    if (fs.existsSync(absolutePath)) {
      return absolutePath;
    }
  }

  return null;
}

function resolveDescriptorFilePath(explicitPath) {
  if (explicitPath) {
    const absolutePath = path.resolve(explicitPath);

    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Descriptor file not found: ${absolutePath}`);
    }

    return absolutePath;
  }

  const foundPath = findFirstExistingPath([
    path.resolve(process.cwd(), "kanji_descriptors.json"),
    path.resolve(process.cwd(), "data", "kanji_descriptors.json"),
    path.resolve(process.cwd(), "services", "kanji_descriptors.json"),
    path.resolve(__dirname, "..", "kanji_descriptors.json"),
    path.resolve(__dirname, "..", "data", "kanji_descriptors.json"),
    path.resolve(__dirname, "..", "services", "kanji_descriptors.json"),
  ]);

  if (!foundPath) {
    throw new Error(
      [
        "Could not find kanji_descriptors.json automatically.",
        "Use --descriptor-file ./path/to/kanji_descriptors.json",
      ].join("\n"),
    );
  }

  return foundPath;
}

function resolveValidatorFilePath(explicitPath) {
  if (explicitPath) {
    const absolutePath = path.resolve(explicitPath);

    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Validator file not found: ${absolutePath}`);
    }

    return absolutePath;
  }

  const foundPath = findFirstExistingPath([
    path.resolve(process.cwd(), "descriptor_validator.js"),
    path.resolve(process.cwd(), "services", "descriptor_validator.js"),
    path.resolve(process.cwd(), "src", "descriptor_validator.js"),
    path.resolve(__dirname, "..", "descriptor_validator.js"),
    path.resolve(__dirname, "..", "services", "descriptor_validator.js"),
    path.resolve(__dirname, "..", "src", "descriptor_validator.js"),
  ]);

  if (!foundPath) {
    throw new Error(
      [
        "Could not find descriptor_validator.js automatically.",
        "Use --validator-file ./path/to/descriptor_validator.js",
      ].join("\n"),
    );
  }

  return foundPath;
}

function loadDescriptors(descriptorFilePath) {
  const content = fs.readFileSync(descriptorFilePath, "utf-8");
  const parsed = JSON.parse(content);

  return parsed.descriptors ?? parsed;
}

function loadDescriptorValidator(validatorFilePath) {
  const validatorModule = require(validatorFilePath);

  if (typeof validatorModule.validateByDescriptor !== "function") {
    throw new Error(
      `Validator file does not export validateByDescriptor: ${validatorFilePath}`,
    );
  }

  return validatorModule.validateByDescriptor;
}

function revalidateSamples(samples, options) {
  const descriptorFilePath = resolveDescriptorFilePath(
    options.descriptorFilePath,
  );

  const validatorFilePath = resolveValidatorFilePath(options.validatorFilePath);

  console.log(
    `Revalidating samples with current validator: ${validatorFilePath}`,
  );
  console.log(`Using descriptors from: ${descriptorFilePath}`);

  const descriptors = loadDescriptors(descriptorFilePath);
  const validateByDescriptor = loadDescriptorValidator(validatorFilePath);

  let revalidatedCount = 0;
  let skippedCount = 0;

  const revalidatedSamples = samples.map((sample) => {
    const expectedKanji = getExpectedKanji(sample);
    const descriptor = descriptors[expectedKanji];

    if (!descriptor || descriptor.enabled === false) {
      skippedCount++;
      return sample;
    }

    if (!sample.features?.geometry) {
      skippedCount++;
      return sample;
    }

    const validationResult = validateByDescriptor({
      kanji: expectedKanji,
      features: sample.features,
      descriptor,
    });

    if (!validationResult) {
      skippedCount++;
      return sample;
    }

    revalidatedCount++;

    return {
      ...sample,

      // Mantiene la etiqueta manual del usuario.
      isCorrect: sample.isCorrect,

      // Recalcula el resultado algorítmico.
      score: validationResult.score,
      validationResult: validationResult.isCorrect,
      validationStrategy: validationResult.strategy,

      descriptorValidation: validationResult,

      features: {
        ...sample.features,
        descriptorMatchScore: validationResult.descriptorMatchScore,
        descriptorFailedChecks: validationResult.failedChecks ?? [],
        descriptorHardFailedChecks: validationResult.hardFailedChecks ?? [],
        descriptorPattern: validationResult.pattern,
      },

      revalidatedAt: new Date().toISOString(),
      revalidatedWith: {
        descriptorFilePath,
        validatorFilePath,
        pattern: validationResult.pattern,
        strategy: validationResult.strategy,
      },
    };
  });

  console.log(
    `Revalidated samples: ${revalidatedCount}. Skipped samples: ${skippedCount}.`,
  );

  return revalidatedSamples;
}

function parseSamplesFileContent(content, absolutePath) {
  // 1) Intento normal: JSON estándar.
  // Sirve para exports de Mongo tipo: [ {...}, {...} ]
  try {
    const parsed = JSON.parse(content);

    if (Array.isArray(parsed)) {
      return parsed;
    }

    if (parsed && typeof parsed === "object") {
      return [parsed];
    }

    throw new Error("JSON root must be an array or object.");
  } catch (jsonError) {
    // 2) Fallback: JSON Lines / NDJSON.
    // Sirve para ficheros generados con appendFileSync(JSON.stringify(entry) + "\\n")
    return parseJsonLines(content, absolutePath, jsonError);
  }
}

function parseJsonLines(content, absolutePath, originalJsonError) {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const samples = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    try {
      const parsedLine = JSON.parse(line);

      if (Array.isArray(parsedLine)) {
        samples.push(...parsedLine);
      } else {
        samples.push(parsedLine);
      }
    } catch (lineError) {
      throw new Error(
        [
          `Could not parse file as JSON array nor JSONL: ${absolutePath}`,
          "",
          `Original JSON error: ${originalJsonError.message}`,
          `JSONL error at line ${i + 1}: ${lineError.message}`,
          "",
          `Line ${i + 1} starts with: ${line.slice(0, 120)}`,
        ].join("\n"),
      );
    }
  }

  return samples;
}

function getExpectedKanji(sample) {
  return sample.expectedKanji ?? sample.kanji ?? "UNKNOWN";
}

function isNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function getScore(sample) {
  return isNumber(sample.score) ? sample.score : null;
}

function getHeuristicScore(sample) {
  const heuristicScore = sample.features?.heuristicScore;

  if (isNumber(heuristicScore)) {
    return heuristicScore;
  }

  return null;
}

function median(numbers) {
  if (!numbers.length) {
    return null;
  }

  const sorted = [...numbers].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    return sorted[middle];
  }

  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function average(numbers) {
  if (!numbers.length) {
    return null;
  }

  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function minmax(numbers) {
  if (!numbers.length) {
    return {
      min: null,
      max: null,
    };
  }

  return {
    min: Math.min(...numbers),
    max: Math.max(...numbers),
  };
}

function scoreStats(samples) {
  const scores = samples.map(getScore).filter(isNumber);

  const { min, max } = minmax(scores);

  return {
    count: scores.length,
    min,
    median: median(scores),
    max,
    average: average(scores),
  };
}

function countBy(items, getKey) {
  const result = {};

  for (const item of items) {
    const key = getKey(item);
    result[key] = (result[key] ?? 0) + 1;
  }

  return result;
}

function incrementCounter(counter, key) {
  if (!key) {
    return;
  }

  counter[key] = (counter[key] ?? 0) + 1;
}

function incrementCounterMany(counter, keys) {
  for (const key of keys ?? []) {
    incrementCounter(counter, key);
  }
}

function getSampleHardFailedChecks(sample) {
  const hardChecks = new Set();

  for (const checkName of sample.simpleValidation?.hardFailedChecks ?? []) {
    hardChecks.add(checkName);
  }

  for (const checkName of sample.descriptorValidation?.hardFailedChecks ?? []) {
    hardChecks.add(checkName);
  }

  for (const checkName of sample.features?.descriptorHardFailedChecks ?? []) {
    hardChecks.add(checkName);
  }

  // Fallback para validadores antiguos que no tengan hardFailedChecks/softFailedChecks.
  if (
    sample.simpleValidation &&
    !Array.isArray(sample.simpleValidation.hardFailedChecks) &&
    !Array.isArray(sample.simpleValidation.softFailedChecks)
  ) {
    for (const [checkName, value] of Object.entries(
      sample.simpleValidation.checks ?? {},
    )) {
      if (value === false) {
        hardChecks.add(checkName);
      }
    }
  }

  return [...hardChecks];
}

function getSampleSoftFailedChecks(sample) {
  const hardChecks = new Set(getSampleHardFailedChecks(sample));
  const softChecks = new Set();

  for (const checkName of sample.simpleValidation?.softFailedChecks ?? []) {
    softChecks.add(checkName);
  }

  for (const checkName of sample.descriptorValidation?.softFailedChecks ?? []) {
    softChecks.add(checkName);
  }

  // En algunos registros locales solo tenemos descriptorFailedChecks en features.
  // Si un failedCheck no está en hard, lo tratamos como soft/informativo.
  for (const checkName of sample.features?.descriptorFailedChecks ?? []) {
    if (!hardChecks.has(checkName)) {
      softChecks.add(checkName);
    }
  }

  return [...softChecks];
}

function getScoreBand(score) {
  if (!isNumber(score)) {
    return "no_score";
  }

  if (score >= 10) {
    return "10";
  }

  if (score <= 0.5) {
    return "<=0.5";
  }

  if (score <= 0.75) {
    return "0.5-0.75";
  }

  if (score <= 1.5) {
    return "0.75-1.5";
  }

  return "1.5-10";
}

function getPatternHint(kanji) {
  const hints = {
    一: "single_horizontal_line",
    二: "two_horizontal_lines",
    三: "three_horizontal_lines",

    // Patrones ya implementados con descriptor específico.
    口: "box_pattern",
    山: "three_vertical_zones",
    日: "box_with_inner_horizontal",
    目: "box_with_two_inner_horizontals",
    田: "box_with_inner_cross",
    回: "nested_box_pattern",
    用: "open_box_with_inner_vertical_and_horizontals",
    木: "tree_cross_pattern",
    本: "tree_with_bottom_mark",
    未: "tree_with_two_horizontals",
    末: "tree_with_two_horizontals",

    // Patrones próximos/probables.
    四: "box_with_inner_strokes",
    白: "box_with_top_mark_or_inner_horizontal",

    上: "vertical_with_horizontals",
    下: "vertical_with_horizontals",
    土: "vertical_with_two_horizontals",
    士: "vertical_with_two_horizontals",
    王: "vertical_with_three_horizontals",
    生: "vertical_with_multiple_horizontals",

    人: "two_diagonal_strokes",
    入: "two_diagonal_strokes",
    八: "two_separated_diagonals",
    大: "central_crossing_diagonals",
    小: "center_vertical_with_side_dots",

    十: "cross",

    丁: "horizontal_with_vertical_tail",
    刀: "hook_or_blade_pattern",
    力: "hook_or_power_pattern",
    又: "crossing_or_fork_pattern",
    五: "horizontal_vertical_cluster",
  };

  return hints[kanji] ?? "unknown_pattern";
}

function buildRecommendation({
  total,
  correctCount,
  incorrectCount,
  falseNegativeCount,
  falsePositiveCount,
  correctScoreTenCount,
  incorrectScoreTenCount,
  simpleValidationCount,
  descriptorValidationCount,
  patternHint,
}) {
  const reasons = [];

  if (total < 10) {
    reasons.push("collect_more_data");
  }

  if (
    simpleValidationCount === 0 &&
    descriptorValidationCount === 0 &&
    total >= 10
  ) {
    reasons.push("no_structural_validation_yet");
  }

  if (falseNegativeCount >= 5) {
    reasons.push("many_false_negatives");
  }

  if (falsePositiveCount >= 3) {
    reasons.push("many_false_positives");
  }

  if (correctScoreTenCount > 0) {
    reasons.push("correct_samples_scored_10");
  }

  if (incorrectScoreTenCount > 0) {
    reasons.push("some_incorrect_samples_rejected_strongly");
  }

  let action = "monitor";

  if (total < 10) {
    action = "collect_more_data";
  } else if (falseNegativeCount >= 5 && falsePositiveCount >= 3) {
    action = "create_or_improve_descriptor_pattern";
  } else if (falseNegativeCount >= 5) {
    action = "add_descriptor_or_relax_structural_matching";
  } else if (falsePositiveCount >= 3) {
    action = "add_stricter_structural_checks";
  } else if (simpleValidationCount === 0 && descriptorValidationCount === 0) {
    action = "consider_descriptor_pattern";
  }

  return {
    action,
    patternHint,
    reasons,
    priorityScore:
      falseNegativeCount * 2 +
      falsePositiveCount * 2 +
      correctScoreTenCount * 3 +
      incorrectScoreTenCount,
  };
}

function analyzeSamples(samples, options) {
  const filteredSamples = options.kanjiFilter
    ? samples.filter(
        (sample) => getExpectedKanji(sample) === options.kanjiFilter,
      )
    : samples;

  const grouped = new Map();

  for (const sample of filteredSamples) {
    const kanji = getExpectedKanji(sample);

    if (!grouped.has(kanji)) {
      grouped.set(kanji, []);
    }

    grouped.get(kanji).push(sample);
  }

  const kanjiReports = [];

  for (const [kanji, kanjiSamples] of grouped.entries()) {
    const correctSamples = kanjiSamples.filter(
      (sample) => sample.isCorrect === true,
    );
    const incorrectSamples = kanjiSamples.filter(
      (sample) => sample.isCorrect === false,
    );

    const falseNegativeSamples = correctSamples.filter((sample) => {
      const score = getScore(sample);
      return isNumber(score) && score >= options.falseNegativeScoreThreshold;
    });

    const falsePositiveSamples = incorrectSamples.filter((sample) => {
      const score = getScore(sample);
      return isNumber(score) && score <= options.falsePositiveScoreThreshold;
    });

    const correctScoreTenSamples = correctSamples.filter((sample) => {
      const score = getScore(sample);
      return isNumber(score) && score >= 10;
    });

    const incorrectScoreTenSamples = incorrectSamples.filter((sample) => {
      const score = getScore(sample);
      return isNumber(score) && score >= 10;
    });

    const validationStrategies = countBy(
      kanjiSamples,
      (sample) => sample.validationStrategy ?? "unknown",
    );

    const scoreBands = countBy(kanjiSamples, (sample) => {
      const label = sample.isCorrect === true ? "correct" : "incorrect";
      return `${label}:${getScoreBand(getScore(sample))}`;
    });

    const simpleValidationSamples = kanjiSamples.filter(
      (sample) => sample.simpleValidation,
    );

    const descriptorValidationSamples = kanjiSamples.filter((sample) => {
      return (
        sample.descriptorValidation ||
        sample.validationStrategy?.startsWith("descriptor") ||
        sample.validationStrategy?.startsWith("descriptor_") ||
        sample.features?.descriptorPattern
      );
    });

    const hardFailedChecks = {};
    const softFailedChecks = {};

    const hardFailedChecksCorrect = {};
    const hardFailedChecksIncorrect = {};
    const hardFailedChecksUnknown = {};

    const softFailedChecksCorrect = {};
    const softFailedChecksIncorrect = {};
    const softFailedChecksUnknown = {};

    for (const sample of kanjiSamples) {
      const sampleHardFailedChecks = getSampleHardFailedChecks(sample);
      const sampleSoftFailedChecks = getSampleSoftFailedChecks(sample);

      incrementCounterMany(hardFailedChecks, sampleHardFailedChecks);
      incrementCounterMany(softFailedChecks, sampleSoftFailedChecks);

      if (sample.isCorrect === true) {
        incrementCounterMany(hardFailedChecksCorrect, sampleHardFailedChecks);
        incrementCounterMany(softFailedChecksCorrect, sampleSoftFailedChecks);
      } else if (sample.isCorrect === false) {
        incrementCounterMany(hardFailedChecksIncorrect, sampleHardFailedChecks);
        incrementCounterMany(softFailedChecksIncorrect, sampleSoftFailedChecks);
      } else {
        incrementCounterMany(hardFailedChecksUnknown, sampleHardFailedChecks);
        incrementCounterMany(softFailedChecksUnknown, sampleSoftFailedChecks);
      }
    }

    const patternHint = getPatternHint(kanji);

    const recommendation = buildRecommendation({
      total: kanjiSamples.length,
      correctCount: correctSamples.length,
      incorrectCount: incorrectSamples.length,
      falseNegativeCount: falseNegativeSamples.length,
      falsePositiveCount: falsePositiveSamples.length,
      correctScoreTenCount: correctScoreTenSamples.length,
      incorrectScoreTenCount: incorrectScoreTenSamples.length,
      simpleValidationCount: simpleValidationSamples.length,
      descriptorValidationCount: descriptorValidationSamples.length,
      patternHint,
    });

    kanjiReports.push({
      kanji,
      total: kanjiSamples.length,
      correctCount: correctSamples.length,
      incorrectCount: incorrectSamples.length,

      scoreStatsAll: scoreStats(kanjiSamples),
      scoreStatsCorrect: scoreStats(correctSamples),
      scoreStatsIncorrect: scoreStats(incorrectSamples),

      falseNegativeCount: falseNegativeSamples.length,
      falsePositiveCount: falsePositiveSamples.length,
      correctScoreTenCount: correctScoreTenSamples.length,
      incorrectScoreTenCount: incorrectScoreTenSamples.length,

      validationStrategies,
      scoreBands,

      simpleValidationCount: simpleValidationSamples.length,
      descriptorValidationCount: descriptorValidationSamples.length,

      hardFailedChecks,
      softFailedChecks,

      hardFailedChecksCorrect,
      hardFailedChecksIncorrect,
      hardFailedChecksUnknown,

      softFailedChecksCorrect,
      softFailedChecksIncorrect,
      softFailedChecksUnknown,

      recommendation,

      examples: {
        falseNegatives: falseNegativeSamples.slice(0, 5).map(toExample),
        falsePositives: falsePositiveSamples.slice(0, 5).map(toExample),
      },
    });
  }

  kanjiReports.sort((a, b) => {
    if (b.recommendation.priorityScore !== a.recommendation.priorityScore) {
      return b.recommendation.priorityScore - a.recommendation.priorityScore;
    }

    return b.total - a.total;
  });

  return {
    generatedAt: new Date().toISOString(),
    totalSamples: filteredSamples.length,
    totalKanjis: kanjiReports.length,
    options: {
      falseNegativeScoreThreshold: options.falseNegativeScoreThreshold,
      falsePositiveScoreThreshold: options.falsePositiveScoreThreshold,
      kanjiFilter: options.kanjiFilter,
      revalidate: options.revalidate,
    },
    global: buildGlobalSummary(filteredSamples, options),
    kanjis: kanjiReports,
  };
}

function toExample(sample) {
  return {
    recognitionId: sample.recognitionId,
    kanji: sample.kanji,
    expectedKanji: sample.expectedKanji,
    score: sample.score,
    heuristicScore: getHeuristicScore(sample),
    isCorrect: sample.isCorrect,
    validationStrategy: sample.validationStrategy,
    validationResult: sample.validationResult,
    hardFailedChecks: getSampleHardFailedChecks(sample),
    softFailedChecks: getSampleSoftFailedChecks(sample),
    failedChecks: [
      ...getSampleHardFailedChecks(sample),
      ...getSampleSoftFailedChecks(sample),
    ],
  };
}

function buildGlobalSummary(samples, options) {
  const correctSamples = samples.filter((sample) => sample.isCorrect === true);
  const incorrectSamples = samples.filter(
    (sample) => sample.isCorrect === false,
  );

  const falseNegativeSamples = correctSamples.filter((sample) => {
    const score = getScore(sample);
    return isNumber(score) && score >= options.falseNegativeScoreThreshold;
  });

  const falsePositiveSamples = incorrectSamples.filter((sample) => {
    const score = getScore(sample);
    return isNumber(score) && score <= options.falsePositiveScoreThreshold;
  });

  return {
    correctCount: correctSamples.length,
    incorrectCount: incorrectSamples.length,
    falseNegativeCount: falseNegativeSamples.length,
    falsePositiveCount: falsePositiveSamples.length,
    scoreStatsAll: scoreStats(samples),
    validationStrategies: countBy(
      samples,
      (sample) => sample.validationStrategy ?? "unknown",
    ),
  };
}

function formatNumber(value, digits = 3) {
  if (!isNumber(value)) {
    return "-";
  }

  return value.toFixed(digits);
}

function printCheckCounter(title, counter) {
  if (!counter || Object.keys(counter).length === 0) {
    return;
  }

  console.log(`${title}: ${JSON.stringify(counter)}`);
}

function printReport(report) {
  console.log("");
  console.log("========================================");
  console.log("KANJI FEEDBACK ANALYSIS");
  console.log("========================================");
  console.log(`Generated at: ${report.generatedAt}`);
  if (report.options.revalidate) {
    console.log("Revalidation: enabled");
  }
  console.log(`Total samples: ${report.totalSamples}`);
  console.log(`Total kanjis: ${report.totalKanjis}`);
  console.log("");

  console.log("GLOBAL SUMMARY");
  console.log("----------------------------------------");
  console.log(`Manual correct: ${report.global.correctCount}`);
  console.log(`Manual incorrect: ${report.global.incorrectCount}`);
  console.log(
    `False negatives: ${report.global.falseNegativeCount} ` +
      `(manual correct + score >= ${report.options.falseNegativeScoreThreshold})`,
  );
  console.log(
    `False positives: ${report.global.falsePositiveCount} ` +
      `(manual incorrect + score <= ${report.options.falsePositiveScoreThreshold})`,
  );
  console.log(
    `Score median: ${formatNumber(report.global.scoreStatsAll.median)}`,
  );
  console.log(
    `Score average: ${formatNumber(report.global.scoreStatsAll.average)}`,
  );
  console.log(
    `Validation strategies: ${JSON.stringify(report.global.validationStrategies)}`,
  );
  console.log("");

  console.log("KANJI PRIORITY REPORT");
  console.log("----------------------------------------");

  for (const kanjiReport of report.kanjis) {
    printKanjiReport(kanjiReport);
  }
}

function printKanjiReport(report) {
  console.log("");
  console.log(`## ${report.kanji}`);
  console.log(`Samples: ${report.total}`);
  console.log(
    `Correct / Incorrect: ${report.correctCount} / ${report.incorrectCount}`,
  );
  console.log(
    `False negatives: ${report.falseNegativeCount} | False positives: ${report.falsePositiveCount}`,
  );
  console.log(
    `Correct with score 10: ${report.correctScoreTenCount} | Incorrect with score 10: ${report.incorrectScoreTenCount}`,
  );
  console.log(
    `Scores all: min=${formatNumber(report.scoreStatsAll.min)} ` +
      `median=${formatNumber(report.scoreStatsAll.median)} ` +
      `max=${formatNumber(report.scoreStatsAll.max)} ` +
      `avg=${formatNumber(report.scoreStatsAll.average)}`,
  );
  console.log(
    `Validation strategies: ${JSON.stringify(report.validationStrategies)}`,
  );
  console.log(
    `Structural validation: simple=${report.simpleValidationCount}, descriptor=${report.descriptorValidationCount}`,
  );

  printCheckCounter("Hard failed checks total", report.hardFailedChecks);
  printCheckCounter(
    "Hard failed checks in correct samples",
    report.hardFailedChecksCorrect,
  );
  printCheckCounter(
    "Hard failed checks in incorrect samples",
    report.hardFailedChecksIncorrect,
  );
  printCheckCounter(
    "Hard failed checks in unknown-label samples",
    report.hardFailedChecksUnknown,
  );

  printCheckCounter("Soft failed checks total", report.softFailedChecks);
  printCheckCounter(
    "Soft failed checks in correct samples",
    report.softFailedChecksCorrect,
  );
  printCheckCounter(
    "Soft failed checks in incorrect samples",
    report.softFailedChecksIncorrect,
  );
  printCheckCounter(
    "Soft failed checks in unknown-label samples",
    report.softFailedChecksUnknown,
  );

  console.log(
    `Recommendation: ${report.recommendation.action} ` +
      `(pattern=${report.recommendation.patternHint}, priority=${report.recommendation.priorityScore})`,
  );

  if (report.recommendation.reasons.length > 0) {
    console.log(`Reasons: ${report.recommendation.reasons.join(", ")}`);
  }

  if (report.examples.falseNegatives.length > 0) {
    console.log("False negative examples:");
    for (const example of report.examples.falseNegatives) {
      console.log(
        `  - ${example.recognitionId} score=${example.score} heuristic=${example.heuristicScore}`,
      );
    }
  }

  if (report.examples.falsePositives.length > 0) {
    console.log("False positive examples:");
    for (const example of report.examples.falsePositives) {
      console.log(
        `  - ${example.recognitionId} score=${example.score} heuristic=${example.heuristicScore}`,
      );
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || (!args.mode && !args.filePath)) {
    printHelp();
    return;
  }

  let samples;

  if (args.mode === "mongo") {
    console.log("Loading samples from MongoDB...");
    samples = await loadSamplesFromMongo({
      dbName: args.dbName,
      collectionName: args.collectionName,
    });
  } else if (args.mode === "file") {
    console.log(`Loading samples from file: ${args.filePath}`);
    samples = loadSamplesFromFile(args.filePath);
  } else {
    throw new Error("You must specify either --mongo or --file <path>.");
  }

  if (args.revalidate) {
    samples = revalidateSamples(samples, args);
  }

  const report = analyzeSamples(samples, args);

  printReport(report);

  if (args.outputJsonPath) {
    const outputPath = path.resolve(args.outputJsonPath);
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), "utf-8");
    console.log("");
    console.log(`JSON report saved to: ${outputPath}`);
  }
}

main().catch((error) => {
  console.error("");
  console.error("ERROR");
  console.error("----------------------------------------");
  console.error(error.message);
  process.exit(1);
});
