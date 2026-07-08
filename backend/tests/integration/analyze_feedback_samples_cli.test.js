const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawnSync } = require("child_process");

function runCli(args) {
  const backendRoot = path.resolve(__dirname, "../..");

  return spawnSync("node", ["scripts/analyze_feedback_samples.js", ...args], {
    cwd: backendRoot,
    encoding: "utf-8",
  });
}

test("analyze_feedback_samples CLI should print help", () => {
  const result = runCli(["--help"]);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Kanji feedback analyzer/);
  assert.match(result.stdout, /--file/);
  assert.match(result.stdout, /--mongo/);
});

test("analyze_feedback_samples CLI should revalidate one kanji and write JSON report", () => {
  const backendRoot = path.resolve(__dirname, "../..");

  const fixturePath = path.resolve(
    backendRoot,
    "tests/fixtures/global_baseline.jsonl",
  );

  assert.ok(fs.existsSync(fixturePath), `Missing fixture file: ${fixturePath}`);

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "kanji-cli-test-"));

  const outputPath = path.join(tempDir, "wood_report.json");

  const result = runCli([
    "--file",
    fixturePath,
    "--kanji",
    "木",
    "--revalidate",
    "--out-json",
    outputPath,
  ]);

  assert.equal(
    result.status,
    0,
    [
      "Expected CLI to exit successfully.",
      "",
      "STDOUT:",
      result.stdout,
      "",
      "STDERR:",
      result.stderr,
    ].join("\n"),
  );

  assert.match(result.stdout, /Revalidation: enabled/);
  assert.match(result.stdout, /## 木/);

  assert.ok(
    fs.existsSync(outputPath),
    `Expected output JSON file: ${outputPath}`,
  );

  const report = JSON.parse(fs.readFileSync(outputPath, "utf-8"));

  assert.equal(report.options.revalidate, true);
  assert.equal(report.options.kanjiFilter, "木");
  assert.equal(report.totalKanjis, 1);
  assert.equal(report.kanjis.length, 1);
  assert.equal(report.kanjis[0].kanji, "木");

  assert.equal(report.global.falseNegativeCount, 0);
  assert.equal(report.global.falsePositiveCount, 0);

  assert.equal(report.kanjis[0].falseNegativeCount, 0);
  assert.equal(report.kanjis[0].falsePositiveCount, 0);

  fs.rmSync(tempDir, {
    recursive: true,
    force: true,
  });
});

test("analyze_feedback_samples CLI should fail for missing file", () => {
  const result = runCli(["--file", "./tests/fixtures/does_not_exist.jsonl"]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /ERROR/);
  assert.match(result.stderr, /File not found/);
});
