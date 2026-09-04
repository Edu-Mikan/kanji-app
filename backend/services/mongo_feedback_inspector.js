"use strict";

const VALID_REVIEW_STATUSES = [
  "pending",
  "approved",
  "excluded",
  "needs_review",
];

const STROKE_SOURCES = [
  {
    field: "strokesNormalized",
    status: "valid_normalized_strokes",
  },
  {
    field: "strokesRaw",
    status: "valid_raw_strokes",
  },
  {
    field: "strokesResampled",
    status: "valid_resampled_strokes",
  },
  {
    field: "strokes",
    status: "valid_legacy_strokes",
  },
];

function isSingleCharacter(value) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    Array.from(value.trim()).length === 1
  );
}

function normalizeOptionalString(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function isValidStroke(stroke) {
  return (
    stroke !== null &&
    typeof stroke === "object" &&
    !Array.isArray(stroke) &&
    Array.isArray(stroke.x) &&
    Array.isArray(stroke.y) &&
    stroke.x.length >= 2 &&
    stroke.x.length === stroke.y.length &&
    stroke.x.every(Number.isFinite) &&
    stroke.y.every(Number.isFinite)
  );
}

function validateStrokeCollection(strokes) {
  if (!Array.isArray(strokes) || strokes.length === 0) {
    return {
      valid: false,
      strokeCount: 0,
      invalidStrokeIndexes: [],
    };
  }

  const invalidStrokeIndexes = [];

  for (let index = 0; index < strokes.length; index++) {
    if (!isValidStroke(strokes[index])) {
      invalidStrokeIndexes.push(index);
    }
  }

  return {
    valid: invalidStrokeIndexes.length === 0,
    strokeCount: strokes.length,
    invalidStrokeIndexes,
  };
}

function inspectStoredReviewStatus(value) {
  const missing = value === undefined || value === null || value === "";

  if (missing) {
    return {
      storedValue: null,
      effectiveStatus: "pending",
      valid: true,
      missing: true,
    };
  }

  if (typeof value !== "string") {
    return {
      storedValue: value,
      effectiveStatus: "pending",
      valid: false,
      missing: false,
    };
  }

  const normalized = value.trim().toLowerCase();
  const valid = VALID_REVIEW_STATUSES.includes(normalized);

  return {
    storedValue: value,
    effectiveStatus: valid ? normalized : "pending",
    valid,
    missing: false,
  };
}

function hasFiniteGeometryStroke(stroke) {
  if (!stroke || typeof stroke !== "object" || Array.isArray(stroke)) {
    return false;
  }

  const requiredNumericFields = [
    "index",
    "minX",
    "maxX",
    "minY",
    "maxY",
    "width",
    "height",
  ];

  return requiredNumericFields.every((field) => Number.isFinite(stroke[field]));
}

function hasUsableGeometry(geometry) {
  if (!geometry || typeof geometry !== "object" || Array.isArray(geometry)) {
    return false;
  }

  if (
    !Number.isFinite(geometry.bboxWidth) ||
    !Number.isFinite(geometry.bboxHeight) ||
    !Number.isFinite(geometry.aspectRatio)
  ) {
    return false;
  }

  if (!Array.isArray(geometry.perStroke) || geometry.perStroke.length === 0) {
    return false;
  }

  return geometry.perStroke.every(hasFiniteGeometryStroke);
}

function normalizeSet(value) {
  if (value instanceof Set) {
    return value;
  }

  if (Array.isArray(value)) {
    return new Set(value);
  }

  return new Set();
}

function normalizeCatalogContext(context = {}) {
  return {
    canonicalKanjis: normalizeSet(context.canonicalKanjis),
    approvedDescriptorKanjis: normalizeSet(context.approvedDescriptorKanjis),
    externalUnseenKanjis: normalizeSet(context.externalUnseenKanjis),
    explicitRequirementKanjis: normalizeSet(context.explicitRequirementKanjis),
  };
}

function inspectCatalogStatus(expectedKanji, context) {
  const normalizedContext = normalizeCatalogContext(context);

  return {
    hasCanonicalReference:
      expectedKanji !== null &&
      normalizedContext.canonicalKanjis.has(expectedKanji),
    hasApprovedDescriptor:
      expectedKanji !== null &&
      normalizedContext.approvedDescriptorKanjis.has(expectedKanji),
    isExternalUnseen:
      expectedKanji !== null &&
      normalizedContext.externalUnseenKanjis.has(expectedKanji),
    isExplicitRequirement:
      expectedKanji !== null &&
      normalizedContext.explicitRequirementKanjis.has(expectedKanji),
  };
}

function inspectStrokeStatus(document) {
  let hasPresentStrokeField = false;

  for (const source of STROKE_SOURCES) {
    const value = document?.[source.field];

    if (value !== undefined && value !== null) {
      hasPresentStrokeField = true;
    }

    const validation = validateStrokeCollection(value);

    if (validation.valid) {
      return {
        status: source.status,
        sourceField: source.field,
        strokeCount: validation.strokeCount,
        invalidStrokeIndexes: [],
      };
    }
  }

  return {
    status: hasPresentStrokeField ? "invalid_strokes" : "missing_strokes",
    sourceField: null,
    strokeCount: 0,
    invalidStrokeIndexes: [],
  };
}

function inspectFeatureStatus({
  document,
  strokeInspection,
  catalogInspection,
}) {
  if (hasUsableGeometry(document?.features?.geometry)) {
    return "geometry_available";
  }

  const hasValidStrokes =
    strokeInspection.status !== "invalid_strokes" &&
    strokeInspection.status !== "missing_strokes";

  if (hasValidStrokes && catalogInspection.hasCanonicalReference) {
    return "reconstructible";
  }

  return "not_preparable";
}

function inspectFeedbackSample(document, context = {}) {
  const reasons = [];

  const recognitionId = normalizeOptionalString(document?.recognitionId);
  if (recognitionId === null) {
    reasons.push("invalid_recognition_id");
  }

  const expectedKanjiValue = document?.expectedKanji ?? document?.kanji ?? null;
  const expectedKanji = isSingleCharacter(expectedKanjiValue)
    ? expectedKanjiValue.trim()
    : null;

  if (expectedKanji === null) {
    reasons.push("invalid_expected_kanji");
  }

  const isCorrect =
    typeof document?.isCorrect === "boolean" ? document.isCorrect : null;

  if (isCorrect === null) {
    reasons.push("invalid_is_correct");
  }

  const source = normalizeOptionalString(document?.source);
  if (source !== "test_screen") {
    reasons.push("source_not_test_screen");
  }

  const feedbackType = normalizeOptionalString(document?.feedbackType);
  if (feedbackType !== "manual_debug") {
    reasons.push("feedback_type_not_manual_debug");
  }

  const review = inspectStoredReviewStatus(document?.datasetReviewStatus);

  if (!review.valid) {
    reasons.push("invalid_dataset_review_status");
  } else if (review.effectiveStatus === "excluded") {
    reasons.push("dataset_review_status_excluded");
  } else if (review.effectiveStatus === "needs_review") {
    reasons.push("dataset_review_status_needs_review");
  }

  const catalog = inspectCatalogStatus(expectedKanji, context);
  const strokeInspection = inspectStrokeStatus(document);

  if (strokeInspection.status === "missing_strokes") {
    reasons.push("missing_strokes");
  } else if (strokeInspection.status === "invalid_strokes") {
    reasons.push("invalid_strokes");
  }

  const featureStatus = inspectFeatureStatus({
    document,
    strokeInspection,
    catalogInspection: catalog,
  });

  if (
    featureStatus === "not_preparable" &&
    expectedKanji !== null &&
    !catalog.hasCanonicalReference
  ) {
    reasons.push("missing_canonical_reference");
  }

  return {
    id:
      document?._id === undefined || document?._id === null
        ? null
        : String(document._id),
    recognitionId,
    kanji: normalizeOptionalString(document?.kanji),
    expectedKanji,
    isCorrect,
    source,
    feedbackType,
    classification: reasons.length === 0 ? "reliable" : "excluded",
    reasons,
    strokeStatus: strokeInspection.status,
    strokeSourceField: strokeInspection.sourceField,
    strokeCount: strokeInspection.strokeCount,
    featureStatus,
    review,
    catalog,
    schemaVersion: document?.schemaVersion ?? null,
    algorithmVersion: document?.algorithmVersion ?? null,
    createdAt: document?.createdAt ?? null,
    updatedAt: document?.updatedAt ?? null,
    labelUpdatedAt: document?.labelUpdatedAt ?? null,
  };
}

function compareKanjis(left, right) {
  return left.codePointAt(0) - right.codePointAt(0);
}

function incrementCount(counts, key) {
  counts[key] = (counts[key] ?? 0) + 1;
}

function sortCountObject(counts) {
  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) =>
      left.localeCompare(right, "en"),
    ),
  );
}

function getStoredReviewStatusCountKey(review) {
  if (review?.missing === true) {
    return "<missing>";
  }

  if (
    typeof review?.storedValue === "string" &&
    review.storedValue.trim().length > 0
  ) {
    return review.storedValue.trim().toLowerCase();
  }

  return "<invalid>";
}

function buildDuplicateRecognitionIdDiagnostics(samples) {
  const countsByRecognitionId = new Map();

  for (const sample of samples) {
    const recognitionId = sample.recognitionId;

    if (typeof recognitionId !== "string" || recognitionId.length === 0) {
      continue;
    }

    countsByRecognitionId.set(
      recognitionId,
      (countsByRecognitionId.get(recognitionId) ?? 0) + 1,
    );
  }

  const duplicateRecognitionIds = [...countsByRecognitionId.entries()]
    .filter(([, count]) => count > 1)
    .map(([recognitionId, count]) => ({
      recognitionId,
      count,
    }))
    .sort((left, right) =>
      left.recognitionId.localeCompare(right.recognitionId, "en"),
    );

  return {
    duplicateRecognitionIdCount: duplicateRecognitionIds.length,

    duplicateSampleCount: duplicateRecognitionIds.reduce(
      (total, duplicate) => total + duplicate.count,
      0,
    ),

    duplicateRecognitionIds,
  };
}

function buildInspectionDiagnostics(samples) {
  const reasonCounts = {};
  const sourceCounts = {};
  const feedbackTypeCounts = {};
  const storedReviewStatusCounts = {};
  const effectiveReviewStatusCounts = {};
  const strokeStatusCounts = {};
  const featureStatusCounts = {};

  const catalogCounts = {
    withCanonicalReference: 0,
    withoutCanonicalReference: 0,
    withApprovedDescriptor: 0,
    withoutApprovedDescriptor: 0,
    externalUnseen: 0,
    explicitRequirement: 0,
  };

  for (const sample of samples) {
    for (const reason of sample.reasons ?? []) {
      incrementCount(reasonCounts, reason);
    }

    incrementCount(sourceCounts, sample.source ?? "<missing>");

    incrementCount(feedbackTypeCounts, sample.feedbackType ?? "<missing>");

    incrementCount(
      storedReviewStatusCounts,
      getStoredReviewStatusCountKey(sample.review),
    );

    incrementCount(
      effectiveReviewStatusCounts,
      sample.review?.effectiveStatus ?? "<missing>",
    );

    incrementCount(strokeStatusCounts, sample.strokeStatus ?? "<missing>");

    incrementCount(featureStatusCounts, sample.featureStatus ?? "<missing>");

    if (sample.catalog?.hasCanonicalReference === true) {
      catalogCounts.withCanonicalReference++;
    } else {
      catalogCounts.withoutCanonicalReference++;
    }

    if (sample.catalog?.hasApprovedDescriptor === true) {
      catalogCounts.withApprovedDescriptor++;
    } else {
      catalogCounts.withoutApprovedDescriptor++;
    }

    if (sample.catalog?.isExternalUnseen === true) {
      catalogCounts.externalUnseen++;
    }

    if (sample.catalog?.isExplicitRequirement === true) {
      catalogCounts.explicitRequirement++;
    }
  }

  return {
    reasonCounts: sortCountObject(reasonCounts),
    sourceCounts: sortCountObject(sourceCounts),

    feedbackTypeCounts: sortCountObject(feedbackTypeCounts),

    storedReviewStatusCounts: sortCountObject(storedReviewStatusCounts),

    effectiveReviewStatusCounts: sortCountObject(effectiveReviewStatusCounts),

    strokeStatusCounts: sortCountObject(strokeStatusCounts),

    featureStatusCounts: sortCountObject(featureStatusCounts),

    catalogCounts,

    ...buildDuplicateRecognitionIdDiagnostics(samples),
  };
}

function inspectFeedbackSamples(documents, context = {}) {
  if (!Array.isArray(documents)) {
    throw new TypeError("documents must be an array.");
  }

  const samples = documents.map((document) =>
    inspectFeedbackSample(document, context),
  );

  const reliableCount = samples.filter(
    (sample) => sample.classification === "reliable",
  ).length;

  const byKanjiMap = new Map();

  for (const sample of samples) {
    const kanji = sample.expectedKanji ?? "UNKNOWN";

    const current = byKanjiMap.get(kanji) ?? {
      kanji,
      total: 0,
      reliableCount: 0,
      excludedCount: 0,
      geometryAvailableCount: 0,
      reconstructibleCount: 0,
      notPreparableCount: 0,
    };

    current.total++;

    if (sample.classification === "reliable") {
      current.reliableCount++;
    } else {
      current.excludedCount++;
    }

    if (sample.featureStatus === "geometry_available") {
      current.geometryAvailableCount++;
    } else if (sample.featureStatus === "reconstructible") {
      current.reconstructibleCount++;
    } else {
      current.notPreparableCount++;
    }

    byKanjiMap.set(kanji, current);
  }

  const orderedKanjis = [...byKanjiMap.keys()].sort((left, right) => {
    if (left === "UNKNOWN") {
      return 1;
    }

    if (right === "UNKNOWN") {
      return -1;
    }

    return compareKanjis(left, right);
  });

  const byKanji = {};

  for (const kanji of orderedKanjis) {
    byKanji[kanji] = byKanjiMap.get(kanji);
  }

  return {
    totalSamples: samples.length,
    reliableCount,
    excludedCount: samples.length - reliableCount,
    byKanji,
    diagnostics: buildInspectionDiagnostics(samples),
    samples,
  };
}

module.exports = {
  VALID_REVIEW_STATUSES,
  STROKE_SOURCES,
  isSingleCharacter,
  normalizeOptionalString,
  isValidStroke,
  validateStrokeCollection,
  inspectStoredReviewStatus,
  hasUsableGeometry,
  normalizeCatalogContext,
  inspectCatalogStatus,
  inspectStrokeStatus,
  inspectFeatureStatus,
  inspectFeedbackSample,
  incrementCount,
  sortCountObject,
  getStoredReviewStatusCountKey,
  buildDuplicateRecognitionIdDiagnostics,
  buildInspectionDiagnostics,
  inspectFeedbackSamples,
};
