"use strict";

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

const REVIEW_STATUSES = [
  "pending",
  "approved",
  "excluded",
  "needs_review",
  "all",
];

const LABEL_FILTERS = ["all", "correct", "incorrect"];

class FeedbackReviewValidationError extends Error {
  constructor(message, code, details = null) {
    super(message);

    this.name = "FeedbackReviewValidationError";

    this.code = code;

    this.statusCode = 400;

    this.details = details;
  }
}

function normalizeRequiredKanji(value) {
  if (typeof value !== "string") {
    throw new FeedbackReviewValidationError(
      "The kanji query parameter is required.",
      "kanji_required",
    );
  }

  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new FeedbackReviewValidationError(
      "The kanji query parameter is required.",
      "kanji_required",
    );
  }

  if (Array.from(normalized).length !== 1) {
    throw new FeedbackReviewValidationError(
      "The kanji query parameter must contain exactly one character.",
      "invalid_kanji",
      {
        actualValue: normalized,
      },
    );
  }

  return normalized;
}

function parsePositiveInteger({
  value,
  defaultValue,
  maximum = null,
  parameterName,
}) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  const normalizedValue = typeof value === "string" ? value.trim() : value;

  if (normalizedValue === "") {
    return defaultValue;
  }

  const parsedValue = Number(normalizedValue);

  if (!Number.isInteger(parsedValue) || parsedValue < 1) {
    throw new FeedbackReviewValidationError(
      `${parameterName} must be a positive integer.`,
      `invalid_${parameterName}`,
      {
        actualValue: value,
      },
    );
  }

  if (maximum !== null && parsedValue > maximum) {
    return maximum;
  }

  return parsedValue;
}

function normalizeStatusFilter(value) {
  if (value === undefined || value === null || value === "") {
    return "pending";
  }

  const normalized = String(value).trim().toLowerCase();

  if (!REVIEW_STATUSES.includes(normalized)) {
    throw new FeedbackReviewValidationError(
      "The status query parameter is invalid.",
      "invalid_status",
      {
        actualValue: value,
        allowedValues: REVIEW_STATUSES,
      },
    );
  }

  return normalized;
}

function normalizeLabelFilter(value) {
  if (value === undefined || value === null || value === "") {
    return "all";
  }

  const normalized = String(value).trim().toLowerCase();

  if (!LABEL_FILTERS.includes(normalized)) {
    throw new FeedbackReviewValidationError(
      "The label query parameter is invalid.",
      "invalid_label",
      {
        actualValue: value,
        allowedValues: LABEL_FILTERS,
      },
    );
  }

  return normalized;
}

function parseReviewQuery(query = {}) {
  return {
    kanji: normalizeRequiredKanji(query.kanji),

    status: normalizeStatusFilter(query.status),

    label: normalizeLabelFilter(query.label),

    page: parsePositiveInteger({
      value: query.page,
      defaultValue: DEFAULT_PAGE,
      parameterName: "page",
    }),

    pageSize: parsePositiveInteger({
      value: query.pageSize,
      defaultValue: DEFAULT_PAGE_SIZE,
      maximum: MAX_PAGE_SIZE,
      parameterName: "pageSize",
    }),
  };
}

function buildReviewFilter({ kanji, status, label }) {
  const conditions = [
    {
      source: "test_screen",
    },
    {
      feedbackType: "manual_debug",
    },
    {
      expectedKanji: kanji,
    },
    {
      isCorrect: {
        $type: "bool",
      },
    },
    {
      recognitionId: {
        $type: "string",
        $ne: "",
      },
    },
    {
      strokesNormalized: {
        $type: "array",
        $ne: [],
      },
    },
  ];

  if (label === "correct") {
    conditions.push({
      isCorrect: true,
    });
  }

  if (label === "incorrect") {
    conditions.push({
      isCorrect: false,
    });
  }

  if (status === "pending") {
    conditions.push({
      $or: [
        {
          datasetReviewStatus: "pending",
        },
        {
          datasetReviewStatus: {
            $exists: false,
          },
        },
        {
          datasetReviewStatus: null,
        },
      ],
    });
  } else if (status !== "all") {
    conditions.push({
      datasetReviewStatus: status,
    });
  }

  return {
    $and: conditions,
  };
}

function buildReviewProjection() {
  return {
    _id: 1,
    recognitionId: 1,
    kanji: 1,
    expectedKanji: 1,
    isCorrect: 1,
    datasetReviewStatus: 1,
    datasetReviewedAt: 1,
    exclusionReason: 1,
    strokesNormalized: 1,
    createdAt: 1,
    updatedAt: 1,
    labelUpdatedAt: 1,
    labelRevisions: 1,
    source: 1,
    feedbackType: 1,
    algorithmVersion: 1,
    schemaVersion: 1,
  };
}

function normalizeStoredReviewStatus(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return "pending";
  }

  const normalized = value.trim().toLowerCase();

  if (!REVIEW_STATUSES.includes(normalized) || normalized === "all") {
    return "pending";
  }

  return normalized;
}

function normalizeNormalizedStrokes(strokes) {
  if (!Array.isArray(strokes)) {
    return [];
  }

  return strokes
    .filter(
      (stroke) => stroke && Array.isArray(stroke.x) && Array.isArray(stroke.y),
    )
    .map((stroke) => {
      const pointCount = Math.min(stroke.x.length, stroke.y.length);

      return {
        x: stroke.x.slice(0, pointCount).map((value) => Number(value)),

        y: stroke.y.slice(0, pointCount).map((value) => Number(value)),
      };
    })
    .filter(
      (stroke) =>
        stroke.x.length >= 2 &&
        stroke.x.every(Number.isFinite) &&
        stroke.y.every(Number.isFinite),
    );
}

function mapReviewSample(document) {
  const strokesNormalized = normalizeNormalizedStrokes(
    document.strokesNormalized,
  );

  return {
    id:
      document._id === undefined || document._id === null
        ? null
        : String(document._id),

    recognitionId: document.recognitionId,

    kanji: document.kanji ?? document.expectedKanji,

    expectedKanji: document.expectedKanji ?? document.kanji,

    isCorrect: document.isCorrect,

    datasetReviewStatus: normalizeStoredReviewStatus(
      document.datasetReviewStatus,
    ),

    datasetReviewedAt: document.datasetReviewedAt ?? null,

    exclusionReason: document.exclusionReason ?? null,

    strokeCount: strokesNormalized.length,

    strokesNormalized,

    createdAt: document.createdAt ?? null,

    updatedAt: document.updatedAt ?? null,

    source: document.source ?? null,

    feedbackType: document.feedbackType ?? null,

    algorithmVersion: document.algorithmVersion ?? null,

    schemaVersion: document.schemaVersion ?? null,
  };
}

function normalizeRecognitionId(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new FeedbackReviewValidationError(
      "The recognitionId route parameter is required.",
      "recognition_id_required",
    );
  }

  return value.trim();
}

function normalizeLabelUpdate(body) {
  if (!body || typeof body.isCorrect !== "boolean") {
    throw new FeedbackReviewValidationError(
      "isCorrect must be a boolean.",
      "invalid_is_correct",
      {
        actualValue: body?.isCorrect,
      },
    );
  }

  return {
    isCorrect: body.isCorrect,
  };
}

function normalizeReviewDeviceForAudit(reviewDevice) {
  return {
    tokenId:
      typeof reviewDevice?.tokenId === "string" ? reviewDevice.tokenId : null,
    name: typeof reviewDevice?.name === "string" ? reviewDevice.name : null,
  };
}

function unwrapFindOneAndUpdateResult(result) {
  if (!result) {
    return null;
  }

  if (
    Object.hasOwn(result, "value") &&
    (result.value === null || typeof result.value === "object")
  ) {
    return result.value;
  }

  return result;
}

async function updateReviewSampleLabel({
  collection,
  recognitionId,
  isCorrect,
  reviewDevice,
  now = new Date(),
}) {
  if (!collection || typeof collection.findOneAndUpdate !== "function") {
    throw new Error(
      "A MongoDB feedback collection with findOneAndUpdate is required.",
    );
  }

  const normalizedRecognitionId = normalizeRecognitionId(recognitionId);

  const normalizedUpdate = normalizeLabelUpdate({
    isCorrect,
  });

  const reviewedAt = now.toISOString();

  const auditDevice = normalizeReviewDeviceForAudit(reviewDevice);

  const revision = {
    previousValue: "$isCorrect",
    newValue: normalizedUpdate.isCorrect,
    reviewedAt,
    reviewDevice: auditDevice,
  };

  const result = await collection.findOneAndUpdate(
    {
      recognitionId: normalizedRecognitionId,
      source: "test_screen",
      feedbackType: "manual_debug",
      isCorrect: {
        $type: "bool",
      },
    },
    [
      {
        $set: {
          labelRevisions: {
            $cond: [
              {
                $eq: ["$isCorrect", normalizedUpdate.isCorrect],
              },
              {
                $ifNull: ["$labelRevisions", []],
              },
              {
                $concatArrays: [
                  {
                    $ifNull: ["$labelRevisions", []],
                  },
                  [revision],
                ],
              },
            ],
          },
          labelUpdatedAt: {
            $cond: [
              {
                $eq: ["$isCorrect", normalizedUpdate.isCorrect],
              },
              "$labelUpdatedAt",
              reviewedAt,
            ],
          },
          updatedAt: {
            $cond: [
              {
                $eq: ["$isCorrect", normalizedUpdate.isCorrect],
              },
              "$updatedAt",
              reviewedAt,
            ],
          },
          isCorrect: normalizedUpdate.isCorrect,
        },
      },
    ],
    {
      returnDocument: "after",
      projection: buildReviewProjection(),
    },
  );

  const document = unwrapFindOneAndUpdateResult(result);

  if (!document) {
    return null;
  }

  return {
    changed: document.labelUpdatedAt === reviewedAt,
    sample: mapReviewSample(document),
  };
}

function calculateTotalPages({ total, pageSize }) {
  if (total === 0) {
    return 0;
  }

  return Math.ceil(total / pageSize);
}

async function listReviewSamples({ collection, query = {} }) {
  if (
    !collection ||
    typeof collection.countDocuments !== "function" ||
    typeof collection.find !== "function"
  ) {
    throw new Error("A MongoDB feedback collection is required.");
  }

  const parsedQuery = parseReviewQuery(query);

  const filter = buildReviewFilter(parsedQuery);

  const projection = buildReviewProjection();

  const skip = (parsedQuery.page - 1) * parsedQuery.pageSize;

  const [total, documents] = await Promise.all([
    collection.countDocuments(filter),

    collection
      .find(filter, {
        projection,
      })
      .sort({
        createdAt: -1,
        _id: -1,
      })
      .skip(skip)
      .limit(parsedQuery.pageSize)
      .toArray(),
  ]);

  const totalPages = calculateTotalPages({
    total,
    pageSize: parsedQuery.pageSize,
  });

  return {
    filters: {
      kanji: parsedQuery.kanji,

      status: parsedQuery.status,

      label: parsedQuery.label,

      source: "test_screen",

      feedbackType: "manual_debug",
    },

    page: parsedQuery.page,

    pageSize: parsedQuery.pageSize,

    total,

    totalPages,

    hasPreviousPage: parsedQuery.page > 1,

    hasNextPage: parsedQuery.page < totalPages,

    items: documents.map(mapReviewSample),
  };
}

module.exports = {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  REVIEW_STATUSES,
  LABEL_FILTERS,
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
  normalizeReviewDeviceForAudit,
  unwrapFindOneAndUpdateResult,
  updateReviewSampleLabel,
};
