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

  const DEFAULTS = { focus: 25, short: 5, long: 15, sessions: 4, scene: 'catstudy', sound: true };
  const STORE_KEY = 'pomoted-settings';
  const OLD_STORE_KEY = 'stillpoint-settings';

  // migrate old theme/photo/scene ids to current scene ids
  const SCENE_MIGRATION = {
    dawn: 'sunset', dusk: 'sunset', mist: 'rain',
    'photo-study': 'catstudy', 'photo-cafe': 'wintercafe', 'photo-loft': 'cloudride',
    library: 'catstudy', cloudsea: 'cloudride', bedroom: 'catstudy', library: 'catstudy',
    pixstudy: 'catstudy', pixcafe: 'wintercafe', pixloft: 'cloudride',
  };

  // carousel order + kind of each scene
  const SCENE_ORDER = [
    { id: 'catstudy',   kind: 'photo',    name: 'Cat Study' },
    { id: 'wintercafe', kind: 'photo',    name: 'Winter Café' },
    { id: 'cloudride',  kind: 'photo',    name: 'Cloud Ride' },
    { id: 'rain',       kind: 'particle', name: 'Rain' },
    { id: 'sunset',     kind: 'particle', name: 'Sunset' },
    { id: 'midnight',   kind: 'particle', name: 'Stars' },
    { id: 'ocean',      kind: 'particle', name: 'Ocean' },
    { id: 'cafe',       kind: 'particle', name: 'Glow' },
    { id: 'forest',     kind: 'particle', name: 'Fireflies' },
  ];

  const PHOTO_SCENES = {
    catstudy:   'bg/cat-study.jpg',
    wintercafe: 'bg/winter-cafe.gif',
    cloudride:  'bg/cloud-ride.gif',
  };

  const PHASE_META = {
    focus: { label: 'focus',       toast: 'Time to focus' },
    short: { label: 'short break', toast: 'Breathe — short break' },
    long:  { label: 'long break',  toast: 'Rest well — long break' },
  };

  const SCENE_COLORS = {
    catstudy: '#241a2e', wintercafe: '#1e2438', cloudride: '#3a2a5e',
    rain: '#16222e', sunset: '#2a1a4a', midnight: '#05060f',
    ocean: '#0f2027', cafe: '#241609', forest: '#0b3d2e',
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
  const photoStage = $('#photoStage');
  const stageBlur  = $('#stageBlur');
  const stageImg   = $('#stageImg');
  const carouselEl = $('#carousel');
  const prevBtn    = $('#prevScene');
  const nextBtn    = $('#nextScene');
  const scrollTrack = $('#scrollTrack');
  const scrollThumb = $('#scrollThumb');
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

  /* ---------------- 3D showcase carousel ---------------- */
  let carouselIdx = 0;
  const sceneCards = [];

  function buildCarousel() {
    if (!carouselEl) return;
    SCENE_ORDER.forEach((s, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'scene';
      btn.dataset.scene = s.id;
      btn.innerHTML =
        '<span class="preview p-' + s.id + '"></span>' +
        '<span class="name">' + s.name + '</span>';
      btn.addEventListener('click', () => {
        if (i === carouselIdx && s.id === settings.scene) return;
        goToScene(i, true);
        saveSettings();
      });
      carouselEl.appendChild(btn);
      sceneCards.push(btn);
    });
  }

  function layoutCarousel() {
    const n = sceneCards.length;
    if (!n) return;
    for (let i = 0; i < n; i++) {
      const off = i - carouselIdx;                 // signed distance from center
      const abs = Math.abs(off);
      const el = sceneCards[i];
      const clamped = Math.max(-3, Math.min(3, off));
      const x = clamped * 150;                     // horizontal spread
      const z = -Math.min(abs, 3) * 150;           // push side cards back
      const rot = -clamped * 24;                   // yaw toward center
      el.style.transform =
        'translateX(' + x + 'px) translateZ(' + z + 'px) rotateY(' + rot + 'deg)' +
        (abs > 3 ? ' translateZ(-460px)' : '');
      el.style.opacity = abs > 3 ? 0 : 1 - abs * 0.16;
      el.style.zIndex = 20 - Math.min(abs, 9);
      el.style.pointerEvents = abs > 2 ? 'none' : 'auto';
      el.classList.toggle('active', i === carouselIdx);
      el.setAttribute('aria-hidden', abs > 3 ? 'true' : 'false');
    }
    // scrollbar thumb follows
    if (scrollThumb && n > 1) {
      const pct = carouselIdx / (n - 1);
      scrollThumb.style.left = 'calc(' + (pct * 100).toFixed(2) + '% - ' + (pct * 18).toFixed(2) + '%)';
    }
  }

  function goToScene(i, fade) {
    const n = sceneCards.length;
    carouselIdx = Math.max(0, Math.min(n - 1, i));
    layoutCarousel();
    const id = SCENE_ORDER[carouselIdx].id;
    if (id !== settings.scene) setScene(id, fade !== false);
  }

  prevBtn && prevBtn.addEventListener('click', () => { goToScene(carouselIdx - 1, true); saveSettings(); });
  nextBtn && nextBtn.addEventListener('click', () => { goToScene(carouselIdx + 1, true); saveSettings(); });

  // keyboard navigation
  window.addEventListener('keydown', (e) => {
    if (running) return;
    if (e.key === 'ArrowLeft')  { goToScene(carouselIdx - 1, true); saveSettings(); }
    if (e.key === 'ArrowRight') { goToScene(carouselIdx + 1, true); saveSettings(); }
  });

  // wheel scrub over the carousel
  let wheelLock = 0;
  carouselEl && carouselEl.addEventListener('wheel', (e) => {
    e.preventDefault();
    const now = Date.now();
    if (now - wheelLock < 180) return;
    wheelLock = now;
    goToScene(carouselIdx + (e.deltaY > 0 ? 1 : -1), true);
    saveSettings();
  }, { passive: false });

  // scrollbar: click + drag
  function scrubTo(clientX) {
    const rect = scrollTrack.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    goToScene(Math.round(pct * (sceneCards.length - 1)), true);
  }
  if (scrollTrack) {
    let dragging = false;
    scrollTrack.addEventListener('pointerdown', (e) => {
      dragging = true;
      scrollThumb.classList.add('dragging');
      scrollTrack.setPointerCapture(e.pointerId);
      scrubTo(e.clientX);
    });
    scrollTrack.addEventListener('pointermove', (e) => { if (dragging) scrubTo(e.clientX); });
    scrollTrack.addEventListener('pointerup', () => {
      dragging = false;
      scrollThumb.classList.remove('dragging');
      saveSettings();
    });
  }

  // swipe/drag on the carousel itself
  if (carouselEl) {
    let startX = null;
    carouselEl.addEventListener('pointerdown', (e) => { startX = e.clientX; });
    carouselEl.addEventListener('pointerup', (e) => {
      if (startX === null) return;
      const dx = e.clientX - startX;
      startX = null;
      if (Math.abs(dx) > 34) {
        goToScene(carouselIdx + (dx < 0 ? 1 : -1), true);
        saveSettings();
      }
    });
  }

  /* ---------------- scene picker ---------------- */
  function setScene(name, fade) {
    settings.scene = name;
    if (metaTheme) metaTheme.setAttribute('content', SCENE_COLORS[name] || '#241a2e');
    // keep carousel centered on the active scene
    const idx = SCENE_ORDER.findIndex((s) => s.id === name);
    if (idx >= 0 && idx !== carouselIdx) { carouselIdx = idx; layoutCarousel(); }
    sceneCards.forEach((b, i) => b.classList.toggle('active', i === carouselIdx));

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


  function initSceneParticles() {
    const name = settings.scene;

    // photo scenes: show the artwork stage, pause canvas work (no canvas needed)
    if (PHOTO_SCENES[name]) {
      particles = [];
      sceneName = name;
      if (ctx) ctx.clearRect(0, 0, W, H);
      if (stageImg && stageBlur) {
        stageImg.src = PHOTO_SCENES[name];
        stageBlur.src = PHOTO_SCENES[name];
      }
      if (photoStage) photoStage.classList.add('visible');
      return;
    }
    if (photoStage) photoStage.classList.remove('visible');
    if (!ctx) return;

    // particle scenes
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
    initSceneParticles();
  }

  function frame(t) {
    rafId = requestAnimationFrame(frame);
    if (document.hidden) { lastT = t; return; }
    const dt = Math.min(0.05, (t - lastT) / 1000 || 0.016);
    lastT = t;

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
  buildCarousel();
  if (canvas && ctx) {
    buildSprites();
    resizeCanvas();
    if (!reduced) rafId = requestAnimationFrame(frame);
  }
  // center carousel on the saved scene, then reveal
  const savedIdx = SCENE_ORDER.findIndex((s) => s.id === settings.scene);
  carouselIdx = savedIdx >= 0 ? savedIdx : 0;
  initSetup();
  layoutCarousel();
  showScreen(setupEl);
})();
