"use strict";

const { calculateSha256 } = require("./kanji_reference_catalog");

const SAMPLE_FINGERPRINT_SCHEMA_VERSION = 1;

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeNullableValue(value) {
  return value === undefined ? null : value;
}

function normalizeReasons(reasons) {
  if (!Array.isArray(reasons)) {
    return [];
  }

  return [
    ...new Set(
      reasons
        .filter(
          (reason) => typeof reason === "string" && reason.trim().length > 0,
        )
        .map((reason) => reason.trim()),
    ),
  ].sort();
}

function normalizeReview(review) {
  const value = isPlainObject(review) ? review : {};

  return {
    storedValue: normalizeNullableValue(value.storedValue),
    effectiveStatus: value.effectiveStatus ?? null,
    valid: value.valid === true,
    missing: value.missing === true,
  };
}

function normalizeCatalog(catalog) {
  const value = isPlainObject(catalog) ? catalog : {};

  return {
    hasCanonicalReference: value.hasCanonicalReference === true,

    hasApprovedDescriptor: value.hasApprovedDescriptor === true,

    isExternalUnseen: value.isExternalUnseen === true,

    isExplicitRequirement: value.isExplicitRequirement === true,
  };
}

function buildSampleFingerprintPayload(sample) {
  if (!isPlainObject(sample)) {
    throw new TypeError("Inspected sample must be an object.");
  }

  const recognitionId =
    typeof sample.recognitionId === "string" ? sample.recognitionId.trim() : "";

  if (recognitionId.length === 0) {
    throw new Error("Inspected sample recognitionId is required.");
  }

  return {
    schemaVersion: SAMPLE_FINGERPRINT_SCHEMA_VERSION,

    recognitionId,

    expectedKanji: sample.expectedKanji ?? null,

    isCorrect: typeof sample.isCorrect === "boolean" ? sample.isCorrect : null,

    source: sample.source ?? null,

    feedbackType: sample.feedbackType ?? null,

    classification: sample.classification ?? null,

    reasons: normalizeReasons(sample.reasons),

    strokeStatus: sample.strokeStatus ?? null,

    strokeSourceField: sample.strokeSourceField ?? null,

    strokeCount: Number.isInteger(sample.strokeCount) ? sample.strokeCount : 0,

    featureStatus: sample.featureStatus ?? null,

    review: normalizeReview(sample.review),

    catalog: normalizeCatalog(sample.catalog),

    sampleSchemaVersion: sample.schemaVersion ?? null,

    algorithmVersion: sample.algorithmVersion ?? null,
  };
}

function calculateSampleFingerprint(sample) {
  const payload = buildSampleFingerprintPayload(sample);

  return {
    schemaVersion: SAMPLE_FINGERPRINT_SCHEMA_VERSION,

    recognitionId: payload.recognitionId,

    expectedKanji: payload.expectedKanji,

    sha256: calculateSha256(payload),

    payload,
  };
}

module.exports = {
  SAMPLE_FINGERPRINT_SCHEMA_VERSION,
  isPlainObject,
  normalizeReasons,
  normalizeReview,
  normalizeCatalog,
  buildSampleFingerprintPayload,
  calculateSampleFingerprint,
};
