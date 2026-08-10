"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
  buildPortablePath,
  calculateRowCount,
  buildMetrics,
  buildDescriptorMetrics,
  sumSuggestionRows,
  sumProposalImpacts,
  buildFpSafeMetrics,
  validateKnownDatasetComparison,
  buildAlternative,
  selectRecommendedAlternative,
  buildComparison,
  formatMetrics,
} = require("../../scripts/compare_reference_candidate_baseline_alternatives");

function createDatasetSummary() {
  return {
    rowCount: 10,
    classificationCounts: {
      truePositive: 6,
      trueNegative: 2,
      falsePositive: 2,
    },
  };
}

function createSuggestionRows() {
  return [
    {
      kanji: "木",
      before: {
        truePositive: 3,
        trueNegative: 1,
        falsePositive: 1,
        falseNegative: 0,
      },
      after: {
        truePositive: 3,
        trueNegative: 2,
        falsePositive: 0,
        falseNegative: 0,
      },
      actualFalsePositiveReduction: 1,
      actualFalseNegativeIncrease: 0,
      actualTruePositiveLoss: 0,
      safe: true,
    },
    {
      kanji: "本",
      before: {
        truePositive: 3,
        trueNegative: 1,
        falsePositive: 1,
        falseNegative: 0,
      },
      after: {
        truePositive: 3,
        trueNegative: 2,
        falsePositive: 0,
        falseNegative: 0,
      },
      actualFalsePositiveReduction: 1,
      actualFalseNegativeIncrease: 0,
      actualTruePositiveLoss: 0,
      safe: true,
    },
  ];
}

function createFpSuggestionSummary() {
  return {
    targetCount: 2,
    evaluatedCount: 2,
    errorCount: 0,
    safeEvaluationCount: 2,
    totalFalsePositiveBefore: 2,
    totalFalsePositiveAfter: 0,
    totalFalsePositiveReduction: 2,
    totalFalseNegativeIncrease: 0,
    totalTruePositiveLoss: 0,
    passed: true,
    rows: createSuggestionRows(),
  };
}

function createProposals() {
  return [
    {
      kanji: "木",
      impact: {
        falsePositiveReduction: 1,
        falseNegativeIncrease: 0,
        truePositiveLoss: 0,
      },
    },
    {
      kanji: "本",
      impact: {
        falsePositiveReduction: 1,
        falseNegativeIncrease: 0,
        truePositiveLoss: 0,
      },
    },
  ];
}

function createFpProposals() {
  return {
    proposalCount: 2,
    rejectedCount: 0,
    totalFalsePositiveReduction: 2,
    totalFalseNegativeIncrease: 0,
    totalTruePositiveLoss: 0,
    proposals: createProposals(),
  };
}

function createGenerationStatus() {
  return {
    fpSuggestionQuality: {
      totalFalsePositiveReduction: 2,
    },
    patchProposalQuality: {
      totalFalsePositiveReduction: 2,
    },
  };
}

function createMetrics({
  truePositive,
  trueNegative,
  falsePositive,
  falseNegative,
}) {
  return buildMetrics({
    truePositive,
    trueNegative,
    falsePositive,
    falseNegative,
  });
}

function createHybridDevelopmentReport() {
  return {
    validation: {
      descriptorMetrics: createMetrics({
        truePositive: 4,
        trueNegative: 2,
        falsePositive: 1,
        falseNegative: 0,
      }),
      pureMlMetrics: createMetrics({
        truePositive: 4,
        trueNegative: 1,
        falsePositive: 2,
        falseNegative: 0,
      }),
      hybridMetrics: createMetrics({
        truePositive: 4,
        trueNegative: 3,
        falsePositive: 0,
        falseNegative: 0,
      }),
    },
  };
}

function createLoocvReport() {
  return {
    aggregate: {
      descriptorMetrics: createMetrics({
        truePositive: 6,
        trueNegative: 2,
        falsePositive: 2,
        falseNegative: 0,
      }),
      pureMlMetrics: createMetrics({
        truePositive: 5,
        trueNegative: 1,
        falsePositive: 3,
        falseNegative: 1,
      }),
      hybridMetrics: createMetrics({
        truePositive: 5,
        trueNegative: 3,
        falsePositive: 1,
        falseNegative: 1,
      }),
    },
  };
}

function createDiagnosisReport() {
  return {
    summary: {
      affectedKanjis: ["木"],
      falseNegativeCount: 1,
    },
  };
}

test("buildPortablePath returns a relative slash-normalized path", () => {
  const absolutePath = path.resolve(process.cwd(), "ml_models", "report.json");

  const portablePath = buildPortablePath(absolutePath);

  assert.equal(portablePath, "ml_models/report.json");
});

test("calculateRowCount sums a confusion matrix", () => {
  const rowCount = calculateRowCount({
    truePositive: 6,
    trueNegative: 2,
    falsePositive: 2,
    falseNegative: 0,
  });

  assert.equal(rowCount, 10);
});

test("buildMetrics calculates classification metrics", () => {
  const metrics = buildMetrics({
    truePositive: 6,
    trueNegative: 2,
    falsePositive: 2,
    falseNegative: 0,
  });

  assert.equal(metrics.rowCount, 10);

  assert.equal(metrics.accuracy, 0.8);

  assert.equal(metrics.recall, 1);

  assert.equal(metrics.specificity, 0.5);

  assert.equal(metrics.precision, 0.75);
});

test("buildDescriptorMetrics reads dataset classifications", () => {
  const metrics = buildDescriptorMetrics(createDatasetSummary());

  assert.deepEqual(
    {
      truePositive: metrics.truePositive,
      trueNegative: metrics.trueNegative,
      falsePositive: metrics.falsePositive,
      falseNegative: metrics.falseNegative,
      rowCount: metrics.rowCount,
    },
    {
      truePositive: 6,
      trueNegative: 2,
      falsePositive: 2,
      falseNegative: 0,
      rowCount: 10,
    },
  );
});

test("sumSuggestionRows aggregates FP-safe evidence", () => {
  const totals = sumSuggestionRows(createSuggestionRows());

  assert.deepEqual(totals, {
    fpBefore: 2,
    fpAfter: 0,
    fpReduction: 2,
    fnIncrease: 0,
    tpLoss: 0,
  });
});

test("sumProposalImpacts aggregates proposal evidence", () => {
  const totals = sumProposalImpacts(createProposals());

  assert.deepEqual(totals, {
    fpReduction: 2,
    fnIncrease: 0,
    tpLoss: 0,
  });
});

test("buildFpSafeMetrics converts rejected false positives into true negatives", () => {
  const descriptorMetrics = buildDescriptorMetrics(createDatasetSummary());

  const metrics = buildFpSafeMetrics({
    descriptorMetrics,
    fpSuggestionSummary: createFpSuggestionSummary(),
  });

  assert.deepEqual(
    {
      truePositive: metrics.truePositive,
      trueNegative: metrics.trueNegative,
      falsePositive: metrics.falsePositive,
      falseNegative: metrics.falseNegative,
      rowCount: metrics.rowCount,
    },
    {
      truePositive: 6,
      trueNegative: 4,
      falsePositive: 0,
      falseNegative: 0,
      rowCount: 10,
    },
  );
});

test("validateKnownDatasetComparison accepts coherent evidence", () => {
  const datasetSummary = createDatasetSummary();

  const descriptorMetrics = buildDescriptorMetrics(datasetSummary);

  const fpSuggestionSummary = createFpSuggestionSummary();

  const fpProposals = createFpProposals();

  const fpSafeMetrics = buildFpSafeMetrics({
    descriptorMetrics,
    fpSuggestionSummary,
  });

  const result = validateKnownDatasetComparison({
    datasetSummary,
    descriptorMetrics,
    fpSafeMetrics,
    fpSuggestionSummary,
    fpProposals,
    generationStatus: createGenerationStatus(),
  });

  assert.equal(result.passed, true);

  assert.deepEqual(result.errors, []);

  assert.deepEqual(result.rowTotals, {
    fpBefore: 2,
    fpAfter: 0,
    fpReduction: 2,
    fnIncrease: 0,
    tpLoss: 0,
  });

  assert.deepEqual(result.proposalTotals, {
    fpReduction: 2,
    fnIncrease: 0,
    tpLoss: 0,
  });
});

test("validateKnownDatasetComparison detects proposal tampering", () => {
  const datasetSummary = createDatasetSummary();

  const descriptorMetrics = buildDescriptorMetrics(datasetSummary);

  const fpSuggestionSummary = createFpSuggestionSummary();

  const fpProposals = createFpProposals();

  fpProposals.proposals[0].impact.falsePositiveReduction = 99;

  const fpSafeMetrics = buildFpSafeMetrics({
    descriptorMetrics,
    fpSuggestionSummary,
  });

  const result = validateKnownDatasetComparison({
    datasetSummary,
    descriptorMetrics,
    fpSafeMetrics,
    fpSuggestionSummary,
    fpProposals,
    generationStatus: createGenerationStatus(),
  });

  assert.equal(result.passed, false);

  assert.ok(
    result.errors.some((error) => error.includes("Proposal FP reduction")),
  );
});

test("selectRecommendedAlternative prioritizes false-negative safety", () => {
  const alternatives = [
    buildAlternative({
      id: "unsafe",
      label: "Unsafe",
      evaluationScope: "test",
      metrics: createMetrics({
        truePositive: 5,
        trueNegative: 4,
        falsePositive: 0,
        falseNegative: 1,
      }),
      complexityRank: 1,
      evidenceLevel: "test",
    }),
    buildAlternative({
      id: "safe",
      label: "Safe",
      evaluationScope: "test",
      metrics: createMetrics({
        truePositive: 6,
        trueNegative: 2,
        falsePositive: 2,
        falseNegative: 0,
      }),
      complexityRank: 2,
      evidenceLevel: "test",
    }),
  ];

  const recommended = selectRecommendedAlternative(alternatives);

  assert.equal(recommended.id, "safe");
});

test("selectRecommendedAlternative minimizes false positives after FN safety", () => {
  const alternatives = [
    buildAlternative({
      id: "more-fp",
      label: "More FP",
      evaluationScope: "test",
      metrics: createMetrics({
        truePositive: 6,
        trueNegative: 2,
        falsePositive: 2,
        falseNegative: 0,
      }),
      complexityRank: 1,
      evidenceLevel: "test",
    }),
    buildAlternative({
      id: "fewer-fp",
      label: "Fewer FP",
      evaluationScope: "test",
      metrics: createMetrics({
        truePositive: 6,
        trueNegative: 3,
        falsePositive: 1,
        falseNegative: 0,
      }),
      complexityRank: 3,
      evidenceLevel: "test",
    }),
  ];

  const recommended = selectRecommendedAlternative(alternatives);

  assert.equal(recommended.id, "fewer-fp");
});

test("selectRecommendedAlternative prefers simplicity on equal false positives", () => {
  const alternatives = [
    buildAlternative({
      id: "complex",
      label: "Complex",
      evaluationScope: "test",
      metrics: createMetrics({
        truePositive: 6,
        trueNegative: 3,
        falsePositive: 1,
        falseNegative: 0,
      }),
      complexityRank: 4,
      evidenceLevel: "test",
    }),
    buildAlternative({
      id: "simple",
      label: "Simple",
      evaluationScope: "test",
      metrics: createMetrics({
        truePositive: 6,
        trueNegative: 3,
        falsePositive: 1,
        falseNegative: 0,
      }),
      complexityRank: 1,
      evidenceLevel: "test",
    }),
  ];

  const recommended = selectRecommendedAlternative(alternatives);

  assert.equal(recommended.id, "simple");
});

test("selectRecommendedAlternative returns null without FN-safe alternatives", () => {
  const alternatives = [
    buildAlternative({
      id: "unsafe-a",
      label: "Unsafe A",
      evaluationScope: "test",
      metrics: createMetrics({
        truePositive: 5,
        trueNegative: 3,
        falsePositive: 1,
        falseNegative: 1,
      }),
      complexityRank: 1,
      evidenceLevel: "test",
    }),
    buildAlternative({
      id: "unsafe-b",
      label: "Unsafe B",
      evaluationScope: "test",
      metrics: createMetrics({
        truePositive: 4,
        trueNegative: 4,
        falsePositive: 0,
        falseNegative: 2,
      }),
      complexityRank: 2,
      evidenceLevel: "test",
    }),
  ];

  const recommended = selectRecommendedAlternative(alternatives);

  assert.equal(recommended, null);
});

test("buildComparison keeps evaluation scopes separated", () => {
  const comparison = buildComparison({
    datasetSummary: createDatasetSummary(),
    fpSuggestionSummary: createFpSuggestionSummary(),
    fpProposals: createFpProposals(),
    generationStatus: createGenerationStatus(),
    hybridDevelopmentReport: createHybridDevelopmentReport(),
    loocvReport: createLoocvReport(),
    diagnosisReport: createDiagnosisReport(),
  });

  assert.equal(comparison.integrity.passed, true);

  assert.equal(
    comparison.knownDataset.recommendedCandidateId,
    "fp_safe_patch_proposals",
  );

  assert.equal(
    comparison.finalDecision.currentOfficialValidator,
    "descriptor_base",
  );

  assert.equal(
    comparison.finalDecision.bestReviewableCandidate,
    "fp_safe_patch_proposals",
  );

  assert.equal(comparison.leaveOneKanjiOut.hybridPromotionBlocked, true);

  assert.deepEqual(comparison.leaveOneKanjiOut.affectedFalseNegativeKanjis, [
    "木",
  ]);

  assert.equal(comparison.leaveOneKanjiOut.falseNegativeCount, 1);

  assert.equal(comparison.finalDecision.productionPromotionReady, false);

  assert.equal(
    comparison.knownDataset.alternatives[0].evaluationScope,
    "known_full_dataset",
  );

  assert.equal(
    comparison.developmentValidation.alternatives[0].evaluationScope,
    "row_level_development_validation",
  );

  assert.equal(
    comparison.leaveOneKanjiOut.alternatives[0].evaluationScope,
    "leave_one_target_kanji_out",
  );
});

test("formatMetrics formats confusion counts", () => {
  const formatted = formatMetrics({
    truePositive: 383,
    trueNegative: 166,
    falsePositive: 16,
    falseNegative: 0,
  });

  assert.equal(formatted, "TP=383, TN=166, FP=16, FN=0");
});
