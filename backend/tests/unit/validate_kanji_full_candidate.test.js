const test = require("node:test");

const assert = require("node:assert/strict");

const {
  validateKanjiEntry,
  buildValidationReport,
} = require("../../scripts/validate_kanji_full_candidate");

test("validateKanjiEntry should report missing kanji entries", () => {
  const result = validateKanjiEntry({
    dataset: {},
    kanji: "田",
  });

  assert.equal(result.exists, false);

  assert.equal(result.ok, false);

  assert.equal(result.warningCount, 1);

  assert.equal(result.warnings[0].type, "missing_kanji_entry");
});

test("buildValidationReport should summarize valid and invalid results", () => {
  const report = buildValidationReport({
    datasetPath: "./kanji_full_candidate.json",
    kanjiList: ["一", "田"],
    results: [
      {
        kanji: "一",
        ok: true,
      },
      {
        kanji: "田",
        ok: false,
      },
    ],
  });

  assert.equal(report.kanjiCount, 2);

  assert.equal(report.validCount, 1);

  assert.equal(report.invalidCount, 1);

  assert.equal(report.ok, false);
});
