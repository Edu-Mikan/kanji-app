const test = require("node:test");
const assert = require("node:assert/strict");

const descriptorData = require("../../data/kanji_descriptors.json");

const {
  buildRelationCheckName,
  isExpectedRange,
} = require("../../services/descriptor_validator");

const descriptors = descriptorData.descriptors ?? {};

const KNOWN_RELATION_TYPES = new Set([
  "leftOf",
  "rightOf",
  "above",
  "centerXGap",
  "centerXDistance",
  "heightRatio",
  "centerYNotMuchHigher",
  "overlapsX",
  "orthogonalCross",
  "containsGroup",
  "startsNearTopZone",
  "extendsDownFrom",
  "centerXRange",
  "centerYRange",
  "belowBBox",
  "direction",
  "intersects",
  "touches",
  "connects",
  "disconnected",
]);

function getDescriptorEntries() {
  return Object.entries(descriptors);
}

function getRoleIds(descriptor) {
  return (descriptor.strokes ?? []).map((stroke) => stroke.id);
}

function getPossibleCheckNames(descriptor) {
  const possibleCheckNames = new Set(["strokeCount", "referenceStrokeCount"]);

  for (const stroke of descriptor.strokes ?? []) {
    possibleCheckNames.add(`${stroke.id}.matches`);
  }

  for (const relation of descriptor.relations ?? []) {
    possibleCheckNames.add(buildRelationCheckName(relation));
  }

  for (const globalCheckName of Object.keys(descriptor.globalChecks ?? {})) {
    possibleCheckNames.add(globalCheckName);
  }

  return possibleCheckNames;
}

function assertRoleExists({ kanji, roleIds, roleId, location }) {
  assert.equal(
    typeof roleId,
    "string",
    `${kanji}: ${location} must reference a string role id`,
  );

  assert.ok(
    roleIds.has(roleId),
    `${kanji}: ${location} references unknown role "${roleId}"`,
  );
}

test("descriptor collection should exist and not be empty", () => {
  assert.equal(typeof descriptors, "object");

  assert.equal(Array.isArray(descriptors), false);

  assert.ok(
    getDescriptorEntries().length > 0,
    "Expected at least one kanji descriptor",
  );
});

test("all descriptors should use the declarative format", () => {
  for (const [kanji, descriptor] of getDescriptorEntries()) {
    assert.equal(
      descriptor.expectedStrokeCount,
      undefined,
      `${kanji}: expectedStrokeCount is a legacy property`,
    );

    assert.equal(
      descriptor.rules,
      undefined,
      `${kanji}: rules is a legacy property`,
    );

    assert.equal(
      Number.isInteger(descriptor.strokeCount),
      true,
      `${kanji}: strokeCount must be an integer`,
    );

    assert.ok(
      descriptor.strokeCount > 0,
      `${kanji}: strokeCount must be greater than zero`,
    );

    assert.equal(
      Array.isArray(descriptor.strokes),
      true,
      `${kanji}: strokes must be an array`,
    );

    assert.equal(
      descriptor.strokes.length,
      descriptor.strokeCount,
      `${kanji}: strokes.length must equal strokeCount`,
    );
  }
});

test("all descriptor role ids should be valid and unique", () => {
  for (const [kanji, descriptor] of getDescriptorEntries()) {
    const roleIds = getRoleIds(descriptor);

    for (const roleId of roleIds) {
      assert.equal(
        typeof roleId,
        "string",
        `${kanji}: every role id must be a string`,
      );

      assert.ok(
        roleId.trim().length > 0,
        `${kanji}: role ids must not be empty`,
      );
    }

    assert.equal(
      new Set(roleIds).size,
      roleIds.length,
      `${kanji}: role ids must be unique`,
    );
  }
});

test("all descriptor roles should define valid expected ranges", () => {
  for (const [kanji, descriptor] of getDescriptorEntries()) {
    for (const role of descriptor.strokes) {
      assert.equal(
        typeof role.expected,
        "object",
        `${kanji}.${role.id}: expected must be an object`,
      );

      assert.equal(
        Array.isArray(role.expected),
        false,
        `${kanji}.${role.id}: expected must not be an array`,
      );

      const expectedEntries = Object.entries(role.expected);

      assert.ok(
        expectedEntries.length > 0,
        `${kanji}.${role.id}: expected must define at least one range`,
      );

      for (const [featureName, range] of expectedEntries) {
        assert.equal(
          isExpectedRange(range),
          true,
          `${kanji}.${role.id}.${featureName}: invalid expected range`,
        );

        if (range.min != null) {
          assert.equal(
            Number.isFinite(range.min),
            true,
            `${kanji}.${role.id}.${featureName}: min must be finite`,
          );
        }

        if (range.max != null) {
          assert.equal(
            Number.isFinite(range.max),
            true,
            `${kanji}.${role.id}.${featureName}: max must be finite`,
          );
        }

        if (range.min != null && range.max != null) {
          assert.ok(
            range.min <= range.max,
            `${kanji}.${role.id}.${featureName}: min must not exceed max`,
          );
        }
      }
    }
  }
});

test("all configured role weights should be finite and non-negative", () => {
  for (const [kanji, descriptor] of getDescriptorEntries()) {
    for (const role of descriptor.strokes) {
      for (const [featureName, weight] of Object.entries(role.weights ?? {})) {
        assert.equal(
          Number.isFinite(weight),
          true,
          `${kanji}.${role.id}.weights.${featureName}: weight must be finite`,
        );

        assert.ok(
          weight >= 0,
          `${kanji}.${role.id}.weights.${featureName}: weight must not be negative`,
        );

        assert.ok(
          Object.hasOwn(role.expected, featureName),
          `${kanji}.${role.id}.weights.${featureName}: weight references a feature without an expected range`,
        );
      }
    }
  }
});

test("all descriptors should use known relation types", () => {
  for (const [kanji, descriptor] of getDescriptorEntries()) {
    for (const relation of descriptor.relations ?? []) {
      assert.equal(
        typeof relation.type,
        "string",
        `${kanji}: relation type must be a string`,
      );

      assert.ok(
        KNOWN_RELATION_TYPES.has(relation.type),
        `${kanji}: unknown relation type "${relation.type}"`,
      );
    }
  }
});

test("all descriptor relations should reference existing roles", () => {
  for (const [kanji, descriptor] of getDescriptorEntries()) {
    const roleIds = new Set(getRoleIds(descriptor));

    for (const relation of descriptor.relations ?? []) {
      const relationName = buildRelationCheckName(relation);

      if (relation.from != null) {
        assertRoleExists({
          kanji,
          roleIds,
          roleId: relation.from,
          location: `${relationName}.from`,
        });
      }

      if (relation.to != null) {
        assertRoleExists({
          kanji,
          roleIds,
          roleId: relation.to,
          location: `${relationName}.to`,
        });
      }

      if (relation.stroke != null) {
        assertRoleExists({
          kanji,
          roleIds,
          roleId: relation.stroke,
          location: `${relationName}.stroke`,
        });
      }

      if (relation.outer != null) {
        assert.equal(
          Array.isArray(relation.outer),
          true,
          `${kanji}: ${relationName}.outer must be an array`,
        );

        assert.ok(
          relation.outer.length > 0,
          `${kanji}: ${relationName}.outer must not be empty`,
        );

        for (const roleId of relation.outer) {
          assertRoleExists({
            kanji,
            roleIds,
            roleId,
            location: `${relationName}.outer`,
          });
        }
      }

      if (relation.inner != null) {
        assert.equal(
          Array.isArray(relation.inner),
          true,
          `${kanji}: ${relationName}.inner must be an array`,
        );

        assert.ok(
          relation.inner.length > 0,
          `${kanji}: ${relationName}.inner must not be empty`,
        );

        for (const roleId of relation.inner) {
          assertRoleExists({
            kanji,
            roleIds,
            roleId,
            location: `${relationName}.inner`,
          });
        }
      }
    }
  }
});

test("all global checks should define valid ranges", () => {
  for (const [kanji, descriptor] of getDescriptorEntries()) {
    for (const [checkName, range] of Object.entries(
      descriptor.globalChecks ?? {},
    )) {
      assert.equal(
        isExpectedRange(range),
        true,
        `${kanji}.globalChecks.${checkName}: invalid expected range`,
      );

      if (range.min != null && range.max != null) {
        assert.ok(
          range.min <= range.max,
          `${kanji}.globalChecks.${checkName}: min must not exceed max`,
        );
      }
    }
  }
});

test("all hard checks should reference checks produced by the descriptor", () => {
  for (const [kanji, descriptor] of getDescriptorEntries()) {
    assert.equal(
      Array.isArray(descriptor.hardChecks),
      true,
      `${kanji}: hardChecks must be an array`,
    );

    const possibleCheckNames = getPossibleCheckNames(descriptor);

    for (const hardCheckName of descriptor.hardChecks) {
      assert.equal(
        typeof hardCheckName,
        "string",
        `${kanji}: hard check names must be strings`,
      );

      assert.ok(
        possibleCheckNames.has(hardCheckName),
        `${kanji}: unknown hard check "${hardCheckName}"`,
      );
    }

    assert.equal(
      new Set(descriptor.hardChecks).size,
      descriptor.hardChecks.length,
      `${kanji}: hardChecks must not contain duplicates`,
    );
  }
});

test("all descriptors should use a valid scoring configuration when present", () => {
  for (const [kanji, descriptor] of getDescriptorEntries()) {
    if (descriptor.scoring == null) {
      continue;
    }

    assert.equal(
      typeof descriptor.scoring,
      "object",
      `${kanji}: scoring must be an object`,
    );

    const numericScoringFields = [
      "validScore",
      "hardFailureScore",
      "softFailureMinScore",
      "softFailureMaxScore",
    ];

    for (const field of numericScoringFields) {
      const value = descriptor.scoring[field];

      if (value == null) {
        continue;
      }

      assert.equal(
        Number.isFinite(value),
        true,
        `${kanji}.scoring.${field}: value must be finite`,
      );

      assert.ok(
        value >= 0,
        `${kanji}.scoring.${field}: value must not be negative`,
      );
    }

    const minScore = descriptor.scoring.softFailureMinScore;

    const maxScore = descriptor.scoring.softFailureMaxScore;

    if (minScore != null && maxScore != null) {
      assert.ok(
        minScore <= maxScore,
        `${kanji}: softFailureMinScore must not exceed softFailureMaxScore`,
      );
    }
  }
});
