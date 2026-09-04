"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  SAMPLE_FINGERPRINT_SCHEMA_VERSION,
  buildSampleFingerprintPayload,
  calculateSampleFingerprint,
} = require("../../services/feedback_sample_fingerprint");

function createInspectedSample(overrides = {}) {
  return {
    id: "mongo-id-1",
    recognitionId: "recognition-id-1",
    kanji: "木",
    expectedKanji: "木",
    isCorrect: true,
    source: "test_screen",
    feedbackType: "manual_debug",
    classification: "reliable",
    reasons: [],
    strokeStatus: "valid_normalized_strokes",
    strokeSourceField: "strokesNormalized",
    strokeCount: 4,
    featureStatus: "geometry_available",
    review: {
      storedValue: "pending",
      effectiveStatus: "pending",
      valid: true,
      missing: false,
    },
    catalog: {
      hasCanonicalReference: true,
      hasApprovedDescriptor: true,
      isExternalUnseen: false,
      isExplicitRequirement: false,
    },
    schemaVersion: 1,
    algorithmVersion: "heuristic-v2",
    createdAt: "2026-08-01T10:00:00.000Z",
    updatedAt: null,
    labelUpdatedAt: null,
    ...overrides,
  };
}

test("fingerprint schema version is explicit", () => {
  assert.equal(SAMPLE_FINGERPRINT_SCHEMA_VERSION, 1);
});

test("buildSampleFingerprintPayload selects relevant fields", () => {
  const payload = buildSampleFingerprintPayload(createInspectedSample());

  assert.deepEqual(payload, {
    schemaVersion: 1,
    recognitionId: "recognition-id-1",
    expectedKanji: "木",
    isCorrect: true,
    source: "test_screen",
    feedbackType: "manual_debug",
    classification: "reliable",
    reasons: [],
    strokeStatus: "valid_normalized_strokes",
    strokeSourceField: "strokesNormalized",
    strokeCount: 4,
    featureStatus: "geometry_available",
    review: {
      storedValue: "pending",
      effectiveStatus: "pending",
      valid: true,
      missing: false,
    },
    catalog: {
      hasCanonicalReference: true,
      hasApprovedDescriptor: true,
      isExternalUnseen: false,
      isExplicitRequirement: false,
    },
    sampleSchemaVersion: 1,
    algorithmVersion: "heuristic-v2",
  });
});

test("fingerprint payload excludes MongoDB and temporal fields", () => {
  const payload = buildSampleFingerprintPayload(createInspectedSample());

  assert.equal(Object.hasOwn(payload, "id"), false);
  assert.equal(Object.hasOwn(payload, "_id"), false);
  assert.equal(Object.hasOwn(payload, "createdAt"), false);
  assert.equal(Object.hasOwn(payload, "updatedAt"), false);
  assert.equal(Object.hasOwn(payload, "labelUpdatedAt"), false);
});

test("calculateSampleFingerprint returns a SHA-256 hash", () => {
  const result = calculateSampleFingerprint(createInspectedSample());

  assert.match(result.sha256, /^[a-f0-9]{64}$/);

  assert.equal(result.recognitionId, "recognition-id-1");

  assert.equal(result.expectedKanji, "木");
  assert.equal(result.schemaVersion, 1);
});

test("fingerprint is deterministic", () => {
  const sample = createInspectedSample();

  const first = calculateSampleFingerprint(sample);
  const second = calculateSampleFingerprint(sample);

  assert.equal(first.sha256, second.sha256);
  assert.deepEqual(first.payload, second.payload);
});

test("fingerprint ignores property insertion order", () => {
  const first = createInspectedSample();

  const second = {
    algorithmVersion: "heuristic-v2",
    schemaVersion: 1,
    catalog: {
      isExplicitRequirement: false,
      isExternalUnseen: false,
      hasApprovedDescriptor: true,
      hasCanonicalReference: true,
    },
    review: {
      missing: false,
      valid: true,
      effectiveStatus: "pending",
      storedValue: "pending",
    },
    featureStatus: "geometry_available",
    strokeCount: 4,
    strokeSourceField: "strokesNormalized",
    strokeStatus: "valid_normalized_strokes",
    reasons: [],
    classification: "reliable",
    feedbackType: "manual_debug",
    source: "test_screen",
    isCorrect: true,
    expectedKanji: "木",
    kanji: "木",
    recognitionId: "recognition-id-1",
    id: "different-mongo-id",
  };

  assert.equal(
    calculateSampleFingerprint(first).sha256,
    calculateSampleFingerprint(second).sha256,
  );
});

test("fingerprint ignores MongoDB identifier changes", () => {
  const first = createInspectedSample({
    id: "mongo-id-1",
  });

  const second = createInspectedSample({
    id: "mongo-id-2",
  });

  assert.equal(
    calculateSampleFingerprint(first).sha256,
    calculateSampleFingerprint(second).sha256,
  );
});

test("fingerprint ignores timestamp changes", () => {
  const first = createInspectedSample();

  const second = createInspectedSample({
    createdAt: "2026-09-01T12:00:00.000Z",
    updatedAt: "2026-09-01T12:10:00.000Z",
    labelUpdatedAt: "2026-09-01T12:10:00.000Z",
  });

  assert.equal(
    calculateSampleFingerprint(first).sha256,
    calculateSampleFingerprint(second).sha256,
  );
});

test("fingerprint changes when the manual label changes", () => {
  const first = createInspectedSample({
    isCorrect: true,
  });

  const second = createInspectedSample({
    isCorrect: false,
  });

  assert.notEqual(
    calculateSampleFingerprint(first).sha256,
    calculateSampleFingerprint(second).sha256,
  );
});

test("fingerprint changes when expectedKanji changes", () => {
  const first = createInspectedSample({
    expectedKanji: "木",
  });

  const second = createInspectedSample({
    expectedKanji: "本",
  });

  assert.notEqual(
    calculateSampleFingerprint(first).sha256,
    calculateSampleFingerprint(second).sha256,
  );
});

test("fingerprint changes when classification reasons change", () => {
  const first = createInspectedSample({
    classification: "reliable",
    reasons: [],
  });

  const second = createInspectedSample({
    classification: "excluded",
    reasons: ["source_not_test_screen"],
  });

  assert.notEqual(
    calculateSampleFingerprint(first).sha256,
    calculateSampleFingerprint(second).sha256,
  );
});

test("reason order does not change the fingerprint", () => {
  const first = createInspectedSample({
    classification: "excluded",
    reasons: ["missing_strokes", "source_not_test_screen"],
  });

  const second = createInspectedSample({
    classification: "excluded",
    reasons: ["source_not_test_screen", "missing_strokes"],
  });

  assert.equal(
    calculateSampleFingerprint(first).sha256,
    calculateSampleFingerprint(second).sha256,
  );
});

test("fingerprint changes when review status changes", () => {
  const first = createInspectedSample();

  const second = createInspectedSample({
    review: {
      storedValue: "excluded",
      effectiveStatus: "excluded",
      valid: true,
      missing: false,
    },
  });

  assert.notEqual(
    calculateSampleFingerprint(first).sha256,
    calculateSampleFingerprint(second).sha256,
  );
});

test("fingerprint changes when preparation status changes", () => {
  const first = createInspectedSample({
    featureStatus: "geometry_available",
  });

  const second = createInspectedSample({
    featureStatus: "not_preparable",
  });

  assert.notEqual(
    calculateSampleFingerprint(first).sha256,
    calculateSampleFingerprint(second).sha256,
  );
});

test("calculateSampleFingerprint rejects an invalid sample", () => {
  assert.throws(
    () => calculateSampleFingerprint(null),
    /Inspected sample must be an object/,
  );

  assert.throws(
    () =>
      calculateSampleFingerprint({
        recognitionId: "",
      }),
    /recognitionId is required/,
  );
});

test("fingerprint calculation does not mutate the sample", () => {
  const sample = createInspectedSample({
    reasons: ["source_not_test_screen", "missing_strokes"],
  });

  const serializedBefore = JSON.stringify(sample);

  calculateSampleFingerprint(sample);

  assert.equal(JSON.stringify(sample), serializedBefore);
});
