const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d');
const video = document.getElementById('bg-video');
const font = new FontFace('CustomFont', 'url(/BigCaslon.ttf)');

font.load().then((font) => {
  document.fonts.add(font);
});

/* ── State machine ────────────────────────────────── */
const State = Object.freeze({ IDLE: 'IDLE', Text: 'Text', RETURN: 'RETURN' });
let state = State.IDLE;

/* ── Text animation bookkeeping ─────────────────── */
const TEXT_STAGE = 1800;   // how long the text stays fully visible
const TRANSITION_DURATION = 500; // fade-in and fade-out duration
let TextStartTime = 0;
let TextAlpha = 0;

/* ── Resize handling ──────────────────────────────── */
function resize() {
  // Use device pixel ratio for crisp rendering on HiDPI screens
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

/* ── Video: start playing as soon as enough data is ready ── */
video.addEventListener('canplay', () => video.play().catch(() => { }));
video.play().catch(() => { }); // attempt immediately (may be blocked until user gesture)

/* ── Helpers ──────────────────────────────────────── */
function cssW() { return window.innerWidth; }
function cssH() { return window.innerHeight; }

/** Returns the hit-square rect in CSS pixels */
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

/** Draw the looping video, cover-fit to the canvas */
function drawVideo() {
  if (video.readyState < 2) {
    return;
  }

  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const cw = cssW();
  const ch = cssH();

  // Cover: scale so the video fills the canvas, centred
  const scale = Math.max(cw / vw, ch / vh);
  const dw = vw * scale;
  const dh = vh * scale;
  const dx = (cw - dw) / 2;
  const dy = (ch - dh) / 2;

  ctx.drawImage(video, dx, dy, dw, dh);
}

/** Draw the always-visible red hit-square */
function drawTouchZone() {
  const r = touchZone();
  ctx.save();
  ctx.strokeStyle = '#22ff29ff';
  ctx.lineWidth = 2;
  ctx.strokeRect(r.x, r.y, r.w, r.h);
  ctx.restore();
}

/** Draw the text overlay at a given alpha */
function drawText(text) {
  const cw = cssW();
  const ch = cssH();

  // Black overlay behind the text
  ctx.save();
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, cw, ch);
  ctx.restore();

  // Text text
  const fontSize = Math.min(cw * 0.10, ch * 0.12, 60);
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.font = `500 ${fontSize}px CustomFont`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.fillText(text, cw / 2, ch / 2);
  ctx.restore();
}

/* ── Main render loop ─────────────────────────────── */
function render(ts) {
  // ctx.clearRect(0, 0, cssW(), cssH());

  if (state === State.IDLE) {
    drawVideo();
    drawTouchZone();

  } else if (state === State.Text) {
    const elapsed = ts - TextStartTime;
    const total = TRANSITION_DURATION + TEXT_STAGE + TRANSITION_DURATION;

    if (elapsed < TRANSITION_DURATION) {
      // Fade in
      TextAlpha = elapsed / TRANSITION_DURATION;
      drawVideo();
      drawText('Text', TextAlpha);

    } else if (elapsed < TRANSITION_DURATION + TEXT_STAGE) {
      // Hold
      drawText('Text', 1);
    } else if (elapsed < total) {
      // Fade out
      TextAlpha = 1 - (elapsed - TRANSITION_DURATION - TEXT_STAGE) / TRANSITION_DURATION;
      drawVideo();
      drawText('Text', TextAlpha);

    } else {
      // Sequence done → back to IDLE
      state = State.IDLE;
      drawVideo();
      drawTouchZone();
    }

  } else if (state === State.RETURN) {
    // Immediate snap-back (currently handled inside Text fade-out)
    state = State.IDLE;
  }

  requestAnimationFrame(render);
}

requestAnimationFrame(render);

/* ── Input handling ───────────────────────────────── */
function handleInteraction(clientX, clientY) {
  // On first user gesture, try to start video playback
  if (video.paused) video.play().catch(() => { });

  if (state !== State.IDLE) return; // ignore during animation

  const r = touchZone();
  if (
    clientX >= r.x && clientX <= r.x + r.w &&
    clientY >= r.y && clientY <= r.y + r.h
  ) {
    state = State.Text;
    TextStartTime = performance.now();
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