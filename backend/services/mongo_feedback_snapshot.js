"use strict";

const { calculateSha256 } = require("./kanji_reference_catalog");

const SNAPSHOT_SCHEMA_VERSION = 1;
const SNAPSHOT_HASH_ALGORITHM = "sha256";

const SNAPSHOT_DOCUMENT_FIELDS = [
  "_id",
  "schemaVersion",
  "recognitionId",
  "kanji",
  "expectedKanji",
  "isCorrect",
  "source",
  "feedbackType",
  "datasetReviewStatus",
  "datasetReviewedAt",
  "exclusionReason",
  "features",
  "strokesRaw",
  "strokesNormalized",
  "strokesResampled",
  "strokes",
  "algorithmVersion",
  "createdAt",
  "updatedAt",
  "labelUpdatedAt",
];

function normalizeSnapshotValue(value) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (
    value &&
    typeof value === "object" &&
    typeof value.toHexString === "function"
  ) {
    return value.toHexString();
  }

  if (Array.isArray(value)) {
    return value.map(normalizeSnapshotValue);
  }

  if (value === null || typeof value !== "object") {
    return value;
  }

  const normalized = {};

  for (const key of Object.keys(value).sort()) {
    normalized[key] = normalizeSnapshotValue(value[key]);
  }

  return normalized;
}

function buildSnapshotDocument(document) {
  if (
    document === null ||
    typeof document !== "object" ||
    Array.isArray(document)
  ) {
    throw new TypeError("Snapshot document must be an object.");
  }

  const selected = {};

  for (const field of SNAPSHOT_DOCUMENT_FIELDS) {
    if (Object.hasOwn(document, field)) {
      selected[field] = document[field];
    }
  }

  return normalizeSnapshotValue(selected);
}

function normalizeNonEmptyString(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();

  return normalized.length > 0 ? normalized : null;
}

function normalizeMongoId(value) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === "object" && typeof value.toHexString === "function") {
    return value.toHexString();
  }

  const normalized = String(value).trim();

  return normalized.length > 0 ? normalized : null;
}

function buildSnapshotSampleKey(document) {
  const recognitionId = normalizeNonEmptyString(document?.recognitionId);

  if (recognitionId !== null) {
    return `recognition:${recognitionId}`;
  }

  const mongoId = normalizeMongoId(document?._id);

  if (mongoId !== null) {
    return `mongo:${mongoId}`;
  }

  throw new Error(
    "Snapshot document requires a stable " + "recognitionId or MongoDB _id.",
  );
}

function buildSnapshotEntry(document) {
  const normalizedDocument = buildSnapshotDocument(document);

  return {
    sampleKey: buildSnapshotSampleKey(document),

    recognitionId: normalizeNonEmptyString(document.recognitionId),

    expectedKanji:
      normalizeNonEmptyString(document.expectedKanji) ??
      normalizeNonEmptyString(document.kanji),

    documentSha256: calculateSha256(normalizedDocument),
  };
}

function normalizeRequiredHash(value, fieldName) {
  const normalized = normalizeNonEmptyString(value);

  if (normalized === null) {
    throw new Error(`${fieldName} is required.`);
  }

  return normalized;
}

function normalizeGeneratedAt(value) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error("generatedAt must be a valid date.");
  }

  return date.toISOString();
}

function compareSnapshotEntries(left, right) {
  return left.sampleKey.localeCompare(right.sampleKey, "en");
}

function assertUniqueSampleKeys(entries) {
  const sampleKeys = new Set();

  for (const entry of entries) {
    if (sampleKeys.has(entry.sampleKey)) {
      throw new Error(`Duplicate snapshot sample key: ` + entry.sampleKey);
    }

    sampleKeys.add(entry.sampleKey);
  }
}

function buildSnapshotHashPayload({ catalogSha256, manifestSha256, entries }) {
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    hashAlgorithm: SNAPSHOT_HASH_ALGORITHM,
    catalogSha256,
    manifestSha256,
    documentCount: entries.length,
    entries,
  };
}

function buildMongoFeedbackSnapshot({
  documents,
  catalogSha256,
  manifestSha256,
  generatedAt = new Date(),
}) {
  if (!Array.isArray(documents)) {
    throw new TypeError("documents must be an array.");
  }

  const normalizedCatalogSha256 = normalizeRequiredHash(
    catalogSha256,
    "catalogSha256",
  );

  const normalizedManifestSha256 = normalizeRequiredHash(
    manifestSha256,
    "manifestSha256",
  );

  const entries = documents
    .map(buildSnapshotEntry)
    .sort(compareSnapshotEntries);

  assertUniqueSampleKeys(entries);

  const hashPayload = buildSnapshotHashPayload({
    catalogSha256: normalizedCatalogSha256,
    manifestSha256: normalizedManifestSha256,
    entries,
  });

  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    generatedAt: normalizeGeneratedAt(generatedAt),
    hashAlgorithm: SNAPSHOT_HASH_ALGORITHM,
    catalogSha256: normalizedCatalogSha256,
    manifestSha256: normalizedManifestSha256,
    documentCount: documents.length,
    entryCount: entries.length,
    snapshotSha256: calculateSha256(hashPayload),
    entries,
  };
}

module.exports = {
  SNAPSHOT_SCHEMA_VERSION,
  SNAPSHOT_HASH_ALGORITHM,
  SNAPSHOT_DOCUMENT_FIELDS,
  normalizeSnapshotValue,
  buildSnapshotDocument,
  normalizeNonEmptyString,
  normalizeMongoId,
  buildSnapshotSampleKey,
  buildSnapshotEntry,
  normalizeRequiredHash,
  normalizeGeneratedAt,
  compareSnapshotEntries,
  assertUniqueSampleKeys,
  buildSnapshotHashPayload,
  buildMongoFeedbackSnapshot,
};
