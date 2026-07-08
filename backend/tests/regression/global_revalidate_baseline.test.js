const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawnSync } = require("child_process");

const ACCEPTED_FALSE_POSITIVES_BY_KANJI = {
  日: 1,
  田: 2,
  用: 1,
  未: 1,
  末: 1,
};

function loadJsonl(filePath) {
  return fs
    .readFileSync(filePath, "utf-8")
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function getExpectedKanji(sample) {
  return sample.expectedKanji ?? sample.kanji;
}

function buildFixtureSummary(fixturePath) {
  const samples = loadJsonl(fixturePath);

  const kanjis = [
    ...new Set(samples.map((sample) => getExpectedKanji(sample))),
  ].sort();

  const correctCount = samples.filter(
    (sample) => sample.isCorrect === true,
  ).length;

  const incorrectCount = samples.filter(
    (sample) => sample.isCorrect === false,
  ).length;

  return {
    totalSamples: samples.length,
    totalKanjis: kanjis.length,
    kanjis,
    correctCount,
    incorrectCount,
  };
}

function sumAcceptedFalsePositives() {
  return Object.values(ACCEPTED_FALSE_POSITIVES_BY_KANJI).reduce(
    (total, value) => total + value,
    0,
  );
}

test("global descriptor baseline should remain stable after revalidation", () => {
  const backendRoot = path.resolve(__dirname, "../..");

  const fixturePath = path.resolve(
    backendRoot,
    "tests/fixtures/global_baseline.jsonl",
  );

  assert.ok(fs.existsSync(fixturePath), `Missing fixture file: ${fixturePath}`);

  const fixtureSummary = buildFixtureSummary(fixturePath);

  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "kanji-revalidate-test-"),
  );

  try {
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

    // Estos valores se derivan de la fixture versionada.
    assert.equal(report.totalSamples, fixtureSummary.totalSamples);
    assert.equal(report.totalKanjis, fixtureSummary.totalKanjis);
    assert.equal(report.global.correctCount, fixtureSummary.correctCount);
    assert.equal(report.global.incorrectCount, fixtureSummary.incorrectCount);

    // Regla global de calidad: no aceptamos falsos negativos.
    assert.equal(report.global.falseNegativeCount, 0);

    // Falsos positivos aceptados explícitamente.
    assert.equal(report.global.falsePositiveCount, sumAcceptedFalsePositives());

    const byKanji = Object.fromEntries(
      report.kanjis.map((kanjiReport) => [kanjiReport.kanji, kanjiReport]),
    );

    const reportedKanjis = Object.keys(byKanji).sort();

    assert.deepEqual(
      reportedKanjis,
      fixtureSummary.kanjis,
      "Reported kanjis should match fixture kanjis",
    );

    for (const kanji of fixtureSummary.kanjis) {
      const kanjiReport = byKanji[kanji];

      assert.ok(kanjiReport, `Missing report for ${kanji}`);

      assert.equal(
        kanjiReport.falseNegativeCount,
        0,
        `${kanji} should have no false negatives`,
      );

      const acceptedFalsePositiveCount =
        ACCEPTED_FALSE_POSITIVES_BY_KANJI[kanji] ?? 0;

      assert.equal(
        kanjiReport.falsePositiveCount,
        acceptedFalsePositiveCount,
        `${kanji} has unexpected false positives`,
      );
    }
  } finally {
    fs.rmSync(tempDir, {
      recursive: true,
      force: true,
    });
  }
});
