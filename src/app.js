/**
 * app.js — v5  (dat.gui controls)
 */

import { Curtains, Plane } from 'curtainsjs';
import gsap from 'gsap';
import * as dat from 'dat.gui';
import data from './data.js';

/* ════════════════════════════════════════════════════════════════
 *  dat.gui — all tuneable parameters live here
 * ════════════════════════════════════════════════════════════════ */
const params = {
  showTouchZone:       true,
  transitionDuration:  3.0,   // seconds
  showDuration:        7.0,  // second
  distortionStrength:  0.012,
  blurStrength:        0.01,
};

const gui = new dat.GUI({ width: 400 });
gui.add(params, 'showTouchZone')
   .name('Show touch zone')
   .onChange(v => { touchZoneEl.style.display = v ? '' : 'none'; });
gui.add(params, 'transitionDuration', 1.0, 6.0, 0.1).name('Transition (s)');
gui.add(params, 'showDuration',       2, 10, 0.5).name('Text duration (s)');
gui.add(params, 'distortionStrength', 0.0, 0.08,  0.001).name('Text distortion strength');
gui.add(params, 'blurStrength',         0.0, 0.02,  0.001).name('Text blur strength');

/* ── State ──────────────────────────────────────────────────── */
const State = Object.freeze({ IDLE: 'IDLE', SHOWING: 'SHOWING' });
let state           = State.IDLE;
let isRunning       = false;
let lastSentenceIdx = -1;
let currentSentence = '';
let glTimer         = 0;

/* ── DOM ────────────────────────────────────────────────────── */
const touchZoneEl  = document.getElementById('touch-zone');
const videoWrap    = document.querySelector('.video');
const sound        = document.getElementById('interaction-sound');
const textVideo    = document.getElementById('text-video');
const textImage = document.getElementById('text-image');

/* ── Source canvas (2-D) ────────────────────────────────────── */
const sourceCanvas = document.getElementById('source-canvas');
const sCtx         = sourceCanvas.getContext('2d');
const SW           = sourceCanvas.width;
const SH           = sourceCanvas.height;

/* ── Output canvas (WebGL distortion → CurtainsJS texture) ─── */
const textCanvas = document.getElementById('text-canvas');
const TW         = textCanvas.width;
const TH         = textCanvas.height;

/* ── Custom font ────────────────────────────────────────────── */
const customFont = new FontFace('CustomFont', 'url(IM_Fell_English_Regular.otf)');
customFont.load().then(f => document.fonts.add(f)).catch(() => {});

/* ════════════════════════════════════════════════════════════════
 *  DISTORTION PASS (WebGL on text-canvas)
 * ════════════════════════════════════════════════════════════════ */
const DIST_VERT = `
  attribute vec2 aPosition;
  varying   vec2 vUv;
  void main() {
    vUv         = aPosition * 0.5 + 0.5;
    gl_Position = vec4(aPosition, 0.0, 1.0);
  }
`;

const DIST_FRAG = `
  precision mediump float;

  varying vec2 vUv;
  uniform sampler2D uSource;
  uniform float     uTime;
  uniform float     uStrength;
  uniform float     uBlurStrength;

  const int   noiseSwirlSteps     = 2;
  const float noiseSwirlValue     = 1.0;
  const float noiseSwirlStepValue = noiseSwirlValue / float(noiseSwirlSteps);
  const float noiseScale          = 2.0;
  const float noiseTimeScale      = 0.08;

  const float BLUR_MIN = 0.000;

  vec3 mod289v3(vec3 x){ return x - floor(x*(1./289.))*289.; }
  vec4 mod289v4(vec4 x){ return x - floor(x*(1./289.))*289.; }
  vec4 permute(vec4 x){ return mod289v4(((x*34.)+1.)*x); }
  vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314*r; }

  float simplex(vec3 v){
    const vec2 C = vec2(1./6.,1./3.);
    const vec4 D = vec4(0.,.5,1.,2.);
    vec3 i  = floor(v+dot(v,C.yyy));
    vec3 x0 = v-i+dot(i,C.xxx);
    vec3 g  = step(x0.yzx,x0.xyz);
    vec3 l  = 1.0-g;
    vec3 i1 = min(g.xyz,l.zxy);
    vec3 i2 = max(g.xyz,l.zxy);
    vec3 x1 = x0-i1+C.xxx;
    vec3 x2 = x0-i2+C.yyy;
    vec3 x3 = x0-D.yyy;
    i = mod289v3(i);
    vec4 p = permute(permute(permute(
               i.z+vec4(0.,i1.z,i2.z,1.))
             + i.y+vec4(0.,i1.y,i2.y,1.))
             + i.x+vec4(0.,i1.x,i2.x,1.));
    float n_ = 0.142857142857;
    vec3  ns = n_*D.wyz-D.xzx;
    vec4  j  = p-49.*floor(p*ns.z*ns.z);
    vec4  x_ = floor(j*ns.z);
    vec4  y_ = floor(j-7.*x_);
    vec4  x  = x_*ns.x+ns.yyyy;
    vec4  y  = y_*ns.x+ns.yyyy;
    vec4  h  = 1.-abs(x)-abs(y);
    vec4  b0 = vec4(x.xy,y.xy);
    vec4  b1 = vec4(x.zw,y.zw);
    vec4  s0 = floor(b0)*2.+1.;
    vec4  s1 = floor(b1)*2.+1.;
    vec4  sh = -step(h,vec4(0.));
    vec4  a0 = b0.xzyw+s0.xzyw*sh.xxyy;
    vec4  a1 = b1.xzyw+s1.xzyw*sh.zzww;
    vec3  p0 = vec3(a0.xy,h.x);
    vec3  p1 = vec3(a0.zw,h.y);
    vec3  p2 = vec3(a1.xy,h.z);
    vec3  p3 = vec3(a1.zw,h.w);
    vec4  norm = taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
    p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
    vec4 m = max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);
    m=m*m;
    return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
  }

  float fbm3(vec3 v){
    float r = simplex(v);
    r += simplex(v*2.)*.5;
    r += simplex(v*4.)*.25;
    return r/(1.+.5+.25);
  }
  float fbm5(vec3 v){
    float r = simplex(v);
    r += simplex(v*2.)*.5;
    r += simplex(v*4.)*.25;
    r += simplex(v*8.)*.125;
    r += simplex(v*16.)*.0625;
    return r/(1.+.5+.25+.125+.0625);
  }

  void main(){
    vec3 v = vec3(vUv * noiseScale, uTime * noiseTimeScale);
    for(int i=0; i<noiseSwirlSteps; i++){
      v.xy += vec2(fbm3(v), fbm3(vec3(v.xy, v.z+1000.))) * noiseSwirlStepValue;
    }
    float nx = fbm5(v)                                     * 0.5 + 0.5;
    float ny = fbm5(vec3(v.xy + vec2(17.31, 31.41), v.z)) * 0.5 + 0.5;
    vec2 warpedUV = vUv + (vec2(nx, ny) * 2. - 1.) * uStrength;

    float blurNoise = fbm3(vec3(vUv * 1.2 + vec2(53.7, 91.3),
                                uTime * noiseTimeScale * 0.6));
    blurNoise = blurNoise * blurNoise;
    float blur = mix(BLUR_MIN, uBlurStrength, blurNoise);

    vec4 c  = texture2D(uSource, warpedUV);
    c += texture2D(uSource, warpedUV + vec2( blur, 0.  ));
    c += texture2D(uSource, warpedUV + vec2(-blur, 0.  ));
    c += texture2D(uSource, warpedUV + vec2( 0.,   blur));
    c += texture2D(uSource, warpedUV + vec2( 0.,  -blur));
    gl_FragColor = c / 5.0;
  }
`;

function compileShader(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
    console.error('Shader error:', gl.getShaderInfoLog(s));
  return s;
}

function buildDistortionPass(gl) {
  const prog = gl.createProgram();
  gl.attachShader(prog, compileShader(gl, gl.VERTEX_SHADER,   DIST_VERT));
  gl.attachShader(prog, compileShader(gl, gl.FRAGMENT_SHADER, DIST_FRAG));
  gl.linkProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER,
    new Float32Array([-1,-1, 1,-1, -1,1, 1,-1, 1,1, -1,1]),
    gl.STATIC_DRAW);

  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  return {
    prog, buf, tex,
    aPos:      gl.getAttribLocation(prog,  'aPosition'),
    uSource:   gl.getUniformLocation(prog, 'uSource'),
    uTime:     gl.getUniformLocation(prog, 'uTime'),
    uStrength: gl.getUniformLocation(prog, 'uStrength'),
    uBlurStrength: gl.getUniformLocation(prog, 'uBlurStrength'),
  };
}

const dgl      = textCanvas.getContext('webgl', { alpha: false, antialias: false, preserveDrawingBuffer: true });
const distPass = dgl ? buildDistortionPass(dgl) : null;

function renderDistortionPass(t) {
  if (!dgl || !distPass) return;
  const { prog, buf, tex, aPos, uSource, uTime, uStrength, uBlurStrength } = distPass;

  dgl.pixelStorei(dgl.UNPACK_FLIP_Y_WEBGL, true);
  dgl.bindTexture(dgl.TEXTURE_2D, tex);
  dgl.texImage2D(dgl.TEXTURE_2D, 0, dgl.RGBA, dgl.RGBA, dgl.UNSIGNED_BYTE, sourceCanvas);

  dgl.viewport(0, 0, TW, TH);
  dgl.useProgram(prog);
  dgl.bindBuffer(dgl.ARRAY_BUFFER, buf);
  dgl.enableVertexAttribArray(aPos);
  dgl.vertexAttribPointer(aPos, 2, dgl.FLOAT, false, 0, 0);

  dgl.uniform1i(uSource,   0);
  dgl.uniform1f(uTime,     t);
  dgl.uniform1f(uStrength, params.distortionStrength); // live from GUI
  dgl.uniform1f(uBlurStrength, params.blurStrength); // live from GUI
  dgl.drawArrays(dgl.TRIANGLES, 0, 6);
}

/* ════════════════════════════════════════════════════════════════
 *  SOURCE CANVAS (2-D)
 * ════════════════════════════════════════════════════════════════ */
function renderSourceCanvas() {
  // if (textVideo.readyState >= 2) {
  //   const vw = textVideo.videoWidth  || SW;
  //   const vh = textVideo.videoHeight || SH;
  //   const scale = Math.max(SW / vw, SH / vh);
  //   const dw = vw * scale, dh = vh * scale;
  //   sCtx.drawImage(textVideo, (SW - dw) / 2, (SH - dh) / 2, dw, dh);
  // } else {
  //   sCtx.fillStyle = '#000';
  //   sCtx.fillRect(0, 0, SW, SH);
  // }
  sCtx.drawImage(textImage, 0, 0, SW, SH);

  if (!currentSentence) return;

  const maxWidth   = SW * 0.8;
  const fontSize   = 65;
  const lineHeight = fontSize * 1.3;

  sCtx.save();
  sCtx.fillStyle    = '#ffffff';
  sCtx.font         = `500 ${fontSize}px CustomFont, serif`;
  sCtx.textAlign    = 'center';
  sCtx.textBaseline = 'middle';

  const lines = [];
  for (const segment of currentSentence.split('\n')) {
    const words = segment.split(' ');
    let cur = '';
    for (const word of words) {
      const test = cur ? `${cur} ${word}` : word;
      if (sCtx.measureText(test).width > maxWidth && cur) { lines.push(cur); cur = word; }
      else cur = test;
    }
    if (cur) lines.push(cur);
  }
  const startY = SH / 2 - (lines.length * lineHeight) / 2 + lineHeight / 2;
  lines.forEach((line, i) => sCtx.fillText(line, SW / 2, startY + i * lineHeight));
  sCtx.restore();
}

/* ════════════════════════════════════════════════════════════════
 *  TOUCH ZONE
 * ════════════════════════════════════════════════════════════════ */
function touchZoneRect() {
  const cw = window.innerWidth, ch = window.innerHeight;
  return { x: cw / 2 + cw * 0.05, y: ch / 2 - ch * 0.25, w: cw * 0.45, h: ch * 0.30 };
}
function positionTouchZone() {
  const r = touchZoneRect();
  touchZoneEl.style.left   = `${r.x}px`;
  touchZoneEl.style.top    = `${r.y}px`;
  touchZoneEl.style.width  = `${r.w}px`;
  touchZoneEl.style.height = `${r.h}px`;
}
window.addEventListener('resize', positionTouchZone);
positionTouchZone();

function insideTouchZone(x, y) {
  const r = touchZoneRect();
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

/* ── Sentences ──────────────────────────────────────────────── */
function randomSentence() {
  if (!data.length) return '';
  let idx;
  do { idx = Math.floor(Math.random() * data.length); }
  while (idx === lastSentenceIdx && data.length > 1);
  lastSentenceIdx = idx;
  return data[idx];
}

/* ════════════════════════════════════════════════════════════════
 *  MASTER rAF LOOP
 * ════════════════════════════════════════════════════════════════ */
function masterLoop(ts) {
  renderSourceCanvas();
  renderDistortionPass(ts * 0.001);
  requestAnimationFrame(masterLoop);
}
requestAnimationFrame(masterLoop);

/* ════════════════════════════════════════════════════════════════
 *  CURTAINSJS
 * ════════════════════════════════════════════════════════════════ */
window.addEventListener('load', () => {
  const curtains = new Curtains({
    container: 'canvas',
    alpha: true,
    pixelRatio: Math.min(1.5, window.devicePixelRatio),
  });

  const planeElements = [...document.getElementsByClassName('plane')];
  const curtainsParams = {
    vertexShaderID:   'vert',
    fragmentShaderID: 'frag',
    uniforms: {
      transitionTimer: { name: 'uTransitionTimer', type: '1f', value: 0 },
      timer:           { name: 'uTimer',           type: '1f', value: 0 },
      to:              { name: 'uTo',              type: '1f', value: 0 },
      from:            { name: 'uFrom',            type: '1f', value: 0 },
    },
  };

  const plane = new Plane(curtains, planeElements[0], curtainsParams);
  let secondTexture = null;
  let showStartTime = 0;

  function triggerTransition(toIndex, onComplete) {
    if (isRunning) return;
    isRunning = true;
    plane.uniforms.transitionTimer.value = 0;
    plane.uniforms.to.value = toIndex;

    const fake = { progress: 0 };
    gsap.to(fake, {
      duration: params.transitionDuration, // live from GUI
      progress: 1,
      ease: 'none',
      onUpdate()   { plane.uniforms.transitionTimer.value = fake.progress; },
      onComplete() {
        plane.uniforms.from.value = toIndex;
        isRunning = false;
        if (onComplete) onComplete();
      },
    });
  }

  plane
    .onReady(() => {
      document.body.classList.add('curtains-ready');
      secondTexture = plane.textures.find(t => t.sampler === 'secondTexture') || null;

      plane.videos[0].play().catch(() => {});
      textVideo.play().catch(() => {});
      textVideo.addEventListener('canplay', () => textVideo.pause(), { once: true });

      function handleInteraction(clientX, clientY) {
        if (state !== State.IDLE || isRunning) return;
        if (!insideTouchZone(clientX, clientY)) return;

        currentSentence = randomSentence();
        textVideo.currentTime = 0;
        textVideo.play().catch(() => {});

        sound.currentTime = 0;
        sound.play().catch(() => {});

        triggerTransition(1, () => {
          state         = State.SHOWING;
          showStartTime = performance.now();
          document.body.classList.add('state-showing');
        });
      }

      videoWrap.addEventListener('click',    e => handleInteraction(e.clientX, e.clientY));
      videoWrap.addEventListener('touchend', e => {
        e.preventDefault();
        const t = e.changedTouches[0];
        handleInteraction(t.clientX, t.clientY);
      }, { passive: false });
    })

    .onRender(() => {
      glTimer += 0.001;
      plane.uniforms.timer.value = glTimer;
      if (secondTexture) secondTexture.needUpdate();

      if (state === State.SHOWING && !isRunning) {
        if (performance.now() - showStartTime >= params.showDuration * 1000) { // live from GUI
          state = State.IDLE;
          document.body.classList.remove('state-showing');
          triggerTransition(0, () => {
            textVideo.pause();
            currentSentence = '';
          });
        }
      }
    });
});