"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  FeedbackReviewValidationError,
  normalizeRequiredKanji,
  parsePositiveInteger,
  normalizeStatusFilter,
  normalizeLabelFilter,
  parseReviewQuery,
  buildReviewFilter,
  buildReviewProjection,
  normalizeStoredReviewStatus,
  normalizeNormalizedStrokes,
  mapReviewSample,
  calculateTotalPages,
  listReviewSamples,
  normalizeRecognitionId,
  normalizeLabelUpdate,
  unwrapFindOneAndUpdateResult,
  updateReviewSampleLabel,
  normalizeRequestedKanjis,
  buildSampleCountFilter,
  getReviewSampleCounts,
} = require("../../services/feedback_review_service");

function createReviewDocument({
  id = "mongo-id-1",
  recognitionId = "recognition-id-1",
  expectedKanji = "力",
  isCorrect = false,
  datasetReviewStatus,
  strokesNormalized = [
    {
      x: [0, 0.5, 1],
      y: [0, 0.5, 1],
    },
    {
      x: [1, 0],
      y: [0, 1],
    },
  ],
} = {}) {
  return {
    _id: {
      toString() {
        return id;
      },
    },
    schemaVersion: 1,
    recognitionId,
    source: "test_screen",
    feedbackType: "manual_debug",
    algorithmVersion: "heuristic-v2",
    kanji: expectedKanji,
    expectedKanji,
    isCorrect,
    datasetReviewStatus,
    strokesNormalized,
    createdAt: "2026-08-03T20:44:28.401Z",
  };
}

function createFakeCollection({
  total = 1,
  documents = [createReviewDocument()],
} = {}) {
  const calls = {
    countFilter: null,
    findFilter: null,
    findOptions: null,
    sort: null,
    skip: null,
    limit: null,
  };

  const cursor = {
    sort(value) {
      calls.sort = value;

      return this;
    },

    skip(value) {
      calls.skip = value;

      return this;
    },

    limit(value) {
      calls.limit = value;

      return this;
    },

    async toArray() {
      return documents;
    },
  };

  const collection = {
    async countDocuments(filter) {
      calls.countFilter = filter;

      return total;
    },

    find(filter, options) {
      calls.findFilter = filter;

      calls.findOptions = options;

      return cursor;
    },
  };

  return {
    collection,
    calls,
  };
}

test("normalizeRequiredKanji accepts one character", () => {
  assert.equal(normalizeRequiredKanji(" 力 "), "力");
});

test("normalizeRequiredKanji rejects missing kanji", () => {
  assert.throws(
    () => normalizeRequiredKanji(""),
    (error) =>
      error instanceof FeedbackReviewValidationError &&
      error.code === "kanji_required",
  );
});

test("normalizeRequiredKanji rejects more than one character", () => {
  assert.throws(
    () => normalizeRequiredKanji("力木"),
    (error) => error.code === "invalid_kanji",
  );
});

test("parsePositiveInteger uses a default value", () => {
  assert.equal(
    parsePositiveInteger({
      value: undefined,
      defaultValue: 20,
      maximum: 100,
      parameterName: "pageSize",
    }),
    20,
  );
});

test("parsePositiveInteger limits the maximum value", () => {
  assert.equal(
    parsePositiveInteger({
      value: "500",
      defaultValue: 20,
      maximum: 100,
      parameterName: "pageSize",
    }),
    100,
  );
});

test("parsePositiveInteger rejects invalid values", () => {
  assert.throws(
    () =>
      parsePositiveInteger({
        value: "0",
        defaultValue: 1,
        parameterName: "page",
      }),
    (error) => error.code === "invalid_page",
  );
});

test("normalizeStatusFilter defaults to pending", () => {
  assert.equal(normalizeStatusFilter(), "pending");
});

test("normalizeStatusFilter rejects unknown status", () => {
  assert.throws(
    () => normalizeStatusFilter("deleted"),
    (error) => error.code === "invalid_status",
  );
});

test("normalizeLabelFilter accepts correct and incorrect", () => {
  assert.equal(normalizeLabelFilter("correct"), "correct");

  assert.equal(normalizeLabelFilter("incorrect"), "incorrect");

  assert.equal(normalizeLabelFilter(), "all");
});

test("parseReviewQuery applies defaults and page-size limit", () => {
  const result = parseReviewQuery({
    kanji: "力",
    pageSize: "500",
  });

  assert.deepEqual(result, {
    kanji: "力",
    status: "pending",
    label: "all",
    page: DEFAULT_PAGE,
    pageSize: MAX_PAGE_SIZE,
  });
});

test("buildReviewFilter restricts results to deliberate manual samples", () => {
  const filter = buildReviewFilter({
    kanji: "力",
    status: "pending",
    label: "incorrect",
  });

  assert.ok(Array.isArray(filter.$and));

  assert.ok(
    filter.$and.some((condition) => condition.source === "test_screen"),
  );

  assert.ok(
    filter.$and.some((condition) => condition.feedbackType === "manual_debug"),
  );

  assert.ok(filter.$and.some((condition) => condition.expectedKanji === "力"));

  assert.ok(filter.$and.some((condition) => condition.isCorrect === false));

  assert.ok(filter.$and.some((condition) => Array.isArray(condition.$or)));
});

test("buildReviewFilter does not add a review-status condition for all", () => {
  const filter = buildReviewFilter({
    kanji: "力",
    status: "all",
    label: "all",
  });

  assert.equal(
    filter.$and.some(
      (condition) =>
        Array.isArray(condition.$or) ||
        typeof condition.datasetReviewStatus === "string",
    ),
    false,
  );
});

test("buildReviewProjection excludes large technical fields", () => {
  const projection = buildReviewProjection();

  assert.equal(projection.strokesNormalized, 1);

  assert.equal(projection.features, undefined);

  assert.equal(projection.strokesRaw, undefined);

  assert.equal(projection.strokesResampled, undefined);
});

test("normalizeStoredReviewStatus treats missing status as pending", () => {
  assert.equal(normalizeStoredReviewStatus(), "pending");

  assert.equal(normalizeStoredReviewStatus("approved"), "approved");

  assert.equal(normalizeStoredReviewStatus("unknown-state"), "pending");
});

test("normalizeNormalizedStrokes removes invalid strokes", () => {
  const result = normalizeNormalizedStrokes([
    {
      x: [0, 1],
      y: [0, 1],
    },
    {
      x: [0],
      y: [0],
    },
    {
      x: [0, "invalid"],
      y: [0, 1],
    },
    null,
  ]);

  assert.deepEqual(result, [
    {
      x: [0, 1],
      y: [0, 1],
    },
  ]);
});

test("mapReviewSample creates a compact mobile response", () => {
  const result = mapReviewSample(createReviewDocument());

  assert.equal(result.id, "mongo-id-1");

  assert.equal(result.expectedKanji, "力");

  assert.equal(result.isCorrect, false);

  assert.equal(result.datasetReviewStatus, "pending");

  assert.equal(result.strokeCount, 2);

  assert.equal(result.source, "test_screen");

  assert.equal(result.feedbackType, "manual_debug");

  assert.equal(Object.hasOwn(result, "features"), false);
});

test("calculateTotalPages handles empty and non-empty result sets", () => {
  assert.equal(
    calculateTotalPages({
      total: 0,
      pageSize: 20,
    }),
    0,
  );

  assert.equal(
    calculateTotalPages({
      total: 21,
      pageSize: 20,
    }),
    2,
  );
});

test("listReviewSamples applies pagination, projection and deterministic order", async () => {
  const { collection, calls } = createFakeCollection({
    total: 45,
    documents: [createReviewDocument()],
  });

  const result = await listReviewSamples({
    collection,
    query: {
      kanji: "力",
      status: "pending",
      label: "incorrect",
      page: "2",
      pageSize: "20",
    },
  });

  assert.equal(calls.skip, 20);

  assert.equal(calls.limit, 20);

  assert.deepEqual(calls.sort, {
    createdAt: -1,
    _id: -1,
  });

  assert.equal(calls.findOptions.projection.strokesNormalized, 1);

  assert.deepEqual(calls.findFilter, calls.countFilter);

  assert.equal(result.page, 2);

  assert.equal(result.pageSize, 20);

  assert.equal(result.total, 45);

  assert.equal(result.totalPages, 3);

  assert.equal(result.hasPreviousPage, true);

  assert.equal(result.hasNextPage, true);

  assert.equal(result.items.length, 1);

  assert.deepEqual(result.filters, {
    kanji: "力",
    status: "pending",
    label: "incorrect",
    source: "test_screen",
    feedbackType: "manual_debug",
  });
});

test("listReviewSamples rejects a missing MongoDB collection", async () => {
  await assert.rejects(
    () =>
      listReviewSamples({
        collection: null,
        query: {
          kanji: "力",
        },
      }),
    /MongoDB feedback collection is required/,
  );
});

test("normalizeRecognitionId rejects an empty value", () => {
  assert.throws(
    () => normalizeRecognitionId(""),
    (error) =>
      error instanceof FeedbackReviewValidationError &&
      error.code === "recognition_id_required",
  );
});

test("normalizeLabelUpdate requires a boolean", () => {
  assert.throws(
    () =>
      normalizeLabelUpdate({
        isCorrect: "true",
      }),
    (error) => error.code === "invalid_is_correct",
  );

  assert.deepEqual(
    normalizeLabelUpdate({
      isCorrect: true,
    }),
    {
      isCorrect: true,
    },
  );
});

test("unwrapFindOneAndUpdateResult supports Mongo result styles", () => {
  const document = createReviewDocument();

  assert.equal(unwrapFindOneAndUpdateResult(document), document);

  assert.equal(
    unwrapFindOneAndUpdateResult({
      value: document,
    }),
    document,
  );

  assert.equal(
    unwrapFindOneAndUpdateResult({
      value: null,
    }),
    null,
  );
});

test("updateReviewSampleLabel updates and maps the sample", async () => {
  const document = createReviewDocument({
    isCorrect: true,
  });

  document.updatedAt = "2026-08-21T10:00:00.000Z";

  document.labelUpdatedAt = "2026-08-21T10:00:00.000Z";

  const calls = [];

  const collection = {
    async findOneAndUpdate(filter, update, options) {
      calls.push({
        filter,
        update,
        options,
      });

      return document;
    },
  };

  const result = await updateReviewSampleLabel({
    collection,
    recognitionId: "recognition-id-1",
    isCorrect: true,
    reviewDevice: {
      tokenId: "device-token-id",
      name: "Móvil test",
    },
    now: new Date("2026-08-21T10:00:00.000Z"),
  });

  assert.equal(result.changed, true);

  assert.equal(result.sample.isCorrect, true);

  assert.equal(calls.length, 1);

  assert.deepEqual(calls[0].filter, {
    recognitionId: "recognition-id-1",
    source: "test_screen",
    feedbackType: "manual_debug",
    isCorrect: {
      $type: "bool",
    },
  });

  assert.equal(calls[0].options.returnDocument, "after");
});

test("updateReviewSampleLabel returns null when sample does not exist", async () => {
  const collection = {
    async findOneAndUpdate() {
      return null;
    },
  };

  const result = await updateReviewSampleLabel({
    collection,
    recognitionId: "missing-id",
    isCorrect: false,
    reviewDevice: {
      tokenId: "device-token-id",
      name: "Móvil test",
    },
  });

  assert.equal(result, null);
});

test("normalizeRequestedKanjis parses, trims and deduplicates kanjis", () => {
  assert.deepEqual(normalizeRequestedKanjis("力, 木,力,刀"), [
    "力",
    "木",
    "刀",
  ]);
});

test("normalizeRequestedKanjis rejects a missing list", () => {
  assert.throws(
    () => normalizeRequestedKanjis(undefined),
    (error) =>
      error instanceof FeedbackReviewValidationError &&
      error.code === "kanjis_required",
  );
});

test("normalizeRequestedKanjis rejects invalid values", () => {
  assert.throws(
    () => normalizeRequestedKanjis("力,力木"),
    (error) => error.code === "invalid_kanji_list",
  );
});

test("buildSampleCountFilter restricts counts to reliable samples", () => {
  const filter = buildSampleCountFilter(["力", "木"]);

  assert.equal(filter.source, "test_screen");

  assert.equal(filter.feedbackType, "manual_debug");

  assert.deepEqual(filter.expectedKanji, {
    $in: ["力", "木"],
  });

  assert.deepEqual(filter.isCorrect, {
    $type: "bool",
  });

  assert.deepEqual(filter.strokesNormalized, {
    $type: "array",
    $ne: [],
  });
});

test("getReviewSampleCounts returns counts and explicit zeros", async () => {
  const calls = {
    pipeline: null,
  };

  const collection = {
    aggregate(pipeline) {
      calls.pipeline = pipeline;

      return {
        async toArray() {
          return [
            {
              _id: "力",
              count: 12,
            },
            {
              _id: "木",
              count: 69,
            },
          ];
        },
      };
    },
  };

  const result = await getReviewSampleCounts({
    collection,
    kanjis: ["力", "木", "刀"],
  });

  assert.deepEqual(result, {
    requestedCount: 3,
    withSamplesCount: 2,
    withoutSamplesCount: 1,
    counts: {
      力: 12,
      木: 69,
      刀: 0,
    },
  });

  assert.ok(Array.isArray(calls.pipeline));

  assert.equal(calls.pipeline.length, 3);

  assert.deepEqual(calls.pipeline[1], {
    $group: {
      _id: "$expectedKanji",
      count: {
        $sum: 1,
      },
    },
  });
});

test("getReviewSampleCounts supports an empty aggregation result", async () => {
  const collection = {
    aggregate() {
      return {
        async toArray() {
          return [];
        },
      };
    },
  };

  const result = await getReviewSampleCounts({
    collection,
    kanjis: ["力", "木"],
  });

  assert.deepEqual(result.counts, {
    力: 0,
    木: 0,
  });

  assert.equal(result.withSamplesCount, 0);

  assert.equal(result.withoutSamplesCount, 2);
});
