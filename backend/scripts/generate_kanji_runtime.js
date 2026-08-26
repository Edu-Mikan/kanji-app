"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  buildKanjiDatasetEntry,
} = require("../services/kanji_svg_reference_converter");
const BACKEND_DIRECTORY = path.resolve(__dirname, "..");
const PROJECT_DIRECTORY = path.resolve(BACKEND_DIRECTORY, "..");
const FRONTEND_DATA_DIRECTORY = path.join(
  PROJECT_DIRECTORY,
  "frontend",
  "assets",
  "data",
);
const TRAINING_KANJI_PATH = path.join(
  FRONTEND_DATA_DIRECTORY,
  "training_kanji.json",
);
const SVG_DIRECTORY = path.join(BACKEND_DIRECTORY, "kanji_svg");
const OUTPUT_PATH = path.join(BACKEND_DIRECTORY, "kanji_runtime.json");
const LESSON_FILE_PATTERN = /^lecciones(?:_N[1-5])?\.json$/;

function assertFileExists(filePath, label) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new Error(`${label} not found: ${filePath}`);
  }
}

function assertDirectoryExists(directoryPath, label) {
  if (
    !fs.existsSync(directoryPath) ||
    !fs.statSync(directoryPath).isDirectory()
  ) {
    throw new Error(`${label} not found: ${directoryPath}`);
  }
}

function readJson(filePath, label) {
  assertFileExists(filePath, label);

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`${label} contains invalid JSON: ${error.message}`);
  }
}

function isHanCharacter(character) {
  return (
    typeof character === "string" &&
    Array.from(character).length === 1 &&
    /\p{Script=Han}/u.test(character)
  );
}

function addHanCharacters(targetSet, value) {
  if (typeof value !== "string") {
    return;
  }

  for (const character of value) {
    if (isHanCharacter(character)) {
      targetSet.add(character);
    }
  }
}

function getLessonFiles(dataDirectory) {
  assertDirectoryExists(dataDirectory, "Frontend data directory");

  return fs
    .readdirSync(dataDirectory)
    .filter((fileName) => LESSON_FILE_PATTERN.test(fileName))
    .sort();
}

function collectLessonKanjis({ dataDirectory = FRONTEND_DATA_DIRECTORY } = {}) {
  const kanjis = new Set();

  const lessonFiles = getLessonFiles(dataDirectory);

  for (const fileName of lessonFiles) {
    const filePath = path.join(dataDirectory, fileName);

    const lessons = readJson(filePath, `Lesson file ${fileName}`);

    if (!Array.isArray(lessons)) {
      throw new Error(`Lesson file must contain an array: ${fileName}`);
    }

    for (const lesson of lessons) {
      addHanCharacters(kanjis, lesson?.target);
    }
  }

  return {
    lessonFiles,
    kanjis,
  };
}

function collectTrainingKanjis({
  trainingKanjiPath = TRAINING_KANJI_PATH,
} = {}) {
  const value = readJson(trainingKanjiPath, "Training kanji catalog");

  if (!Array.isArray(value.categories)) {
    throw new Error("Training kanji catalog must contain a categories array.");
  }

  const kanjis = new Set();

  for (const category of value.categories) {
    if (!Array.isArray(category?.kanjis)) {
      throw new Error(
        `Training category has no kanjis array: ${category?.id ?? "unknown"}`,
      );
    }

    for (const value of category.kanjis) {
      addHanCharacters(kanjis, value);
    }
  }

  return {
    categoryCount: value.categories.length,

    kanjis,
  };
}

function collectRuntimeKanjis(options = {}) {
  const lessonResult = collectLessonKanjis(options);

  const trainingResult = collectTrainingKanjis(options);

  const runtimeKanjis = new Set([
    ...lessonResult.kanjis,
    ...trainingResult.kanjis,
  ]);

  return {
    lessonFiles: lessonResult.lessonFiles,

    lessonKanjiCount: lessonResult.kanjis.size,

    trainingCategoryCount: trainingResult.categoryCount,

    trainingKanjiCount: trainingResult.kanjis.size,

    runtimeKanjis: [...runtimeKanjis].sort((left, right) =>
      left.localeCompare(right, "ja"),
    ),
  };
}

function serializeRuntimeDataset(dataset) {
  return `${JSON.stringify(dataset, null, 2)}\n`;
}

function generateRuntimeDataset({
  runtimeKanjis,
  svgDirectory = SVG_DIRECTORY,
  buildEntry = buildKanjiDatasetEntry,
}) {
  assertDirectoryExists(svgDirectory, "Kanji SVG directory");

  if (!Array.isArray(runtimeKanjis)) {
    throw new Error("Runtime kanjis must be an array.");
  }

  if (typeof buildEntry !== "function") {
    throw new Error("buildEntry must be a function.");
  }

  const dataset = {};
  const rows = [];

  for (const kanji of runtimeKanjis) {
    const result = buildEntry({
      svgDir: svgDirectory,
      kanji,
    });

    if (
      !result ||
      !Array.isArray(result.strokes) ||
      result.strokes.length === 0
    ) {
      throw new Error(`Generated runtime reference is invalid for ${kanji}.`);
    }

    dataset[kanji] = result.strokes;

    rows.push({
      kanji,
      originalPathCount: result.originalPathCount ?? null,
      usefulStrokeCount: result.usefulStrokeCount ?? result.strokes.length,
      warningCount: Array.isArray(result.warnings) ? result.warnings.length : 0,
      warnings: Array.isArray(result.warnings) ? result.warnings : [],
    });
  }

  return {
    dataset,
    rows,
  };
}

function writeRuntimeDataset({ dataset, outputPath = OUTPUT_PATH }) {
  fs.mkdirSync(path.dirname(outputPath), {
    recursive: true,
  });

  fs.writeFileSync(outputPath, serializeRuntimeDataset(dataset), "utf8");
}

function generateRuntimeFile({
  runtimeKanjis,
  svgDirectory = SVG_DIRECTORY,
  outputPath = OUTPUT_PATH,
  buildEntry = buildKanjiDatasetEntry,
}) {
  const result = generateRuntimeDataset({
    runtimeKanjis,
    svgDirectory,
    buildEntry,
  });

  writeRuntimeDataset({
    dataset: result.dataset,
    outputPath,
  });

  return result;
}

function validateGeneratedRuntime({ runtimeKanjis, outputPath = OUTPUT_PATH }) {
  const runtimeDataset = readJson(outputPath, "Generated runtime dataset");

  const generatedKanjis = Object.keys(runtimeDataset);

  const missingKanjis = runtimeKanjis.filter(
    (kanji) => !Object.hasOwn(runtimeDataset, kanji),
  );

  const unexpectedKanjis = generatedKanjis.filter(
    (kanji) => !runtimeKanjis.includes(kanji),
  );

  if (missingKanjis.length > 0) {
    throw new Error(
      `Generated runtime dataset is missing kanjis: ${missingKanjis.join(", ")}`,
    );
  }

  if (unexpectedKanjis.length > 0) {
    throw new Error(
      `Generated runtime dataset contains unexpected kanjis: ${unexpectedKanjis.join(", ")}`,
    );
  }

  return {
    generatedKanjiCount: generatedKanjis.length,

    outputSizeBytes: fs.statSync(outputPath).size,

    missingKanjis,

    unexpectedKanjis,
  };
}

function main() {
  try {
    const collection = collectRuntimeKanjis();

    console.log("");
    console.log("KANJI RUNTIME GENERATION");

    console.log("========================");

    console.log(`Lesson files: ${collection.lessonFiles.length}`);

    console.log(`Lesson kanjis: ${collection.lessonKanjiCount}`);

    console.log(`Training categories: ${collection.trainingCategoryCount}`);

    console.log(`Training kanjis: ${collection.trainingKanjiCount}`);

    console.log(`Runtime kanjis: ${collection.runtimeKanjis.length}`);

    console.log(`Includes 力: ${collection.runtimeKanjis.includes("力")}`);

    const generation = generateRuntimeFile({
      runtimeKanjis: collection.runtimeKanjis,
    });

    const validation = validateGeneratedRuntime({
      runtimeKanjis: collection.runtimeKanjis,
    });

    console.log("");
    console.log("Validation");
    console.log("----------");

    console.log(`Generated kanjis: ${validation.generatedKanjiCount}`);

    console.log(`Missing kanjis: ${validation.missingKanjis.length}`);

    console.log(`Unexpected kanjis: ${validation.unexpectedKanjis.length}`);

    console.log(`Output size: ${validation.outputSizeBytes} bytes`);

    console.log(`Output: ${OUTPUT_PATH}`);

    for (const row of generation.rows) {
      console.log(
        [
          `${row.kanji}:`,
          `paths=${row.originalPathCount}`,
          `strokes=${row.usefulStrokeCount}`,
          `warnings=${row.warningCount}`,
        ].join(" "),
      );
    }

    console.log("");
    console.log("Kanji runtime generated successfully.");
  } catch (error) {
    console.error("");
    console.error("ERROR");
    console.error("-----");
    console.error(error.message);

    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  LESSON_FILE_PATTERN,
  isHanCharacter,
  addHanCharacters,
  getLessonFiles,
  collectLessonKanjis,
  collectTrainingKanjis,
  collectRuntimeKanjis,
  serializeRuntimeDataset,
  generateRuntimeDataset,
  writeRuntimeDataset,
  generateRuntimeFile,
  validateGeneratedRuntime,
  main,
};
