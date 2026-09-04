"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  VALID_REVIEW_STATUSES,
  validateStrokeCollection,
  inspectStoredReviewStatus,
  hasUsableGeometry,
  inspectFeedbackSample,
  inspectFeedbackSamples,
} = require("../../services/mongo_feedback_inspector");

function createValidStroke() {
  return {
    x: [0, 0.5, 1],
    y: [0, 0.5, 1],
  };
}

function createValidGeometry() {
  return {
    bboxWidth: 1,
    bboxHeight: 1,
    aspectRatio: 1,
    perStroke: [
      {
        index: 0,
        minX: 0,
        maxX: 1,
        minY: 0,
        maxY: 1,
        width: 1,
        height: 1,
      },
    ],
  };
}

function createReliableSample(overrides = {}) {
  return {
    _id: "mongo-id-1",
    recognitionId: "recognition-id-1",
    kanji: "木",
    expectedKanji: "木",
    isCorrect: true,
    source: "test_screen",
    feedbackType: "manual_debug",
    datasetReviewStatus: "pending",
    strokesNormalized: [createValidStroke()],
    features: {
      geometry: createValidGeometry(),
    },
    createdAt: "2026-08-26T08:00:00.000Z",
    ...overrides,
  };
}

function createCatalogContext() {
  return {
    canonicalKanjis: new Set(["木", "力"]),
    approvedDescriptorKanjis: new Set(["木"]),
    externalUnseenKanjis: new Set(["力"]),
    explicitRequirementKanjis: new Set(),
  };
}

test("VALID_REVIEW_STATUSES contains only persistent review states", () => {
  assert.deepEqual(VALID_REVIEW_STATUSES, [
    "pending",
    "approved",
    "excluded",
    "needs_review",
  ]);
});

test("validateStrokeCollection accepts structurally valid strokes", () => {
  const result = validateStrokeCollection([createValidStroke()]);

  assert.deepEqual(result, {
    valid: true,
    strokeCount: 1,
    invalidStrokeIndexes: [],
  });
});

test("validateStrokeCollection rejects missing and empty collections", () => {
  assert.deepEqual(validateStrokeCollection(undefined), {
    valid: false,
    strokeCount: 0,
    invalidStrokeIndexes: [],
  });

  assert.deepEqual(validateStrokeCollection([]), {
    valid: false,
    strokeCount: 0,
    invalidStrokeIndexes: [],
  });
});

test("validateStrokeCollection rejects mismatched or non-finite points", () => {
  const result = validateStrokeCollection([
    {
      x: [0, 1],
      y: [0],
    },
    {
      x: [0, Number.NaN],
      y: [0, 1],
    },
    createValidStroke(),
  ]);

  assert.equal(result.valid, false);
  assert.equal(result.strokeCount, 3);
  assert.deepEqual(result.invalidStrokeIndexes, [0, 1]);
});

test("inspectStoredReviewStatus preserves the stored and effective values", () => {
  assert.deepEqual(inspectStoredReviewStatus("approved"), {
    storedValue: "approved",
    effectiveStatus: "approved",
    valid: true,
    missing: false,
  });

  assert.deepEqual(inspectStoredReviewStatus(undefined), {
    storedValue: null,
    effectiveStatus: "pending",
    valid: true,
    missing: true,
  });

  assert.deepEqual(inspectStoredReviewStatus("unexpected"), {
    storedValue: "unexpected",
    effectiveStatus: "pending",
    valid: false,
    missing: false,
  });
});

test("hasUsableGeometry requires finite global and per-stroke geometry", () => {
  assert.equal(hasUsableGeometry(createValidGeometry()), true);

  assert.equal(
    hasUsableGeometry({
      bboxWidth: 1,
      bboxHeight: 1,
      aspectRatio: 1,
      perStroke: [],
    }),
    false,
  );

  assert.equal(
    hasUsableGeometry({
      ...createValidGeometry(),
      bboxWidth: Number.NaN,
    }),
    false,
  );
});

test("inspectFeedbackSample classifies a reliable prepared sample", () => {
  const result = inspectFeedbackSample(
    createReliableSample(),
    createCatalogContext(),
  );

  assert.equal(result.classification, "reliable");
  assert.deepEqual(result.reasons, []);

  assert.equal(result.recognitionId, "recognition-id-1");
  assert.equal(result.expectedKanji, "木");
  assert.equal(result.isCorrect, true);

  assert.equal(result.strokeStatus, "valid_normalized_strokes");
  assert.equal(result.featureStatus, "geometry_available");

  assert.equal(result.catalog.hasCanonicalReference, true);
  assert.equal(result.catalog.hasApprovedDescriptor, true);
  assert.equal(result.catalog.isExternalUnseen, false);
  assert.equal(result.catalog.isExplicitRequirement, false);

  assert.equal(result.review.storedValue, "pending");
  assert.equal(result.review.effectiveStatus, "pending");
});

test("inspectFeedbackSample marks missing geometry as reconstructible", () => {
  const sample = createReliableSample({
    features: undefined,
  });

  const result = inspectFeedbackSample(sample, createCatalogContext());

  assert.equal(result.classification, "reliable");
  assert.equal(result.featureStatus, "reconstructible");
  assert.deepEqual(result.reasons, []);
});

test("inspectFeedbackSample accepts valid raw strokes for reconstruction", () => {
  const sample = createReliableSample({
    features: undefined,
    strokesNormalized: undefined,
    strokesRaw: [createValidStroke()],
  });

  const result = inspectFeedbackSample(sample, createCatalogContext());

  assert.equal(result.classification, "reliable");
  assert.equal(result.strokeStatus, "valid_raw_strokes");
  assert.equal(result.featureStatus, "reconstructible");
});

test("inspectFeedbackSample does not treat resampled strokes as missing", () => {
  const sample = createReliableSample({
    features: undefined,
    strokesNormalized: undefined,
    strokesResampled: [createValidStroke()],
  });

  const result = inspectFeedbackSample(sample, createCatalogContext());

  assert.equal(result.classification, "reliable");
  assert.equal(result.strokeStatus, "valid_resampled_strokes");
  assert.equal(result.featureStatus, "reconstructible");
});

test("inspectFeedbackSample excludes a sample without a recognitionId", () => {
  const sample = createReliableSample({
    recognitionId: " ",
  });

  const result = inspectFeedbackSample(sample, createCatalogContext());

  assert.equal(result.classification, "excluded");
  assert.ok(result.reasons.includes("invalid_recognition_id"));
});

test("inspectFeedbackSample excludes a non-deliberate sample", () => {
  const sample = createReliableSample({
    source: "unknown",
    feedbackType: "unknown",
  });

  const result = inspectFeedbackSample(sample, createCatalogContext());

  assert.equal(result.classification, "excluded");
  assert.ok(result.reasons.includes("source_not_test_screen"));
  assert.ok(result.reasons.includes("feedback_type_not_manual_debug"));
});

test("inspectFeedbackSample requires source and feedbackType simultaneously", () => {
  const sample = createReliableSample({
    source: "test_screen",
    feedbackType: "unknown",
  });

  const result = inspectFeedbackSample(sample, createCatalogContext());

  assert.equal(result.classification, "excluded");
  assert.ok(result.reasons.includes("feedback_type_not_manual_debug"));
});

test("inspectFeedbackSample excludes a sample without a boolean label", () => {
  const sample = createReliableSample({
    isCorrect: "true",
  });

  const result = inspectFeedbackSample(sample, createCatalogContext());

  assert.equal(result.classification, "excluded");
  assert.ok(result.reasons.includes("invalid_is_correct"));
});

test("inspectFeedbackSample excludes invalid stroke data", () => {
  const sample = createReliableSample({
    strokesNormalized: [
      {
        x: [0, 1],
        y: [0],
      },
    ],
  });

  const result = inspectFeedbackSample(sample, createCatalogContext());

  assert.equal(result.classification, "excluded");
  assert.equal(result.strokeStatus, "invalid_strokes");
  assert.equal(result.featureStatus, "geometry_available");
  assert.ok(result.reasons.includes("invalid_strokes"));
});

test("inspectFeedbackSample identifies a sample that is not preparable", () => {
  const sample = createReliableSample({
    features: undefined,
    strokesNormalized: undefined,
  });

  const result = inspectFeedbackSample(sample, createCatalogContext());

  assert.equal(result.classification, "excluded");
  assert.equal(result.strokeStatus, "missing_strokes");
  assert.equal(result.featureStatus, "not_preparable");
  assert.ok(result.reasons.includes("missing_strokes"));
});

test("inspectFeedbackSample excludes an explicitly excluded review status", () => {
  const sample = createReliableSample({
    datasetReviewStatus: "excluded",
  });

  const result = inspectFeedbackSample(sample, createCatalogContext());

  assert.equal(result.classification, "excluded");
  assert.ok(result.reasons.includes("dataset_review_status_excluded"));
});

test("inspectFeedbackSample excludes needs_review from reliable data", () => {
  const sample = createReliableSample({
    datasetReviewStatus: "needs_review",
  });

  const result = inspectFeedbackSample(sample, createCatalogContext());

  assert.equal(result.classification, "excluded");
  assert.ok(result.reasons.includes("dataset_review_status_needs_review"));
});

test("inspectFeedbackSample reports an invalid stored review status", () => {
  const sample = createReliableSample({
    datasetReviewStatus: "unexpected",
  });

  const result = inspectFeedbackSample(sample, createCatalogContext());

  assert.equal(result.classification, "excluded");
  assert.equal(result.review.effectiveStatus, "pending");
  assert.equal(result.review.valid, false);
  assert.ok(result.reasons.includes("invalid_dataset_review_status"));
});

test("inspectFeedbackSample reports an external unseen kanji", () => {
  const sample = createReliableSample({
    kanji: "力",
    expectedKanji: "力",
  });

  const result = inspectFeedbackSample(sample, createCatalogContext());

  assert.equal(result.catalog.hasCanonicalReference, true);
  assert.equal(result.catalog.hasApprovedDescriptor, false);
  assert.equal(result.catalog.isExternalUnseen, true);
  assert.equal(result.classification, "reliable");
});

test("inspectFeedbackSample cannot reconstruct features without a reference", () => {
  const sample = createReliableSample({
    kanji: "刀",
    expectedKanji: "刀",
    features: undefined,
  });

  const result = inspectFeedbackSample(sample, createCatalogContext());

  assert.equal(result.featureStatus, "not_preparable");
  assert.equal(result.classification, "excluded");
  assert.ok(result.reasons.includes("missing_canonical_reference"));
});

test("inspectFeedbackSamples groups results by kanji deterministically", () => {
  const samples = [
    createReliableSample({
      recognitionId: "sample-force",
      kanji: "力",
      expectedKanji: "力",
    }),
    createReliableSample({
      recognitionId: "sample-tree",
      kanji: "木",
      expectedKanji: "木",
    }),
    createReliableSample({
      recognitionId: "sample-invalid",
      kanji: "木",
      expectedKanji: "木",
      source: "unknown",
    }),
  ];

  const result = inspectFeedbackSamples(samples, createCatalogContext());

  assert.equal(result.totalSamples, 3);
  assert.equal(result.reliableCount, 2);
  assert.equal(result.excludedCount, 1);

  assert.ok(Array.isArray(result.samples));
  assert.equal(result.samples.length, 3);
  assert.equal(Object.hasOwn(result, "simples"), false);

  assert.deepEqual(Object.keys(result.byKanji), ["力", "木"]);

  assert.equal(result.byKanji.力.total, 1);
  assert.equal(result.byKanji.力.reliableCount, 1);
  assert.equal(result.byKanji.力.excludedCount, 0);

  assert.equal(result.byKanji.木.total, 2);
  assert.equal(result.byKanji.木.reliableCount, 1);
  assert.equal(result.byKanji.木.excludedCount, 1);
});

test("inspectFeedbackSamples does not mutate source documents", () => {
  const sample = createReliableSample();
  const serializedBefore = JSON.stringify(sample);

  inspectFeedbackSamples([sample], createCatalogContext());

  assert.equal(JSON.stringify(sample), serializedBefore);
});
