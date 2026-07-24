const fs = require("node:fs");
const path = require("node:path");

function parseArgs(argv) {
  const options = {
    descriptorPath: null,
    patchPath: null,
    outputPath: null,
    help: false,
  };

  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];

    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }

    if (argument === "--descriptor-file") {
      options.descriptorPath = path.resolve(argv[index + 1]);
      index++;
      continue;
    }

    if (argument === "--candidate-patch") {
      options.patchPath = path.resolve(argv[index + 1]);
      index++;
      continue;
    }

    if (argument === "--out-json") {
      options.outputPath = path.resolve(argv[index + 1]);
      index++;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return options;
}

function printHelp() {
  console.log(`
Apply descriptor candidate patch

Usage:
  node scripts/apply_descriptor_candidate_patch.js \\
    --descriptor-file ./data/kanji_descriptors.json \\
    --candidate-patch ./field_descriptor_candidate_patch.json \\
    --out-json ./kanji_descriptors_candidate.json
`);
}

function assertFileExists(filePath, label) {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error(`${label} not found: ${filePath}`);
  }
}

function loadJson(filePath, label) {
  assertFileExists(filePath, label);

  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function getDescriptorCatalog(parsedDescriptorFile) {
  return parsedDescriptorFile.descriptors ?? parsedDescriptorFile;
}

function buildReferenceConstraintFromRule(rule) {
  return {
    type: rule.type,
    metricPath: rule.metricPath,
    max: rule.max,
    severity: "hard",
    status: "candidate",
    source: "descriptor_candidate_patch",
    comparisonGroup: rule.comparisonGroup,
    risk: rule.risk,
    evidence: rule.evidence,
  };
}

function applyCandidatePatchToDescriptorFile({ descriptorFile, patch }) {
  if (!patch.kanji) {
    throw new Error("Candidate patch is missing kanji");
  }

  const result = cloneJson(descriptorFile);
  const descriptors = getDescriptorCatalog(result);

  const descriptor = descriptors[patch.kanji];

  if (!descriptor) {
    throw new Error(`Descriptor not found for kanji: ${patch.kanji}`);
  }

  const existingConstraints = Array.isArray(descriptor.referenceConstraints)
    ? descriptor.referenceConstraints
    : [];

  const candidateConstraints = (patch.rules ?? []).map(
    buildReferenceConstraintFromRule,
  );

  descriptor.referenceConstraints = [
    ...existingConstraints,
    ...candidateConstraints,
  ];

  descriptor.candidateMetadata = {
    generatedAt: new Date().toISOString(),
    sourceMode: patch.mode,
    patchStatus: patch.status,
    patchAction: patch.action,
    ruleCount: candidateConstraints.length,
    selectionPolicy: patch.selectionPolicy,
  };

  return result;
}

function printResult({ patch, outputPath }) {
  console.log("");
  console.log("DESCRIPTOR CANDIDATE GENERATED");
  console.log("==============================");

  console.log(`Kanji: ${patch.kanji}`);
  console.log(`Rules: ${(patch.rules ?? []).length}`);
  console.log(`Output: ${outputPath}`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  if (!options.descriptorPath) {
    throw new Error("Missing --descriptor-file <path>");
  }

  if (!options.patchPath) {
    throw new Error("Missing --candidate-patch <path>");
  }

  if (!options.outputPath) {
    throw new Error("Missing --out-json <path>");
  }

  const descriptorFile = loadJson(options.descriptorPath, "descriptor file");

  const patch = loadJson(options.patchPath, "candidate patch");

  const candidateDescriptorFile = applyCandidatePatchToDescriptorFile({
    descriptorFile,
    patch,
  });

  fs.writeFileSync(
    options.outputPath,
    JSON.stringify(candidateDescriptorFile, null, 2),
    "utf8",
  );

  printResult({
    patch,
    outputPath: options.outputPath,
  });
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error("");
    console.error("ERROR");
    console.error("-----");
    console.error(error.message);

    process.exitCode = 1;
  }
}

module.exports = {
  cloneJson,
  getDescriptorCatalog,
  buildReferenceConstraintFromRule,
  applyCandidatePatchToDescriptorFile,
};
