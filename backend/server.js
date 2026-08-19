const express = require("express");
const cors = require("cors");
const fs = require("fs");
const crypto = require("crypto");
const { MongoClient } = require("mongodb");
const packageJson = require("./package.json");
const serverStartedAt = new Date().toISOString();

const {
  normalizeStrokes,
  resampleStroke,
  getStrokeAngle,
  angleDifference,
  strokeLength,
  getStrokeVectors,
  compareStrokeShape,
  getDominantAngle,
  strokeBoundingBox,
  classifyAngle,
} = require("./services/stroke_utils");

const { extractAllFeatures } = require("./services/feature_extractor");
const {
  loadKanjiDescriptors,
  getKanjiDescriptor,
} = require("./services/descriptor_loader");

const { validateByDescriptor } = require("./services/descriptor_validator");

const {
  createFeedbackReviewRouter,
} = require("./routes/feedback_review_routes");

const {
  ReviewDeviceAuthError,
  authenticateReviewDevice,
} = require("./services/review_device_service");

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));
app.use("/kanji_svg", express.static("kanji_svg"));

const PORT = process.env.PORT || 3000;
const ALGORITHM_VERSION = "heuristic-v2";
const TRAINING_DATA_SCHEMA_VERSION = 1;

const MONGO_URI = process.env.MONGO_URI;

// Como solo has podido añadir una variable en Render,
// dejamos estos valores fijos por defecto en el código.
const MONGO_DB_NAME = "kanji_app";
const MONGO_COLLECTION_FEEDBACK = "feedback_samples";

let mongoClient = null;
let feedbackCollection = null;
let mongoConnectionError = null;
let mongoConnectionAttemptedAt = null;
let reviewDeviceCollection = null;

app.use(
  "/api/review",
  createFeedbackReviewRouter({
    getCollection: () => feedbackCollection,
    getDeviceCollection: () => reviewDeviceCollection,
  }),
);

const kanjiDataset = JSON.parse(
  fs.readFileSync("./kanji_runtime.json", "utf8"),
);
const kanjiDescriptors = loadKanjiDescriptors();

async function connectMongoIfConfigured() {
  mongoConnectionAttemptedAt = new Date().toISOString();
  mongoConnectionError = null;

  if (!MONGO_URI) {
    mongoConnectionError = "MONGO_URI no configurada";
    console.log("MONGO_URI no configurada. Se usará training_data.jsonl.");
    return;
  }

  if (feedbackCollection) {
    return;
  }

  console.log("Intentando conectar a MongoDB Atlas...");

  mongoClient = new MongoClient(MONGO_URI, {
    serverSelectionTimeoutMS: 10000,
  });

  await mongoClient.connect();

  const db = mongoClient.db(MONGO_DB_NAME);
  feedbackCollection = db.collection(MONGO_COLLECTION_FEEDBACK);

  reviewDeviceCollection = db.collection("review_devices");

  await feedbackCollection.createIndex({ kanji: 1 });
  await feedbackCollection.createIndex({ expectedKanji: 1 });
  await feedbackCollection.createIndex({ isCorrect: 1 });
  await feedbackCollection.createIndex({ createdAt: -1 });
  await feedbackCollection.createIndex({ recognitionId: 1 });
  await reviewDeviceCollection.createIndex(
    {
      tokenId: 1,
    },
    {
      unique: true,
    },
  );

  console.log(
    `Conectado a MongoDB: ${MONGO_DB_NAME}.${MONGO_COLLECTION_FEEDBACK}`,
  );
}

function prepareTrainingStrokes(strokes) {
  const normalized = normalizeStrokes(strokes);
  const resampled = normalized.map((s) => resampleStroke(s, 20));

  return {
    raw: strokes,
    normalized,
    resampled,
  };
}

// ================= TYPE =================
function getStrokeType(stroke) {
  const angle = Math.abs(getStrokeAngle(stroke));
  const a = angle > Math.PI / 2 ? Math.PI - angle : angle;

  if (a < 0.3) return "horizontal";
  if (a > 1.2) return "vertical";
  return "diagonal";
}

// ================= COMPARE =================
function compareStrokes(user, reference) {
  const complexity = reference.length;

  const userCount = user.length;
  const refCount = reference.length;

  const diff = Math.abs(userCount - refCount);
  const maxCount = Math.max(userCount, refCount);

  // 🔥 regla fuerte de strokes
  const ratio = diff / maxCount;

  // 🔥 BLOQUEO REAL por diferencia de strokes
  if (reference.length >= 6) {
    const diff = Math.abs(user.length - reference.length);

    if (diff >= 2) {
      return 10;
    }
  }

  // ================= HARD RULE: SIMPLE KANJI =================
  // 🔥 evita casos como 犬 vs 大
  if (complexity <= 4 && user.length < reference.length) {
    return 10;
  }

  // ================= SPECIAL CASE: 1 STROKE =================
  /* if (reference.length === 1 && user.length === 1) {
    const u = user[0];
    const r = reference[0];

    const uAngle = getDominantAngle(u);
    const rAngle = getDominantAngle(r);

    // 🔥 FIX IMPORTANTE: permitir líneas invertidas
    const angleDiff = Math.min(
      angleDifference(uAngle, rAngle),
      angleDifference(uAngle, rAngle + Math.PI),
    );

    // horizontales (一)
    if (Math.abs(uAngle) < 0.3 && Math.abs(rAngle) < 0.3) {
      return angleDiff * 0.3;
    }

    // orientación incorrecta → rechazo
    if (angleDiff > 0.4) {
      return 10;
    }

    const uLen = strokeLength(u);
    const rLen = strokeLength(r);

    const lenRatio = Math.abs(uLen - rLen) / (rLen + 1e-6);

    return angleDiff * 0.5 + lenRatio * 0.5;
  } */

  let totalError = 0;
  let used = new Array(reference.length).fill(false);

  // ================= HARD GLOBAL ORIENTATION CHECK =================
  // calculamos orientación global media
  const userAngles = user.map(getDominantAngle);
  const refAngles = reference.map(getDominantAngle);
  /*   

  // media absoluta (ignorando signo)
  const meanUserAngle =
    userAngles.reduce((a, b) => a + Math.abs(b), 0) / (userAngles.length || 1);

  const meanRefAngle =
    refAngles.reduce((a, b) => a + Math.abs(b), 0) / (refAngles.length || 1);

  // diferencia global
  const globalDiff = Math.abs(meanUserAngle - meanRefAngle);

  // 🔥 REGLA FUERTE: horizontal vs vertical
  if (globalDiff > 0.6) {
    return 9; // ❌ rechazo directo
  } */
  // ================= STRUCTURAL ORIENTATION CHECK =================

  const userTypes = user.map((s) => classifyAngle(getDominantAngle(s)));
  const refTypes = reference.map((s) => classifyAngle(getDominantAngle(s)));

  // ordenar para evitar problemas de orden de escritura
  userTypes.sort();
  refTypes.sort();

  // contar coincidencias
  let mismatch = 0;

  for (let i = 0; i < Math.min(userTypes.length, refTypes.length); i++) {
    if (userTypes[i] !== refTypes[i]) {
      mismatch++;
    }
  }

  // Para kanjis de 3 o mas trazos, rechazo duro por tipos.
  if (reference.length >= 3 && mismatch === refTypes.length) {
    return 10;
  }

  if (reference.length === 2 && mismatch === refTypes.length) {
    // Penalización moderada, pero dejamos que la comparación de forma decida.
    totalError += 0.25;
  }

  // 🔥 ordenar strokes por ángulo para mejorar matching
  const sortedUser = [...user].sort(
    (a, b) => getDominantAngle(a) - getDominantAngle(b),
  );

  const sortedRef = [...reference].sort(
    (a, b) => getDominantAngle(a) - getDominantAngle(b),
  );

  for (let i = 0; i < user.length; i++) {
    let bestError = Infinity;
    let bestIndex = -1;

    const u = sortedUser[i];

    for (let j = 0; j < reference.length; j++) {
      if (used[j]) continue;

      const r = sortedRef[j];
      const len = Math.min(u.x.length, r.x.length);

      // 🔥 NUEVO: error de forma real
      let error = compareStrokeShape(u, r) * 0.25;

      // orientación ligera

      //const angleDiff = angleDifference(getStrokeAngle(u), getStrokeAngle(r));
      // 🔥 NUEVO: usar ángulo dominante (mucho más preciso)
      const angleDiff = angleDifference(
        getDominantAngle(u),
        getDominantAngle(r),
      );

      // 🔥 diagonales (caso 八) → relajar
      if (angleDiff > 0.5 && angleDiff < 1.5) {
        error *= 0.7;
      }

      // 🔥 BONUS: relajar líneas rectas (horizontal/vertical)
      const uAngle = Math.abs(getDominantAngle(u));
      const rAngle = Math.abs(getDominantAngle(r));

      // horizontal
      if (uAngle < 0.2 && rAngle < 0.2) {
        error *= 0.7;
      }

      // vertical
      if (
        Math.abs(uAngle - Math.PI / 2) < 0.2 &&
        Math.abs(rAngle - Math.PI / 2) < 0.2
      ) {
        error *= 0.7;
      }

      const angleWeight = reference.length <= 3 ? 0.15 : 0.12;

      const angleTolerance = reference.length <= 3 ? 0.25 : 0.12;

      if (angleDiff > angleTolerance) {
        error += (angleDiff - angleTolerance) * angleWeight;
      }

      if (error < bestError) {
        bestError = error;
        bestIndex = j;
      }
    }

    if (bestIndex !== -1) {
      used[bestIndex] = true;
      totalError += bestError;
    } else {
      totalError += 0.5; // penalización fuerte
    }
  }

  // ================= UNUSED REFERENCE STROKES =================
  let unused = 0;
  for (let i = 0; i < used.length; i++) {
    if (!used[i]) unused++;
  }

  const missingRatio = unused / reference.length;

  // 🔥 penalización fuerte solo en complejos
  if (complexity >= 6) {
    totalError += missingRatio * 4.0;
  } else {
    totalError += missingRatio * 2.0;
  }

  // penalización extra por strokes de más
  if (user.length > reference.length) {
    totalError += (user.length - reference.length) * 1.2;
  }

  // ================= SCORE FINAL =================
  //let score = totalError / Math.max(user.length, reference.length);

  // ================= PARALLELISM CHECK =================
  // ================= PARALLELISM CHECK =================
  let parallelPenalty = 0;

  // 🔥 reutilizamos los ángulos ya calculados arriba
  for (let i = 0; i < Math.min(refAngles.length, userAngles.length); i++) {
    const diff = angleDifference(refAngles[i], userAngles[i]);

    if (diff > 0.4) {
      parallelPenalty += 0.8;
    }
  }

  totalError += parallelPenalty;

  // ================= SCRIBBLE DETECTION =================
  let totalLength = 0;

  for (let s of user) {
    totalLength += strokeLength(s);
  }

  const meanLength = totalLength / (user.length || 1);

  // 🔥 trazos muy pequeños → basura
  if (meanLength < 0.05) {
    return 10;
  }

  // ================= ANGLE VARIANCE =================
  let angles = user.map(getDominantAngle);
  let mean = angles.reduce((a, b) => a + b, 0) / (angles.length || 1);

  let variance =
    angles.reduce((sum, a) => {
      return sum + Math.pow(a - mean, 2);
    }, 0) / (angles.length || 1);

  // 🔥 todos los trazos iguales (|||| o /////)
  if (variance < 0.02 && user.length >= 3) {
    totalError += 2.5;
  }

  if (totalError > 20) {
    totalError = 20;
  }

  let score = totalError / reference.length;
  score = Math.min(score, 10);

  return score;
}

// ================= ENDPOINT =================
app.get("/health", (req, res) => {
  res.json({
    ok: true,
    mongoUriConfigured: Boolean(process.env.MONGO_URI),
    mongoConnected: Boolean(feedbackCollection),
    mongoConnectionAttemptedAt,
    mongoConnectionError,
    storage: feedbackCollection ? "mongo" : "jsonl",
    timestamp: new Date().toISOString(),
  });
});

/* app.post("/mongo/reconnect", async (req, res) => {
  try {
    feedbackCollection = null;
    mongoConnectionError = null;

    await connectMongoIfConfigured();

    res.json({
      ok: true,
      mongoUriConfigured: Boolean(process.env.MONGO_URI),
      mongoConnected: Boolean(feedbackCollection),
      storage: feedbackCollection ? "mongo" : "jsonl",
      mongoConnectionAttemptedAt,
      mongoConnectionError,
    });
  } catch (err) {
    mongoConnectionError = err.message;
    feedbackCollection = null;

    res.status(500).json({
      ok: false,
      mongoUriConfigured: Boolean(process.env.MONGO_URI),
      mongoConnected: false,
      storage: "jsonl",
      mongoConnectionAttemptedAt,
      mongoConnectionError: err.message,
    });
  }
});
 */
app.post("/recognize", async (req, res) => {
  try {
    const strokes = req.body.ink.strokes;
    const targetKanji = req.body.kanji;
    const referenceKanji = kanjiDataset[targetKanji];

    if (!referenceKanji) {
      return res.status(404).json({
        error: `Kanji not found in dataset: ${targetKanji}`,
      });
    }

    const recognitionId = crypto.randomUUID();
    const recognizeStartedAt = Date.now();
    const normalized = normalizeStrokes(strokes);
    const resampledUser = normalized.map((s) => resampleStroke(s, 20));
    const resampledRef = referenceKanji.map((s) => resampleStroke(s, 20));
    const heuristicScore = compareStrokes(resampledUser, resampledRef);

    const features = extractAllFeatures({
      userResampled: resampledUser,
      referenceResampled: resampledRef,
      userNormalized: normalized,
      score: heuristicScore,
    });

    const descriptor = getKanjiDescriptor(kanjiDescriptors, targetKanji);

    const descriptorValidation = validateByDescriptor({
      kanji: targetKanji,
      features,
      descriptor,
    });

    const validation = descriptorValidation;

    const validationStrategy = descriptorValidation
      ? descriptorValidation.strategy
      : "heuristic_score";

    const validationResult = descriptorValidation
      ? descriptorValidation.isCorrect
      : null;

    const finalScore = descriptorValidation
      ? descriptorValidation.score
      : heuristicScore;

    // Guardamos también el score heurístico original para debug.
    features.heuristicScore = heuristicScore;
    features.totalError = finalScore;

    if (descriptorValidation) {
      features.descriptorMatchScore = descriptorValidation.descriptorMatchScore;
      features.descriptorFailedChecks = descriptorValidation.failedChecks;
      features.descriptorHardFailedChecks =
        descriptorValidation.hardFailedChecks;
      features.descriptorPattern = descriptorValidation.pattern;
      features.descriptorRoleMatches = descriptorValidation.roleMatches;
    }

    // const logEntry = {
    //   kanji: targetKanji,
    //   features,
    //   score,
    //   timestamp: Date.now(),
    //   isCorrect: null,
    // };

    // guardar en fichero JSON (simple)
    //fs.appendFileSync("training_data.jsonl", JSON.stringify(logEntry) + "\n");

    res.send({
      kanji: targetKanji,
      strokes: referenceKanji.length,
      score: finalScore,
      heuristicScore,
      features: features,
      algorithmVersion: ALGORITHM_VERSION,
      descriptorValidation,
      validation,
      validationStrategy,
      validationResult,
      recognitionId,
      timestamp: recognizeStartedAt,
      recognizeStartedAt,
      schemaVersion: TRAINING_DATA_SCHEMA_VERSION,
    });
  } catch (e) {
    console.error(e);
    res.status(500).send("Error");
  }
});

function getBearerToken(req) {
  const authorization =
    req.get?.("authorization") ?? req.headers?.authorization;

  if (typeof authorization !== "string") {
    return "";
  }

  const match = authorization.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    return "";
  }

  return match[1].trim();
}

function isManualDebugFeedback(body) {
  return (
    body?.source === "test_screen" || body?.feedbackType === "manual_debug"
  );
}

async function requireManualFeedbackDeviceAccess(req, res) {
  if (!isManualDebugFeedback(req.body)) {
    return true;
  }

  if (!reviewDeviceCollection) {
    res.status(503).json({
      ok: false,
      error: "review_device_storage_unavailable",
      message: "The review device storage is unavailable.",
    });

    return false;
  }

  const deviceToken = getBearerToken(req);

  if (deviceToken.length === 0) {
    res.status(401).json({
      ok: false,
      error: "review_authorization_required",
      message:
        "A paired review device token is required to create manual samples.",
    });

    return false;
  }

  try {
    req.reviewDevice = await authenticateReviewDevice({
      collection: reviewDeviceCollection,
      deviceToken,
      requiredPermission: "samples:create",
    });

    return true;
  } catch (error) {
    if (error instanceof ReviewDeviceAuthError) {
      res.status(error.statusCode).json({
        ok: false,
        error: error.code,
        message: error.message,
      });

      return false;
    }

    console.error("Error authenticating review device for feedback:", error);

    res.status(500).json({
      ok: false,
      error: "review_device_auth_failed",
      message: "The review device could not be authenticated.",
    });

    return false;
  }
}

app.post("/feedback", async (req, res) => {
  try {
    const hasManualFeedbackAccess = await requireManualFeedbackDeviceAccess(
      req,
      res,
    );

    if (!hasManualFeedbackAccess) {
      return;
    }

    const {
      recognitionId,
      kanji,
      expectedKanji,
      features,
      score,
      isCorrect,
      strokes,
      source,
      validationStrategy,
      validationResult,
      // Campos opcionales útiles para ML futuro
      sessionId,
      userId,
      durationMs,
      canvas,
      clientInfo,
      feedbackType,
    } = req.body;

    let strokesData = null;

    if (strokes && Array.isArray(strokes) && strokes.length > 0) {
      const prepared = prepareTrainingStrokes(strokes);

      strokesData = {
        strokesRaw: prepared.raw,
        strokesNormalized: prepared.normalized,
        strokesResampled: prepared.resampled,
      };
    }

    const now = Date.now();

    const entry = {
      schemaVersion: TRAINING_DATA_SCHEMA_VERSION,
      recognitionId: recognitionId ?? crypto.randomUUID(),
      source: source ?? "unknown",
      algorithmVersion: ALGORITHM_VERSION,
      // Mantengo kanji por compatibilidad
      kanji,
      // Nombre más claro para ML futuro
      expectedKanji: expectedKanji ?? kanji,
      features,
      score,
      // Feedback manual del usuario/tester
      isCorrect,
      // Tipo de feedback, por si más adelante tienes varios
      // Ej: "manual_debug", "user_feedback", "auto_log"
      feedbackType: feedbackType ?? "unknown",
      // Resultado de la estrategia automática del backend
      validationStrategy: validationStrategy ?? "unknown",
      validationResult: validationResult ?? null,

      // Contexto opcional
      sessionId: sessionId ?? null,
      userId: userId ?? null,
      durationMs: durationMs ?? null,
      canvas: canvas ?? null,
      clientInfo: clientInfo ?? null,
      reviewDevice: req.reviewDevice
        ? {
            tokenId: req.reviewDevice.tokenId,
            name: req.reviewDevice.name,
          }
        : null,
      ...(strokesData ?? {}),
      timestamp: now,
      createdAt: new Date(now).toISOString(),
    };

    let mongoInsertedId = null;

    if (feedbackCollection) {
      const result = await feedbackCollection.insertOne(entry);
      mongoInsertedId = result.insertedId;
    } else {
      fs.appendFileSync("training_data.jsonl", JSON.stringify(entry) + "\n");
    }

    res.json({
      ok: true,
      recognitionId: entry.recognitionId,
      savedTo: feedbackCollection ? "mongo" : "jsonl",
      mongoInsertedId,
    });
  } catch (err) {
    console.error("Error saving feedback:", err);
    res.status(500).json({ error: "Error saving feedback" });
  }
});

app.get("/api/version", (req, res) => {
  const gitCommit = process.env.RENDER_GIT_COMMIT ?? "local";
  const gitBranch = process.env.RENDER_GIT_BRANCH ?? "local";

  res.json({
    app: "kanji_backend",
    version: packageJson.version,
    environment: process.env.RENDER === "true" ? "render" : "local",
    gitCommit,
    gitCommitShort: gitCommit === "local" ? "local" : gitCommit.slice(0, 7),
    gitBranch,
    serverStartedAt,
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);

  connectMongoIfConfigured().catch((err) => {
    mongoConnectionError = err.message;
    console.error(
      "No se pudo conectar a MongoDB. Se usará training_data.jsonl como fallback:",
      err,
    );
    feedbackCollection = null;
  });
});
