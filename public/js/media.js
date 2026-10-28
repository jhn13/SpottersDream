// Getting photos and videos ready to upload: shrink photos, grab a video thumbnail, read the photo date and GPS.

export const MAX_VIDEO_MB = 50;
const PHOTO_MAX = 2048, THUMB_MAX = 480;

async function loadBitmap(file) {
  if ('createImageBitmap' in window) {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) { /* fall through */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

function toJpeg(src, max, quality) {
  const w = src.width || src.videoWidth, h = src.height || src.videoHeight;
  const k = Math.min(1, max / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  return new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('Could not process that photo.')), 'image/jpeg', quality));
}

// Re-encoding also strips the photo's hidden location data before it's uploaded.
export async function preparePhoto(file) {
  let bmp;
  try { bmp = await loadBitmap(file); }
  catch (e) { throw new Error(`"${file.name}" isn't a photo this browser can open. On iPhone, choose it from Photos so it's converted to JPEG.`); }
  const blob = await toJpeg(bmp, PHOTO_MAX, 0.85);
  const poster = await toJpeg(bmp, THUMB_MAX, 0.8);
  if (bmp.close) bmp.close();
  return { kind: 'photo', blob, poster, ext: 'jpg' };
}

export async function prepareVideo(file) {
  if (file.size > MAX_VIDEO_MB * 1024 * 1024) {
    throw new Error(`That video is ${Math.round(file.size / 1048576)} MB. The limit is ${MAX_VIDEO_MB} MB, so trim it in Photos first (tap Edit and drag the ends in).`);
  }
  const ext = /quicktime/.test(file.type) || /\.mov$/i.test(file.name) ? 'mov' : 'mp4';
  const blob = file.type ? file : new Blob([file], { type: ext === 'mov' ? 'video/quicktime' : 'video/mp4' });
  let poster = null;
  try { poster = await videoThumb(file); } catch (e) { /* a missing thumbnail is fine */ }
  return { kind: 'video', blob, poster, ext };
}

function videoThumb(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
    const done = (fn, x) => { clearTimeout(t); URL.revokeObjectURL(url); fn(x); };
    const t = setTimeout(() => done(reject, new Error('timeout')), 8000);
    v.addEventListener('loadeddata', () => { v.currentTime = Math.min(0.5, (v.duration || 1) / 2); }, { once: true });
    v.addEventListener('seeked', () => { toJpeg(v, THUMB_MAX, 0.8).then(b => done(resolve, b), e => done(reject, e)); }, { once: true });
    v.addEventListener('error', () => done(reject, new Error('video')), { once: true });
  });
}

// Minimal EXIF reader: DateTimeOriginal and GPS from a JPEG. Returns {date:'YYYY-MM-DD', lat, lon} or {}.
export async function readExif(file) {
  try {
    if (!/jpe?g/i.test(file.type) && !/\.jpe?g$/i.test(file.name)) return {};
    const buf = await file.slice(0, 256 * 1024).arrayBuffer();
    const d = new DataView(buf);
    if (d.getUint16(0) !== 0xFFD8) return {};
    let off = 2;
    while (off + 4 < d.byteLength) {
      const marker = d.getUint16(off), len = d.getUint16(off + 2);
      if (marker === 0xFFE1 && d.getUint32(off + 4) === 0x45786966) return parseTiff(d, off + 10);
      if ((marker & 0xFF00) !== 0xFF00) break;
      off += 2 + len;
    }
  } catch (e) { /* ignore */ }
  return {};
}
function parseTiff(d, t) {
  const le = d.getUint16(t) === 0x4949;
  const u16 = o => d.getUint16(t + o, le), u32 = o => d.getUint32(t + o, le);
  const ifd = (o) => { const n = u16(o), out = {}; for (let i = 0; i < n; i++) { const e = o + 2 + i * 12; out[u16(e)] = { type: u16(e + 2), count: u32(e + 4), val: e + 8 }; } return out; };
  const str = (en) => { const o = en.count > 4 ? u32(en.val) : en.val - 0; let s = ''; for (let i = 0; i < en.count - 1; i++) s += String.fromCharCode(d.getUint8(t + o + i)); return s; };
  const rat = (o, i) => u32(o + i * 8) / (u32(o + i * 8 + 4) || 1);
  const out = {};
  const ifd0 = ifd(u32(4));
  if (ifd0[0x8769]) {
    const ex = ifd(u32(ifd0[0x8769].val));
    const dt = ex[0x9003] || ex[0x9004];
    if (dt) { const m = /^(\d{4}):(\d{2}):(\d{2})/.exec(str(dt)); if (m) out.date = `${m[1]}-${m[2]}-${m[3]}`; }
  }
  if (ifd0[0x8825]) {
    const g = ifd(u32(ifd0[0x8825].val));
    if (g[2] && g[4]) {
      const la = u32(g[2].val), lo = u32(g[4].val);
      let lat = rat(la, 0) + rat(la, 1) / 60 + rat(la, 2) / 3600;
      let lon = rat(lo, 0) + rat(lo, 1) / 60 + rat(lo, 2) / 3600;
      const latRef = g[1] ? String.fromCharCode(d.getUint8(g[1].val)) : 'N';
      const lonRef = g[3] ? String.fromCharCode(d.getUint8(g[3].val)) : 'E';
      if (latRef === 'S') lat = -lat;
      if (lonRef === 'W') lon = -lon;
      if (isFinite(lat) && isFinite(lon) && (lat || lon)) { out.lat = lat; out.lon = lon; }
    }
  }
  return out;
}
