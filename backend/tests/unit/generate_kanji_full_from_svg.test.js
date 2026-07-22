const test = require("node:test");
const assert = require("node:assert/strict");
const {
  extractPathDataFromSvg,
} = require("../../../backend/scripts/generate_kanji_full_from_svg");

test("extractPathDataFromSvg should not confuse id with d attribute", () => {
  const paths = extractPathDataFromSvg(
    '<svg><path id="kvg:07530-s1" d="M0 0 H10 V20"/></svg>',
  );

  assert.deepEqual(paths, ["M0 0 H10 V20"]);
});
