const test = require("node:test");
const assert = require("node:assert/strict");

const {
  scoreStrokeAgainstRole,
  strokeMatchesExpected,
  isExpectedRange,
  isValidExpectedRangeWeight,
  getExpectedRangeWeight,
} = require("../../services/descriptor_validator");

test("isExpectedRange should accept numeric min and max ranges", () => {
  assert.equal(
    isExpectedRange({
      min: 0.2,
    }),
    true,
  );

  assert.equal(
    isExpectedRange({
      max: 0.8,
    }),
    true,
  );

  assert.equal(
    isExpectedRange({
      min: 0.2,
      max: 0.8,
    }),
    true,
  );
});

test("isExpectedRange should reject invalid range definitions", () => {
  assert.equal(isExpectedRange(null), false);
  assert.equal(isExpectedRange({}), false);
  assert.equal(isExpectedRange([]), false);
  assert.equal(isExpectedRange("horizontal"), false);

  assert.equal(
    isExpectedRange({
      min: "0.2",
    }),
    false,
  );
});

test("existing expected range weights should remain stable", () => {
  assert.equal(getExpectedRangeWeight("angleAbs"), 2);

  assert.equal(getExpectedRangeWeight("straightness"), 1.5);

  assert.equal(getExpectedRangeWeight("width"), 1);
});

test("new numeric features should use default weight one", () => {
  assert.equal(getExpectedRangeWeight("cornerCount"), 1);

  assert.equal(getExpectedRangeWeight("relativeLength"), 1);
});

test("strokeMatchesExpected should support new numeric features", () => {
  const stroke = {
    cornerCount: 1,
    directionChanges: 2,
    relativeLength: 0.35,
  };

  const expected = {
    cornerCount: {
      min: 1,
      max: 1,
    },
    directionChanges: {
      min: 1,
      max: 3,
    },
    relativeLength: {
      min: 0.2,
      max: 0.5,
    },
  };

  assert.equal(strokeMatchesExpected(stroke, expected), true);
});

test("strokeMatchesExpected should reject an out-of-range new feature", () => {
  const stroke = {
    cornerCount: 3,
    relativeLength: 0.35,
  };

  const expected = {
    cornerCount: {
      min: 1,
      max: 1,
    },
    relativeLength: {
      min: 0.2,
      max: 0.5,
    },
  };

  assert.equal(strokeMatchesExpected(stroke, expected), false);
});

test("scoreStrokeAgainstRole should penalize new numeric features", () => {
  const stroke = {
    cornerCount: 3,
  };

  const role = {
    expected: {
      cornerCount: {
        min: 1,
        max: 1,
      },
    },
  };

  const score = scoreStrokeAgainstRole(stroke, role);

  assert.equal(score, 2);
});

test("scoreStrokeAgainstRole should preserve existing feature weights", () => {
  const stroke = {
    angleAbs: 0.2,
    straightness: 0.5,
  };

  const role = {
    expected: {
      angleAbs: {
        min: 0.5,
      },
      straightness: {
        min: 0.7,
      },
    },
  };

  const score = scoreStrokeAgainstRole(stroke, role);

  const expectedScore = (0.5 - 0.2) * 2 + (0.7 - 0.5) * 1.5;

  assert.ok(
    Math.abs(score - expectedScore) < 1e-9,
    `Expected ${expectedScore}, received ${score}`,
  );
});

test("isValidExpectedRangeWeight should accept finite non-negative numbers", () => {
  assert.equal(isValidExpectedRangeWeight(0), true);

  assert.equal(isValidExpectedRangeWeight(0.5), true);

  assert.equal(isValidExpectedRangeWeight(2), true);
});

test("isValidExpectedRangeWeight should reject invalid values", () => {
  assert.equal(isValidExpectedRangeWeight(-1), false);

  assert.equal(isValidExpectedRangeWeight("2"), false);

  assert.equal(isValidExpectedRangeWeight(null), false);

  assert.equal(isValidExpectedRangeWeight(NaN), false);

  assert.equal(isValidExpectedRangeWeight(Infinity), false);
});

test("configured expected range weight should override the default", () => {
  const weight = getExpectedRangeWeight("angleAbs", {
    angleAbs: 4,
  });

  assert.equal(weight, 4);
});

test("configured weight should work for new numeric features", () => {
  const weight = getExpectedRangeWeight("cornerCount", {
    cornerCount: 2.5,
  });

  assert.equal(weight, 2.5);
});

test("invalid configured weight should fall back to the default", () => {
  assert.equal(
    getExpectedRangeWeight("angleAbs", {
      angleAbs: -3,
    }),
    2,
  );

  assert.equal(
    getExpectedRangeWeight("cornerCount", {
      cornerCount: "4",
    }),
    1,
  );
});

test("scoreStrokeAgainstRole should apply configured feature weights", () => {
  const stroke = {
    cornerCount: 3,
  };

  const role = {
    expected: {
      cornerCount: {
        min: 1,
        max: 1,
      },
    },
    weights: {
      cornerCount: 2.5,
    },
  };

  const score = scoreStrokeAgainstRole(stroke, role);

  assert.equal(score, 5);
});

test("zero configured weight should remove the scoring penalty", () => {
  const stroke = {
    cornerCount: 5,
  };

  const role = {
    expected: {
      cornerCount: {
        min: 1,
        max: 1,
      },
    },
    weights: {
      cornerCount: 0,
    },
  };

  const score = scoreStrokeAgainstRole(stroke, role);

  assert.equal(score, 0);
});

test("configured weights should not change range validation", () => {
  const stroke = {
    cornerCount: 3,
  };

  const expected = {
    cornerCount: {
      min: 1,
      max: 1,
    },
  };

  assert.equal(strokeMatchesExpected(stroke, expected), false);
});
