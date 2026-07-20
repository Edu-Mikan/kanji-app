const test = require("node:test");

const assert = require("node:assert/strict");

const fs = require("node:fs");

const path = require("node:path");

const descriptorData = require("../../data/kanji_descriptors.json");

const backendRoot = path.resolve(__dirname, "../..");

const legacyModulePath = path.join(
  backendRoot,
  "services",
  "simple_kanji_rules.js",
);

function getJavaScriptFiles(directory) {
  if (!fs.existsSync(directory)) {
    return [];
  }

  const entries = fs.readdirSync(directory, {
    withFileTypes: true,
  });

  return entries.flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      return getJavaScriptFiles(fullPath);
    }

    if (entry.isFile() && entry.name.endsWith(".js")) {
      return [fullPath];
    }

    return [];
  });
}

test("legacy simple kanji validation module should not exist", () => {
  assert.equal(
    fs.existsSync(legacyModulePath),
    false,
    "simple_kanji_rules.js must not be restored",
  );
});

test("production code should not reference the legacy simple validator", () => {
  const serviceDirectory = path.join(backendRoot, "services");

  const serverPath = path.join(backendRoot, "server.js");

  const productionFiles = [
    ...getJavaScriptFiles(serviceDirectory),
    ...(fs.existsSync(serverPath) ? [serverPath] : []),
  ];

  for (const filePath of productionFiles) {
    const content = fs.readFileSync(filePath, "utf8");

    assert.equal(
      content.includes("simple_kanji_rules"),
      false,
      `${filePath} references simple_kanji_rules`,
    );

    assert.equal(
      content.includes("validateSimpleKanji"),
      false,
      `${filePath} references validateSimpleKanji`,
    );
  }
});

test("formerly simple kanjis should exist in the declarative catalog", () => {
  const migratedKanjis = ["一", "二", "三", "七", "六", "四"];

  for (const kanji of migratedKanjis) {
    assert.ok(
      descriptorData.descriptors[kanji],
      `${kanji} must have a declarative descriptor`,
    );
  }
});
