"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  EXPECTED_SOURCE_NAMES,
  calculateFileSha256,
  resolvePortablePath,
  validateMetrics,
  validateSources,
  findAlternative,
  evaluateBaselineComparisonGate,
  formatMetrics,
} = require("../../scripts/validate_reference_candidate_baseline_comparison_quality_gate");

function createMetrics({
  truePositive,
  trueNegative,
  falsePositive,
  falseNegative,
}) {
  return {
    truePositive,
    trueNegative,
    falsePositive,
    falseNegative,
    rowCount: truePositive + trueNegative + falsePositive + falseNegative,
  };
}

function createAlternative({
  id,
  metrics,
  manualReviewRequired = false,
  automaticallyPromoted = false,
}) {
  return {
    id,
    label: id,
    evaluationScope: "test",
    metrics,
    fnSafe: metrics.falseNegative === 0,
    complexityRank: 1,
    evidenceLevel: "test",
    automaticallyPromoted,
    manualReviewRequired,
    limitations: [],
  };
}

function createTemporarySources() {
  const temporaryDirectory = fs.mkdtempSync(
    path.join(process.cwd(), "tmp-baseline-gate-"),
  );

  const sources = {};

  for (const sourceName of EXPECTED_SOURCE_NAMES) {
    const fileName = `${sourceName}.json`;

    const absolutePath = path.join(temporaryDirectory, fileName);

    fs.writeFileSync(
      absolutePath,
      JSON.stringify(
        {
          sourceName,
        },
        null,
        2,
      ),
      "utf8",
    );

    const portablePath = path
      .relative(process.cwd(), absolutePath)
      .split(path.sep)
      .join("/");

    sources[sourceName] = {
      path: portablePath,
      sha256: calculateFileSha256(absolutePath),
    };
  }

  return {
    temporaryDirectory,
    sources,
  };
}

function removeTemporaryDirectory(temporaryDirectory) {
  fs.rmSync(temporaryDirectory, {
    recursive: true,
    force: true,
  });
}

function createValidComparison(sources) {
  const descriptorMetrics = createMetrics({
    truePositive: 383,
    trueNegative: 126,
    falsePositive: 56,
    falseNegative: 0,
  });

  const fpSafeMetrics = createMetrics({
    truePositive: 383,
    trueNegative: 166,
    falsePositive: 16,
    falseNegative: 0,
  });

  const loocvPureMlMetrics = createMetrics({
    truePositive: 380,
    trueNegative: 86,
    falsePositive: 96,
    falseNegative: 3,
  });

  const loocvHybridMetrics = createMetrics({
    truePositive: 380,
    trueNegative: 133,
    falsePositive: 49,
    falseNegative: 3,
  });

  return {
    schemaVersion: 1,
    purpose: "Test baseline comparison",
    knownDataset: {
      descriptorMetrics,
      fpSafeMetrics,
      proposalCount: 14,
      proposalKanjis: [
        "一",
        "七",
        "八",
        "六",
        "四",
        "回",
        "山",
        "日",
        "木",
        "未",
        "末",
        "本",
        "用",
        "田",
      ],
      alternatives: [
        createAlternative({
          id: "descriptor_base",
          metrics: descriptorMetrics,
        }),
        createAlternative({
          id: "fp_safe_patch_proposals",
          metrics: fpSafeMetrics,
          manualReviewRequired: true,
          automaticallyPromoted: false,
        }),
      ],
    },
    developmentValidation: {
      alternatives: [],
    },
    leaveOneKanjiOut: {
      alternatives: [
        createAlternative({
          id: "loocv_descriptor",
          metrics: descriptorMetrics,
        }),
        createAlternative({
          id: "loocv_pure_ml",
          metrics: loocvPureMlMetrics,
        }),
        createAlternative({
          id: "loocv_hybrid",
          metrics: loocvHybridMetrics,
        }),
      ],
      hybridPromotionBlocked: true,
      affectedFalseNegativeKanjis: ["本", "木"],
      falseNegativeCount: 3,
    },
    finalDecision: {
      currentOfficialValidator: "descriptor_base",
      bestReviewableCandidate: "fp_safe_patch_proposals",
      pureMlPromotionReady: false,
      hybridPromotionReady: false,
      fpSafeAutomaticPromotionReady: false,
      productionPromotionReady: false,
    },
    integrity: {
      passed: true,
      errors: [],
    },
    sources,
  };
}

test("resolvePortablePath resolves a portable project path", () => {
  const result = resolvePortablePath("ml_models/report.json");

  assert.equal(result, path.resolve(process.cwd(), "ml_models", "report.json"));
});

test("resolvePortablePath rejects absolute paths", () => {
  const absolutePath = path.resolve(process.cwd(), "ml_models", "report.json");

  assert.throws(() => resolvePortablePath(absolutePath), /must be relative/);
});

test("resolvePortablePath rejects backslashes", () => {
  assert.throws(
    () => resolvePortablePath("ml_models\\report.json"),
    /must use forward slashes/,
  );
});

test("validateMetrics accepts a coherent confusion matrix", () => {
  const failures = validateMetrics({
    metrics: createMetrics({
      truePositive: 6,
      trueNegative: 2,
      falsePositive: 2,
      falseNegative: 0,
    }),
    location: "test.metrics",
    expectedRowCount: 10,
  });

  assert.deepEqual(failures, []);
});

test("validateMetrics detects invalid counts", () => {
  const failures = validateMetrics({
    metrics: {
      truePositive: 6,
      trueNegative: -1,
      falsePositive: 2,
      falseNegative: 0,
    },
    location: "test.metrics",
    expectedRowCount: 7,
  });

  assert.ok(
    failures.some((failure) => failure.code === "invalid_metric_count"),
  );
});

test("validateMetrics detects row count mismatch", () => {
  const failures = validateMetrics({
    metrics: createMetrics({
      truePositive: 6,
      trueNegative: 2,
      falsePositive: 2,
      falseNegative: 0,
    }),
    location: "test.metrics",
    expectedRowCount: 11,
  });

  assert.ok(
    failures.some((failure) => failure.code === "metric_row_count_mismatch"),
  );
});

test("validateSources accepts seven matching portable sources", () => {
  const { temporaryDirectory, sources } = createTemporarySources();

  try {
    const result = validateSources(sources);

    assert.deepEqual(result.failures, []);

    assert.equal(result.observed.length, 7);

    assert.ok(result.observed.every((source) => source.matches));
  } finally {
    removeTemporaryDirectory(temporaryDirectory);
  }
});

test("validateSources detects SHA-256 mismatch", () => {
  const { temporaryDirectory, sources } = createTemporarySources();

  try {
    sources.datasetSummary.sha256 = "0".repeat(64);

    const result = validateSources(sources);

    assert.ok(
      result.failures.some(
        (failure) => failure.code === "source_sha256_mismatch",
      ),
    );
  } finally {
    removeTemporaryDirectory(temporaryDirectory);
  }
});

test("validateSources detects missing required source", () => {
  const { temporaryDirectory, sources } = createTemporarySources();

  try {
    delete sources.diagnosisReport;

    const result = validateSources(sources);

    assert.ok(
      result.failures.some((failure) => failure.code === "missing_source"),
    );
  } finally {
    removeTemporaryDirectory(temporaryDirectory);
  }
});

test("validateSources detects unexpected sources", () => {
  const { temporaryDirectory, sources } = createTemporarySources();

  try {
    sources.unexpectedSource = {
      path: sources.datasetSummary.path,
      sha256: sources.datasetSummary.sha256,
    };

    const result = validateSources(sources);

    assert.ok(
      result.failures.some((failure) => failure.code === "unexpected_sources"),
    );
  } finally {
    removeTemporaryDirectory(temporaryDirectory);
  }
});

test("findAlternative returns an alternative by ID", () => {
  const alternatives = [
    {
      id: "descriptor_base",
    },
    {
      id: "fp_safe_patch_proposals",
    },
  ];

  assert.deepEqual(findAlternative(alternatives, "fp_safe_patch_proposals"), {
    id: "fp_safe_patch_proposals",
  });

  assert.equal(findAlternative(alternatives, "missing"), null);
});

test("evaluateBaselineComparisonGate closes phase one for a coherent decision", () => {
  const { temporaryDirectory, sources } = createTemporarySources();

  try {
    const comparison = createValidComparison(sources);

    const result = evaluateBaselineComparisonGate(comparison);

    assert.equal(result.technicalGatePassed, true);

    assert.equal(result.decisionGatePassed, true);

    assert.equal(result.phaseOneCompleted, true);

    assert.equal(result.productionPromotionReady, false);

    assert.deepEqual(result.technicalFailures, []);

    assert.deepEqual(result.decisionFailures, []);

    assert.equal(result.observed.knownDatasetFpReduction, 40);

    assert.equal(result.observed.proposalCount, 14);

    assert.equal(result.observed.loocvPureMlFalseNegative, 3);

    assert.equal(result.observed.loocvHybridFalseNegative, 3);

    assert.deepEqual(result.observed.affectedFalseNegativeKanjis, ["本", "木"]);

    assert.equal(result.observed.sourceCount, 7);
  } finally {
    removeTemporaryDirectory(temporaryDirectory);
  }
});

test("evaluateBaselineComparisonGate rejects FP-safe false negatives", () => {
  const { temporaryDirectory, sources } = createTemporarySources();

  try {
    const comparison = createValidComparison(sources);

    comparison.knownDataset.fpSafeMetrics = createMetrics({
      truePositive: 382,
      trueNegative: 166,
      falsePositive: 16,
      falseNegative: 1,
    });

    comparison.knownDataset.alternatives.find(
      (alternative) => alternative.id === "fp_safe_patch_proposals",
    ).metrics = comparison.knownDataset.fpSafeMetrics;

    const result = evaluateBaselineComparisonGate(comparison);

    assert.equal(result.decisionGatePassed, false);

    assert.equal(result.phaseOneCompleted, false);

    assert.ok(
      result.decisionFailures.some(
        (failure) => failure.code === "fp_safe_candidate_not_fn_safe",
      ),
    );
  } finally {
    removeTemporaryDirectory(temporaryDirectory);
  }
});

test("evaluateBaselineComparisonGate rejects automatic FP-safe promotion", () => {
  const { temporaryDirectory, sources } = createTemporarySources();

  try {
    const comparison = createValidComparison(sources);

    const fpSafeAlternative = comparison.knownDataset.alternatives.find(
      (alternative) => alternative.id === "fp_safe_patch_proposals",
    );

    fpSafeAlternative.automaticallyPromoted = true;

    const result = evaluateBaselineComparisonGate(comparison);

    assert.equal(result.decisionGatePassed, false);

    assert.ok(
      result.decisionFailures.some(
        (failure) => failure.code === "fp_safe_automatic_promotion_detected",
      ),
    );
  } finally {
    removeTemporaryDirectory(temporaryDirectory);
  }
});

test("evaluateBaselineComparisonGate rejects a promoted hybrid", () => {
  const { temporaryDirectory, sources } = createTemporarySources();

  try {
    const comparison = createValidComparison(sources);

    comparison.finalDecision.hybridPromotionReady = true;

    const result = evaluateBaselineComparisonGate(comparison);

    assert.equal(result.decisionGatePassed, false);

    assert.ok(
      result.decisionFailures.some(
        (failure) => failure.code === "hybrid_promotion_ready",
      ),
    );
  } finally {
    removeTemporaryDirectory(temporaryDirectory);
  }
});

test("evaluateBaselineComparisonGate rejects production promotion", () => {
  const { temporaryDirectory, sources } = createTemporarySources();

  try {
    const comparison = createValidComparison(sources);

    comparison.finalDecision.productionPromotionReady = true;

    const result = evaluateBaselineComparisonGate(comparison);

    assert.equal(result.decisionGatePassed, false);

    assert.equal(result.productionPromotionReady, false);

    assert.ok(
      result.decisionFailures.some(
        (failure) => failure.code === "production_promotion_ready",
      ),
    );
  } finally {
    removeTemporaryDirectory(temporaryDirectory);
  }
});

test("formatMetrics formats the confusion matrix", () => {
  assert.equal(
    formatMetrics({
      truePositive: 383,
      trueNegative: 166,
      falsePositive: 16,
      falseNegative: 0,
    }),
    "TP=383, TN=166, FP=16, FN=0",
  );

  assert.equal(formatMetrics(null), "n/a");
});
