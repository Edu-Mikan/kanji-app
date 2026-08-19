"use strict";

const fs = require("node:fs");
const path = require("node:path");

function parseArgs(argv) {
  const args = {
    file: "training_data.jsonl",
  };

  for (let index = 2; index < argv.length; index++) {
    const arg = argv[index];

    if (arg === "--file") {
      args.file = argv[index + 1];
      index++;
      continue;
    }

    if (arg === "--help") {
      args.help = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function printHelp() {
  console.log(`
Audit local feedback JSONL file.

Usage:
  node scripts/audit_feedback_jsonl.js --file ./training_data.jsonl

Options:
  --file <path>
      JSONL file to audit. Default: ./training_data.jsonl

  --help
      Show this help.
`);
}

function incrementMap(map, key) {
  const normalizedKey =
    key === undefined || key === null || key === "" ? "(missing)" : String(key);

  map.set(normalizedKey, (map.get(normalizedKey) ?? 0) + 1);
}

function mapToSortedArray(map) {
  return [...map.entries()].sort((left, right) => {
    const countDiff = right[1] - left[1];

    if (countDiff !== 0) {
      return countDiff;
    }

    return left[0].localeCompare(right[0]);
  });
}

function hasUsableStrokes(document) {
  if (Array.isArray(document.strokesRaw) && document.strokesRaw.length > 0) {
    return true;
  }

  if (
    Array.isArray(document.strokesNormalized) &&
    document.strokesNormalized.length > 0
  ) {
    return true;
  }

  if (Array.isArray(document.strokes) && document.strokes.length > 0) {
    return true;
  }

  return false;
}

function auditJsonlFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split(/\r?\n/);

  const stats = {
    filePath,
    totalLines: 0,
    emptyLines: 0,
    validJsonLines: 0,
    invalidJsonLines: 0,
    withRecognitionId: 0,
    withoutRecognitionId: 0,
    duplicateRecognitionIds: 0,
    correctTrue: 0,
    correctFalse: 0,
    correctMissingOrInvalid: 0,
    withUsableStrokes: 0,
    withoutUsableStrokes: 0,
    manualDebugCount: 0,
    testScreenCount: 0,
    invalidLines: [],
    duplicateIds: [],
    byKanji: new Map(),
    byExpectedKanji: new Map(),
    bySource: new Map(),
    byFeedbackType: new Map(),
    byValidationStrategy: new Map(),
    bySchemaVersion: new Map(),
  };

  const recognitionIds = new Map();

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const rawLine = lines[lineIndex];

    if (rawLine.trim().length === 0) {
      stats.emptyLines++;
      continue;
    }

    stats.totalLines++;

    let document;

    try {
      document = JSON.parse(rawLine);
      stats.validJsonLines++;
    } catch (error) {
      stats.invalidJsonLines++;

      stats.invalidLines.push({
        lineNumber: lineIndex + 1,
        error: error.message,
      });

      continue;
    }

    const recognitionId =
      typeof document.recognitionId === "string"
        ? document.recognitionId.trim()
        : "";

    if (recognitionId.length > 0) {
      stats.withRecognitionId++;

      const previousCount = recognitionIds.get(recognitionId) ?? 0;

      recognitionIds.set(recognitionId, previousCount + 1);
    } else {
      stats.withoutRecognitionId++;
    }

    if (document.isCorrect === true) {
      stats.correctTrue++;
    } else if (document.isCorrect === false) {
      stats.correctFalse++;
    } else {
      stats.correctMissingOrInvalid++;
    }

    if (hasUsableStrokes(document)) {
      stats.withUsableStrokes++;
    } else {
      stats.withoutUsableStrokes++;
    }

    if (document.feedbackType === "manual_debug") {
      stats.manualDebugCount++;
    }

    if (document.source === "test_screen") {
      stats.testScreenCount++;
    }

    incrementMap(stats.byKanji, document.kanji);

    incrementMap(stats.byExpectedKanji, document.expectedKanji);

    incrementMap(stats.bySource, document.source);

    incrementMap(stats.byFeedbackType, document.feedbackType);

    incrementMap(stats.byValidationStrategy, document.validationStrategy);

    incrementMap(stats.bySchemaVersion, document.schemaVersion);
  }

  for (const [recognitionId, count] of recognitionIds.entries()) {
    if (count > 1) {
      stats.duplicateRecognitionIds += count - 1;

      stats.duplicateIds.push({
        recognitionId,
        count,
      });
    }
  }

  stats.duplicateIds.sort((left, right) => {
    const countDiff = right.count - left.count;

    if (countDiff !== 0) {
      return countDiff;
    }

    return left.recognitionId.localeCompare(right.recognitionId);
  });

  return stats;
}

function printMapSection(title, map, limit = 30) {
  console.log("");
  console.log(title);
  console.log("-".repeat(title.length));

  const rows = mapToSortedArray(map).slice(0, limit);

  if (rows.length === 0) {
    console.log("(empty)");
    return;
  }

  for (const [key, count] of rows) {
    console.log(`${key}: ${count}`);
  }
}

function printAudit(stats) {
  console.log("");
  console.log("FEEDBACK JSONL AUDIT");
  console.log("====================");
  console.log(`File: ${stats.filePath}`);
  console.log("");

  console.log("Summary");
  console.log("-------");
  console.log(`Non-empty lines: ${stats.totalLines}`);
  console.log(`Empty lines: ${stats.emptyLines}`);
  console.log(`Valid JSON lines: ${stats.validJsonLines}`);
  console.log(`Invalid JSON lines: ${stats.invalidJsonLines}`);
  console.log(`With recognitionId: ${stats.withRecognitionId}`);
  console.log(`Without recognitionId: ${stats.withoutRecognitionId}`);
  console.log(
    `Duplicate recognitionId occurrences: ${stats.duplicateRecognitionIds}`,
  );
  console.log(`isCorrect true: ${stats.correctTrue}`);
  console.log(`isCorrect false: ${stats.correctFalse}`);
  console.log(`isCorrect missing/invalid: ${stats.correctMissingOrInvalid}`);
  console.log(`With usable strokes: ${stats.withUsableStrokes}`);
  console.log(`Without usable strokes: ${stats.withoutUsableStrokes}`);
  console.log(`source=test_screen: ${stats.testScreenCount}`);
  console.log(`feedbackType=manual_debug: ${stats.manualDebugCount}`);

  printMapSection("By kanji", stats.byKanji);

  printMapSection("By expectedKanji", stats.byExpectedKanji);

  printMapSection("By source", stats.bySource);

  printMapSection("By feedbackType", stats.byFeedbackType);

  printMapSection("By validationStrategy", stats.byValidationStrategy);

  printMapSection("By schemaVersion", stats.bySchemaVersion);

  if (stats.invalidLines.length > 0) {
    console.log("");
    console.log("Invalid JSON lines");
    console.log("------------------");

    for (const item of stats.invalidLines.slice(0, 20)) {
      console.log(`Line ${item.lineNumber}: ${item.error}`);
    }
  }

  if (stats.duplicateIds.length > 0) {
    console.log("");
    console.log("Duplicate recognitionIds");
    console.log("------------------------");

    for (const item of stats.duplicateIds.slice(0, 20)) {
      console.log(`${item.recognitionId}: ${item.count}`);
    }
  }

  console.log("");
  console.log("Audit completed.");
}

function main() {
  try {
    const args = parseArgs(process.argv);

    if (args.help) {
      printHelp();
      return;
    }

    const filePath = path.resolve(process.cwd(), args.file);

    const stats = auditJsonlFile(filePath);

    printAudit(stats);
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
  parseArgs,
  auditJsonlFile,
  hasUsableStrokes,
};
