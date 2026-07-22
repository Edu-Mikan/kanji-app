const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getTargetKanjis,
  getKanjiSvgFileName,
  extractPathDataFromSvg,
  parsePathDataToPoints,
  convertSvgToStrokes,
  getKanjiFromSvgFileName,
  isCjkCharacter,
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

test("getKanjiFromSvgFileName should convert SVG file name to kanji", () => {
  assert.equal(getKanjiFromSvgFileName("07530.svg"), "田");
});

test("getKanjiFromSvgFileName should ignore invalid file names", () => {
  assert.equal(getKanjiFromSvgFileName("not-a-kanji.svg"), null);

  assert.equal(getKanjiFromSvgFileName("07530.txt"), null);
});

test("isCjkCharacter should accept CJK ideographs", () => {
  assert.equal(isCjkCharacter("田"), true);

  assert.equal(isCjkCharacter("一"), true);
});
test("isCjkCharacter should reject ASCII characters", () => {
  assert.equal(isCjkCharacter("A"), false);

  assert.equal(isCjkCharacter("0"), false);

  assert.equal(isCjkCharacter("?"), false);
});
