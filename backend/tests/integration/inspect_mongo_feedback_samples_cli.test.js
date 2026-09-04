"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");

const BACKEND_ROOT = path.resolve(__dirname, "../..");
const SCRIPT_PATH = "scripts/inspect_mongo_feedback_samples.js";
const {
  compareMongoFeedbackSnapshots,
} = require("../../services/mongo_feedback_snapshot_diff");
const cli = require("../../scripts/inspect_mongo_feedback_samples");

function runCli(args, environmentOverrides = {}) {
  const environment = {
    ...process.env,
    ...environmentOverrides,
  };

  if (
    Object.hasOwn(environmentOverrides, "MONGO_URI") &&
    environmentOverrides.MONGO_URI === undefined
  ) {
    delete environment.MONGO_URI;
  }

  return spawnSync(process.execPath, [SCRIPT_PATH, ...args], {
    cwd: BACKEND_ROOT,
    encoding: "utf8",
    env: environment,
  });
}

test("CLI prints help without requiring MongoDB", () => {
  const result = runCli(["--help"], {
    MONGO_URI: undefined,
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);

  assert.match(result.stdout, /MongoDB feedback sample inspector/);

  assert.match(result.stdout, /--out-json/);
  assert.match(result.stdout, /strictly read-only/i);
  assert.match(result.stdout, /MongoDB feedback sample inspector/);

  assert.match(result.stdout, /--out-json/);
  assert.match(result.stdout, /--manifest/);
  assert.match(result.stdout, /--out-snapshot/);
  assert.match(result.stdout, /strictly read-only/i);
  assert.doesNotMatch(result.stdout, /--apply/);
});

test("CLI rejects --apply explicitly", () => {
  const result = runCli(["--apply"], {
    MONGO_URI: undefined,
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /ERROR/);
  assert.match(result.stderr, /--apply is not supported/i);
});

test("CLI rejects an unknown argument", () => {
  const result = runCli(["--unknown-option"], {
    MONGO_URI: undefined,
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /ERROR/);
  assert.match(result.stderr, /Unknown argument: --unknown-option/);
});

test("CLI requires MONGO_URI without exposing a value", () => {
  const sensitiveUri =
    "mongodb://private-user:private-password" + "@private-host.invalid:27017";

  const result = runCli([], {
    MONGO_URI: undefined,
    TEST_SENSITIVE_MONGO_URI: sensitiveUri,
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /MONGO_URI is required/);

  const fullOutput = `${result.stdout}\n${result.stderr}`;

  assert.equal(fullOutput.includes("private-password"), false);

  assert.equal(fullOutput.includes(sensitiveUri), false);
});

test("CLI validates options before connecting to MongoDB", () => {
  const result = runCli(["--db", ""], {
    MONGO_URI: "mongodb://example.invalid:27017",
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Missing value for --db/);

  assert.doesNotMatch(result.stderr, /example\.invalid/);
});

test("CLI module can be required without executing main", () => {
  const result = spawnSync(
    process.execPath,
    [
      "-e",
      [
        `const cli = require("./${SCRIPT_PATH}");`,
        'if (typeof cli.parseArgs !== "function") {',
        '  throw new Error("parseArgs missing");',
        "}",
        'if (typeof cli.buildSafeConsoleSummary !== "function") {',
        '  throw new Error("buildSafeConsoleSummary missing");',
        "}",
        'if (typeof cli.runInspectionBundle !== "function") {',
        '  throw new Error("runInspectionBundle missing");',
        "}",
        'if (typeof cli.writeSnapshotReport !== "function") {',
        '  throw new Error("writeSnapshotReport missing");',
        "}",
      ].join("\n"),
    ],
    {
      cwd: BACKEND_ROOT,
      encoding: "utf8",
      env: {
        ...process.env,
        MONGO_URI: "",
      },
    },
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);

  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
});
test("CLI inspection bundle builds a deterministic candidate snapshot", async () => {
  const tempDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "kanji-mongo-snapshot-cli-test-"),
  );

  try {
    const catalogPath = path.join(tempDirectory, "catalog.json");

    const manifestPath = path.join(tempDirectory, "manifest.json");

    const descriptorPath = path.join(tempDirectory, "descriptors.json");

    const requirementsPath = path.join(tempDirectory, "requirements.json");

    const referenceStroke = {
      x: [0, 0.5, 1],
      y: [0, 0.5, 1],
    };

    fs.writeFileSync(
      catalogPath,
      JSON.stringify({
        木: [referenceStroke],
      }),
      "utf8",
    );

    fs.writeFileSync(
      manifestPath,
      JSON.stringify({
        schemaVersion: 1,
        catalog: {
          kanjiCount: 1,
          kanjis: ["木"],
          sha256: "fixture-catalog-hash",
        },
      }),
      "utf8",
    );

    fs.writeFileSync(
      descriptorPath,
      JSON.stringify({
        schemaVersion: 1,
        descriptors: {
          木: {
            enabled: true,
          },
        },
      }),
      "utf8",
    );

    fs.writeFileSync(
      requirementsPath,
      JSON.stringify({
        schemaVersion: 1,
        externalUnseen: [],
        requiredKanjis: [],
      }),
      "utf8",
    );

    const options = cli.parseArgs([
      "--catalog",
      catalogPath,
      "--manifest",
      manifestPath,
      "--descriptors",
      descriptorPath,
      "--requirements",
      requirementsPath,
    ]);

    const documents = [
      {
        _id: "mongo-id-1",
        schemaVersion: 1,
        recognitionId: "recognition-id-1",
        kanji: "木",
        expectedKanji: "木",
        isCorrect: true,
        source: "test_screen",
        feedbackType: "manual_debug",
        datasetReviewStatus: "pending",
        features: {
          geometry: {
            bboxWidth: 1,
            bboxHeight: 1,
            aspectRatio: 1,
            perStroke: [
              {
                index: 0,
                minX: 0,
                maxX: 1,
                minY: 0,
                maxY: 1,
                width: 1,
                height: 1,
              },
            ],
          },
        },
        strokesNormalized: [referenceStroke],
        algorithmVersion: "heuristic-v2",
        createdAt: "2026-08-26T08:00:00.000Z",
      },
    ];

    const bundle = await cli.runInspectionBundle({
      options,
      environment: {
        MONGO_URI: "mongodb://example.invalid:27017",
      },
      readDocuments: async () => documents,
      generatedAt: "2026-08-26T10:00:00.000Z",
    });

    assert.equal(bundle.documents.length, 1);

    assert.equal(bundle.report.totalSamples, 1);

    assert.equal(bundle.report.reliableCount, 1);

    assert.equal(bundle.snapshot.documentCount, 1);

    assert.equal(bundle.snapshot.entryCount, 1);

    assert.match(bundle.snapshot.catalogSha256, /^[a-f0-9]{64}$/);

    assert.match(bundle.snapshot.manifestSha256, /^[a-f0-9]{64}$/);

    assert.match(bundle.snapshot.snapshotSha256, /^[a-f0-9]{64}$/);

    assert.deepEqual(
      bundle.snapshot.entries.map((entry) => entry.sampleKey),
      ["recognition:recognition-id-1"],
    );

    assert.equal(Object.hasOwn(bundle.snapshot.entries[0], "document"), false);

    assert.equal(
      Object.hasOwn(bundle.snapshot.entries[0], "strokesNormalized"),
      false,
    );

    assert.equal(Object.hasOwn(bundle.snapshot.entries[0], "features"), false);
  } finally {
    fs.rmSync(tempDirectory, {
      recursive: true,
      force: true,
    });
  }
});
test("writeSnapshotReport writes local JSON without secret fields", () => {
  const tempDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "kanji-mongo-snapshot-write-test-"),
  );

  try {
    const outputPath = path.join(tempDirectory, "candidate.snapshot.json");

    const snapshot = {
      schemaVersion: 1,
      generatedAt: "2026-08-26T10:00:00.000Z",
      hashAlgorithm: "sha256",
      catalogSha256: "catalog-hash",
      manifestSha256: "manifest-hash",
      documentCount: 1,
      entryCount: 1,
      snapshotSha256: "snapshot-hash",
      entries: [
        {
          sampleKey: "recognition:recognition-id-1",
          recognitionId: "recognition-id-1",
          expectedKanji: "木",
          documentSha256: "document-hash",
        },
      ],
    };

    cli.writeSnapshotReport(outputPath, snapshot);

    assert.equal(fs.existsSync(outputPath), true);

    const written = JSON.parse(fs.readFileSync(outputPath, "utf8"));

    assert.deepEqual(written, snapshot);

    const serialized = JSON.stringify(written);

    assert.equal(serialized.includes("MONGO_URI"), false);

    assert.equal(serialized.includes("mongodb://"), false);

    assert.equal(serialized.includes("tokenSecret"), false);
  } finally {
    fs.rmSync(tempDirectory, {
      recursive: true,
      force: true,
    });
  }
});
test("CLI parses previous snapshot and diff output paths", () => {
  const options = cli.parseArgs([
    "--previous-snapshot",
    "./previous.snapshot.json",
    "--out-snapshot",
    "./current.snapshot.json",
    "--out-diff",
    "./snapshot.diff.json",
  ]);

  assert.equal(
    options.previousSnapshotPath,
    path.resolve("./previous.snapshot.json"),
  );

  assert.equal(
    options.outputSnapshotPath,
    path.resolve("./current.snapshot.json"),
  );

  assert.equal(options.outputDiffPath, path.resolve("./snapshot.diff.json"));
});

test("CLI requires previous snapshot when out-diff is requested", () => {
  assert.throws(
    () =>
      cli.validateSnapshotDiffOptions({
        previousSnapshotPath: null,
        outputDiffPath: path.resolve("./snapshot.diff.json"),
      }),
    /--out-diff requires --previous-snapshot/,
  );
});

test("CLI help documents snapshot comparison options", () => {
  const result = runCli(["--help"], {
    MONGO_URI: undefined,
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);

  assert.match(result.stdout, /--previous-snapshot/);
  assert.match(result.stdout, /--out-diff/);
  assert.match(result.stdout, /new/i);
  assert.match(result.stdout, /modified/i);
  assert.match(result.stdout, /unchanged/i);
  assert.match(result.stdout, /missing/i);
});

test("buildSnapshotDiff compares real candidate snapshots", () => {
  const previousSnapshot = {
    schemaVersion: 1,
    entries: [
      {
        sampleKey: "recognition:sample-1",
        recognitionId: "sample-1",
        expectedKanji: "木",
        documentSha256: "a".repeat(64),
      },
    ],
  };

  const currentSnapshot = {
    schemaVersion: 1,
    entries: [
      {
        sampleKey: "recognition:sample-1",
        recognitionId: "sample-1",
        expectedKanji: "木",
        documentSha256: "b".repeat(64),
      },
      {
        sampleKey: "recognition:sample-2",
        recognitionId: "sample-2",
        expectedKanji: "力",
        documentSha256: "c".repeat(64),
      },
    ],
  };

  const result = cli.buildSnapshotDiff({
    previousSnapshot,
    currentSnapshot,
  });

  assert.deepEqual(result.counts, {
    previous: 1,
    current: 2,
    new: 1,
    modified: 1,
    unchanged: 0,
    missing: 0,
  });

  assert.equal(result.newSamples[0].sampleKey, "recognition:sample-2");

  assert.equal(result.modifiedSamples[0].sampleKey, "recognition:sample-1");
});

test("buildSnapshotDiff uses the shared snapshot comparator", () => {
  const previousSnapshot = {
    schemaVersion: 1,
    entries: [],
  };

  const currentSnapshot = {
    schemaVersion: 1,
    entries: [],
  };

  assert.deepEqual(
    cli.buildSnapshotDiff({
      previousSnapshot,
      currentSnapshot,
    }),
    compareMongoFeedbackSnapshots({
      previousSnapshot,
      currentSnapshot,
    }),
  );
});

test("buildSnapshotDiff loads the previous snapshot from disk", () => {
  const tempDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "kanji-snapshot-diff-load-test-"),
  );

  try {
    const previousSnapshotPath = path.join(
      tempDirectory,
      "previous.snapshot.json",
    );

    fs.writeFileSync(
      previousSnapshotPath,
      JSON.stringify(
        {
          schemaVersion: 1,
          entries: [],
        },
        null,
        2,
      ),
      "utf8",
    );

    const currentSnapshot = {
      schemaVersion: 1,
      entries: [
        {
          sampleKey: "recognition:sample-new",
          recognitionId: "sample-new",
          expectedKanji: "力",
          documentSha256: "a".repeat(64),
        },
      ],
    };

    const result = cli.buildSnapshotDiffFromFile({
      previousSnapshotPath,
      currentSnapshot,
    });

    assert.equal(result.counts.previous, 0);
    assert.equal(result.counts.current, 1);
    assert.equal(result.counts.new, 1);
  } finally {
    fs.rmSync(tempDirectory, {
      recursive: true,
      force: true,
    });
  }
});

test("buildSnapshotDiffFromFile rejects a missing previous snapshot", () => {
  assert.throws(
    () =>
      cli.buildSnapshotDiffFromFile({
        previousSnapshotPath: "./missing-previous-snapshot.json",
        currentSnapshot: {
          schemaVersion: 1,
          entries: [],
        },
      }),
    /Previous snapshot not found/,
  );
});

test("writeSnapshotDiffReport writes local JSON", () => {
  const tempDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "kanji-snapshot-diff-write-test-"),
  );

  try {
    const outputPath = path.join(tempDirectory, "snapshot.diff.json");

    const diff = {
      schemaVersion: 1,
      counts: {
        previous: 1,
        current: 1,
        new: 0,
        modified: 0,
        unchanged: 1,
        missing: 0,
      },
      byKanji: {
        木: {
          kanji: "木",
          new: 0,
          modified: 0,
          unchanged: 1,
          missing: 0,
        },
      },
      newSamples: [],
      modifiedSamples: [],
      unchangedSamples: [
        {
          sampleKey: "recognition:sample-1",
          recognitionId: "sample-1",
          expectedKanji: "木",
          documentSha256: "a".repeat(64),
        },
      ],
      missingSamples: [],
    };

    cli.writeSnapshotDiffReport(outputPath, diff);

    const written = JSON.parse(fs.readFileSync(outputPath, "utf8"));

    assert.deepEqual(written, diff);
  } finally {
    fs.rmSync(tempDirectory, {
      recursive: true,
      force: true,
    });
  }
});

test("safe snapshot diff summary contains only aggregate counts", () => {
  const diff = {
    counts: {
      previous: 10,
      current: 12,
      new: 3,
      modified: 1,
      unchanged: 8,
      missing: 1,
    },
  };

  assert.deepEqual(cli.buildSafeSnapshotDiffSummary(diff), {
    previous: 10,
    current: 12,
    new: 3,
    modified: 1,
    unchanged: 8,
    missing: 1,
  });
});

test("CLI validates diff options before requiring MongoDB", () => {
  const result = runCli(["--out-diff", "./snapshot.diff.json"], {
    MONGO_URI: undefined,
  });

  assert.notEqual(result.status, 0);

  assert.match(result.stderr, /--out-diff requires --previous-snapshot/);

  assert.doesNotMatch(result.stderr, /MONGO_URI is required/);
});
