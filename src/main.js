const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d');
const video = document.getElementById('bg-video');
const font = new FontFace('CustomFont', 'url(BigCaslon.otf)');
import data from './data.js';

font.load().then((font) => {
  document.fonts.add(font);
});

let sentences = [];
let lastSentenceIndex = -1;
let currentSentence = '';

function randomSentence() {
  sentences = data;
  if (sentences.length === 0) return '';
  let idx;
  do {
    idx = Math.floor(Math.random() * sentences.length);
  } while (idx === lastSentenceIndex);
  lastSentenceIndex = idx;
  return sentences[idx];
}

/* ── State machine ────────────────────────────────── */
const State = Object.freeze({ IDLE: 'IDLE', Text: 'Text' });
let state = State.IDLE;

/* ── Text display duration ───────────────────────── */
const TEXT_STAGE = 3000;
let TextStartTime = 0;

/* ── Resize handling ──────────────────────────────── */
function resize() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  canvas.style.width = window.innerWidth + 'px';
  canvas.style.height = window.innerHeight + 'px';
  ctx.scale(dpr, dpr);
}

window.addEventListener('resize', resize);
resize();

/* ── Video ────────────────────────────────────────── */
video.addEventListener('canplay', () => video.play().catch(() => { }));
video.play().catch(() => { });

/* ── Helpers ──────────────────────────────────────── */
function cssW() { return window.innerWidth; }
function cssH() { return window.innerHeight; }

function touchZone() {
  const cx = cssW() / 2;
  const cy = cssH() / 2;
  return {
    x: cx + cssW() * 0.1,
    y: cy - cssH() * 0.25,
    w: cssW() * 0.35,
    h: cssH() * 0.3
  };
}

function drawVideo() {
  if (video.readyState < 2) return;

  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const cw = cssW();
  const ch = cssH();

  const scale = Math.max(cw / vw, ch / vh);
  const dw = vw * scale;
  const dh = vh * scale;
  const dx = (cw - dw) / 2;
  const dy = (ch - dh) / 2;

  ctx.drawImage(video, dx, dy, dw, dh);
}

function drawTouchZone() {
  const r = touchZone();
  ctx.save();
  ctx.strokeStyle = '#22ff29ff';
  ctx.lineWidth = 2;
  ctx.strokeRect(r.x, r.y, r.w, r.h);
  ctx.restore();
}

function drawText(text) {
  const cw = cssW();
  const ch = cssH();
  const maxWidth = cw * 0.8;
  const fontSize = Math.min(cw * 0.10, ch * 0.12, 50);
  const lineHeight = fontSize * 1.3;

  ctx.save();
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, cw, ch);
  ctx.restore();

  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.font = `500 ${fontSize}px CustomFont`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const words = text.split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);

  const totalHeight = lines.length * lineHeight;
  const startY = ch / 2 - totalHeight / 2 + lineHeight / 2;
  lines.forEach((line, i) => {
    ctx.fillText(line, cw / 2, startY + i * lineHeight);
  });

  ctx.restore();
}

/* ── Main render loop ─────────────────────────────── */
function render(ts) {
  if (state === State.IDLE) {
    drawVideo();
    drawTouchZone();

  } else if (state === State.Text) {
    const elapsed = ts - TextStartTime;

    if (elapsed < TEXT_STAGE) {
      drawText(currentSentence);
    } else {
      state = State.IDLE;
    }
  }

  requestAnimationFrame(render);
}

requestAnimationFrame(render);

/* ── Input handling ───────────────────────────────── */
function handleInteraction(clientX, clientY) {
  if (video.paused) video.play().catch(() => { });
  if (state !== State.IDLE) return;

  const r = touchZone();
  if (
    clientX >= r.x && clientX <= r.x + r.w &&
    clientY >= r.y && clientY <= r.y + r.h
  ) {
    state = State.Text;
    TextStartTime = performance.now();
    currentSentence = randomSentence();
  }
}

canvas.addEventListener('click', e => {
  handleInteraction(e.clientX, e.clientY);
});

canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  const t = e.changedTouches[0];
  handleInteraction(t.clientX, t.clientY);
}, { passive: false });