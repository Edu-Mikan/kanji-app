const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const { validateByDescriptor } = require("../../services/descriptor_validator");

const descriptorsFile = path.resolve(
  __dirname,
  "../../data/kanji_descriptors.json",
);

const honFixtureFile = path.resolve(__dirname, "../fixtures/本_baseline.jsonl");

const descriptors = JSON.parse(
  fs.readFileSync(descriptorsFile, "utf-8"),
).descriptors;

function loadJsonl(filePath) {
  return fs
    .readFileSync(filePath, "utf-8")
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

test("本 descriptor should exist and use tree_with_bottom_mark", () => {
  const descriptor = descriptors["本"];

  assert.ok(descriptor, "Missing descriptor for 本");
  assert.equal(descriptor.enabled, true);
  assert.equal(descriptor.pattern, "tree_with_bottom_mark");
  assert.equal(descriptor.expectedStrokeCount, 5);
});

test("本 manually correct samples should pass validateByDescriptor", () => {
  const samples = loadJsonl(honFixtureFile);
  const descriptor = descriptors["本"];

  const correctSamples = samples.filter((sample) => sample.isCorrect === true);

  assert.ok(correctSamples.length > 0, "Expected correct 本 samples");

  for (const sample of correctSamples) {
    const result = validateByDescriptor({
      kanji: "本",
      features: sample.features,
      descriptor,
    });

    assert.ok(result, `Expected validation result for ${sample.recognitionId}`);
    assert.equal(
      result.isCorrect,
      true,
      `Expected correct sample to pass: ${sample.recognitionId}. Failed checks: ${
        result.failedChecks?.join(", ") ?? ""
      }`,
    );
    assert.equal(
      result.hardFailedChecks.length,
      0,
      `Expected no hard failures for ${sample.recognitionId}`,
    );
    assert.ok(
      result.score <= 0.75,
      `Expected passing score for ${sample.recognitionId}, got ${result.score}`,
    );
  }
});

test("本 manually incorrect samples should fail validateByDescriptor", () => {
  const samples = loadJsonl(honFixtureFile);
  const descriptor = descriptors["本"];

  const incorrectSamples = samples.filter(
    (sample) => sample.isCorrect === false,
  );

  assert.ok(incorrectSamples.length > 0, "Expected incorrect 本 samples");

  for (const sample of incorrectSamples) {
    const result = validateByDescriptor({
      kanji: "本",
      features: sample.features,
      descriptor,
    });

    assert.ok(result, `Expected validation result for ${sample.recognitionId}`);
    assert.equal(
      result.isCorrect,
      false,
      `Expected incorrect sample to fail: ${sample.recognitionId}`,
    );
    assert.ok(
      result.hardFailedChecks.length > 0,
      `Expected hard failures for incorrect sample: ${sample.recognitionId}`,
    );
    assert.ok(
      result.score >= 10,
      `Expected hard failure score for ${sample.recognitionId}, got ${result.score}`,
    );
  }
});

test("本 incorrect samples should include at least one diagonal direction failure", () => {
  const samples = loadJsonl(honFixtureFile);
  const descriptor = descriptors["本"];

  const incorrectSamples = samples.filter(
    (sample) => sample.isCorrect === false,
  );

  const allHardFailures = [];

  for (const sample of incorrectSamples) {
    const result = validateByDescriptor({
      kanji: "本",
      features: sample.features,
      descriptor,
    });

    allHardFailures.push(...result.hardFailedChecks);
  }

  assert.ok(
    allHardFailures.includes("leftDiagonalDirection") ||
      allHardFailures.includes("rightDiagonalDirection"),
    "Expected at least one diagonal direction failure in incorrect 本 samples",
  );
});
