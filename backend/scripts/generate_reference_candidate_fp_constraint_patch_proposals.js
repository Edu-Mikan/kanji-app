const fs = require("node:fs");
const path = require("node:path");

function parseArgs(argv) {
  const options = {
    summaryPath: null,
    outputPath: null,
    minFalsePositiveReduction: 1,
    requireSafe: true,
    help: false,
  };

  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];

    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }

    if (argument === "--summary") {
      options.summaryPath = path.resolve(argv[index + 1]);
      index++;
      continue;
    }

    if (argument === "--out-json") {
      options.outputPath = path.resolve(argv[index + 1]);
      index++;
      continue;
    }

    if (argument === "--min-fp-reduction") {
      options.minFalsePositiveReduction = Number(argv[index + 1]);
      index++;
      continue;
    }

    if (argument === "--allow-unsafe") {
      options.requireSafe = false;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return options;
}

function printHelp() {
  console.log(`
Generate reference candidate FP constraint patch proposals

Usage:
  node scripts/generate_reference_candidate_fp_constraint_patch_proposals.js \\
    --summary ./candidate_reports_training/reference_candidate_fp_constraint_suggestion_batch_summary.json \\
    --out-json ./candidate_reports_training/reference_candidate_fp_constraint_patch_proposals.json

Options:
  --min-fp-reduction <number>
      Minimum actual false positive reduction required to create a proposal.
      Default: 1.

  --allow-unsafe
      Include rows even if safe=false.
      By default only safe rows are proposed.

This script reads the evaluated FP suggestion batch summary and creates
reviewable patch proposals. It does not modify production descriptors.
`);
}

function validateOptions(options) {
  if (options.help) {
    return;
  }

  if (!options.summaryPath) {
    throw new Error("Missing --summary <path>");
  }

  if (!options.outputPath) {
    throw new Error("Missing --out-json <path>");
  }

  if (!Number.isFinite(options.minFalsePositiveReduction)) {
    throw new Error("--min-fp-reduction must be a finite number");
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

function shouldCreateProposal({ row, minFalsePositiveReduction, requireSafe }) {
  if (row.status !== "ok") {
    return false;
  }

  if (requireSafe && row.safe !== true) {
    return false;
  }

  if ((row.actualFalsePositiveReduction ?? 0) < minFalsePositiveReduction) {
    return false;
  }

  if ((row.actualFalseNegativeIncrease ?? 0) > 0) {
    return false;
  }

  if ((row.actualTruePositiveLoss ?? 0) > 0) {
    return false;
  }

  if (!row.metricPath) {
    return false;
  }

  if (row.max == null) {
    return false;
  }

  return true;
}

function buildReferenceConstraintFromRow(row) {
  return {
    type: "referenceMetricMax",

    metricPath: row.metricPath,

    max: row.max,

    severity: "hard",

    status: "candidate",

    source: "fp_constraint_patch_proposal",

    evidence: {
      suggestedFalsePositiveReduction:
        row.suggestedFalsePositiveReduction ?? null,

      suggestedTruePositiveLoss: row.suggestedTruePositiveLoss ?? null,

      actualFalsePositiveReduction: row.actualFalsePositiveReduction ?? 0,

      actualFalseNegativeIncrease: row.actualFalseNegativeIncrease ?? 0,

      actualTruePositiveLoss: row.actualTruePositiveLoss ?? 0,

      safe: row.safe === true,
    },
  };
}

function buildPatchProposal(row) {
  const before = row.before ?? {};

  const after = row.after ?? {};

  return {
    kanji: row.kanji,

    status: "proposal",

    source: "reference_candidate_fp_constraint_suggestion_batch",

    action: "append_reference_constraint",

    constraint: buildReferenceConstraintFromRow(row),

    impact: {
      truePositiveBefore: before.truePositive ?? 0,

      truePositiveAfter: after.truePositive ?? 0,

      falseNegativeBefore: before.falseNegative ?? 0,

      falseNegativeAfter: after.falseNegative ?? 0,

      trueNegativeBefore: before.trueNegative ?? 0,

      trueNegativeAfter: after.trueNegative ?? 0,

      falsePositiveBefore: before.falsePositive ?? 0,

      falsePositiveAfter: after.falsePositive ?? 0,

      falsePositiveReduction: row.actualFalsePositiveReduction ?? 0,

      falseNegativeIncrease: row.actualFalseNegativeIncrease ?? 0,

      truePositiveLoss: row.actualTruePositiveLoss ?? 0,

      remainingFalsePositive:
        row.remainingFalsePositive ?? after.falsePositive ?? 0,
    },

    review: {
      requiresManualReview: true,

      recommendedDecision: "review_before_promotion",

      notes: [
        "Generated from evaluated FP-safe reference candidate suggestion.",
        "This proposal does not modify production descriptors.",
        "Review for overfitting before promotion.",
      ],
    },
  };
}

function buildRejectedRowReason({
  row,
  minFalsePositiveReduction,
  requireSafe,
}) {
  if (row.status !== "ok") {
    return "row_status_not_ok";
  }

  if (requireSafe && row.safe !== true) {
    return "row_not_safe";
  }

  if ((row.actualFalsePositiveReduction ?? 0) < minFalsePositiveReduction) {
    return "false_positive_reduction_below_minimum";
  }

  if ((row.actualFalseNegativeIncrease ?? 0) > 0) {
    return "false_negative_increase";
  }

  if ((row.actualTruePositiveLoss ?? 0) > 0) {
    return "true_positive_loss";
  }

  if (!row.metricPath) {
    return "missing_metric_path";
  }

  if (row.max == null) {
    return "missing_threshold";
  }

  return "unknown";
}

function generatePatchProposals({
  suggestionBatchSummary,
  minFalsePositiveReduction = 1,
  requireSafe = true,
}) {
  const rows = suggestionBatchSummary.rows ?? [];

  const proposals = [];
  const rejectedRows = [];

  for (const row of rows) {
    if (
      shouldCreateProposal({
        row,
        minFalsePositiveReduction,
        requireSafe,
      })
    ) {
      proposals.push(buildPatchProposal(row));
      continue;
    }

    rejectedRows.push({
      kanji: row.kanji ?? null,

      status: row.status ?? null,

      reason: buildRejectedRowReason({
        row,
        minFalsePositiveReduction,
        requireSafe,
      }),

      actualFalsePositiveReduction: row.actualFalsePositiveReduction ?? null,

      actualFalseNegativeIncrease: row.actualFalseNegativeIncrease ?? null,

      actualTruePositiveLoss: row.actualTruePositiveLoss ?? null,

      safe: row.safe ?? null,
    });
  }

  const totalFalsePositiveReduction = proposals.reduce(
    (total, proposal) => total + proposal.impact.falsePositiveReduction,
    0,
  );

  const totalFalseNegativeIncrease = proposals.reduce(
    (total, proposal) => total + proposal.impact.falseNegativeIncrease,
    0,
  );

  const totalTruePositiveLoss = proposals.reduce(
    (total, proposal) => total + proposal.impact.truePositiveLoss,
    0,
  );

  return {
    generatedAt: new Date().toISOString(),

    mode: "reference_candidate_fp_constraint_patch_proposals",

    sourceMode: suggestionBatchSummary.mode ?? null,

    sourceSummary: {
      targetCount: suggestionBatchSummary.targetCount ?? null,

      evaluatedCount: suggestionBatchSummary.evaluatedCount ?? null,

      errorCount: suggestionBatchSummary.errorCount ?? null,

      totalFalsePositiveBefore:
        suggestionBatchSummary.totalFalsePositiveBefore ?? null,

      totalFalsePositiveAfter:
        suggestionBatchSummary.totalFalsePositiveAfter ?? null,

      totalFalsePositiveReduction:
        suggestionBatchSummary.totalFalsePositiveReduction ?? null,

      totalFalseNegativeIncrease:
        suggestionBatchSummary.totalFalseNegativeIncrease ?? null,

      totalTruePositiveLoss:
        suggestionBatchSummary.totalTruePositiveLoss ?? null,

      passed: suggestionBatchSummary.passed ?? null,
    },

    criteria: {
      minFalsePositiveReduction,
      requireSafe,
      requireNoFalseNegativeIncrease: true,
      requireNoTruePositiveLoss: true,
    },

    proposalCount: proposals.length,

    rejectedCount: rejectedRows.length,

    totalFalsePositiveReduction,
    totalFalseNegativeIncrease,
    totalTruePositiveLoss,

    proposals,
    rejectedRows,
  };
}

function printProposalSummary(report) {
  console.log("");
  console.log("REFERENCE CANDIDATE FP CONSTRAINT PATCH PROPOSALS");
  console.log("=================================================");

  console.log(`Proposals: ${report.proposalCount}`);
  console.log(`Rejected rows: ${report.rejectedCount}`);
  console.log(`Total FP reduction: ${report.totalFalsePositiveReduction}`);
  console.log(`Total FN increase: ${report.totalFalseNegativeIncrease}`);
  console.log(`Total TP loss: ${report.totalTruePositiveLoss}`);

  console.log("");

  for (const proposal of report.proposals) {
    console.log(
      [
        `${proposal.kanji}:`,
        proposal.constraint.metricPath,
        `max=${proposal.constraint.max}`,
        `FP ${proposal.impact.falsePositiveBefore}->${proposal.impact.falsePositiveAfter}`,
        `reduction=${proposal.impact.falsePositiveReduction}`,
        `FN increase=${proposal.impact.falseNegativeIncrease}`,
        `TP loss=${proposal.impact.truePositiveLoss}`,
      ].join(" "),
    );
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  validateOptions(options);

  if (options.help) {
    printHelp();
    return;
  }

  if (!fs.existsSync(options.summaryPath)) {
    throw new Error(`Summary file not found: ${options.summaryPath}`);
  }

  const suggestionBatchSummary = readJson(options.summaryPath);

  const proposalReport = generatePatchProposals({
    suggestionBatchSummary,
    minFalsePositiveReduction: options.minFalsePositiveReduction,
    requireSafe: options.requireSafe,
  });

  writeJson(options.outputPath, proposalReport);

  printProposalSummary(proposalReport);

  console.log("");
  console.log(`Patch proposals saved to: ${options.outputPath}`);
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
  shouldCreateProposal,
  buildReferenceConstraintFromRow,
  buildPatchProposal,
  buildRejectedRowReason,
  generatePatchProposals,
};
