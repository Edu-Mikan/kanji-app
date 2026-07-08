const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawnSync } = require("child_process");

test("global descriptor baseline should remain stable after revalidation", () => {
  const backendRoot = path.resolve(__dirname, "../..");

  const fixturePath = path.resolve(
    backendRoot,
    "tests/fixtures/global_baseline.jsonl",
  );

  assert.ok(fs.existsSync(fixturePath), `Missing fixture file: ${fixturePath}`);

  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "kanji-revalidate-test-"),
  );

  const outputPath = path.join(tempDir, "global_revalidate_report.json");

  const result = spawnSync(
    "node",
    [
      "scripts/analyze_feedback_samples.js",
      "--file",
      fixturePath,
      "--revalidate",
      "--out-json",
      outputPath,
    ],
    {
      cwd: backendRoot,
      encoding: "utf-8",
    },
  );

  assert.equal(
    result.status,
    0,
    [
      "Expected analyze_feedback_samples.js to exit successfully.",
      "",
      "STDOUT:",
      result.stdout,
      "",
      "STDERR:",
      result.stderr,
    ].join("\n"),
  );

  assert.ok(
    fs.existsSync(outputPath),
    `Expected JSON report to be created at ${outputPath}`,
  );

  const report = JSON.parse(fs.readFileSync(outputPath, "utf-8"));

  assert.equal(report.options.revalidate, true);
  assert.equal(report.totalSamples, 189);
  assert.equal(report.totalKanjis, 8);

  assert.equal(report.global.correctCount, 126);
  assert.equal(report.global.incorrectCount, 63);

  assert.equal(report.global.falseNegativeCount, 0);

  // Actualmente aceptamos 4 falsos positivos conocidos:
  // - 日: 1
  // - 田: 2
  // - 用: 1
  assert.equal(report.global.falsePositiveCount, 4);

  const byKanji = Object.fromEntries(
    report.kanjis.map((kanjiReport) => [kanjiReport.kanji, kanjiReport]),
  );

  assert.ok(byKanji["口"], "Missing report for 口");
  assert.ok(byKanji["山"], "Missing report for 山");
  assert.ok(byKanji["日"], "Missing report for 日");
  assert.ok(byKanji["目"], "Missing report for 目");
  assert.ok(byKanji["田"], "Missing report for 田");
  assert.ok(byKanji["回"], "Missing report for 回");
  assert.ok(byKanji["用"], "Missing report for 用");
  assert.ok(byKanji["木"], "Missing report for 木");

  assert.equal(byKanji["口"].falseNegativeCount, 0);
  assert.equal(byKanji["口"].falsePositiveCount, 0);

  assert.equal(byKanji["山"].falseNegativeCount, 0);
  assert.equal(byKanji["山"].falsePositiveCount, 0);

  assert.equal(byKanji["目"].falseNegativeCount, 0);
  assert.equal(byKanji["目"].falsePositiveCount, 0);

  assert.equal(byKanji["回"].falseNegativeCount, 0);
  assert.equal(byKanji["回"].falsePositiveCount, 0);

  assert.equal(byKanji["木"].falseNegativeCount, 0);
  assert.equal(byKanji["木"].falsePositiveCount, 0);

  // Falsos positivos conocidos y aceptados.
  assert.equal(byKanji["日"].falseNegativeCount, 0);
  assert.equal(byKanji["日"].falsePositiveCount, 1);

  assert.equal(byKanji["田"].falseNegativeCount, 0);
  assert.equal(byKanji["田"].falsePositiveCount, 2);

  assert.equal(byKanji["用"].falseNegativeCount, 0);
  assert.equal(byKanji["用"].falsePositiveCount, 1);

  fs.rmSync(tempDir, {
    recursive: true,
    force: true,
  });
});
