import data from './data.js';
import bg from './assets/bg_text.jpg';

const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d');
const video = document.getElementById('bg-video');
const font = new FontFace('CustomFont', 'url(IM_Fell_English_Regular.otf)');
const sound = document.getElementById('interaction-sound');

const bgIMG = new Image();
bgIMG.src = bg;

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
const TEXT_STAGE = 5000;
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
    x: cx + cssW() * 0.05,
    y: cy - cssH() * 0.25,
    w: cssW() * 0.45,
    h: cssH() * 0.3
  };
}

function drawVideo(asset) {
  if (asset.readyState < 2) return;

  const vw = asset.videoWidth;
  const vh = asset.videoHeight;
  const cw = cssW();
  const ch = cssH();

  const scale = Math.max(cw / vw, ch / vh);
  const dw = vw * scale;
  const dh = vh * scale;
  const dx = (cw - dw) / 2;
  const dy = (ch - dh) / 2;

  ctx.drawImage(asset, dx, dy, dw, dh);
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
  const fontSize = Math.min(cw * 0.07, ch * 0.1, 65);
  const lineHeight = fontSize * 1.3;

  ctx.save();
  ctx.drawImage(bgIMG, 0, 0, cw, ch);
  ctx.restore();

  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.font = `500 ${fontSize}px CustomFont`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const lines = [];
  for (const segment of text.split('\n')) {
    const words = segment.split(' ');
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
  }

  // Draw lines centred vertically as a block
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
    drawVideo(video);
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
    sound.currentTime = 0; // rewind in case it's still playing from last time
    sound.play().catch(() => { });
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