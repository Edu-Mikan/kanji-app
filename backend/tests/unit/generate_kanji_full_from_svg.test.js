const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getTargetKanjis,
  getKanjiSvgFileName,
  extractPathDataFromSvg,
  parsePathDataToPoints,
  convertSvgToStrokes,
} = require("../../scripts/generate_kanji_full_from_svg");

test("extractPathDataFromSvg should not confuse id with d attribute", () => {
  const paths = extractPathDataFromSvg(
    '<svg><path id="kvg:07530-s1" d="M0 0 H10 V20"/></svg>',
  );

  assert.deepEqual(paths, ["M0 0 H10 V20"]);
});

test("getTargetKanjis should use single kanji when provided", () => {
  assert.deepEqual(
    getTargetKanjis({
      kanji: "田",
      kanjiList: null,
    }),
    ["田"],
  );
});

test("getTargetKanjis should prefer kanji list over single kanji", () => {
  assert.deepEqual(
    getTargetKanjis({
      kanji: "田",
      kanjiList: ["一", "二", "田"],
    }),
    ["一", "二", "田"],
  );
});
