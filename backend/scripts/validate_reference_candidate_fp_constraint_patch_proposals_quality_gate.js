const fs = require("node:fs");
const path = require("node:path");

function parseArgs(argv) {
  const options = {
    proposalsPath: null,
    requireProposals: true,
    help: false,
  };

  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];

    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }

    if (argument === "--proposals") {
      options.proposalsPath = path.resolve(argv[index + 1]);
      index++;
      continue;
    }

    if (argument === "--allow-empty") {
      options.requireProposals = false;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return options;
}

function printHelp() {
  console.log(`
Validate reference candidate FP constraint patch proposals quality gate

Usage:
  node scripts/validate_reference_candidate_fp_constraint_patch_proposals_quality_gate.js \\
    --proposals ./candidate_reports_training/reference_candidate_fp_constraint_patch_proposals.json

Options:
  --allow-empty
      Do not fail when proposalCount is 0.

The gate fails when:
  - proposalCount is 0, unless --allow-empty is used
  - totalFalseNegativeIncrease > 0
  - totalTruePositiveLoss > 0
  - any proposal has falseNegativeIncrease > 0
  - any proposal has truePositiveLoss > 0
  - any proposal is missing a valid referenceMetricMax constraint
`);
}

function validateOptions(options) {
  if (options.help) {
    return;
  }

  if (!options.proposalsPath) {
    throw new Error("Missing --proposals <path>");
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function isValidReferenceConstraint(constraint) {
  return (
    constraint &&
    constraint.type === "referenceMetricMax" &&
    typeof constraint.metricPath === "string" &&
    constraint.metricPath.length > 0 &&
    typeof constraint.max === "number" &&
    Number.isFinite(constraint.max) &&
    constraint.severity === "hard" &&
    constraint.status === "candidate"
  );
}

function validatePatchProposal(proposal) {
  const failures = [];

  if (!proposal.kanji) {
    failures.push({
      code: "missing_kanji",
      message: "Proposal is missing kanji.",
    });
  }

  if (proposal.status !== "proposal") {
    failures.push({
      code: "invalid_status",
      message: `Proposal has invalid status: ${proposal.status}`,
    });
  }

  if (proposal.action !== "append_reference_constraint") {
    failures.push({
      code: "invalid_action",
      message: `Proposal has invalid action: ${proposal.action}`,
    });
  }

  if (!isValidReferenceConstraint(proposal.constraint)) {
    failures.push({
      code: "invalid_constraint",
      message: "Proposal has invalid referenceMetricMax constraint.",
    });
  }

  const impact = proposal.impact ?? {};

  if ((impact.falseNegativeIncrease ?? 0) > 0) {
    failures.push({
      code: "false_negative_increase",
      message: `Proposal for ${proposal.kanji} introduces ${impact.falseNegativeIncrease} false negative(s).`,
    });
  }

  if ((impact.truePositiveLoss ?? 0) > 0) {
    failures.push({
      code: "true_positive_loss",
      message: `Proposal for ${proposal.kanji} loses ${impact.truePositiveLoss} true positive(s).`,
    });
  }

  if ((impact.falsePositiveReduction ?? 0) <= 0) {
    failures.push({
      code: "no_false_positive_reduction",
      message: `Proposal for ${proposal.kanji} does not reduce false positives.`,
    });
  }

  return failures;
}

function validatePatchProposalsQualityGate({
  proposalReport,
  requireProposals = true,
}) {
  const failures = [];

  const proposals = proposalReport.proposals ?? [];

  if (requireProposals && proposals.length === 0) {
    failures.push({
      code: "no_proposals",
      message: "Proposal report contains no proposals.",
    });
  }

  if ((proposalReport.totalFalseNegativeIncrease ?? 0) > 0) {
    failures.push({
      code: "total_false_negative_increase",
      message: `Proposal report has totalFalseNegativeIncrease=${proposalReport.totalFalseNegativeIncrease}.`,
    });
  }

  if ((proposalReport.totalTruePositiveLoss ?? 0) > 0) {
    failures.push({
      code: "total_true_positive_loss",
      message: `Proposal report has totalTruePositiveLoss=${proposalReport.totalTruePositiveLoss}.`,
    });
  }

  for (const proposal of proposals) {
    const proposalFailures = validatePatchProposal(proposal);

    for (const failure of proposalFailures) {
      failures.push({
        ...failure,
        kanji: proposal.kanji ?? null,
      });
    }
  }

  return {
    passed: failures.length === 0,
    failures,
  };
}

function printQualityGateResult({ proposalReport, result }) {
  console.log("");
  console.log("REFERENCE CANDIDATE FP PATCH PROPOSALS QUALITY GATE");
  console.log("===================================================");

  console.log(`Proposals: ${proposalReport.proposalCount}`);
  console.log(`Rejected rows: ${proposalReport.rejectedCount}`);
  console.log(
    `Total FP reduction: ${proposalReport.totalFalsePositiveReduction}`,
  );
  console.log(
    `Total FN increase: ${proposalReport.totalFalseNegativeIncrease}`,
  );
  console.log(`Total TP loss: ${proposalReport.totalTruePositiveLoss}`);

  console.log("");
  console.log(`Passed: ${result.passed}`);

  if (!result.passed) {
    console.log("");
    console.log("Failures:");

    for (const failure of result.failures) {
      const prefix = failure.kanji ? `${failure.kanji} ` : "";

      console.log(`- ${prefix}${failure.code}: ${failure.message}`);
    }
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  validateOptions(options);

  if (options.help) {
    printHelp();
    return;
  }

  if (!fs.existsSync(options.proposalsPath)) {
    throw new Error(`Proposal file not found: ${options.proposalsPath}`);
  }

  const proposalReport = readJson(options.proposalsPath);

  const result = validatePatchProposalsQualityGate({
    proposalReport,
    requireProposals: options.requireProposals,
  });

  printQualityGateResult({
    proposalReport,
    result,
  });

  if (!result.passed) {
    process.exitCode = 1;
  }
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
  isValidReferenceConstraint,
  validatePatchProposal,
  validatePatchProposalsQualityGate,
};
