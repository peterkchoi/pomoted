/* ============================================================
   pomoted — lofi pixel pomodoro timer
   Vanilla JS. Settings persist in localStorage.
   Canvas-driven living scenes + smooth screen transitions.
   ============================================================ */
(() => {
  'use strict';

  /* ---------------- helpers ---------------- */
  const $  = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const DEFAULTS = { focus: 25, short: 5, long: 15, sessions: 4, scene: 'pixstudy', sound: true };
  const STORE_KEY = 'pomoted-settings';
  const OLD_STORE_KEY = 'stillpoint-settings';

  // migrate old theme/photo/scene ids to current scene ids
  const SCENE_MIGRATION = {
    dawn: 'sunset', dusk: 'sunset', mist: 'rain',
    'photo-study': 'pixstudy', 'photo-cafe': 'pixcafe', 'photo-loft': 'pixloft',
    cloudsea: 'pixstudy', bedroom: 'pixloft',
  };

  const PHASE_META = {
    focus: { label: 'focus',       toast: 'Time to focus' },
    short: { label: 'short break', toast: 'Breathe — short break' },
    long:  { label: 'long break',  toast: 'Rest well — long break' },
  };

  const SCENE_COLORS = {
    rain: '#16222e', cafe: '#241609', sunset: '#2a1a4a',
    ocean: '#0f2027', midnight: '#05060f', forest: '#0b3d2e',
    pixstudy: '#2b1a10', pixcafe: '#141a34', pixloft: '#33182a', library: '#12211a',
  };

  /* ---------------- elements ---------------- */
  const setupEl    = $('#setup');
  const sessionEl  = $('#session');
  const timeEl     = $('#time');
  const ringFg     = $('#ringFg');
  const phaseLabel = $('#phaseLabel');
  const phaseSub   = $('#phaseSub');
  const dotsEl     = $('#dots');
  const toastEl    = $('#toast');
  const pauseBtn   = $('#pauseBtn');
  const skipBtn    = $('#skipBtn');
  const endBtn     = $('#endBtn');
  const startBtn   = $('#start');
  const soundInput = $('#sound');
  const metaTheme  = $('#metaTheme');
  const bgEl       = document.querySelector('.bg');
  const sliders = {
    focus: $('#focus'), short: $('#short'),
    long: $('#long'),   sessions: $('#sessions'),
  };
  const outputs = {
    focus: $('#focusVal'), short: $('#shortVal'),
    long: $('#longVal'),   sessions: $('#sessionsVal'),
  };

  const RING_C = 2 * Math.PI * 140; // ring circle r = 140
  ringFg.style.strokeDasharray = String(RING_C);

  /* ---------------- settings ---------------- */
  let settings = loadSettings();

  function loadSettings() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE_KEY) || localStorage.getItem(OLD_STORE_KEY)) || {};
      if (raw.theme && !raw.scene) raw.scene = raw.theme; // v1 -> v2 key rename
      const merged = Object.assign({}, DEFAULTS, raw);
      if (SCENE_MIGRATION[merged.scene]) merged.scene = SCENE_MIGRATION[merged.scene];
      return merged;
    } catch {
      return Object.assign({}, DEFAULTS);
    }
  }

  function saveSettings() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(settings)); } catch { /* private mode */ }
  }

  /* ---------------- state ---------------- */
  let phase     = 'focus';   // 'focus' | 'short' | 'long'
  let completed = 0;         // focus sessions finished (total, across rounds)
  let running   = false;
  let paused    = false;
  let timeLeft  = 0;
  let totalTime = 1;
  let endAt     = 0;

  let wakeLock   = null;
  let toastTimer = null;
  let idleTimer  = null;
  let audioCtx   = null;

  /* ---------------- screen transitions ---------------- */
  function showScreen(el) {
    el.classList.remove('hidden');
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('visible')));
  }

  function hideScreen(el) {
    el.classList.remove('visible');
    setTimeout(() => el.classList.add('hidden'), 520);
  }

  /* ---------------- setup screen ---------------- */
  function initSetup() {
    sliders.focus.value    = settings.focus;
    sliders.short.value    = settings.short;
    sliders.long.value     = settings.long;
    sliders.sessions.value = settings.sessions;
    soundInput.checked     = settings.sound;
    Object.keys(sliders).forEach((k) => syncSlider(k, false));
    setScene(settings.scene, false);
  }

  function sliderText(key, v) {
    if (key === 'sessions') return v + (v === 1 ? ' session' : ' sessions');
    return v + ' min';
  }

  function syncSlider(key, popIt) {
    const el = sliders[key];
    const v = parseInt(el.value, 10) || 0;
    const min = Number(el.min), max = Number(el.max);
    const pct = ((v - min) / (max - min)) * 100;
    el.style.setProperty('--val', pct + '%');
    const out = outputs[key];
    out.textContent = sliderText(key, v);
    if (popIt !== false) {
      out.classList.remove('pop');
      void out.offsetWidth;
      out.classList.add('pop');
    }
  }

  Object.keys(sliders).forEach((key) => {
    sliders[key].addEventListener('input', () => {
      syncSlider(key);
      settings[key] = parseInt(sliders[key].value, 10);
    });
    sliders[key].addEventListener('change', saveSettings);
  });

  // preset chips: classic / deep work / sprint
  $$('.preset').forEach((btn) => {
    btn.addEventListener('click', () => {
      settings.focus    = parseInt(btn.dataset.f, 10);
      settings.short    = parseInt(btn.dataset.s, 10);
      settings.long     = parseInt(btn.dataset.l, 10);
      settings.sessions = parseInt(btn.dataset.n, 10);
      sliders.focus.value    = settings.focus;
      sliders.short.value    = settings.short;
      sliders.long.value     = settings.long;
      sliders.sessions.value = settings.sessions;
      Object.keys(sliders).forEach((k) => syncSlider(k));
      saveSettings();
      btn.classList.remove('flash');
      void btn.offsetWidth;
      btn.classList.add('flash');
    });
  });

  /* ---------------- scene picker ---------------- */
  $$('.scene').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.scene === settings.scene) return;
      setScene(btn.dataset.scene, true);
      saveSettings();
    });
  });

  function setScene(name, fade) {
    settings.scene = name;
    if (metaTheme) metaTheme.setAttribute('content', SCENE_COLORS[name] || '#16222e');
    $$('.scene').forEach((b) => b.classList.toggle('active', b.dataset.scene === name));

    if (fade && bgEl) {
      bgEl.classList.add('swap');
      setTimeout(() => {
        document.body.dataset.scene = name;
        initSceneParticles();
        bgEl.classList.remove('swap');
      }, 600);
    } else {
      document.body.dataset.scene = name;
      initSceneParticles();
    }
  }

  /* ---------------- audio (soft chime) ---------------- */
  function unlockAudio() {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch { /* audio unsupported — fine */ }
  }

  function chime(kind) {
    if (!settings.sound || !audioCtx) return;
    try {
      const t = audioCtx.currentTime + 0.05;
      // rising arpeggio when focus begins, falling when rest begins
      const notes = kind === 'focus' ? [523.25, 659.25, 783.99] : [659.25, 523.25, 392.00];
      notes.forEach((freq, i) => {
        const osc  = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        const start = t + i * 0.22;
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.14, start + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 1.8);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(start);
        osc.stop(start + 1.9);
      });
    } catch { /* ignore */ }
  }

  /* ---------------- wake lock ---------------- */
  async function requestWakeLock() {
    try {
      if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
    } catch { /* not critical */ }
  }

  function releaseWakeLock() {
    try { if (wakeLock) wakeLock.release(); } catch { /* ignore */ }
    wakeLock = null;
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && running && !paused) requestWakeLock();
  });

  /* ---------------- ui helpers ---------------- */
  function fmt(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m + ':' + String(s).padStart(2, '0');
  }

  function updateUI() {
    timeEl.textContent = fmt(timeLeft);
    const progress = totalTime > 0 ? timeLeft / totalTime : 0;
    ringFg.style.strokeDashoffset = String(RING_C * (1 - progress));
    document.title = fmt(timeLeft) + ' · ' + PHASE_META[phase].label + ' — pomoted';
  }

  function renderMeta() {
    const n = settings.sessions;
    const done = completed % n;
    // the long break still belongs to the round it just completed
    const round = Math.floor((completed - (phase !== 'focus' ? 1 : 0)) / n) + 1;
    const sessionNum = phase === 'focus' ? done + 1 : (done === 0 ? n : done);
    phaseSub.textContent = 'round ' + round + ' · session ' + sessionNum + ' of ' + n;

    let filled = done;
    if (phase === 'long' && done === 0) filled = n;
    const currentIdx = phase === 'focus' ? done : -1;

    dotsEl.innerHTML = '';
    for (let i = 0; i < n; i++) {
      const d = document.createElement('span');
      d.className = 'dot' + (i < filled ? ' filled' : '') + (i === currentIdx ? ' current' : '');
      dotsEl.appendChild(d);
    }
  }

  function showToast(text) {
    toastEl.textContent = text;
    toastEl.classList.remove('hidden', 'show');
    void toastEl.offsetWidth;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.classList.remove('show');
      toastEl.classList.add('hidden');
    }, 2700);
  }

  function swapPhaseLabel() {
    phaseLabel.textContent = PHASE_META[phase].label;
    phaseLabel.classList.remove('swap');
    void phaseLabel.offsetWidth;
    phaseLabel.classList.add('swap');
  }

  function setPauseIcon() {
    pauseBtn.querySelector('.icon-pause').classList.toggle('hidden', paused);
    pauseBtn.querySelector('.icon-play').classList.toggle('hidden', !paused);
    pauseBtn.setAttribute('aria-label', paused ? 'Resume' : 'Pause');
  }

  /* ---------------- phase engine ---------------- */
  function phaseSeconds() {
    if (phase === 'focus') return settings.focus * 60;
    if (phase === 'short') return settings.short * 60;
    return settings.long * 60;
  }

  function startPhase() {
    totalTime = phaseSeconds();
    timeLeft  = totalTime;
    endAt     = Date.now() + timeLeft * 1000;
    document.body.dataset.phase = phase;
    swapPhaseLabel();
    renderMeta();
    updateUI();
    showToast(PHASE_META[phase].toast);
    chime(phase === 'focus' ? 'focus' : 'rest');
    resetIdleTimer();
  }

  function advance() {
    if (phase === 'focus') {
      completed++;
      phase = (completed % settings.sessions === 0) ? 'long' : 'short';
    } else {
      phase = 'focus';
    }
    startPhase();
  }

  // timestamp-based tick: stays accurate even in throttled background tabs
  setInterval(() => {
    if (!running || paused) return;
    timeLeft = Math.max(0, Math.round((endAt - Date.now()) / 1000));
    updateUI();
    if (timeLeft <= 0) advance();
  }, 250);

  /* ---------------- living scene canvas engine ---------------- */
  const canvas   = $('#sceneCanvas');
  const ctx      = canvas ? canvas.getContext('2d') : null;
  const reduced  = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let W = 0, H = 0;
  let particles = [];
  let sceneName = settings.scene;
  let lastT = 0;
  let rafId = null;
  let shooter = null;      // midnight shooting star
  let nextShot = 3;
  const sprites = {};

  function makeGlowSprite(r, g, b) {
    const s = document.createElement('canvas');
    s.width = s.height = 64;
    const c = s.getContext('2d');
    const grad = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0,    'rgba(' + r + ',' + g + ',' + b + ',1)');
    grad.addColorStop(0.35, 'rgba(' + r + ',' + g + ',' + b + ',0.5)');
    grad.addColorStop(1,    'rgba(' + r + ',' + g + ',' + b + ',0)');
    c.fillStyle = grad;
    c.fillRect(0, 0, 64, 64);
    return s;
  }

  function makeCloudSprite(r, g, b) {
    const s = document.createElement('canvas');
    s.width = 300; s.height = 140;
    const c = s.getContext('2d');
    const blobs = [[80, 90, 60], [140, 70, 72], [205, 88, 60], [115, 100, 55], [175, 105, 50], [240, 100, 40]];
    blobs.forEach((b3) => {
      const x = b3[0], y = b3[1], rad = b3[2];
      const grad = c.createRadialGradient(x, y, 0, x, y, rad);
      grad.addColorStop(0, 'rgba(' + r + ',' + g + ',' + b + ',0.55)');
      grad.addColorStop(1, 'rgba(' + r + ',' + g + ',' + b + ',0)');
      c.fillStyle = grad;
      c.beginPath();
      c.arc(x, y, rad, 0, Math.PI * 2);
      c.fill();
    });
    return s;
  }

  function buildSprites() {
    sprites.amber      = makeGlowSprite(244, 178, 107);
    sprites.cream      = makeGlowSprite(255, 226, 180);
    sprites.teal       = makeGlowSprite(140, 215, 220);
    sprites.firefly    = makeGlowSprite(200, 250, 160);
    sprites.cloudPink  = makeCloudSprite(255, 168, 185);
    sprites.cloudPeach = makeCloudSprite(255, 192, 150);
  }

  /* ----- per-scene particle systems ----- */
  const sceneDefs = {
    rain: {
      init() {
        particles = [];
        const n = Math.min(150, Math.max(60, Math.floor(W / 9)));
        for (let i = 0; i < n; i++) particles.push(this.make(true));
      },
      make(anyY) {
        return {
          x: Math.random() * (W + 60), y: anyY ? Math.random() * H : -20 - Math.random() * 50,
          len: 9 + Math.random() * 15, v: 420 + Math.random() * 300,
          drift: -40 - Math.random() * 35, o: 0.08 + Math.random() * 0.2,
        };
      },
      update(p, dt) {
        p.y += p.v * dt;
        p.x += p.drift * dt;
        if (p.y > H + 10) Object.assign(p, this.make(false));
      },
      draw(p) {
        ctx.strokeStyle = 'rgba(188, 216, 236,' + p.o.toFixed(3) + ')';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + p.drift * 0.02, p.y + p.len);
        ctx.stroke();
      },
    },

    cafe: {
      init() {
        particles = [];
        for (let i = 0; i < 20; i++) {
          particles.push({
            x: Math.random() * W, y: Math.random() * H,
            r: 34 + Math.random() * 72, v: 6 + Math.random() * 13,
            sway: 10 + Math.random() * 18, phase: Math.random() * Math.PI * 2,
            o: 0.05 + Math.random() * 0.09, warm: Math.random() < 0.7,
          });
        }
      },
      update(p, dt) {
        p.y -= p.v * dt;
        p.phase += dt * 0.35;
        p.x += Math.sin(p.phase) * p.sway * dt;
        if (p.y < -p.r * 2) { p.y = H + p.r * 2; p.x = Math.random() * W; }
      },
      draw(p) {
        ctx.globalAlpha = p.o;
        ctx.drawImage(p.warm ? sprites.amber : sprites.cream, p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
        ctx.globalAlpha = 1;
      },
    },

    sunset: {
      init() {
        particles = [];
        for (let i = 0; i < 8; i++) {
          particles.push({
            x: Math.random() * W, y: Math.random() * H * 0.6,
            w: 240 + Math.random() * 420, v: 5 + Math.random() * 9,
            o: 0.14 + Math.random() * 0.18, pink: Math.random() < 0.5,
          });
        }
      },
      update(p, dt) {
        p.x += p.v * dt;
        if (p.x - p.w > W + 40) { p.x = -p.w; p.y = Math.random() * H * 0.6; }
      },
      draw(p) {
        ctx.globalAlpha = p.o;
        ctx.drawImage(p.pink ? sprites.cloudPink : sprites.cloudPeach, p.x - p.w / 2, p.y - p.w / 4, p.w, p.w / 2);
        ctx.globalAlpha = 1;
      },
    },

    ocean: {
      init() {
        particles = [];
        for (let i = 0; i < 26; i++) {
          particles.push({
            x: Math.random() * W, y: Math.random() * H,
            r: 6 + Math.random() * 24, v: 12 + Math.random() * 22,
            sway: 8 + Math.random() * 14, phase: Math.random() * Math.PI * 2,
            o: 0.05 + Math.random() * 0.11,
          });
        }
      },
      update(p, dt) {
        p.y -= p.v * dt;
        p.phase += dt * 0.6;
        p.x += Math.sin(p.phase) * p.sway * dt;
        if (p.y < -p.r * 2) { p.y = H + p.r * 2; p.x = Math.random() * W; }
      },
      draw(p) {
        ctx.globalAlpha = p.o;
        ctx.drawImage(sprites.teal, p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
        ctx.globalAlpha = 1;
      },
    },

    midnight: {
      init() {
        particles = [];
        for (let i = 0; i < 110; i++) {
          particles.push({
            x: Math.random() * W, y: Math.random() * H,
            r: 0.6 + Math.random() * 1.6, tw: 0.5 + Math.random() * 2,
            phase: Math.random() * Math.PI * 2, o: 0.3 + Math.random() * 0.7,
          });
        }
        shooter = null;
        nextShot = 2 + Math.random() * 3;
      },
      update(p, dt) { p.phase += dt * p.tw; },
      draw(p) {
        const a = p.o * (0.5 + 0.5 * Math.sin(p.phase));
        ctx.fillStyle = 'rgba(235, 240, 255,' + a.toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      },
      extra(dt) {
        // occasional shooting star
        nextShot -= dt;
        if (!shooter && nextShot <= 0) {
          shooter = {
            x: Math.random() * W * 0.6, y: Math.random() * H * 0.3,
            vx: 520 + Math.random() * 320, vy: 150 + Math.random() * 120, life: 0.9,
          };
        }
        if (shooter) {
          const s = shooter;
          s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
          const a = Math.max(0, Math.min(1, s.life));
          const grad = ctx.createLinearGradient(s.x, s.y, s.x - s.vx * 0.12, s.y - s.vy * 0.12);
          grad.addColorStop(0, 'rgba(255,255,255,' + a.toFixed(3) + ')');
          grad.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.strokeStyle = grad;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(s.x, s.y);
          ctx.lineTo(s.x - s.vx * 0.12, s.y - s.vy * 0.12);
          ctx.stroke();
          if (s.life <= 0 || s.x > W + 100) { shooter = null; nextShot = 4 + Math.random() * 6; }
        }
      },
    },

    forest: {
      init() {
        particles = [];
        for (let i = 0; i < 24; i++) {
          particles.push({
            x: Math.random() * W, y: Math.random() * H,
            r: 9 + Math.random() * 11,
            ax: 20 + Math.random() * 40, ay: 15 + Math.random() * 30,
            fx: 0.2 + Math.random() * 0.4, fy: 0.15 + Math.random() * 0.3,
            px: Math.random() * Math.PI * 2, py: Math.random() * Math.PI * 2,
            pulse: 0.6 + Math.random() * 1.4, o: 0.25 + Math.random() * 0.45,
            bx: 0, by: 0, glow: 0.5,
          });
        }
      },
      update(p, dt) {
        p.px += dt * p.fx;
        p.py += dt * p.fy;
        p.bx = p.x + Math.sin(p.px) * p.ax;
        p.by = p.y + Math.cos(p.py) * p.ay;
        p.glow = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(p.px * p.pulse * 2));
      },
      draw(p) {
        ctx.globalAlpha = p.o * p.glow;
        ctx.drawImage(sprites.firefly, p.bx - p.r, p.by - p.r, p.r * 2, p.r * 2);
        ctx.globalAlpha = 1;
      },
    },
  };

  /* ---------------- 8-bit pixel diorama engine ---------------- */
  // Scenes draw into a tiny buffer (pixBuf), then blit upscaled with
  // smoothing off so every pixel stays chunky. Image scenes use the
  // pixelated artwork in bg/ and add animated pixel overlays on top.
  let pixW = 160, pixH = 107;
  let pixScene = null;
  const pixBuf = document.createElement('canvas');
  pixBuf.width = pixW;
  pixBuf.height = pixH;
  const pctx = pixBuf.getContext ? pixBuf.getContext('2d') : null;
  if (pctx) pctx.imageSmoothingEnabled = false;

  // preload pixel artwork
  const pixImages = {};
  if (typeof Image !== 'undefined') {
    ['study', 'cafe', 'loft'].forEach((k) => {
      const img = new Image();
      img.src = 'bg/pix-' + k + '.png';
      pixImages[k] = img;
    });
  }

  function sizePixCanvas() { /* fixed 160x107 buffer; cover-cropped at blit time */ }

  function drawPixFrame(t) {
    if (!pixScene || !pctx) return;
    pctx.clearRect(0, 0, pixW, pixH);

    if (pixScene.imgKey) {
      // base artwork, cover-fit into the buffer (chunky: no smoothing)
      const img = pixImages[pixScene.imgKey];
      if (img && img.complete && img.naturalWidth) {
        const s = Math.max(pixW / img.width, pixH / img.height);
        const dw = img.width * s, dh = img.height * s;
        pctx.drawImage(img, (pixW - dw) / 2, (pixH - dh) / 2, dw, dh);
      } else {
        pctx.fillStyle = '#181410';
        pctx.fillRect(0, 0, pixW, pixH);
      }
      pixScene.overlay(pctx, pixW, pixH, t);
    } else {
      pixScene.draw(pctx, pixW, pixH, t); // fully procedural scene
    }

    // blit to screen: cover-fit + a slow ambient "breathing" zoom
    const breathe = 1 + 0.018 * Math.sin(t * 0.45);
    const s = Math.max(W / pixW, H / pixH) * breathe;
    const dw = pixW * s, dh = pixH * s;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(pixBuf, 0, 0, pixW, pixH, (W - dw) / 2, (H - dh) / 2, dw, dh);
    ctx.restore();
  }

  // tiny rect helper
  function R(c, x, y, w, h, col) {
    c.fillStyle = col;
    c.fillRect(x | 0, y | 0, Math.max(1, w | 0), Math.max(1, h | 0));
  }

  function circleRows(c, cx, cy, r, col) {
    c.fillStyle = col;
    for (let y = -r; y <= r; y++) {
      const w = Math.floor(Math.sqrt(r * r - y * y));
      c.fillRect((cx - w) | 0, (cy + y) | 0, w * 2, 1);
    }
  }

  const PIXEL_SCENES = {
    /* sunset study room (from user's photo) + birds, dust motes, lamp flicker */
    pixstudy: {
      imgKey: 'study',
      build() {},
      overlay(c, w, h, t) {
        // window zone: right-center of the artwork (roughly x 56–96%, y 20–70%)
        const wx = w * 0.56, wy = h * 0.2, ww = w * 0.4, wh = h * 0.5;
        // birds drifting past the window
        for (let i = 0; i < 3; i++) {
          const speed = 3.5 + i * 1.2;
          const span = ww + 30;
          const bx = wx + ((t * speed + i * 47) % span) - 15;
          const by = wy + wh * (0.2 + i * 0.22) + Math.sin(t * 2 + i) * 2;
          const flap = Math.sin(t * 9 + i * 2) > 0 ? 0 : 1;
          c.globalAlpha = 0.75;
          R(c, bx, by + flap, 2, 1, '#3a2418');
          R(c, bx - 1, by + (flap ? 0 : 1), 1, 1, '#3a2418');
          R(c, bx + 2, by + (flap ? 0 : 1), 1, 1, '#3a2418');
        }
        c.globalAlpha = 1;
        // dust motes floating in the sunlight beam
        for (let i = 0; i < 10; i++) {
          const ph = i * 1.7;
          const dx = wx + ((i * 13.7 + t * 2.2) % ww);
          const dy = wy + wh * 0.4 + ((i * 7.3 + t * 1.1) % (wh * 0.6));
          c.globalAlpha = 0.2 + 0.18 * Math.sin(t * 1.5 + ph);
          R(c, dx, dy, 1, 1, '#ffe8c0');
        }
        c.globalAlpha = 1;
        // soft sun shimmer at the window center
        const pulse = 0.5 + 0.5 * Math.sin(t * 0.8);
        circleRows(c, w * 0.72, h * 0.44, 10, 'rgba(255,220,150,' + (0.05 + 0.05 * pulse).toFixed(3) + ')');
      },
    },

    /* evening café (from user's photo) + steam, twinkling string lights, rain */
    pixcafe: {
      imgKey: 'cafe',
      build() {
        this.drops = [];
        for (let i = 0; i < 26; i++) {
          this.drops.push({ x: Math.random(), y: Math.random(), v: 0.55 + Math.random() * 0.45 });
        }
      },
      overlay(c, w, h, t) {
        // windows occupy left ~45% of the artwork
        const winR = w * 0.45;
        // rain streaks on the windows
        this.drops.forEach((d) => {
          d.y += d.v * 0.016 * 1.6;
          if (d.y > 1) { d.y = 0; d.x = Math.random(); }
          c.globalAlpha = 0.5;
          R(c, d.x * winR, d.y * h * 0.85, 1, 2, '#9fc0e8');
        });
        c.globalAlpha = 1;
        // steam wisps above the two front tables (bottom-left area)
        for (let i = 0; i < 2; i++) {
          const baseX = w * (0.16 + i * 0.22), baseY = h * 0.82;
          for (let j = 0; j < 2; j++) {
            const ph = (t * 0.4 + j * 0.5 + i * 0.25) % 1;
            c.globalAlpha = 0.35 * (1 - ph);
            R(c, baseX + Math.sin(ph * 6 + i) * 2, baseY - ph * 10, 1, 2, '#fff0dd');
          }
        }
        c.globalAlpha = 1;
        // string lights twinkle (top edge)
        for (let i = 0; i < 6; i++) {
          const lx = w * (0.5 + i * 0.08), ly = h * 0.1 + Math.sin(i * 1.3) * 3;
          const tw = 0.5 + 0.5 * Math.sin(t * 2.6 + i * 1.9);
          circleRows(c, lx, ly, 1, 'rgba(255,210,140,' + (0.35 + 0.5 * tw).toFixed(3) + ')');
        }
        // hanging lamp glow breathing (left pendant)
        const flick = 0.85 + 0.15 * Math.sin(t * 6.7) * Math.sin(t * 2.9);
        circleRows(c, w * 0.12, h * 0.22, 7, 'rgba(255,200,130,' + (0.10 * flick).toFixed(3) + ')');
      },
    },

    /* rainy loft at sunset (from user's photo) + rain, city lights twinkle */
    pixloft: {
      imgKey: 'loft',
      build() {
        this.drops = [];
        for (let i = 0; i < 34; i++) {
          this.drops.push({ x: Math.random(), y: Math.random(), v: 0.5 + Math.random() * 0.5 });
        }
        this.lights = [];
        for (let i = 0; i < 12; i++) {
          this.lights.push({ x: Math.random(), y: 0.35 + Math.random() * 0.3, ph: Math.random() * 6.3 });
        }
      },
      overlay(c, w, h, t) {
        // big window spans roughly left 70%, top 10–75%
        const wx = 0, wy = h * 0.1, ww = w * 0.7, wh = h * 0.65;
        // rain on the window
        this.drops.forEach((d) => {
          d.y += d.v * 0.016 * 1.7;
          if (d.y > 1) { d.y = 0; d.x = Math.random(); }
          c.globalAlpha = 0.45;
          R(c, wx + d.x * ww, wy + d.y * wh, 1, 3, '#c8b8d8');
        });
        c.globalAlpha = 1;
        // city lights flickering through the glass
        this.lights.forEach((L) => {
          const tw = 0.5 + 0.5 * Math.sin(t * 1.8 + L.ph);
          c.globalAlpha = 0.25 + 0.55 * tw;
          R(c, wx + L.x * ww, wy + L.y * wh, 1, 1, '#ffe0a0');
        });
        c.globalAlpha = 1;
        // slow sun-shimmer on the horizon
        const pulse = 0.5 + 0.5 * Math.sin(t * 0.7);
        circleRows(c, w * 0.3, h * 0.52, 9, 'rgba(255,190,140,' + (0.04 + 0.05 * pulse).toFixed(3) + ')');
      },
    },

    /* hushed library: shelves, ladder, reading lamp, dust motes */
    library: {
      build(w, h) {
        this.t = 0;
        // pre-randomize book rows so they don't flicker
        this.rows = [];
        const shelfTop = h * 0.12, shelfH = h * 0.16;
        for (let s = 0; s < 4; s++) {
          const books = [];
          let x = 4;
          while (x < w * 0.62 - 6) {
            const bw = 2 + Math.floor(Math.random() * 3);
            const bh = shelfH * 0.55 + Math.random() * shelfH * 0.3;
            const cols = ['#7a4a3a', '#a8763e', '#5c7a4a', '#4a5e7a', '#8a4a56', '#c2a86a', '#6a4a7a'];
            books.push({ x, w: bw, h: bh, col: cols[Math.floor(Math.random() * cols.length)] });
            x += bw + 1;
          }
          this.rows.push({ y: shelfTop + s * (shelfH + 4), books });
        }
        this.motes = [];
        for (let i = 0; i < 14; i++) {
          this.motes.push({ x: Math.random() * w, y: Math.random() * h, ph: Math.random() * 6.3 });
        }
      },
      draw(c, w, h, t) {
        R(c, 0, 0, w, h, '#101d16');
        R(c, 0, 0, w, h * 0.7, '#18281e');
        R(c, 0, h * 0.7, w, h * 0.3, '#0e1a12');
        // bookshelf frame
        R(c, 2, h * 0.1, w * 0.62 + 4, h * 0.72, '#241408');
        R(c, 4, h * 0.12, w * 0.62, h * 0.68, '#160e06');
        this.rows.forEach((row) => {
          row.books.forEach((b) => R(c, b.x, row.y + (h * 0.12 - b.h) * 0.4, b.w, b.h, b.col));
          R(c, 4, row.y + h * 0.1, w * 0.62, 2, '#241408'); // shelf board
        });
        // window right side, moonlight
        const wx = w * 0.74, wy = h * 0.14, ww = w * 0.2, wh = h * 0.4;
        R(c, wx - 2, wy - 2, ww + 4, wh + 4, '#0c1208');
        R(c, wx, wy, ww, wh, '#24304a');
        circleRows(c, wx + ww * 0.68, wy + wh * 0.28, 5, '#e8ecf7');
        R(c, wx + ww / 2 - 1, wy, 2, wh, '#0c1208');
        // reading lamp glow (breathing)
        const breathe = 0.5 + 0.5 * Math.sin(t * 0.9);
        circleRows(c, w * 0.82, h * 0.78, 12, 'rgba(232,195,122,' + (0.10 + 0.08 * breathe).toFixed(3) + ')');
        circleRows(c, w * 0.82, h * 0.78, 6,  'rgba(245,223,168,' + (0.22 + 0.12 * breathe).toFixed(3) + ')');
        R(c, w * 0.82 - 2, h * 0.74, 5, 4, '#f5dfa8');
        R(c, w * 0.82 - 1, h * 0.78, 3, h * 0.06, '#241408'); // stand
        // dust motes drifting in the light
        this.motes.forEach((m) => {
          const yy = (m.y + t * 2) % h;
          const xx = m.x + Math.sin(t * 0.5 + m.ph) * 6;
          c.globalAlpha = 0.25 + 0.2 * Math.sin(t + m.ph);
          R(c, xx, yy, 1, 1, '#f5e6c0');
        });
        c.globalAlpha = 1;
      },
    },
  };

  function initSceneParticles() {
    const name = settings.scene;
    if (!ctx) return;

    // pixel diorama scenes render via the pixel engine
    if (PIXEL_SCENES[name]) {
      particles = [];
      pixScene = PIXEL_SCENES[name];
      sceneName = name;
      canvas.classList.add('pixelated');
      sizePixCanvas();
      pixScene.build(pixW, pixH);
      if (reduced) drawPixFrame(0); // draw one static frame
      return;
    }
    canvas.classList.remove('pixelated');
    pixScene = null;

    if (!sceneDefs[name]) return;
    sceneName = name;
    sceneDefs[sceneName].init();
    if (reduced && ctx) { // draw one static frame for reduced motion
      ctx.clearRect(0, 0, W, H);
      for (let i = 0; i < particles.length; i++) sceneDefs[sceneName].draw(particles[i]);
    }
  }

  function resizeCanvas() {
    if (!canvas || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width  = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    sizePixCanvas();
    initSceneParticles();
  }

  function frame(t) {
    rafId = requestAnimationFrame(frame);
    if (document.hidden) { lastT = t; return; }
    const dt = Math.min(0.05, (t - lastT) / 1000 || 0.016);
    lastT = t;

    // pixel diorama scenes take over the canvas
    if (pixScene) {
      drawPixFrame(t / 1000);
      return;
    }

    const def = sceneDefs[sceneName];
    if (!def) return;
    ctx.clearRect(0, 0, W, H);
    if (def.extra) def.extra(dt);
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      def.update(p, dt);
      def.draw(p);
    }
  }

  window.addEventListener('resize', resizeCanvas);

  /* ---------------- session controls ---------------- */
  function togglePause() {
    if (!running) return;
    paused = !paused;
    if (paused) {
      releaseWakeLock();
    } else {
      endAt = Date.now() + timeLeft * 1000;
      requestWakeLock();
    }
    setPauseIcon();
    sessionEl.classList.toggle('paused', paused);
  }

  pauseBtn.addEventListener('click', togglePause);

  skipBtn.addEventListener('click', () => {
    if (!running) return;
    advance();
  });

  function endSession() {
    running = false;
    paused  = false;
    releaseWakeLock();
    sessionEl.classList.remove('paused', 'idle');
    hideScreen(sessionEl);
    showScreen(setupEl);
    document.body.dataset.phase = 'focus';
    document.title = 'pomoted · lofi pomodoro timer';
    initSetup();
  }

  endBtn.addEventListener('click', endSession);

  // controls fade out when idle, reappear on any touch/movement
  function resetIdleTimer() {
    sessionEl.classList.remove('idle');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => sessionEl.classList.add('idle'), 3500);
  }

  ['pointermove', 'pointerdown', 'touchstart'].forEach((evt) => {
    sessionEl.addEventListener(evt, resetIdleTimer, { passive: true });
  });

  // spacebar toggles pause
  window.addEventListener('keydown', (e) => {
    if (!running) return;
    if (e.code === 'Space') {
      e.preventDefault();
      togglePause();
    }
  });

  // warn before accidentally closing mid-session
  window.addEventListener('beforeunload', (e) => {
    if (running) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  /* ---------------- start ---------------- */
  startBtn.addEventListener('click', () => {
    settings.focus    = parseInt(sliders.focus.value, 10)    || DEFAULTS.focus;
    settings.short    = parseInt(sliders.short.value, 10)    || DEFAULTS.short;
    settings.long     = parseInt(sliders.long.value, 10)     || DEFAULTS.long;
    settings.sessions = parseInt(sliders.sessions.value, 10) || DEFAULTS.sessions;
    settings.sound    = soundInput.checked;
    saveSettings();
    unlockAudio();

    phase     = 'focus';
    completed = 0;
    running   = true;
    paused    = false;
    setPauseIcon();

    hideScreen(setupEl);
    showScreen(sessionEl);
    sessionEl.classList.remove('idle');

    startPhase();
    requestWakeLock();
  });

  /* ---------------- boot ---------------- */
  if (canvas && ctx) {
    buildSprites();
    resizeCanvas();
    if (!reduced) rafId = requestAnimationFrame(frame);
  }
  initSetup();
  showScreen(setupEl);
})();
