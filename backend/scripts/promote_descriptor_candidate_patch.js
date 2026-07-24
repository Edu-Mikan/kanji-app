const fs = require("node:fs");
const path = require("node:path");

function parseArgs(argv) {
  const options = {
    descriptorPath: null,
    candidatePatchPath: null,
    evaluationReportPath: null,
    outputPath: null,
    minFalsePositiveReduction: 1,
    help: false,
  };

  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];

    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }

    if (argument === "--descriptor-file") {
      options.descriptorPath = path.resolve(argv[index + 1]);
      index++;
      continue;
    }

    if (argument === "--candidate-patch") {
      options.candidatePatchPath = path.resolve(argv[index + 1]);
      index++;
      continue;
    }

    if (argument === "--evaluation-report") {
      options.evaluationReportPath = path.resolve(argv[index + 1]);
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

    throw new Error(`Unknown argument: ${argument}`);
  }

  return options;
}

function printHelp() {
  console.log(`
Promote descriptor candidate patch

Usage:
  node scripts/promote_descriptor_candidate_patch.js \\
    --descriptor-file ./data/kanji_descriptors.json \\
    --candidate-patch ./field_descriptor_candidate_patch.json \\
    --evaluation-report ./field_descriptor_candidate_patch_evaluation_report.json \\
    --out-json ./data/kanji_descriptors.json
`);
}

function assertFileExists(filePath, label) {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error(`${label} not found: ${filePath}`);
  }
}

function loadJson(filePath, label) {
  assertFileExists(filePath, label);

  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function getDescriptorCatalog(descriptorFile) {
  return descriptorFile.descriptors ?? descriptorFile;
}

function assertPromotionIsSafe({
  patch,
  evaluationReport,
  minFalsePositiveReduction,
}) {
  if (patch.status !== "candidate") {
    throw new Error(
      `Candidate patch status must be candidate. Received: ${patch.status}`,
    );
  }

  if (evaluationReport.safe !== true) {
    throw new Error("Candidate patch evaluation is not safe");
  }

  if (evaluationReport.falseNegativeIncrease !== 0) {
    throw new Error(
      `Candidate introduces false negatives: ${evaluationReport.falseNegativeIncrease}`,
    );
  }

  if (evaluationReport.truePositiveLoss !== 0) {
    throw new Error(
      `Candidate loses true positives: ${evaluationReport.truePositiveLoss}`,
    );
  }

  if (evaluationReport.falsePositiveReduction < minFalsePositiveReduction) {
    throw new Error(
      [
        "Candidate false positive reduction is too low.",
        `Expected at least ${minFalsePositiveReduction}.`,
        `Received ${evaluationReport.falsePositiveReduction}.`,
      ].join(" "),
    );
  }

  if (patch.kanji !== evaluationReport.kanji) {
    throw new Error(
      `Patch kanji (${patch.kanji}) does not match evaluation kanji (${evaluationReport.kanji})`,
    );
  }
}

function buildApprovedReferenceConstraint({ rule, evaluationReport }) {
  return {
    type: rule.type,
    metricPath: rule.metricPath,
    max: rule.max,
    severity: "hard",
    status: "approved",
    source: "descriptor_candidate_promotion",
    comparisonGroup: rule.comparisonGroup,
    risk: rule.risk,
    promotedAt: new Date().toISOString(),
    evidence: {
      falsePositiveReduction: evaluationReport.falsePositiveReduction,
      falseNegativeIncrease: evaluationReport.falseNegativeIncrease,
      truePositiveLoss: evaluationReport.truePositiveLoss,
      safe: evaluationReport.safe,
      sampleCount: evaluationReport.sampleCount,
      affectedSampleCount: evaluationReport.affectedSampleCount,
    },
  };
}

function constraintKey(constraint) {
  return [
    constraint.type,
    constraint.metricPath,
    constraint.max,
    constraint.severity,
  ].join("|");
}

function appendConstraintsWithoutDuplicates({
  existingConstraints,
  newConstraints,
}) {
  const result = [...existingConstraints];
  const existingKeys = new Set(existingConstraints.map(constraintKey));

  for (const constraint of newConstraints) {
    const key = constraintKey(constraint);

    if (!existingKeys.has(key)) {
      result.push(constraint);
      existingKeys.add(key);
    }
  }

  return result;
}

function promoteCandidatePatch({
  descriptorFile,
  patch,
  evaluationReport,
  minFalsePositiveReduction = 1,
}) {
  assertPromotionIsSafe({
    patch,
    evaluationReport,
    minFalsePositiveReduction,
  });

  const result = cloneJson(descriptorFile);
  const descriptors = getDescriptorCatalog(result);
  const descriptor = descriptors[patch.kanji];

  if (!descriptor) {
    throw new Error(`Descriptor not found for kanji: ${patch.kanji}`);
  }

  const existingConstraints = Array.isArray(descriptor.referenceConstraints)
    ? descriptor.referenceConstraints
    : [];

  const approvedConstraints = (patch.rules ?? []).map((rule) =>
    buildApprovedReferenceConstraint({
      rule,
      evaluationReport,
    }),
  );

  descriptor.referenceConstraints = appendConstraintsWithoutDuplicates({
    existingConstraints,
    newConstraints: approvedConstraints,
  });

  descriptor.promotionMetadata = {
    promotedAt: new Date().toISOString(),
    sourcePatchMode: patch.mode,
    sourcePatchStatus: patch.status,
    sourceEvaluationMode: evaluationReport.mode,
    ruleCount: approvedConstraints.length,
    falsePositiveReduction: evaluationReport.falsePositiveReduction,
    falseNegativeIncrease: evaluationReport.falseNegativeIncrease,
    truePositiveLoss: evaluationReport.truePositiveLoss,
    safe: evaluationReport.safe,
  };

  return result;
}

function printPromotionResult({ patch, evaluationReport, outputPath }) {
  console.log("");
  console.log("DESCRIPTOR CANDIDATE PROMOTION");
  console.log("==============================");

  console.log(`Kanji: ${patch.kanji}`);
  console.log(`Rules: ${(patch.rules ?? []).length}`);
  console.log(
    `False positive reduction: ${evaluationReport.falsePositiveReduction}`,
  );
  console.log(
    `False negative increase: ${evaluationReport.falseNegativeIncrease}`,
  );
  console.log(`True positive loss: ${evaluationReport.truePositiveLoss}`);
  console.log(`Safe: ${evaluationReport.safe}`);
  console.log(`Output: ${outputPath}`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  if (!options.descriptorPath) {
    throw new Error("Missing --descriptor-file <path>");
  }

  if (!options.candidatePatchPath) {
    throw new Error("Missing --candidate-patch <path>");
  }

  if (!options.evaluationReportPath) {
    throw new Error("Missing --evaluation-report <path>");
  }

  if (!options.outputPath) {
    throw new Error("Missing --out-json <path>");
  }

  if (!Number.isFinite(options.minFalsePositiveReduction)) {
    throw new Error("--min-fp-reduction must be a finite number");
  }

  const descriptorFile = loadJson(options.descriptorPath, "descriptor file");

  const patch = loadJson(options.candidatePatchPath, "candidate patch");

  const evaluationReport = loadJson(
    options.evaluationReportPath,
    "evaluation report",
  );

  const promotedDescriptorFile = promoteCandidatePatch({
    descriptorFile,
    patch,
    evaluationReport,
    minFalsePositiveReduction: options.minFalsePositiveReduction,
  });

  fs.writeFileSync(
    options.outputPath,
    JSON.stringify(promotedDescriptorFile, null, 2),
    "utf8",
  );

  printPromotionResult({
    patch,
    evaluationReport,
    outputPath: options.outputPath,
  });
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
  cloneJson,
  getDescriptorCatalog,
  assertPromotionIsSafe,
  buildApprovedReferenceConstraint,
  constraintKey,
  appendConstraintsWithoutDuplicates,
  promoteCandidatePatch,
};
