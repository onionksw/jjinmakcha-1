// 찐막차 PWA 아이콘 생성 (순수 Node.js — 외부 패키지 없음)
// 맥주잔 로고를 픽셀로 직접 드로잉
import { deflateSync } from 'zlib';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ──────────────── PNG 인코더 ────────────────
function crc32(buf) {
  const t = Array.from({ length: 256 }, (_, i) => {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    return c >>> 0;
  });
  let crc = 0xFFFFFFFF;
  for (const b of buf) crc = (crc >>> 8) ^ t[(crc ^ b) & 0xFF];
  return ((crc ^ 0xFFFFFFFF) >>> 0);
}
function pngChunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, c]);
}
function encodePNG(w, h, pixels) { // pixels: Uint8Array RGBA
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // RGBA

  const rows = [];
  for (let y = 0; y < h; y++) {
    const row = Buffer.alloc(1 + w * 4);
    for (let x = 0; x < w; x++) {
      const s = (y * w + x) * 4;
      row[1 + x * 4]     = pixels[s];
      row[1 + x * 4 + 1] = pixels[s + 1];
      row[1 + x * 4 + 2] = pixels[s + 2];
      row[1 + x * 4 + 3] = pixels[s + 3];
    }
    rows.push(row);
  }
  const idat = deflateSync(Buffer.concat(rows));
  return Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ──────────────── 드로잉 헬퍼 ────────────────
function setPixel(pixels, w, x, y, r, g, b, a = 255) {
  if (x < 0 || y < 0 || x >= w || y >= w) return;
  const i = (y * w + x) * 4;
  // 알파 블렌딩
  const sa = a / 255, da = pixels[i + 3] / 255;
  const oa = sa + da * (1 - sa);
  if (oa < 0.001) return;
  pixels[i]     = Math.round((r * sa + pixels[i]     * da * (1 - sa)) / oa);
  pixels[i + 1] = Math.round((g * sa + pixels[i + 1] * da * (1 - sa)) / oa);
  pixels[i + 2] = Math.round((b * sa + pixels[i + 2] * da * (1 - sa)) / oa);
  pixels[i + 3] = Math.round(oa * 255);
}

function fillRect(pixels, w, x0, y0, x1, y1, r, g, b, a = 255) {
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++)
      setPixel(pixels, w, x, y, r, g, b, a);
}

function fillCircle(pixels, w, cx, cy, radius, r, g, b, aa = true) {
  const r2 = radius * radius;
  for (let dy = -radius - 1; dy <= radius + 1; dy++) {
    for (let dx = -radius - 1; dx <= radius + 1; dx++) {
      const d = Math.sqrt(dx * dx + dy * dy);
      if (!aa) {
        if (d <= radius) setPixel(pixels, w, cx + dx, cy + dy, r, g, b);
      } else {
        const alpha = Math.max(0, Math.min(1, radius - d + 0.5));
        if (alpha > 0) setPixel(pixels, w, cx + dx, cy + dy, r, g, b, Math.round(alpha * 255));
      }
    }
  }
}

function fillRoundRect(pixels, w, x0, y0, x1, y1, radius, r, g, b) {
  // fill body
  fillRect(pixels, w, x0 + radius, y0, x1 - radius, y1, r, g, b);
  fillRect(pixels, w, x0, y0 + radius, x1, y1 - radius, r, g, b);
  // corners
  fillCircle(pixels, w, x0 + radius, y0 + radius, radius, r, g, b);
  fillCircle(pixels, w, x1 - radius, y0 + radius, radius, r, g, b);
  fillCircle(pixels, w, x0 + radius, y1 - radius, radius, r, g, b);
  fillCircle(pixels, w, x1 - radius, y1 - radius, radius, r, g, b);
}

// 호 (핸들용)
function strokeArc(pixels, w, cx, cy, radiusOuter, thickness, startDeg, endDeg, r, g, b) {
  const radiusInner = radiusOuter - thickness;
  const steps = 800;
  for (let i = 0; i <= steps; i++) {
    const angle = (startDeg + (endDeg - startDeg) * i / steps) * Math.PI / 180;
    for (let ri = radiusInner; ri <= radiusOuter; ri += 0.5) {
      const px = Math.round(cx + ri * Math.cos(angle));
      const py = Math.round(cy + ri * Math.sin(angle));
      setPixel(pixels, w, px, py, r, g, b);
    }
  }
}

// ──────────────── 아이콘 드로잉 ────────────────
function drawIcon(size) {
  const s = size;
  const pixels = new Uint8Array(s * s * 4); // 투명 초기값

  const bg = [0x4C, 0xC9, 0xF0]; // #4CC9F0 브랜드 블루

  // 1) 둥근 사각형 배경
  const r = Math.round(s * 0.18);
  fillRoundRect(pixels, s, 0, 0, s - 1, s - 1, r, ...bg);

  // 2) 맥주잔 몸통 (흰색 둥근 사각형)
  const mx = Math.round(s * 0.22), my = Math.round(s * 0.28);
  const mw = Math.round(s * 0.45), mh = Math.round(s * 0.48);
  const mr = Math.round(s * 0.06);
  fillRoundRect(pixels, s, mx, my, mx + mw, my + mh, mr, 255, 255, 255);

  // 3) 핸들
  const hcx = Math.round(mx + mw + s * 0.08);
  const hcy = Math.round(my + mh * 0.5);
  const hOuter = Math.round(s * 0.18);
  const hThick = Math.round(s * 0.07);
  strokeArc(pixels, s, hcx, hcy, hOuter, hThick, -70, 70, 255, 255, 255);

  // 4) 맥주 색상 내부 채우기 (황금색)
  const beerTop = my + Math.round(mh * 0.28);
  fillRect(pixels, s, mx + 4, beerTop, mx + mw - 4, my + mh - 4, 0xFF, 0xD0, 0x60);

  // 5) 거품 (흰 원들)
  const foamY = my + Math.round(mh * 0.08);
  const fr = Math.round(s * 0.08);
  fillCircle(pixels, s, mx + Math.round(mw * 0.25), foamY, fr, 255, 255, 255);
  fillCircle(pixels, s, mx + Math.round(mw * 0.5), foamY - Math.round(s * 0.03), Math.round(fr * 1.1), 255, 255, 255);
  fillCircle(pixels, s, mx + Math.round(mw * 0.75), foamY, fr, 255, 255, 255);

  // 거품 아래 가로 줄로 매끄럽게
  fillRect(pixels, s, mx + 4, foamY, mx + mw - 4, foamY + fr, 255, 255, 255);

  return encodePNG(s, s, pixels);
}

const outDir = join(__dirname, '..', 'public', 'icons');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'icon-192.png'), drawIcon(192));
writeFileSync(join(outDir, 'icon-512.png'), drawIcon(512));
console.log('✅ 맥주잔 아이콘 생성 완료: icon-192.png, icon-512.png');
