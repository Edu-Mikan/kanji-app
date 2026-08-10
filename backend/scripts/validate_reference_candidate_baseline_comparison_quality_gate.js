"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const DEFAULT_COMPARISON_PATH = path.resolve(
  process.cwd(),
  "ml_models",
  "reference_candidate_baseline_comparison.json",
);

const EXPECTED_SOURCE_NAMES = [
  "datasetSummary",
  "fpSuggestionSummary",
  "fpProposals",
  "generationStatus",
  "hybridDevelopmentReport",
  "loocvReport",
  "diagnosisReport",
];

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

function calculateFileSha256(filePath) {
  assertFileExists(filePath, "File");

  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(filePath))
    .digest("hex");
}

function resolvePortablePath(portablePath) {
  if (typeof portablePath !== "string" || portablePath.length === 0) {
    throw new Error("Portable path must be a non-empty string");
  }

  if (path.isAbsolute(portablePath)) {
    throw new Error(`Source path must be relative: ${portablePath}`);
  }

  if (portablePath.includes("\\")) {
    throw new Error(`Source path must use forward slashes: ${portablePath}`);
  }

  return path.resolve(process.cwd(), ...portablePath.split("/"));
}

function addFailure(failures, code, message, details = null) {
  failures.push({
    code,
    message,
    details,
  });
}

function validateMetrics({ metrics, location, expectedRowCount = null }) {
  const failures = [];

  if (!metrics || typeof metrics !== "object") {
    addFailure(failures, "missing_metrics", `${location} metrics are missing.`);

    return failures;
  }

  const countNames = [
    "truePositive",
    "trueNegative",
    "falsePositive",
    "falseNegative",
  ];

  for (const countName of countNames) {
    const value = metrics[countName];

    if (!Number.isInteger(value) || value < 0) {
      addFailure(
        failures,
        "invalid_metric_count",
        `${location}.${countName} must be a non-negative integer.`,
        {
          actualValue: value,
        },
      );
    }
  }

  if (failures.length > 0) {
    return failures;
  }

  const calculatedRowCount =
    metrics.truePositive +
    metrics.trueNegative +
    metrics.falsePositive +
    metrics.falseNegative;

  if (expectedRowCount !== null && calculatedRowCount !== expectedRowCount) {
    addFailure(
      failures,
      "metric_row_count_mismatch",
      `${location} contains ${calculatedRowCount} rows, ` +
        `expected ${expectedRowCount}.`,
    );
  }

  if (
    metrics.rowCount !== undefined &&
    metrics.rowCount !== calculatedRowCount
  ) {
    addFailure(
      failures,
      "stored_row_count_mismatch",
      `${location}.rowCount=${metrics.rowCount}, ` +
        `calculated=${calculatedRowCount}.`,
    );
  }

  return failures;
}

function validateSources(sources) {
  const failures = [];
  const observed = [];

  if (!sources || typeof sources !== "object") {
    addFailure(failures, "missing_sources", "Comparison sources are missing.");

    return {
      failures,
      observed,
    };
  }

  for (const sourceName of EXPECTED_SOURCE_NAMES) {
    const source = sources[sourceName];

    if (!source) {
      addFailure(
        failures,
        "missing_source",
        `Required source is missing: ${sourceName}.`,
      );

      continue;
    }

    let absolutePath;

    try {
      absolutePath = resolvePortablePath(source.path);
    } catch (error) {
      addFailure(
        failures,
        "invalid_source_path",
        `${sourceName}: ${error.message}`,
      );

      continue;
    }

    if (!fs.existsSync(absolutePath)) {
      addFailure(
        failures,
        "source_file_missing",
        `${sourceName} file does not exist: ${source.path}.`,
      );

      continue;
    }

    const actualSha256 = calculateFileSha256(absolutePath);

    if (actualSha256 !== source.sha256) {
      addFailure(
        failures,
        "source_sha256_mismatch",
        `${sourceName} SHA-256 does not match.`,
        {
          expected: source.sha256,
          actual: actualSha256,
          path: source.path,
        },
      );
    }

    observed.push({
      name: sourceName,
      path: source.path,
      expectedSha256: source.sha256,
      actualSha256,
      matches: actualSha256 === source.sha256,
    });
  }

  const unexpectedSourceNames = Object.keys(sources).filter(
    (sourceName) => !EXPECTED_SOURCE_NAMES.includes(sourceName),
  );

  if (unexpectedSourceNames.length > 0) {
    addFailure(
      failures,
      "unexpected_sources",
      "Comparison contains unexpected sources.",
      {
        sourceNames: unexpectedSourceNames,
      },
    );
  }

  return {
    failures,
    observed,
  };
}

function findAlternative(alternatives, alternativeId) {
  return (
    alternatives?.find((alternative) => alternative.id === alternativeId) ??
    null
  );
}

function evaluateBaselineComparisonGate(comparison) {
  const technicalFailures = [];
  const decisionFailures = [];
  const warnings = [];

  if (!comparison || typeof comparison !== "object") {
    addFailure(
      technicalFailures,
      "invalid_comparison",
      "Baseline comparison must be an object.",
    );

    return {
      technicalGatePassed: false,
      decisionGatePassed: false,
      phaseOneCompleted: false,
      productionPromotionReady: false,
      technicalFailures,
      decisionFailures,
      warnings,
      observed: {},
    };
  }

  if (comparison.schemaVersion !== 1) {
    addFailure(
      technicalFailures,
      "unsupported_schema_version",
      `Expected schemaVersion=1, actual=${comparison.schemaVersion}.`,
    );
  }

  if (comparison.integrity?.passed !== true) {
    addFailure(
      technicalFailures,
      "comparison_integrity_failed",
      "Comparison integrity.passed is not true.",
    );
  }

  const sourceValidation = validateSources(comparison.sources);

  technicalFailures.push(...sourceValidation.failures);

  const descriptorMetrics = comparison.knownDataset?.descriptorMetrics;

  const fpSafeMetrics = comparison.knownDataset?.fpSafeMetrics;

  technicalFailures.push(
    ...validateMetrics({
      metrics: descriptorMetrics,
      location: "knownDataset.descriptorMetrics",
      expectedRowCount: 565,
    }),
  );

  technicalFailures.push(
    ...validateMetrics({
      metrics: fpSafeMetrics,
      location: "knownDataset.fpSafeMetrics",
      expectedRowCount: 565,
    }),
  );

  const descriptorAlternative = findAlternative(
    comparison.knownDataset?.alternatives,
    "descriptor_base",
  );

  const fpSafeAlternative = findAlternative(
    comparison.knownDataset?.alternatives,
    "fp_safe_patch_proposals",
  );

  const loocvDescriptor = findAlternative(
    comparison.leaveOneKanjiOut?.alternatives,
    "loocv_descriptor",
  );

  const loocvPureMl = findAlternative(
    comparison.leaveOneKanjiOut?.alternatives,
    "loocv_pure_ml",
  );

  const loocvHybrid = findAlternative(
    comparison.leaveOneKanjiOut?.alternatives,
    "loocv_hybrid",
  );

  const requiredAlternatives = [
    ["descriptor_base", descriptorAlternative],
    ["fp_safe_patch_proposals", fpSafeAlternative],
    ["loocv_descriptor", loocvDescriptor],
    ["loocv_pure_ml", loocvPureMl],
    ["loocv_hybrid", loocvHybrid],
  ];

  for (const [alternativeId, alternative] of requiredAlternatives) {
    if (!alternative) {
      addFailure(
        technicalFailures,
        "missing_alternative",
        `Required alternative is missing: ${alternativeId}.`,
      );
    }
  }

  const knownDatasetFpReduction =
    descriptorMetrics && fpSafeMetrics
      ? descriptorMetrics.falsePositive - fpSafeMetrics.falsePositive
      : null;

  if (descriptorMetrics?.falseNegative !== 0) {
    addFailure(
      decisionFailures,
      "descriptor_not_fn_safe",
      `Descriptor FN=${descriptorMetrics?.falseNegative}, expected 0.`,
    );
  }

  if (fpSafeMetrics?.falseNegative !== 0) {
    addFailure(
      decisionFailures,
      "fp_safe_candidate_not_fn_safe",
      `FP-safe candidate FN=${fpSafeMetrics?.falseNegative}, expected 0.`,
    );
  }

  if (knownDatasetFpReduction !== 40) {
    addFailure(
      decisionFailures,
      "unexpected_fp_safe_reduction",
      `FP-safe reduction=${knownDatasetFpReduction}, expected 40.`,
    );
  }

  if (comparison.knownDataset?.proposalCount !== 14) {
    addFailure(
      decisionFailures,
      "unexpected_proposal_count",
      `FP-safe proposal count=${comparison.knownDataset?.proposalCount}, ` +
        "expected 14.",
    );
  }

  if (fpSafeAlternative && fpSafeAlternative.manualReviewRequired !== true) {
    addFailure(
      decisionFailures,
      "fp_safe_manual_review_missing",
      "FP-safe proposals must require manual review.",
    );
  }

  if (fpSafeAlternative && fpSafeAlternative.automaticallyPromoted !== false) {
    addFailure(
      decisionFailures,
      "fp_safe_automatic_promotion_detected",
      "FP-safe proposals must not be automatically promoted.",
    );
  }

  if (loocvDescriptor?.metrics.falseNegative !== 0) {
    addFailure(
      decisionFailures,
      "loocv_descriptor_not_fn_safe",
      "LOOCV descriptor must remain FN-safe.",
    );
  }

  if (loocvPureMl?.metrics.falseNegative !== 3) {
    addFailure(
      decisionFailures,
      "unexpected_loocv_pure_ml_fn",
      `LOOCV pure ML FN=${loocvPureMl?.metrics.falseNegative}, expected 3.`,
    );
  }

  if (loocvHybrid?.metrics.falseNegative !== 3) {
    addFailure(
      decisionFailures,
      "unexpected_loocv_hybrid_fn",
      `LOOCV hybrid FN=${loocvHybrid?.metrics.falseNegative}, expected 3.`,
    );
  }

  if (comparison.leaveOneKanjiOut?.hybridPromotionBlocked !== true) {
    addFailure(
      decisionFailures,
      "hybrid_promotion_not_blocked",
      "LOOCV hybrid promotion must be blocked.",
    );
  }

  const affectedKanjis =
    comparison.leaveOneKanjiOut?.affectedFalseNegativeKanjis ?? [];

  if (JSON.stringify(affectedKanjis) !== JSON.stringify(["本", "木"])) {
    addFailure(
      decisionFailures,
      "unexpected_false_negative_kanjis",
      "Expected held-out false negatives in 本 and 木.",
      {
        actual: affectedKanjis,
      },
    );
  }

  if (
    comparison.finalDecision?.currentOfficialValidator !== "descriptor_base"
  ) {
    addFailure(
      decisionFailures,
      "unexpected_official_validator",
      `Current official validator is ` +
        `${comparison.finalDecision?.currentOfficialValidator}.`,
    );
  }

  if (
    comparison.finalDecision?.bestReviewableCandidate !==
    "fp_safe_patch_proposals"
  ) {
    addFailure(
      decisionFailures,
      "unexpected_reviewable_candidate",
      `Best reviewable candidate is ` +
        `${comparison.finalDecision?.bestReviewableCandidate}.`,
    );
  }

  if (comparison.finalDecision?.pureMlPromotionReady !== false) {
    addFailure(
      decisionFailures,
      "pure_ml_promotion_not_blocked",
      "Pure ML promotion must remain blocked.",
    );
  }

  if (comparison.finalDecision?.hybridPromotionReady !== false) {
    addFailure(
      decisionFailures,
      "hybrid_promotion_ready",
      "Hybrid promotion must remain blocked.",
    );
  }

  if (comparison.finalDecision?.fpSafeAutomaticPromotionReady !== false) {
    addFailure(
      decisionFailures,
      "fp_safe_automatic_promotion_ready",
      "FP-safe automatic promotion must remain blocked.",
    );
  }

  if (comparison.finalDecision?.productionPromotionReady !== false) {
    addFailure(
      decisionFailures,
      "production_promotion_ready",
      "Production promotion must remain blocked.",
    );
  }

  warnings.push({
    code: "fp_safe_known_dataset_only",
    message:
      "FP-safe proposals were generated and evaluated on the known dataset.",
  });

  warnings.push({
    code: "fp_safe_manual_review_required",
    message: "The fourteen FP-safe proposals require individual manual review.",
  });

  warnings.push({
    code: "external_unseen_dataset_required",
    message: "A separately reserved unseen-kanji dataset is still required.",
  });

  warnings.push({
    code: "logistic_hybrid_not_fn_safe",
    message: "The logistic hybrid introduces three held-out false negatives.",
  });

  const technicalGatePassed = technicalFailures.length === 0;

  const decisionGatePassed =
    technicalGatePassed && decisionFailures.length === 0;

  return {
    technicalGatePassed,
    decisionGatePassed,
    phaseOneCompleted: decisionGatePassed,
    productionPromotionReady: false,
    technicalFailures,
    decisionFailures,
    warnings,
    observed: {
      descriptorMetrics,
      fpSafeMetrics,
      knownDatasetFpReduction,
      proposalCount: comparison.knownDataset?.proposalCount ?? null,
      officialValidator:
        comparison.finalDecision?.currentOfficialValidator ?? null,
      bestReviewableCandidate:
        comparison.finalDecision?.bestReviewableCandidate ?? null,
      loocvPureMlFalseNegative: loocvPureMl?.metrics.falseNegative ?? null,
      loocvHybridFalseNegative: loocvHybrid?.metrics.falseNegative ?? null,
      affectedFalseNegativeKanjis: affectedKanjis,
      sourceCount: sourceValidation.observed.length,
      sourceValidation: sourceValidation.observed,
    },
  };
}

function formatMetrics(metrics) {
  if (!metrics) {
    return "n/a";
  }

  return (
    `TP=${metrics.truePositive}, ` +
    `TN=${metrics.trueNegative}, ` +
    `FP=${metrics.falsePositive}, ` +
    `FN=${metrics.falseNegative}`
  );
}

function printIssues(title, issues) {
  console.log("");
  console.log(title);
  console.log("-".repeat(title.length));

  if (issues.length === 0) {
    console.log("None");
    return;
  }

  for (const issue of issues) {
    console.log(`- [${issue.code}] ${issue.message}`);
  }
}

function printGate({ comparisonPath, comparisonSha256, result }) {
  console.log("");
  console.log("REFERENCE CANDIDATE BASELINE V1 QUALITY GATE");

  console.log("============================================");

  console.log(`Comparison: ${comparisonPath}`);

  console.log(`Comparison SHA-256: ${comparisonSha256}`);

  console.log("");
  console.log("Observed");
  console.log("--------");

  console.log(
    `Descriptor: ${formatMetrics(result.observed.descriptorMetrics)}`,
  );

  console.log(`FP-safe: ${formatMetrics(result.observed.fpSafeMetrics)}`);

  console.log(
    `FP-safe reduction: ` + `${result.observed.knownDatasetFpReduction}`,
  );

  console.log(`FP-safe proposals: ` + `${result.observed.proposalCount}`);

  console.log(
    `LOOCV pure ML FN: ` + `${result.observed.loocvPureMlFalseNegative}`,
  );

  console.log(
    `LOOCV hybrid FN: ` + `${result.observed.loocvHybridFalseNegative}`,
  );

  console.log(
    `Affected kanjis: ` +
      `${result.observed.affectedFalseNegativeKanjis.join(", ")}`,
  );

  console.log(`Validated sources: ` + `${result.observed.sourceCount}`);

  console.log("");
  console.log("Decision");
  console.log("--------");

  console.log(`Official validator: ` + `${result.observed.officialValidator}`);

  console.log(
    `Best reviewable candidate: ` +
      `${result.observed.bestReviewableCandidate}`,
  );

  console.log(`Technical failures: ` + `${result.technicalFailures.length}`);

  console.log(`Decision failures: ` + `${result.decisionFailures.length}`);

  console.log(`Warnings: ` + `${result.warnings.length}`);

  console.log(`Technical gate passed: ` + `${result.technicalGatePassed}`);

  console.log(`Decision gate passed: ` + `${result.decisionGatePassed}`);

  console.log(`Phase 1 completed: ` + `${result.phaseOneCompleted}`);

  console.log(
    `Production promotion ready: ` + `${result.productionPromotionReady}`,
  );

  printIssues("Technical failures", result.technicalFailures);

  printIssues("Decision failures", result.decisionFailures);

  printIssues("Warnings", result.warnings);
}

function main() {
  try {
    const comparison = readJson(DEFAULT_COMPARISON_PATH, "Baseline comparison");

    const result = evaluateBaselineComparisonGate(comparison);

    printGate({
      comparisonPath: DEFAULT_COMPARISON_PATH,
      comparisonSha256: calculateFileSha256(DEFAULT_COMPARISON_PATH),
      result,
    });

    if (!result.technicalGatePassed) {
      process.exitCode = 1;
      return;
    }

    if (!result.decisionGatePassed) {
      process.exitCode = 1;
      return;
    }

    console.log("");
    console.log("Reference candidate baseline v1 closed successfully.");
  } catch (error) {
    console.error("");
    console.error(`Baseline v1 quality gate failed: ${error.message}`);

    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  EXPECTED_SOURCE_NAMES,
  assertFileExists,
  readJson,
  calculateFileSha256,
  resolvePortablePath,
  validateMetrics,
  validateSources,
  findAlternative,
  evaluateBaselineComparisonGate,
  formatMetrics,
  main,
};
