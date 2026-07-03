const fs = require("fs");
const path = require("path");

const DESCRIPTORS_PATH = path.join(
  __dirname,
  "..",
  "data",
  "kanji_descriptors.json",
);

const OVERRIDES_PATH = path.join(
  __dirname,
  "..",
  "data",
  "kanji_descriptor_overrides.json",
);

function readJsonFile(filePath, fallbackValue) {
  try {
    if (!fs.existsSync(filePath)) {
      console.warn(`Descriptor file not found: ${filePath}`);
      return fallbackValue;
    }

    const raw = fs.readFileSync(filePath, "utf-8");

    if (!raw.trim()) {
      console.warn(`Descriptor file is empty: ${filePath}`);
      return fallbackValue;
    }

    return JSON.parse(raw);
  } catch (error) {
    console.error(`Error reading JSON file: ${filePath}`, error);
    return fallbackValue;
  }
}

function deepMerge(base, override) {
  if (!override || typeof override !== "object") {
    return base;
  }

  if (!base || typeof base !== "object") {
    return override;
  }

  if (Array.isArray(base) || Array.isArray(override)) {
    return override;
  }

  const merged = { ...base };

  for (const [key, overrideValue] of Object.entries(override)) {
    const baseValue = merged[key];

    if (
      baseValue &&
      overrideValue &&
      typeof baseValue === "object" &&
      typeof overrideValue === "object" &&
      !Array.isArray(baseValue) &&
      !Array.isArray(overrideValue)
    ) {
      merged[key] = deepMerge(baseValue, overrideValue);
    } else {
      merged[key] = overrideValue;
    }
  }

  return merged;
}

function applyDescriptorOverrides(descriptorsFile, overridesFile) {
  const descriptors = descriptorsFile?.descriptors ?? {};
  const overrides = overridesFile?.overrides ?? {};

  const mergedDescriptors = { ...descriptors };

  for (const [kanji, overrideConfig] of Object.entries(overrides)) {
    const currentDescriptor = mergedDescriptors[kanji];

    if (!currentDescriptor) {
      console.warn(
        `Override found for kanji "${kanji}", but descriptor does not exist.`,
      );
      continue;
    }

    mergedDescriptors[kanji] = deepMerge(currentDescriptor, overrideConfig);
  }

  return {
    ...descriptorsFile,
    descriptors: mergedDescriptors,
    overridesApplied: Object.keys(overrides),
  };
}

function loadKanjiDescriptors() {
  const descriptorsFile = readJsonFile(DESCRIPTORS_PATH, {
    schemaVersion: 1,
    descriptors: {},
  });

  const overridesFile = readJsonFile(OVERRIDES_PATH, {
    schemaVersion: 1,
    overrides: {},
  });

  return applyDescriptorOverrides(descriptorsFile, overridesFile);
}

function getKanjiDescriptor(kanjiDescriptors, kanji) {
  if (!kanjiDescriptors || !kanji) {
    return null;
  }

  return kanjiDescriptors.descriptors?.[kanji] ?? null;
}

module.exports = {
  loadKanjiDescriptors,
  getKanjiDescriptor,

  // Exportado para tests/debug futuro.
  deepMerge,
};
