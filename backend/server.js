const express = require("express");
const cors = require("cors");
const fs = require("fs");

const app = express();
app.use(cors());
app.use(express.json());
app.use("/kanji_svg", express.static("kanji_svg"));

const PORT = process.env.PORT || 3000;

// 👉 ESTO FALTABA
const kanjiDataset = JSON.parse(fs.readFileSync("./kanji_full.json", "utf-8"));

// ================= NORMALIZE =================
function normalizeStrokes(strokes) {
  let minX = Infinity,
    minY = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity;

  strokes.forEach((stroke) => {
    stroke.x.forEach((x) => {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    });
    stroke.y.forEach((y) => {
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    });
  });

  const size = Math.max(maxX - minX, maxY - minY);

  return strokes.map((stroke) => ({
    x: stroke.x.map((x) => (x - minX) / size),
    y: stroke.y.map((y) => (y - minY) / size),
  }));
}

// ================= RESAMPLE =================
function resampleStroke(stroke, n = 20) {
  const newX = [];
  const newY = [];
  const total = stroke.x.length;

  if (total === 0) return { x: [], y: [] };

  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const idx = t * (total - 1);

    const i1 = Math.floor(idx);
    const i2 = Math.ceil(idx);
    const ratio = idx - i1;

    const x = stroke.x[i1] * (1 - ratio) + stroke.x[i2] * ratio;
    const y = stroke.y[i1] * (1 - ratio) + stroke.y[i2] * ratio;

    newX.push(x);
    newY.push(y);
  }

  return { x: newX, y: newY };
}

// ================= ANGLE =================
function getStrokeAngle(stroke) {
  const dx = stroke.x[stroke.x.length - 1] - stroke.x[0];
  const dy = stroke.y[stroke.y.length - 1] - stroke.y[0];
  return Math.atan2(dy, dx);
}

function angleDifference(a1, a2) {
  let diff = Math.abs(a1 - a2);
  if (diff > Math.PI / 2) {
    diff = Math.PI - diff;
  }
  return diff;
}

// ================= LENGTH =================
function strokeLength(stroke) {
  let len = 0;
  for (let i = 1; i < stroke.x.length; i++) {
    const dx = stroke.x[i] - stroke.x[i - 1];
    const dy = stroke.y[i] - stroke.y[i - 1];
    len += Math.sqrt(dx * dx + dy * dy);
  }
  return len;
}

// ================= TYPE =================
function getStrokeType(stroke) {
  const angle = Math.abs(getStrokeAngle(stroke));
  const a = angle > Math.PI / 2 ? Math.PI - angle : angle;

  if (a < 0.4) return "horizontal";
  if (a > 1.1) return "vertical";
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

  // ================= HARD ORIENTATION RULE (SIMPLES) =================

  if (reference.length <= 3) {
    const userTypes = user.map(getStrokeType);
    const refTypes = reference.map(getStrokeType);

    if (userTypes.length === refTypes.length) {
      for (let i = 0; i < refTypes.length; i++) {
        if (userTypes[i] !== refTypes[i]) {
          return 10; // ❌ orientación incorrecta → rechazar
        }
      }
    }
  }

  // ================= HARD RULE: SIMPLE KANJI =================
  // 🔥 evita casos como 犬 vs 大
  if (complexity <= 4 && user.length < reference.length) {
    return 10;
  }

  let totalError = 0;
  let used = new Array(reference.length).fill(false);

  for (let i = 0; i < user.length; i++) {
    let bestError = Infinity;
    let bestIndex = -1;

    const u = user[i];

    for (let j = 0; j < reference.length; j++) {
      if (used[j]) continue;

      const r = reference[j];
      const len = Math.min(u.x.length, r.x.length);

      let error = 0;

      for (let k = 0; k < len; k++) {
        const dx = u.x[k] - r.x[k];
        const dy = u.y[k] - r.y[k];
        error += dx * dx + dy * dy;
      }

      error = Math.sqrt(error / len);

      // orientación ligera
      const angleDiff = angleDifference(getStrokeAngle(u), getStrokeAngle(r));
      error += angleDiff * 0.2;

      if (error < bestError) {
        bestError = error;
        bestIndex = j;
      }
    }

    if (bestIndex !== -1) {
      used[bestIndex] = true;
      totalError += bestError;
    } else {
      totalError += 2; // penalización fuerte
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
  let score = totalError / Math.max(user.length, reference.length);

  return score;
}

// ================= ENDPOINT =================
app.post("/recognize", async (req, res) => {
  try {
    const strokes = req.body.ink.strokes;
    const targetKanji = req.body.kanji;

    const referenceKanji = kanjiDataset[targetKanji];

    const normalized = normalizeStrokes(strokes);
    const resampledUser = normalized.map((s) => resampleStroke(s, 20));
    const resampledRef = referenceKanji.map((s) => resampleStroke(s, 20));

    const score = compareStrokes(resampledUser, resampledRef);

    res.send({
      kanji: targetKanji,
      score: score,
      strokes: referenceKanji.length,
    });
  } catch (e) {
    console.error(e);
    res.status(500).send("Error");
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
