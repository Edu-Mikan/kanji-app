const test = require("node:test");

const assert = require("node:assert/strict");

const {
  prepareReferenceStrokes,
  extractReferenceFeatures,
} = require("../../scripts/extract_reference_features");

function createSimpleStroke() {
  return {
    x: [0, 1],
    y: [0.5, 0.5],
  };
}

test("prepareReferenceStrokes should preserve raw, normalized and resampled strokes", () => {
  const rawStrokes = [createSimpleStroke()];

  const prepared = prepareReferenceStrokes(rawStrokes);

  assert.equal(prepared.raw, rawStrokes);

  assert.equal(prepared.normalized.length, 1);

  assert.equal(prepared.resampled.length, 1);

  assert.equal(prepared.resampled[0].x.length, 20);

  assert.equal(prepared.resampled[0].y.length, 20);
});

test("extractReferenceFeatures should generate geometry for a reference kanji", () => {
  const result = extractReferenceFeatures({
    kanji: "一",
    rawStrokes: [createSimpleStroke()],
  });

  assert.equal(result.kanji, "一");

  assert.equal(result.strokeCount, 1);

  assert.equal(result.reference.rawStrokeCount, 1);

  assert.ok(result.features.geometry);

  assert.equal(result.features.geometry.perStroke.length, 1);
});
