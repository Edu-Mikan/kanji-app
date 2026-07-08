const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const descriptorsFile = path.resolve(
  __dirname,
  "../../data/kanji_descriptors.json",
);

test("kanji_descriptors.json should be valid JSON", () => {
  assert.doesNotThrow(() => {
    JSON.parse(fs.readFileSync(descriptorsFile, "utf-8"));
  });
});

test("kanji_descriptors.json should contain descriptors object", () => {
  const parsed = JSON.parse(fs.readFileSync(descriptorsFile, "utf-8"));

  assert.ok(parsed.descriptors, "Missing descriptors root object");
  assert.equal(typeof parsed.descriptors, "object");
});

test("implemented descriptor patterns should exist for current kanjis", () => {
  const parsed = JSON.parse(fs.readFileSync(descriptorsFile, "utf-8"));
  const descriptors = parsed.descriptors;

  const expectedPatterns = {
    山: "three_vertical_zones",
    口: "box_pattern",
    日: "box_with_inner_horizontal",
    目: "box_with_two_inner_horizontals",
    田: "box_with_inner_cross",
    回: "nested_box_pattern",
    用: "open_box_with_inner_vertical_and_horizontals",
    木: "tree_cross_pattern",
  };

  for (const [kanji, expectedPattern] of Object.entries(expectedPatterns)) {
    assert.ok(descriptors[kanji], `Missing descriptor for ${kanji}`);
    assert.equal(
      descriptors[kanji].pattern,
      expectedPattern,
      `${kanji} has unexpected pattern`,
    );
    assert.equal(
      descriptors[kanji].enabled,
      true,
      `${kanji} descriptor should be enabled`,
    );
  }
});
