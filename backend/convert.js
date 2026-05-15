const fs = require('fs');
const path = require('path');

// simplifica path SVG a puntos
function extractPoints(d) {
  const points = [];
  const commands = d.match(/[ML][^ML]*/g);

  if (!commands) return [];

  commands.forEach(cmd => {
    const nums = cmd.slice(1).trim().split(/[ ,]/).map(Number);
    for (let i = 0; i < nums.length; i += 2) {
      points.push({ x: nums[i], y: nums[i + 1] });
    }
  });

  return points;
}

// normalizar stroke
function normalize(points) {
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;

  points.forEach(p => {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  });

  const size = Math.max(maxX - minX, maxY - minY);

  return points.map(p => ({
    x: (p.x - minX) / size,
    y: (p.y - minY) / size
  }));
}

// convertir un SVG
function convertFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');

  const paths = [...content.matchAll(/<path[^>]*d="([^"]+)"/g)];

  const strokes = paths.map(p => {
    const points = extractPoints(p[1]);
    const normalized = normalize(points);

    return {
      x: normalized.map(p => p.x),
      y: normalized.map(p => p.y)
    };
  });

  return strokes;
}

// convertir todos
const dir = './kanji_svg/';
const dataset = {};

fs.readdirSync(dir).forEach(file => {
  if (!file.endsWith('.svg')) return;

  const filePath = path.join(dir, file);
  const unicode = file.replace('.svg', '');

  const kanji = String.fromCharCode(parseInt(unicode, 16));

  try {
    dataset[kanji] = convertFile(filePath);
  } catch (e) {
    console.log('Error:', file);
  }
});

// guardar JSON final
fs.writeFileSync('kanji_full.json', JSON.stringify(dataset, null, 2));

console.log('✅ Dataset generado');