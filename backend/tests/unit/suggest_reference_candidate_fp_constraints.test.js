const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parseArgs,
  validateOptions,
  percentile,
  collectMetricRows,
  buildMetricSummary,
  suggestReferenceCandidateFpConstraints,
} = require("../../scripts/suggest_reference_candidate_fp_constraints");

test("parseArgs should parse calibration report and output path", () => {
  const options = parseArgs([
    "--calibration-report",
    "./candidate_reports_training/本_reference_candidate_calibration_report.json",
    "--out-json",
    "./candidate_reports_training/本_reference_candidate_fp_constraint_suggestions.json",
  ]);

  assert.ok(
    options.calibrationReportPath.endsWith(
      "本_reference_candidate_calibration_report.json",
    ),
  );

  assert.ok(
    options.outputPath.endsWith(
      "本_reference_candidate_fp_constraint_suggestions.json",
    ),
  );
});

test("validateOptions should reject missing calibration report", () => {
  assert.throws(
    () =>
      validateOptions({
        outputPath: "./out.json",
        minFalsePositiveReduction: 1,
        maxSuggestions: 50,
        help: false,
      }),
    /Missing --calibration-report/,
  );
});

test("percentile should return expected nearest-rank value", () => {
  assert.equal(percentile([1, 2, 3, 4, 5], 50), 3);

  assert.equal(percentile([1, 2, 3, 4, 5], 95), 5);
});

test("collectMetricRows should collect reference and per-role metrics", () => {
  const rows = collectMetricRows({
    sampleEvaluations: [
      {
        recognitionId: "tp1",
        classification: "truePositive",
        referenceComparison: {
          comparisonCost: 0.1,
          meanRoleCost: 0.1,
          maxRoleCost: 0.2,
        },
        perRoleReferenceComparison: {
          role_stroke0_horizontal: {
            centerDistance: 0.05,
            comparisonCost: 0.08,
          },
        },
      },
      {
        recognitionId: "fp1",
        classification: "falsePositive",
        referenceComparison: {
          comparisonCost: 0.4,
          meanRoleCost: 0.4,
          maxRoleCost: 0.5,
        },
        perRoleReferenceComparison: {
          role_stroke0_horizontal: {
            centerDistance: 0.3,
            comparisonCost: 0.35,
          },
        },
      },
    ],
  });

  assert.ok(
    rows.some(
      (row) =>
        row.metricPath === "referenceComparison.comparisonCost" &&
        row.value === 0.1,
    ),
  );

  assert.ok(
    rows.some(
      (row) =>
        row.metricPath === "perRole.role_stroke0_horizontal.centerDistance" &&
        row.value === 0.3,
    ),
  );
});

test("buildMetricSummary should calculate safe false positive reduction", () => {
  const metricRows = [
    {
      recognitionId: "tp1",
      classification: "truePositive",
      metricPath: "perRole.role.centerDistance",
      value: 0.1,
    },
    {
      recognitionId: "tp2",
      classification: "truePositive",
      metricPath: "perRole.role.centerDistance",
      value: 0.2,
    },
    {
      recognitionId: "fp1",
      classification: "falsePositive",
      metricPath: "perRole.role.centerDistance",
      value: 0.25,
    },
    {
      recognitionId: "fp2",
      classification: "falsePositive",
      metricPath: "perRole.role.centerDistance",
      value: 0.4,
    },
  ];

  const summary = buildMetricSummary({
    metricPath: "perRole.role.centerDistance",
    metricRows,
  });

  assert.equal(summary.threshold, 0.2);

  assert.equal(summary.falsePositiveReduction, 2);

  assert.equal(summary.truePositiveLoss, 0);

  assert.equal(summary.safe, true);
});

test("suggestReferenceCandidateFpConstraints should suggest safe constraints sorted by reduction", () => {
  const report = suggestReferenceCandidateFpConstraints({
    calibrationReport: {
      kanji: "本",
      classifications: {
        truePositive: 2,
        falsePositive: 2,
      },
      sampleEvaluations: [
        {
          recognitionId: "tp1",
          classification: "truePositive",
          perRoleReferenceComparison: {
            role_stroke4_horizontal: {
              centerDistance: 0.1,
            },
          },
        },
        {
          recognitionId: "tp2",
          classification: "truePositive",
          perRoleReferenceComparison: {
            role_stroke4_horizontal: {
              centerDistance: 0.2,
            },
          },
        },
        {
          recognitionId: "fp1",
          classification: "falsePositive",
          perRoleReferenceComparison: {
            role_stroke4_horizontal: {
              centerDistance: 0.25,
            },
          },
        },
        {
          recognitionId: "fp2",
          classification: "falsePositive",
          perRoleReferenceComparison: {
            role_stroke4_horizontal: {
              centerDistance: 0.4,
            },
          },
        },
      ],
    },
    minFalsePositiveReduction: 1,
    maxSuggestions: 10,
  });

  assert.equal(report.suggestionCount, 1);

  assert.equal(
    report.suggestions[0].metricPath,
    "perRole.role_stroke4_horizontal.centerDistance",
  );

  assert.equal(report.suggestions[0].max, 0.2);

  assert.equal(report.suggestions[0].evidence.falsePositiveReduction, 2);

  assert.equal(report.suggestions[0].evidence.truePositiveLoss, 0);
});
