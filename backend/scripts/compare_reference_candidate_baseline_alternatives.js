"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const DEFAULT_DATASET_SUMMARY_PATH = path.resolve(
  process.cwd(),
  "ml_datasets",
  "reference_candidate_binary_dataset_summary.json",
);

const DEFAULT_FP_SUGGESTION_PATH = path.resolve(
  process.cwd(),
  "candidate_reports_training",
  "reference_candidate_fp_constraint_suggestion_batch_summary.json",
);

const DEFAULT_FP_PROPOSALS_PATH = path.resolve(
  process.cwd(),
  "candidate_reports_training",
  "reference_candidate_fp_constraint_patch_proposals.json",
);

const DEFAULT_GENERATION_STATUS_PATH = path.resolve(
  process.cwd(),
  "candidate_reports_training",
  "reference_candidate_generation_status_summary.json",
);

const DEFAULT_HYBRID_DEVELOPMENT_PATH = path.resolve(
  process.cwd(),
  "ml_models",
  "reference_candidate_logistic_hybrid_evaluation_report.json",
);

const DEFAULT_LOOCV_PATH = path.resolve(
  process.cwd(),
  "ml_models",
  "reference_candidate_logistic_leave_one_kanji_out_report.json",
);

const DEFAULT_DIAGNOSIS_PATH = path.resolve(
  process.cwd(),
  "ml_models",
  "reference_candidate_logistic_leave_one_kanji_out_diagnosis.json",
);

const DEFAULT_OUTPUT_PATH = path.resolve(
  process.cwd(),
  "ml_models",
  "reference_candidate_baseline_comparison.json",
);

function assertFileExists(filePath, label) {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error(`${label} not found: ${filePath}`);
  }

  if (!fs.statSync(filePath).isFile()) {
    throw new Error(`${label} is not a file: ${filePath}`);
  }
}

function readJson(filePath, label) {
  assertFileExists(filePath, label);

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`${label} contains invalid JSON: ${error.message}`);
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), {
    recursive: true,
  });

  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function calculateFileSha256(filePath) {
  assertFileExists(filePath, "File");

  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(filePath))
    .digest("hex");
}

function buildPortablePath(filePath) {
  return path.relative(process.cwd(), filePath).split(path.sep).join("/");
}

function calculateRowCount(metrics) {
  return (
    metrics.truePositive +
    metrics.trueNegative +
    metrics.falsePositive +
    metrics.falseNegative
  );
}

function buildMetrics({
  truePositive,
  trueNegative,
  falsePositive,
  falseNegative,
}) {
  const positiveCount = truePositive + falseNegative;

  const negativeCount = trueNegative + falsePositive;

  const rowCount = positiveCount + negativeCount;

  return {
    truePositive,
    trueNegative,
    falsePositive,
    falseNegative,
    rowCount,
    accuracy: rowCount === 0 ? 0 : (truePositive + trueNegative) / rowCount,
    recall: positiveCount === 0 ? 0 : truePositive / positiveCount,
    specificity: negativeCount === 0 ? 0 : trueNegative / negativeCount,
    precision:
      truePositive + falsePositive === 0
        ? 0
        : truePositive / (truePositive + falsePositive),
  };
}

function buildDescriptorMetrics(datasetSummary) {
  return buildMetrics({
    truePositive: datasetSummary.classificationCounts.truePositive,
    trueNegative: datasetSummary.classificationCounts.trueNegative,
    falsePositive: datasetSummary.classificationCounts.falsePositive,
    falseNegative: datasetSummary.classificationCounts.falseNegative ?? 0,
  });
}

function sumSuggestionRows(rows) {
  return rows.reduce(
    (total, row) => ({
      fpBefore: total.fpBefore + row.before.falsePositive,
      fpAfter: total.fpAfter + row.after.falsePositive,
      fpReduction: total.fpReduction + row.actualFalsePositiveReduction,
      fnIncrease: total.fnIncrease + row.actualFalseNegativeIncrease,
      tpLoss: total.tpLoss + row.actualTruePositiveLoss,
    }),
    {
      fpBefore: 0,
      fpAfter: 0,
      fpReduction: 0,
      fnIncrease: 0,
      tpLoss: 0,
    },
  );
}

function sumProposalImpacts(proposals) {
  return proposals.reduce(
    (total, proposal) => ({
      fpReduction: total.fpReduction + proposal.impact.falsePositiveReduction,
      fnIncrease: total.fnIncrease + proposal.impact.falseNegativeIncrease,
      tpLoss: total.tpLoss + proposal.impact.truePositiveLoss,
    }),
    {
      fpReduction: 0,
      fnIncrease: 0,
      tpLoss: 0,
    },
  );
}

function buildFpSafeMetrics({ descriptorMetrics, fpSuggestionSummary }) {
  return buildMetrics({
    truePositive:
      descriptorMetrics.truePositive -
      fpSuggestionSummary.totalTruePositiveLoss,
    trueNegative:
      descriptorMetrics.trueNegative +
      fpSuggestionSummary.totalFalsePositiveReduction,
    falsePositive:
      descriptorMetrics.falsePositive -
      fpSuggestionSummary.totalFalsePositiveReduction,
    falseNegative:
      descriptorMetrics.falseNegative +
      fpSuggestionSummary.totalFalseNegativeIncrease,
  });
}

function validateKnownDatasetComparison({
  datasetSummary,
  descriptorMetrics,
  fpSafeMetrics,
  fpSuggestionSummary,
  fpProposals,
  generationStatus,
}) {
  const errors = [];

  if (descriptorMetrics.rowCount !== datasetSummary.rowCount) {
    errors.push("Descriptor metrics do not match the dataset row count.");
  }

  if (fpSafeMetrics.rowCount !== datasetSummary.rowCount) {
    errors.push("FP-safe metrics do not match the dataset row count.");
  }

  const rowTotals = sumSuggestionRows(fpSuggestionSummary.rows);

  const proposalTotals = sumProposalImpacts(fpProposals.proposals);

  if (
    rowTotals.fpReduction !== fpSuggestionSummary.totalFalsePositiveReduction
  ) {
    errors.push("FP-safe row reduction does not match the summary.");
  }

  if (
    proposalTotals.fpReduction !==
    fpSuggestionSummary.totalFalsePositiveReduction
  ) {
    errors.push("Proposal FP reduction does not match the suggestion summary.");
  }

  if (rowTotals.fnIncrease !== fpSuggestionSummary.totalFalseNegativeIncrease) {
    errors.push("FP-safe row FN increase does not match the summary.");
  }

  if (
    proposalTotals.fnIncrease !== fpSuggestionSummary.totalFalseNegativeIncrease
  ) {
    errors.push("Proposal FN increase does not match the suggestion summary.");
  }

  if (rowTotals.tpLoss !== fpSuggestionSummary.totalTruePositiveLoss) {
    errors.push("FP-safe row TP loss does not match the summary.");
  }

  if (proposalTotals.tpLoss !== fpSuggestionSummary.totalTruePositiveLoss) {
    errors.push("Proposal TP loss does not match the suggestion summary.");
  }

  if (
    fpSuggestionSummary.totalFalsePositiveBefore !==
    descriptorMetrics.falsePositive
  ) {
    errors.push("FP-safe baseline FP does not match descriptor FP.");
  }

  if (
    fpSuggestionSummary.totalFalsePositiveAfter !== fpSafeMetrics.falsePositive
  ) {
    errors.push("FP-safe final FP does not match derived metrics.");
  }

  if (fpProposals.proposalCount !== fpProposals.proposals.length) {
    errors.push("Stored proposal count does not match proposal rows.");
  }

  if (
    generationStatus.fpSuggestionQuality.totalFalsePositiveReduction !==
    fpSuggestionSummary.totalFalsePositiveReduction
  ) {
    errors.push(
      "Generation status FP reduction does not match the suggestion summary.",
    );
  }

  if (
    generationStatus.patchProposalQuality.totalFalsePositiveReduction !==
    fpProposals.totalFalsePositiveReduction
  ) {
    errors.push(
      "Generation status FP reduction does not match patch proposals.",
    );
  }

  return {
    passed: errors.length === 0,
    errors,
    rowTotals,
    proposalTotals,
  };
}

function buildAlternative({
  id,
  label,
  evaluationScope,
  metrics,
  complexityRank,
  evidenceLevel,
  automaticallyPromoted = false,
  manualReviewRequired = false,
  limitations = [],
}) {
  return {
    id,
    label,
    evaluationScope,
    metrics,
    fnSafe: metrics.falseNegative === 0,
    complexityRank,
    evidenceLevel,
    automaticallyPromoted,
    manualReviewRequired,
    limitations,
  };
}

function selectRecommendedAlternative(alternatives) {
  const safeAlternatives = alternatives.filter(
    (alternative) => alternative.fnSafe,
  );

  if (safeAlternatives.length === 0) {
    return null;
  }

  return [...safeAlternatives].sort((left, right) => {
    if (left.metrics.falsePositive !== right.metrics.falsePositive) {
      return left.metrics.falsePositive - right.metrics.falsePositive;
    }

    return left.complexityRank - right.complexityRank;
  })[0];
}

function buildComparison({
  datasetSummary,
  fpSuggestionSummary,
  fpProposals,
  generationStatus,
  hybridDevelopmentReport,
  loocvReport,
  diagnosisReport,
}) {
  const descriptorKnownMetrics = buildDescriptorMetrics(datasetSummary);

  const fpSafeMetrics = buildFpSafeMetrics({
    descriptorMetrics: descriptorKnownMetrics,
    fpSuggestionSummary,
  });

  const validation = validateKnownDatasetComparison({
    datasetSummary,
    descriptorMetrics: descriptorKnownMetrics,
    fpSafeMetrics,
    fpSuggestionSummary,
    fpProposals,
    generationStatus,
  });

  const knownDatasetAlternatives = [
    buildAlternative({
      id: "descriptor_base",
      label: "Descriptor base",
      evaluationScope: "known_full_dataset",
      metrics: descriptorKnownMetrics,
      complexityRank: 1,
      evidenceLevel: "observed_on_known_dataset",
      limitations: [
        "Evaluated on the same known dataset used during descriptor development.",
      ],
    }),
    buildAlternative({
      id: "fp_safe_patch_proposals",
      label: "FP-safe patch proposals",
      evaluationScope: "known_full_dataset",
      metrics: fpSafeMetrics,
      complexityRank: 2,
      evidenceLevel: "candidate_evaluated_on_known_dataset",
      manualReviewRequired: true,
      limitations: [
        "Suggestions were generated and evaluated on the known dataset.",
        "Fourteen proposals remain subject to manual review.",
        "No independent unseen-kanji evaluation is available.",
      ],
    }),
  ];

  const recommendedKnownCandidate = selectRecommendedAlternative(
    knownDatasetAlternatives,
  );

  const developmentAlternatives = [
    buildAlternative({
      id: "development_descriptor",
      label: "Development descriptor",
      evaluationScope: "row_level_development_validation",
      metrics: hybridDevelopmentReport.validation.descriptorMetrics,
      complexityRank: 1,
      evidenceLevel: "row_level_development_validation",
    }),
    buildAlternative({
      id: "development_pure_ml",
      label: "Development pure ML",
      evaluationScope: "row_level_development_validation",
      metrics: hybridDevelopmentReport.validation.pureMlMetrics,
      complexityRank: 3,
      evidenceLevel: "row_level_development_validation",
    }),
    buildAlternative({
      id: "development_hybrid",
      label: "Development descriptor and ML hybrid",
      evaluationScope: "row_level_development_validation",
      metrics: hybridDevelopmentReport.validation.hybridMetrics,
      complexityRank: 4,
      evidenceLevel: "row_level_development_validation",
      limitations: [
        "Threshold was selected using the same development validation partition.",
      ],
    }),
  ];

  const loocvAlternatives = [
    buildAlternative({
      id: "loocv_descriptor",
      label: "LOOCV descriptor",
      evaluationScope: "leave_one_target_kanji_out",
      metrics: loocvReport.aggregate.descriptorMetrics,
      complexityRank: 1,
      evidenceLevel: "held_out_target_kanji",
    }),
    buildAlternative({
      id: "loocv_pure_ml",
      label: "LOOCV pure ML",
      evaluationScope: "leave_one_target_kanji_out",
      metrics: loocvReport.aggregate.pureMlMetrics,
      complexityRank: 3,
      evidenceLevel: "held_out_target_kanji",
    }),
    buildAlternative({
      id: "loocv_hybrid",
      label: "LOOCV descriptor and ML hybrid",
      evaluationScope: "leave_one_target_kanji_out",
      metrics: loocvReport.aggregate.hybridMetrics,
      complexityRank: 4,
      evidenceLevel: "held_out_target_kanji",
      limitations: ["Introduces false negatives on held-out kanjis."],
    }),
  ];

  return {
    schemaVersion: 1,
    purpose:
      "Consolidated comparison of descriptor, FP-safe and logistic baseline alternatives",
    decisionPolicy: {
      primary: "Require falseNegative = 0",
      secondary: "Minimize falsePositive",
      tieBreak: "Prefer the simpler alternative",
      scopeIsolation:
        "Do not rank alternatives across different evaluation scopes as equivalent evidence",
    },
    knownDataset: {
      descriptorMetrics: descriptorKnownMetrics,
      fpSafeMetrics,
      alternatives: knownDatasetAlternatives,
      recommendedCandidateId: recommendedKnownCandidate?.id ?? null,
      recommendationStatus: "manual_review_required",
      proposalCount: fpProposals.proposalCount,
      proposalKanjis: fpProposals.proposals.map((proposal) => proposal.kanji),
    },
    developmentValidation: {
      alternatives: developmentAlternatives,
      warning: "Development metrics are not independent unseen-kanji evidence.",
    },
    leaveOneKanjiOut: {
      alternatives: loocvAlternatives,
      hybridPromotionBlocked:
        loocvReport.aggregate.hybridMetrics.falseNegative > 0,
      affectedFalseNegativeKanjis: diagnosisReport.summary.affectedKanjis,
      falseNegativeCount: diagnosisReport.summary.falseNegativeCount,
    },
    finalDecision: {
      currentOfficialValidator: "descriptor_base",
      bestReviewableCandidate: "fp_safe_patch_proposals",
      pureMlPromotionReady: false,
      hybridPromotionReady: false,
      fpSafeAutomaticPromotionReady: false,
      productionPromotionReady: false,
      reason:
        "The descriptor remains FN-safe. FP-safe proposals show the strongest known-dataset improvement but require manual review and independent evaluation. The logistic hybrid introduces held-out false negatives.",
    },
    integrity: {
      passed: validation.passed,
      errors: validation.errors,
      knownDatasetValidation: validation,
    },
  };
}

function formatMetrics(metrics) {
  return (
    `TP=${metrics.truePositive}, ` +
    `TN=${metrics.trueNegative}, ` +
    `FP=${metrics.falsePositive}, ` +
    `FN=${metrics.falseNegative}`
  );
}

function main() {
  try {
    const inputs = {
      datasetSummary: DEFAULT_DATASET_SUMMARY_PATH,
      fpSuggestionSummary: DEFAULT_FP_SUGGESTION_PATH,
      fpProposals: DEFAULT_FP_PROPOSALS_PATH,
      generationStatus: DEFAULT_GENERATION_STATUS_PATH,
      hybridDevelopmentReport: DEFAULT_HYBRID_DEVELOPMENT_PATH,
      loocvReport: DEFAULT_LOOCV_PATH,
      diagnosisReport: DEFAULT_DIAGNOSIS_PATH,
    };

    const values = {};

    for (const [name, filePath] of Object.entries(inputs)) {
      values[name] = readJson(filePath, name);
    }

    const comparison = buildComparison(values);

    comparison.sources = Object.fromEntries(
      Object.entries(inputs).map(([name, filePath]) => [
        name,
        {
          path: buildPortablePath(filePath),
          sha256: calculateFileSha256(filePath),
        },
      ]),
    );

    writeJson(DEFAULT_OUTPUT_PATH, comparison);

    console.log("");
    console.log("REFERENCE CANDIDATE BASELINE COMPARISON");

    console.log("=======================================");

    console.log("");
    console.log("Known full dataset");
    console.log("------------------");

    console.log(
      `Descriptor: ${formatMetrics(comparison.knownDataset.descriptorMetrics)}`,
    );

    console.log(
      `FP-safe: ${formatMetrics(comparison.knownDataset.fpSafeMetrics)}`,
    );

    console.log(
      `Recommended candidate: ` +
        `${comparison.knownDataset.recommendedCandidateId}`,
    );

    console.log("");
    console.log("Leave-one-kanji-out");
    console.log("-------------------");

    for (const alternative of comparison.leaveOneKanjiOut.alternatives) {
      console.log(
        `${alternative.label}: ` + `${formatMetrics(alternative.metrics)}`,
      );
    }

    console.log("");
    console.log("Final decision");
    console.log("--------------");

    console.log(
      `Current official validator: ` +
        `${comparison.finalDecision.currentOfficialValidator}`,
    );

    console.log(
      `Best reviewable candidate: ` +
        `${comparison.finalDecision.bestReviewableCandidate}`,
    );

    console.log(
      `Production promotion ready: ` +
        `${comparison.finalDecision.productionPromotionReady}`,
    );

    console.log("");
    console.log("Integrity");
    console.log("---------");

    console.log(`Errors: ${comparison.integrity.errors.length}`);

    console.log(`Passed: ${comparison.integrity.passed}`);

    console.log("");
    console.log(`Output: ${DEFAULT_OUTPUT_PATH}`);

    if (!comparison.integrity.passed) {
      process.exitCode = 1;
      return;
    }

    console.log("");
    console.log("Baseline comparison completed successfully.");
  } catch (error) {
    console.error("");
    console.error(`Baseline comparison failed: ${error.message}`);

    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
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
  buildPortablePath,
  main,
};
