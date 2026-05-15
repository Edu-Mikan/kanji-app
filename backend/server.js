const express = require('express');
const cors = require('cors');
const fs = require('fs');



const kanjiDataset = JSON.parse(
  fs.readFileSync('./kanji_full.json', 'utf-8')
);



const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3000;

function normalizeStrokes(strokes) {
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;

  strokes.forEach(stroke => {
    stroke.x.forEach(x => {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    });
    stroke.y.forEach(y => {
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    });
  });

  const size = Math.max(maxX - minX, maxY - minY);
  
  return strokes.map(stroke => ({
    x: stroke.x.map(x => (x - minX) / size),
    y: stroke.y.map(y => (y - minY) / size),
  }));

}

// function compareStrokes(user, reference) {
//   let total = 0;
//   let count = 0;

//   const strokeCount = Math.min(user.length, reference.length);

//   for (let i = 0; i < strokeCount; i++) {
//     const s1 = user[i];
//     const s2 = reference[i];

//     const len = Math.min(s1.x.length, s2.x.length);

//     for (let j = 0; j < len; j++) {
//       const dx = s1.x[j] - s2.x[j];
//       const dy = s1.y[j] - s2.y[j];

//       total += Math.sqrt(dx * dx + dy * dy);
//       count++;
//     }
//   }

//   let score = total / count;

//   // 🔥 PENALIZACIÓN POR TRAZOS
//   const strokePenalty = Math.abs(user.length - reference.length);

//   score += strokePenalty * 0.5;

//   return score;
// }

function ordenarStroke(stroke) {
  const points = stroke.x.map((x, i) => ({
    x,
    y: stroke.y[i]
  }));

  if (points.length < 2) return stroke;

  const ordered = [points[0]];
  const remaining = points.slice(1);

  while (remaining.length > 0) {
    const last = ordered[ordered.length - 1];

    let bestIndex = 0;
    let bestDist = Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const dx = remaining[i].x - last.x;
      const dy = remaining[i].y - last.y;
      const dist = dx * dx + dy * dy;

      if (dist < bestDist) {
        bestDist = dist;
        bestIndex = i;
      }
    }

    ordered.push(remaining.splice(bestIndex, 1)[0]);
  }

  return {
    x: ordered.map(p => p.x),
    y: ordered.map(p => p.y)
  };
}

function compareStrokes(user, reference) {
  let total = 0;

  user.forEach(userStroke => {
    let bestScore = Infinity;

    reference.forEach(refStroke => {
      const len = Math.min(userStroke.x.length, refStroke.x.length);

      let score = 0;

      for (let i = 0; i < len; i++) {
        const dx = userStroke.x[i] - refStroke.x[i];
        const dy = userStroke.y[i] - refStroke.y[i];
        score += Math.sqrt(dx * dx + dy * dy);
      }

      score = score / len;

      if (score < bestScore) {
        bestScore = score;
      }
    });

    total += bestScore;
  });

  let finalScore = total / user.length;

  // penalización por número de strokes
  const strokePenalty = Math.abs(user.length - reference.length);

  
  // 🔥 divide por nº de strokes para no inflar
  finalScore = finalScore / Math.sqrt(reference.length);


  finalScore += strokePenalty * 0.6;

  return finalScore;
}

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


function alignStrokes(user, reference) {
  if (!user || user.length === 0) return user;
  if (!reference || reference.length === 0) return user;

  if (!user[0] || !user[0].x || user[0].x.length === 0) return user;
  if (!reference[0] || !reference[0].x || reference[0].x.length === 0) return user;

  const offsetX = user[0].x[0] - reference[0].x[0];
  const offsetY = user[0].y[0] - reference[0].y[0];

  return user.map(stroke => ({
    x: stroke.x.map(x => x - offsetX),
    y: stroke.y.map(y => y - offsetY),
  }));
}



function isValidKanji(strokes) {
  return (
    strokes &&
    strokes.length > 0 &&
    strokes.every(s => s.x.length > 0 && s.y.length > 0)
  );
}


const referenceKanji = [
  // horizontal
  {
    x: [0.2, 0.8],
    y: [0.5, 0.5]
  },
  // vertical
  {
    x: [0.5, 0.5],
    y: [0.2, 0.8]
  }
];


app.post('/recognize', async (req, res) => {
  try {

    const strokes = req.body.ink.strokes;

    const targetKanji = req.body.kanji || "難";
    const referenceKanji = kanjiDataset[targetKanji];

    const normalized = normalizeStrokes(strokes);

    const resampled = normalized.map(s => resampleStroke(s, 20));

    // ✅ 🔥 FILTRO AQUÍ
    const filtered = resampled.filter(s => s.x.length > 5);

    const referenceResampled = referenceKanji.map(s =>
      //resampleStroke(s, 20)
      ordenarStroke(resampleStroke(s, 20))
    );

    const cleaned = referenceResampled.filter(s => s.x.length > 5);

    
if (!filtered || filtered.length === 0) {
  console.log("⚠️ Usuario sin strokes válidos");
  return res.send({
    kanji: targetKanji,
    score: 999
  });
}

if (!cleaned || cleaned.length === 0) {
  console.log("⚠️ Dataset sin strokes válidos");
  return res.send({
    kanji: targetKanji,
    score: 999,
    strokes: []
  });
}

    // ✅ 🔥 ALINEAR CON FILTERED
    const aligned = alignStrokes(filtered, referenceResampled);

    // ✅ 🔥 COMPARAR CON FILTERED
    const score = compareStrokes(aligned, referenceResampled);

    console.log(`KANJI: ${targetKanji} → SCORE: ${score}`);

    res.send({
      kanji: targetKanji,
      score: score,
      //strokes: referenceKanji
      strokes: referenceResampled
    });

  } catch (error) {
    console.error(error);
    res.status(500).send('Error');
  }
});


app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});