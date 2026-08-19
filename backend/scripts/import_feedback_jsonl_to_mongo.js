"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { MongoClient } = require("mongodb");

const DEFAULT_DB_NAME = "kanji_app";
const DEFAULT_COLLECTION_NAME = "feedback_samples";

function parseArgs(argv) {
  const args = {
    file: "training_data.jsonl",
    dryRun: true,
    apply: false,
    skipWithoutStrokes: false,
    skipSourceNotTestScreen: false,
  };

  for (let index = 2; index < argv.length; index++) {
    const arg = argv[index];

    if (arg === "--file") {
      args.file = argv[index + 1];
      index++;
      continue;
    }

    if (arg === "--dry-run") {
      args.dryRun = true;
      args.apply = false;
      continue;
    }

    if (arg === "--apply") {
      args.apply = true;
      args.dryRun = false;
      continue;
    }

    if (arg === "--help") {
      args.help = true;
      continue;
    }

    if (arg === "--skip-without-strokes") {
      args.skipWithoutStrokes = true;
      continue;
    }

    if (arg === "--skip-source-not-test-screen") {
      args.skipSourceNotTestScreen = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function printHelp() {
  console.log(`
Import local feedback JSONL into MongoDB.

Usage:
  node scripts/import_feedback_jsonl_to_mongo.js --file ./training_data.jsonl --dry-run
  node scripts/import_feedback_jsonl_to_mongo.js --file ./training_data.jsonl --apply

Options:
  --file <path>
      JSONL file to import. Default: ./training_data.jsonl

  --dry-run
      Analyze what would be imported without writing to MongoDB. Default.

  --skip-without-strokes
      Skip records that do not contain usable stroke data.

  --skip-source-not-test-screen
      Skip records whose source is not test_screen.

  --apply
      Actually import missing records into MongoDB.

  --help
      Show this help.
`);
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

function normalizeImportedDocument(document, metadata) {
  const nowIso = metadata.importedAt.toISOString();

  return {
    ...document,

    source: document.source ?? "unknown",
    feedbackType: document.feedbackType ?? "unknown",
    expectedKanji: document.expectedKanji ?? document.kanji ?? null,

    datasetReviewStatus: document.datasetReviewStatus ?? "pending",
    datasetReviewedAt: document.datasetReviewedAt ?? null,
    exclusionReason: document.exclusionReason ?? null,

    legacyImported: true,
    importedFrom: metadata.importedFrom,
    importedAt: nowIso,

    reviewDevice: document.reviewDevice ?? null,
  };
}

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split(/\r?\n/);

  const records = [];
  const invalidLines = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const rawLine = lines[lineIndex];

    if (rawLine.trim().length === 0) {
      continue;
    }

    try {
      const document = JSON.parse(rawLine);

      records.push({
        lineNumber: lineIndex + 1,
        document,
      });
    } catch (error) {
      invalidLines.push({
        lineNumber: lineIndex + 1,
        error: error.message,
      });
    }
  }

  return {
    records,
    invalidLines,
  };
}

function classifyRecords(records) {
  const byRecognitionId = new Map();

  const result = {
    validCandidates: [],
    withoutRecognitionId: [],
    duplicateRecognitionIds: [],
    withoutUsableStrokes: [],
    sourceNotTestScreen: [],
    feedbackTypeNotManualDebug: [],
  };

  for (const record of records) {
    const recognitionId =
      typeof record.document.recognitionId === "string"
        ? record.document.recognitionId.trim()
        : "";

    if (recognitionId.length === 0) {
      result.withoutRecognitionId.push(record);
      continue;
    }

    const previous = byRecognitionId.get(recognitionId);

    if (previous) {
      result.duplicateRecognitionIds.push({
        recognitionId,
        firstLineNumber: previous.lineNumber,
        duplicateLineNumber: record.lineNumber,
      });
      continue;
    }

    byRecognitionId.set(recognitionId, record);

    if (!hasUsableStrokes(record.document)) {
      result.withoutUsableStrokes.push(record);
    }

    if (record.document.source !== "test_screen") {
      result.sourceNotTestScreen.push(record);
    }

    if (record.document.feedbackType !== "manual_debug") {
      result.feedbackTypeNotManualDebug.push(record);
    }

    result.validCandidates.push(record);
  }

  return result;
}

function filterImportableRecords({
  records,
  skipWithoutStrokes,
  skipSourceNotTestScreen,
}) {
  const selected = [];
  const skipped = [];

  for (const record of records) {
    const reasons = [];

    if (skipWithoutStrokes && !hasUsableStrokes(record.document)) {
      reasons.push("without_usable_strokes");
    }

    if (skipSourceNotTestScreen && record.document.source !== "test_screen") {
      reasons.push("source_not_test_screen");
    }

    if (reasons.length > 0) {
      skipped.push({
        ...record,
        skipReasons: reasons,
      });

      continue;
    }

    selected.push(record);
  }

  return {
    selected,
    skipped,
  };
}

async function findExistingRecognitionIds(collection, recognitionIds) {
  const existing = new Set();

  if (recognitionIds.length === 0) {
    return existing;
  }

  const batchSize = 500;

  for (let index = 0; index < recognitionIds.length; index += batchSize) {
    const batch = recognitionIds.slice(index, index + batchSize);

    const documents = await collection
      .find(
        {
          recognitionId: {
            $in: batch,
          },
        },
        {
          projection: {
            recognitionId: 1,
          },
        },
      )
      .toArray();

    for (const document of documents) {
      if (typeof document.recognitionId === "string") {
        existing.add(document.recognitionId);
      }
    }
  }

  return existing;
}

async function importRecords({
  collection,
  records,
  existingRecognitionIds,
  importedFrom,
  apply,
}) {
  const importedAt = new Date();

  const summary = {
    alreadyExisting: 0,
    wouldInsert: 0,
    inserted: 0,
    failed: 0,
    failures: [],
  };

  for (const record of records) {
    const recognitionId = record.document.recognitionId;

    if (existingRecognitionIds.has(recognitionId)) {
      summary.alreadyExisting++;
      continue;
    }

    summary.wouldInsert++;

    if (!apply) {
      continue;
    }

    const document = normalizeImportedDocument(record.document, {
      importedFrom,
      importedAt,
    });

    try {
      const result = await collection.updateOne(
        {
          recognitionId,
        },
        {
          $setOnInsert: document,
        },
        {
          upsert: true,
        },
      );

      if (result.upsertedCount === 1) {
        summary.inserted++;
      } else {
        summary.alreadyExisting++;
      }
    } catch (error) {
      summary.failed++;

      summary.failures.push({
        recognitionId,
        lineNumber: record.lineNumber,
        error: error.message,
      });
    }
  }

  return summary;
}

function printSection(title) {
  console.log("");
  console.log(title);
  console.log("-".repeat(title.length));
}

function printImportPlan({
  filePath,
  mode,
  readResult,
  classified,
  importable,
  existingRecognitionIds,
  importSummary,
}) {
  console.log("");
  console.log("FEEDBACK JSONL MONGO IMPORT");
  console.log("===========================");
  console.log(`File: ${filePath}`);
  console.log(`Mode: ${mode}`);
  console.log("");

  printSection("Input");
  console.log(`Records read: ${readResult.records.length}`);
  console.log(`Invalid JSON lines: ${readResult.invalidLines.length}`);

  printSection("Local classification");
  console.log(
    `Valid candidates with recognitionId: ${classified.validCandidates.length}`,
  );
  console.log(
    `Without recognitionId: ${classified.withoutRecognitionId.length}`,
  );
  console.log(
    `Duplicate recognitionIds: ${classified.duplicateRecognitionIds.length}`,
  );
  console.log(
    `Without usable strokes: ${classified.withoutUsableStrokes.length}`,
  );
  console.log(
    `source != test_screen: ${classified.sourceNotTestScreen.length}`,
  );
  console.log(
    `feedbackType != manual_debug: ${classified.feedbackTypeNotManualDebug.length}`,
  );

  console.log(`Selected for import: ${importable.selected.length}`);
  console.log(`Skipped by options: ${importable.skipped.length}`);

  printSection("Mongo comparison");
  console.log(`Already existing in Mongo: ${existingRecognitionIds.size}`);
  console.log(`New candidates: ${importSummary.wouldInsert}`);

  if (mode === "apply") {
    printSection("Apply result");
    console.log(`Inserted: ${importSummary.inserted}`);
    console.log(`Skipped existing: ${importSummary.alreadyExisting}`);
    console.log(`Failed: ${importSummary.failed}`);
  }

  if (classified.withoutUsableStrokes.length > 0) {
    printSection("Records without usable strokes");
    for (const record of classified.withoutUsableStrokes.slice(0, 20)) {
      console.log(
        `Line ${record.lineNumber}: recognitionId=${record.document.recognitionId}`,
      );
    }
  }

  if (classified.sourceNotTestScreen.length > 0) {
    printSection("Records with source != test_screen");
    for (const record of classified.sourceNotTestScreen.slice(0, 20)) {
      console.log(
        `Line ${record.lineNumber}: recognitionId=${record.document.recognitionId}, source=${record.document.source}`,
      );
    }
  }

  if (classified.duplicateRecognitionIds.length > 0) {
    printSection("Duplicate recognitionIds");
    for (const duplicate of classified.duplicateRecognitionIds.slice(0, 20)) {
      console.log(
        `${duplicate.recognitionId}: first line ${duplicate.firstLineNumber}, duplicate line ${duplicate.duplicateLineNumber}`,
      );
    }
  }

  if (importSummary.failures.length > 0) {
    printSection("Failures");
    for (const failure of importSummary.failures.slice(0, 20)) {
      console.log(
        `Line ${failure.lineNumber}: recognitionId=${failure.recognitionId}, error=${failure.error}`,
      );
    }
  }

  if (importable.skipped.length > 0) {
    printSection("Skipped by options");

    for (const record of importable.skipped.slice(0, 20)) {
      console.log(
        `Line ${record.lineNumber}: recognitionId=${record.document.recognitionId}, reasons=${record.skipReasons.join(",")}`,
      );
    }
  }

  console.log("");
  console.log("Import check completed.");
}

async function main() {
  let client;

  try {
    const args = parseArgs(process.argv);

    if (args.help) {
      printHelp();
      return;
    }

    const mongoUri = process.env.MONGO_URI;

    if (!mongoUri) {
      throw new Error("MONGO_URI environment variable is required.");
    }

    const filePath = path.resolve(process.cwd(), args.file);
    const readResult = readJsonl(filePath);
    const classified = classifyRecords(readResult.records);

    const importable = filterImportableRecords({
      records: classified.validCandidates,
      skipWithoutStrokes: args.skipWithoutStrokes,
      skipSourceNotTestScreen: args.skipSourceNotTestScreen,
    });

    const recognitionIds = importable.selected.map(
      (record) => record.document.recognitionId,
    );

    client = new MongoClient(mongoUri, {
      serverSelectionTimeoutMS: 10000,
    });

    await client.connect();

    const db = client.db(DEFAULT_DB_NAME);
    const collection = db.collection(DEFAULT_COLLECTION_NAME);

    const existingRecognitionIds = await findExistingRecognitionIds(
      collection,
      recognitionIds,
    );

    const importSummary = await importRecords({
      collection,
      records: importable.selected,
      existingRecognitionIds,
      importedFrom: path.basename(filePath),
      apply: args.apply,
    });

    printImportPlan({
      filePath,
      mode: args.apply ? "apply" : "dry-run",
      readResult,
      classified,
      importable,
      existingRecognitionIds,
      importSummary,
    });
  } catch (error) {
    console.error("");
    console.error("ERROR");
    console.error("-----");
    console.error(error.message);

    process.exitCode = 1;
  } finally {
    if (client) {
      await client.close();
    }
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  parseArgs,
  readJsonl,
  classifyRecords,
  hasUsableStrokes,
  normalizeImportedDocument,
  filterImportableRecords,
};
