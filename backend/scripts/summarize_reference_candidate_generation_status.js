const fs = require("node:fs");
const path = require("node:path");

function parseArgs(argv) {
  const options = {
    referenceCandidateSummaryPath: null,
    fpSuggestionBatchSummaryPath: null,
    patchProposalsPath: null,
    outputPath: null,
    help: false,
  };

  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];

    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }

    if (argument === "--reference-candidate-summary") {
      options.referenceCandidateSummaryPath = path.resolve(argv[index + 1]);
      index++;
      continue;
    }

    if (argument === "--fp-suggestion-summary") {
      options.fpSuggestionBatchSummaryPath = path.resolve(argv[index + 1]);
      index++;
      continue;
    }

    if (argument === "--patch-proposals") {
      options.patchProposalsPath = path.resolve(argv[index + 1]);
      index++;
      continue;
    }

    if (argument === "--out-json") {
      options.outputPath = path.resolve(argv[index + 1]);
      index++;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return options;
}

function printHelp() {
  console.log(`
Summarize reference candidate generation status

Usage:
  node scripts/summarize_reference_candidate_generation_status.js \\
    --reference-candidate-summary ./candidate_reports_training/reference_descriptor_candidate_pipeline_batch_summary.json \\
    --fp-suggestion-summary ./candidate_reports_training/reference_candidate_fp_constraint_suggestion_batch_summary.json \\
    --patch-proposals ./candidate_reports_training/reference_candidate_fp_constraint_patch_proposals.json \\
    --out-json ./candidate_reports_training/reference_candidate_generation_status_summary.json

This script creates a consolidated status summary for:
  1. generated reference candidates,
  2. FP-safe suggestion evaluations,
  3. reviewable FP constraint patch proposals,
  4. readiness before ML dataset export.
`);
}

function validateOptions(options) {
  if (options.help) {
    return;
  }

  if (!options.referenceCandidateSummaryPath) {
    throw new Error("Missing --reference-candidate-summary <path>");
  }

  if (!options.fpSuggestionBatchSummaryPath) {
    throw new Error("Missing --fp-suggestion-summary <path>");
  }

  if (!options.patchProposalsPath) {
    throw new Error("Missing --patch-proposals <path>");
  }

  if (!options.outputPath) {
    throw new Error("Missing --out-json <path>");
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), {
    recursive: true,
  });

  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function summarizeReferenceCandidateQuality(referenceCandidateSummary) {
  return {
    kanjiCount: referenceCandidateSummary.kanjiCount ?? 0,

    processedCount: referenceCandidateSummary.processedCount ?? 0,

    errorCount: referenceCandidateSummary.errorCount ?? 0,

    cleanCandidateCount: referenceCandidateSummary.cleanCandidateCount ?? 0,

    safeCandidateCount: referenceCandidateSummary.safeCandidateCount ?? 0,

    unsafeCandidateCount: referenceCandidateSummary.unsafeCandidateCount ?? 0,

    permissiveCandidateCount:
      referenceCandidateSummary.permissiveCandidateCount ?? 0,

    cleanKanjis: referenceCandidateSummary.cleanKanjis ?? [],

    safeKanjis: referenceCandidateSummary.safeKanjis ?? [],

    unsafeKanjis: referenceCandidateSummary.unsafeKanjis ?? [],

    permissiveKanjis: referenceCandidateSummary.permissiveKanjis ?? [],

    passed:
      (referenceCandidateSummary.errorCount ?? 0) === 0 &&
      (referenceCandidateSummary.unsafeCandidateCount ?? 0) === 0,
  };
}

function summarizeFpSuggestionQuality(fpSuggestionBatchSummary) {
  return {
    targetCount: fpSuggestionBatchSummary.targetCount ?? 0,

    evaluatedCount: fpSuggestionBatchSummary.evaluatedCount ?? 0,

    noSuggestionCount: fpSuggestionBatchSummary.noSuggestionCount ?? 0,

    errorCount: fpSuggestionBatchSummary.errorCount ?? 0,

    safeEvaluationCount: fpSuggestionBatchSummary.safeEvaluationCount ?? 0,

    totalFalsePositiveBefore:
      fpSuggestionBatchSummary.totalFalsePositiveBefore ?? 0,

    totalFalsePositiveAfter:
      fpSuggestionBatchSummary.totalFalsePositiveAfter ?? 0,

    totalFalsePositiveReduction:
      fpSuggestionBatchSummary.totalFalsePositiveReduction ?? 0,

    totalFalseNegativeIncrease:
      fpSuggestionBatchSummary.totalFalseNegativeIncrease ?? 0,

    totalTruePositiveLoss: fpSuggestionBatchSummary.totalTruePositiveLoss ?? 0,

    passed: fpSuggestionBatchSummary.passed === true,
  };
}

function summarizePatchProposals(patchProposals) {
  return {
    proposalCount: patchProposals.proposalCount ?? 0,

    rejectedCount: patchProposals.rejectedCount ?? 0,

    totalFalsePositiveReduction:
      patchProposals.totalFalsePositiveReduction ?? 0,

    totalFalseNegativeIncrease: patchProposals.totalFalseNegativeIncrease ?? 0,

    totalTruePositiveLoss: patchProposals.totalTruePositiveLoss ?? 0,

    proposalKanjis: (patchProposals.proposals ?? []).map(
      (proposal) => proposal.kanji,
    ),

    passed:
      (patchProposals.proposalCount ?? 0) > 0 &&
      (patchProposals.totalFalseNegativeIncrease ?? 0) === 0 &&
      (patchProposals.totalTruePositiveLoss ?? 0) === 0,
  };
}

function buildReadiness({
  referenceCandidateQuality,
  fpSuggestionQuality,
  patchProposalQuality,
}) {
  const blockers = [];

  if (!referenceCandidateQuality.passed) {
    blockers.push("reference_candidates_not_safe");
  }

  if (!fpSuggestionQuality.passed) {
    blockers.push("fp_suggestion_quality_gate_not_passed");
  }

  if (!patchProposalQuality.passed) {
    blockers.push("patch_proposals_not_ready");
  }

  if ((referenceCandidateQuality.safeCandidateCount ?? 0) === 0) {
    blockers.push("no_safe_reference_candidates");
  }

  const readyForMlDatasetExport = blockers.length === 0;

  return {
    readyForMlDatasetExport,

    blockers,

    reason: readyForMlDatasetExport
      ? "All generated reference candidates are safe against false negatives, FP-safe suggestion evaluation passed, and patch proposals are available for review."
      : "One or more prerequisite quality gates failed before ML dataset export.",

    recommendedNextStep: readyForMlDatasetExport
      ? "Create export_reference_candidate_ml_dataset.js to produce a supervised binary dataset for candidate-vs-reference acceptance modeling."
      : "Resolve blockers before creating the ML dataset export.",
  };
}

function buildStatusSummary({
  referenceCandidateSummary,
  fpSuggestionBatchSummary,
  patchProposals,
}) {
  const referenceCandidateQuality = summarizeReferenceCandidateQuality(
    referenceCandidateSummary,
  );

  const fpSuggestionQuality = summarizeFpSuggestionQuality(
    fpSuggestionBatchSummary,
  );

  const patchProposalQuality = summarizePatchProposals(patchProposals);

  const readiness = buildReadiness({
    referenceCandidateQuality,
    fpSuggestionQuality,
    patchProposalQuality,
  });

  return {
    generatedAt: new Date().toISOString(),

    mode: "reference_candidate_generation_status_summary",

    referenceCandidateQuality,

    fpSuggestionQuality,

    patchProposalQuality,

    readiness,
  };
}

function printStatusSummary(summary) {
  console.log("");
  console.log("REFERENCE CANDIDATE GENERATION STATUS SUMMARY");
  console.log("=============================================");

  console.log("");
  console.log("Reference candidates");
  console.log("--------------------");
  console.log(`Kanjis: ${summary.referenceCandidateQuality.kanjiCount}`);
  console.log(`Safe: ${summary.referenceCandidateQuality.safeCandidateCount}`);
  console.log(
    `Unsafe: ${summary.referenceCandidateQuality.unsafeCandidateCount}`,
  );
  console.log(
    `Clean: ${summary.referenceCandidateQuality.cleanCandidateCount}`,
  );
  console.log(
    `Permissive: ${summary.referenceCandidateQuality.permissiveCandidateCount}`,
  );
  console.log(`Passed: ${summary.referenceCandidateQuality.passed}`);

  console.log("");
  console.log("FP suggestions");
  console.log("--------------");
  console.log(`Targets: ${summary.fpSuggestionQuality.targetCount}`);
  console.log(
    `FP before: ${summary.fpSuggestionQuality.totalFalsePositiveBefore}`,
  );
  console.log(
    `FP after: ${summary.fpSuggestionQuality.totalFalsePositiveAfter}`,
  );
  console.log(
    `FP reduction: ${summary.fpSuggestionQuality.totalFalsePositiveReduction}`,
  );
  console.log(
    `FN increase: ${summary.fpSuggestionQuality.totalFalseNegativeIncrease}`,
  );
  console.log(`TP loss: ${summary.fpSuggestionQuality.totalTruePositiveLoss}`);
  console.log(`Passed: ${summary.fpSuggestionQuality.passed}`);

  console.log("");
  console.log("Patch proposals");
  console.log("---------------");
  console.log(`Proposals: ${summary.patchProposalQuality.proposalCount}`);
  console.log(`Rejected: ${summary.patchProposalQuality.rejectedCount}`);
  console.log(
    `FP reduction: ${summary.patchProposalQuality.totalFalsePositiveReduction}`,
  );
  console.log(
    `FN increase: ${summary.patchProposalQuality.totalFalseNegativeIncrease}`,
  );
  console.log(`TP loss: ${summary.patchProposalQuality.totalTruePositiveLoss}`);
  console.log(`Passed: ${summary.patchProposalQuality.passed}`);

  console.log("");
  console.log("Readiness");
  console.log("---------");
  console.log(
    `Ready for ML dataset export: ${summary.readiness.readyForMlDatasetExport}`,
  );
  console.log(`Reason: ${summary.readiness.reason}`);
  console.log(
    `Recommended next step: ${summary.readiness.recommendedNextStep}`,
  );
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  validateOptions(options);

  if (options.help) {
    printHelp();
    return;
  }

  const referenceCandidateSummary = readJson(
    options.referenceCandidateSummaryPath,
  );

  const fpSuggestionBatchSummary = readJson(
    options.fpSuggestionBatchSummaryPath,
  );

  const patchProposals = readJson(options.patchProposalsPath);

  const statusSummary = buildStatusSummary({
    referenceCandidateSummary,
    fpSuggestionBatchSummary,
    patchProposals,
  });

  writeJson(options.outputPath, statusSummary);

  printStatusSummary(statusSummary);

  console.log("");
  console.log(`Status summary saved to: ${options.outputPath}`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error("");
    console.error("ERROR");
    console.error("-----");
    console.error(error.message);

    process.exitCode = 1;
  }
}

module.exports = {
  parseArgs,
  validateOptions,
  summarizeReferenceCandidateQuality,
  summarizeFpSuggestionQuality,
  summarizePatchProposals,
  buildReadiness,
  buildStatusSummary,
};
