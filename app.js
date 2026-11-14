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

  const DEFAULTS = { focus: 25, short: 5, long: 15, sessions: 4, scene: 'catstudy', sound: true, tab: 'timer' };
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
    { id: 'tajsunset',  kind: 'photo',    name: 'Taj Sunset' },
  ];

  const PHOTO_SCENES = {
    catstudy:   'bg/cat-study.jpg',
    wintercafe: 'bg/winter-cafe.jpg',
    cloudride:  'bg/cloud-ride.gif',
    tajsunset:  'bg/taj-sunset.jpg',
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
    tajsunset: '#3a2440',
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
  // tabs + planner
  const tabTimerBtn   = $('#tabTimer');
  const tabPlannerBtn = $('#tabPlanner');
  const plannerView   = $('#plannerView');
  const calTitle      = $('#calTitle');
  const calDowRow     = $('#calDowRow');
  const calGrid       = $('#calGrid');
  const calPrev       = $('#calPrev');
  const calNext       = $('#calNext');
  const calTodayBtn   = $('#calTodayBtn');
  const planDayLabel  = $('#planDayLabel');
  const planCount     = $('#planCount');
  const planList      = $('#planList');
  const planForm      = $('#planForm');
  const planInput     = $('#planInput');
  const weekRows      = $('#weekRows');
  // mini timer (planner tab)
  const miniTimerBtn  = $('#miniTimerBtn');
  const miniRingFg    = $('#miniRingFg');
  const miniTime      = $('#miniTime');
  const miniPhase     = $('#miniPhase');
  const miniPop       = $('#miniPop');
  const miniPopPhase  = $('#miniPopPhase');
  const miniPopTime   = $('#miniPopTime');
  const miniPopSub    = $('#miniPopSub');
  const miniPause     = $('#miniPause');
  const miniSkip      = $('#miniSkip');
  const miniGo        = $('#miniGo');
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
    updateMiniTimer();
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
    updateMiniTimer(); // keep the planner-tab mini timer live
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
    updateMiniTimer();
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
    applyTabVisibility(); // return to whichever tab the user had open
    document.body.dataset.phase = 'focus';
    document.title = 'pomoted · lofi pomodoro timer';
    initSetup();
    updateMiniTimer();
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

  /* ---------------- weekly to-do list ---------------- */
  const TODO_KEY = 'pomoted-todos';
  const todoBtn    = $('#todoBtn');
  const todoBadge  = $('#todoBadge');
  const todoScrim  = $('#todoScrim');
  const todoPanel  = $('#todoPanel');
  const todoClose  = $('#todoClose');
  const weekStrip  = $('#weekStrip');
  const dayLabel   = $('#todoDayLabel');
  const todoCount  = $('#todoCount');
  const todoList   = $('#todoList');
  const todoForm   = $('#todoForm');
  const todoInput  = $('#todoInput');

  let todos = loadTodos();
  let selectedDate = todayKey();

  function loadTodos() {
    try {
      const raw = JSON.parse(localStorage.getItem(TODO_KEY));
      return raw && typeof raw === 'object' ? raw : {};
    } catch { return {}; }
  }
  function saveTodos() {
    try { localStorage.setItem(TODO_KEY, JSON.stringify(todos)); } catch { /* private mode */ }
  }

  // local date key YYYY-MM-DD (not UTC — avoids off-by-one at night)
  function keyOf(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function todayKey() { return keyOf(new Date()); }

  function weekDates() {
    // week starting Sunday, containing today
    const now = new Date();
    const dow = now.getDay(); // Sun=0 … Sat=6
    const mon = new Date(now);
    mon.setDate(now.getDate() - dow);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(mon);
      d.setDate(mon.getDate() + i);
      return d;
    });
  }

  function tasksFor(key) { return todos[key] || []; }

  /* ---------- categories (highlight-to-target model) ---------- */
  const CATS_KEY = 'pomoted-cats';
  const ACTIVE_CAT_KEY = 'pomoted-active-cat';
  const todoTargetEl = $('#todoTarget');
  const planTargetEl = $('#planTarget');

  let cats = loadCats();
  let activeCat = loadActiveCat();

  function loadCats() {
    try {
      const raw = JSON.parse(localStorage.getItem(CATS_KEY));
      if (Array.isArray(raw) && raw.length) return raw;
    } catch { /* ignore */ }
    return [{ id: 'general', name: 'general', closed: false }];
  }
  function saveCats() {
    try { localStorage.setItem(CATS_KEY, JSON.stringify(cats)); } catch { /* private mode */ }
  }
  function catById(id) { return cats.find((c) => c.id === id) || cats[0]; }
  function catByIdSilent(id) { return cats.some((c) => c.id === id); }

  function loadActiveCat() {
    try {
      const raw = localStorage.getItem(ACTIVE_CAT_KEY);
      if (raw && catByIdSilent(raw)) return raw;
    } catch { /* ignore */ }
    return 'general';
  }
  function saveActiveCat() {
    try { localStorage.setItem(ACTIVE_CAT_KEY, activeCat); } catch { /* private mode */ }
  }

  function setActiveCat(id) {
    if (!catByIdSilent(id)) id = 'general';
    activeCat = id;
    saveActiveCat();
    updateTargetLabels();
  }

  function updateTargetLabels() {
    const name = catById(activeCat).name;
    [todoTargetEl, planTargetEl].forEach((el) => {
      if (!el) return;
      el.innerHTML = 'adding to: <b></b>';
      el.querySelector('b').textContent = name;
    });
  }

  // migrate old tasks without a category into "general"
  (function migrateTasks() {
    let changed = false;
    Object.keys(todos).forEach((k) => {
      todos[k].forEach((t) => {
        if (!t.cat) { t.cat = 'general'; changed = true; }
        else if (!catByIdSilent(t.cat)) { t.cat = 'general'; changed = true; }
      });
    });
    if (changed) saveTodos();
  })();

  function addCategory(name) {
    const clean = name.trim().slice(0, 30);
    if (!clean) return null;
    if (cats.some((c) => c.name.toLowerCase() === clean.toLowerCase())) return null;
    const cat = { id: 'c' + Date.now().toString(36), name: clean, closed: false };
    cats.push(cat);
    saveCats();
    setActiveCat(cat.id); // new category becomes the target right away
    return cat;
  }

  function deleteCategory(id) {
    if (id === 'general') return;
    // re-home its tasks to general
    let changed = false;
    Object.keys(todos).forEach((k) => {
      todos[k].forEach((t) => { if (t.cat === id) { t.cat = 'general'; changed = true; } });
    });
    cats = cats.filter((c) => c.id !== id);
    if (activeCat === id) activeCat = 'general';
    if (changed) saveTodos();
    saveCats();
    saveActiveCat();
    updateTargetLabels();
  }

  function todayPending() {
    return tasksFor(todayKey()).filter((t) => !t.done).length;
  }

  function renderBadge() {
    const n = todayPending();
    todoBadge.textContent = n;
    todoBadge.classList.toggle('hidden', n === 0);
  }

  const DOW_NAMES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

  function renderWeek() {
    if (!weekStrip) return;
    weekStrip.innerHTML = '';
    const today = todayKey();
    weekDates().forEach((d, i) => {
      const k = keyOf(d);
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'day-chip'
        + (k === selectedDate ? ' selected' : '')
        + (k === today ? ' today' : '')
        + (tasksFor(k).length ? ' has-tasks' : '');
      chip.setAttribute('role', 'tab');
      chip.setAttribute('aria-selected', k === selectedDate ? 'true' : 'false');
      chip.innerHTML =
        '<span class="dow">' + DOW_NAMES[i] + '</span>' +
        '<span class="dnum">' + d.getDate() + '</span>' +
        '<span class="dotmark"></span>';
      chip.addEventListener('click', () => {
        selectedDate = k;
        renderWeek();
        renderTasks();
        // keep the planner in sync if it's open
        if (activeTab === 'planner') {
          renderCalendar();
          renderPlanList();
          renderWeekRows();
        }
      });
      weekStrip.appendChild(chip);
    });
  }

  function prettyDay(k) {
    if (k === todayKey()) return 'today';
    const d = new Date(k + 'T12:00:00');
    const t = new Date(); t.setHours(12, 0, 0, 0);
    const tomorrow = new Date(t); tomorrow.setDate(t.getDate() + 1);
    if (k === keyOf(tomorrow)) return 'tomorrow';
    const yesterday = new Date(t); yesterday.setDate(t.getDate() - 1);
    if (k === keyOf(yesterday)) return 'yesterday';
    return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  }

  // shared task-row builder used by both the popout and the planner
  function refreshAllTaskViews() {
    updateTargetLabels();
    renderTasks();
    renderWeek();
    renderBadge();
    if (activeTab === 'planner') {
      renderCalendar();
      renderPlanList();
      renderWeekRows();
    }
  }

  function buildTaskItem(task, dateKey) {
    const li = document.createElement('li');
    li.className = 'todo-item' + (task.done ? ' done' : '');

    const check = document.createElement('button');
    check.type = 'button';
    check.className = 'task-check';
    check.setAttribute('aria-label', 'Toggle done');
    check.innerHTML = '<svg viewBox="0 0 24 24"><path d="M5 13l4 4 10-10" fill="none" stroke="' +
      'currentColor' + '" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    check.addEventListener('click', () => {
      task.done = !task.done;
      saveTodos();
      refreshAllTaskViews();
    });

    const span = document.createElement('span');
    span.className = 'task-text';
    span.textContent = task.text;

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'task-del';
    del.setAttribute('aria-label', 'Delete task');
    del.textContent = '×';
    del.addEventListener('click', () => {
      todos[dateKey] = tasksFor(dateKey).filter((t) => t.id !== task.id);
      if (!todos[dateKey].length) delete todos[dateKey];
      saveTodos();
      refreshAllTaskViews();
    });

    li.appendChild(check);
    li.appendChild(span);
    li.appendChild(del);
    return li;
  }

  // grouped, collapsible category sections shared by popout + planner
  function renderTaskGroups(listEl, dateKey) {
    listEl.innerHTML = '';
    const list = tasksFor(dateKey);

    // keep section order: general first, then user categories in creation order
    cats.forEach((cat) => {
      const inCat = list.filter((t) => (t.cat || 'general') === cat.id);
      if (!inCat.length && cat.id !== 'general') return; // hide empty custom sections
      if (cats.length === 1 && cat.id === 'general') {
        // no custom categories: flat list, no header
        inCat.forEach((task) => listEl.appendChild(buildTaskItem(task, dateKey)));
        return;
      }

      const doneIn = inCat.filter((t) => t.done).length;

      const head = document.createElement('button');
      head.type = 'button';
      head.className = 'cat-head' + (cat.closed ? ' closed' : '');
      head.setAttribute('aria-expanded', cat.closed ? 'false' : 'true');

      // chevron: collapse/expand only
      const chev = document.createElement('span');
      chev.className = 'cat-chevron';
      chev.setAttribute('aria-hidden', 'true');
      chev.innerHTML = '<svg viewBox="0 0 24 24"><path d="M9 6.5 15 12l-6 5.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      chev.addEventListener('click', (e) => {
        e.stopPropagation();
        cat.closed = !cat.closed;
        saveCats();
        refreshAllTaskViews();
      });

      const nameEl = document.createElement('span');
      nameEl.className = 'cat-name';
      nameEl.textContent = cat.name;
      const countEl = document.createElement('span');
      countEl.className = 'cat-count';
      countEl.textContent = doneIn + '/' + inCat.length;
      head.appendChild(chev);
      head.appendChild(nameEl);
      head.appendChild(countEl);

      if (cat.id !== 'general') {
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'cat-del';
        del.setAttribute('aria-label', 'Delete category');
        del.textContent = '×';
        del.addEventListener('click', (e) => {
          e.stopPropagation();
          deleteCategory(cat.id);
          refreshAllTaskViews();
        });
        head.appendChild(del);
      }

      // clicking the header highlights the category as the add-target
      head.addEventListener('click', () => {
        setActiveCat(cat.id);
        if (cat.closed) { cat.closed = false; saveCats(); } // auto-open so you see new tasks
        refreshAllTaskViews();
      });

      const bodyEl = document.createElement('div');
      bodyEl.className = 'cat-body' + (cat.closed ? ' closed' : '');
      if (!cat.closed) {
        inCat.forEach((task) => bodyEl.appendChild(buildTaskItem(task, dateKey)));
        // smooth expand: measure after paint
        requestAnimationFrame(() => { bodyEl.style.maxHeight = bodyEl.scrollHeight + 'px'; });
      }

      const section = document.createElement('div');
      section.className = 'cat-section' + (cat.id === activeCat ? ' targeted' : '');
      section.appendChild(head);
      section.appendChild(bodyEl);
      listEl.appendChild(section);
    });
  }

  function renderTasks() {
    if (!todoList) return;
    const list = tasksFor(selectedDate);
    const doneCount = list.filter((t) => t.done).length;

    dayLabel.textContent = prettyDay(selectedDate);
    todoCount.textContent = list.length
      ? doneCount + ' of ' + list.length + ' done'
      : '';

    renderTaskGroups(todoList, selectedDate);
  }

  todoForm && todoForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = todoInput.value.trim();
    if (!text) return;
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const cat = activeCat;
    todos[selectedDate] = tasksFor(selectedDate).concat({ id, text, done: false, cat });
    saveTodos();
    todoInput.value = '';
    refreshAllTaskViews();
    // keep the new task in view
    todoList.scrollTop = todoList.scrollHeight;
  });

  let todoOpen = false;
  function openTodo() {
    if (!todoPanel) return;
    todoOpen = true;
    todoPanel.classList.remove('hidden');
    todoScrim.classList.remove('hidden');
    requestAnimationFrame(() => requestAnimationFrame(() => {
      todoPanel.classList.add('open');
      todoScrim.classList.add('open');
    }));
    selectedDate = todayKey();
    renderWeek();
    renderTasks();
    renderBadge();
    setTimeout(() => { if (todoInput) todoInput.focus({ preventScroll: true }); }, 480);
  }
  function closeTodo() {
    if (!todoPanel) return;
    todoOpen = false;
    todoPanel.classList.remove('open');
    todoScrim.classList.remove('open');
    setTimeout(() => {
      todoPanel.classList.add('hidden');
      todoScrim.classList.add('hidden');
    }, 460);
  }

  todoBtn && todoBtn.addEventListener('click', () => (todoOpen ? closeTodo() : openTodo()));
  todoClose && todoClose.addEventListener('click', closeTodo);
  todoScrim && todoScrim.addEventListener('click', closeTodo);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && todoOpen) closeTodo();
  });
  renderBadge();

  /* ---------------- tabs + planner + mini timer ---------------- */
  let activeTab = settings.tab === 'planner' ? 'planner' : 'timer';
  const MINI_RING_C = 2 * Math.PI * 15.5;
  if (miniRingFg) miniRingFg.style.strokeDasharray = String(MINI_RING_C);

  function applyTabVisibility() {
    const isPlanner = activeTab === 'planner';
    $$('.timer-view').forEach((el) => el.classList.toggle('hidden', isPlanner));
    if (setupEl) setupEl.classList.toggle('planner-open', isPlanner);
    if (plannerView) plannerView.classList.toggle('hidden', !isPlanner);
    if (todoBtn) todoBtn.classList.toggle('hidden', isPlanner);
    if (miniTimerBtn) miniTimerBtn.classList.toggle('hidden', !isPlanner);
    if (tabTimerBtn) {
      tabTimerBtn.classList.toggle('active', !isPlanner);
      tabTimerBtn.setAttribute('aria-selected', String(!isPlanner));
    }
    if (tabPlannerBtn) {
      tabPlannerBtn.classList.toggle('active', isPlanner);
      tabPlannerBtn.setAttribute('aria-selected', String(isPlanner));
    }
  }

  function switchTab(tab) {
    if (tab === activeTab) return;
    activeTab = tab;
    settings.tab = tab;
    saveSettings();
    applyTabVisibility();
    if (tab === 'planner') {
      // park the session screen; timer keeps running in the background
      sessionEl.classList.add('hidden');
      showScreen(setupEl);
      renderPlanner();
    } else if (running) {
      setupEl.classList.add('hidden');
      sessionEl.classList.remove('hidden');
      showScreen(sessionEl);
      resetIdleTimer();
    } else {
      showScreen(setupEl);
    }
    closeMiniPop();
  }

  tabTimerBtn && tabTimerBtn.addEventListener('click', () => switchTab('timer'));
  tabPlannerBtn && tabPlannerBtn.addEventListener('click', () => switchTab('planner'));

  /* ---------- mini timer (visible while planner tab is open) ---------- */
  let miniPopOpen = false;

  function updateMiniTimer() {
    if (!miniTimerBtn) return;
    const secs = running ? timeLeft : settings.focus * 60;
    miniTime.textContent = fmt(secs);
    miniPhase.textContent = running ? PHASE_META[phase].label : 'ready';
    const progress = totalTime > 0 ? timeLeft / totalTime : 0;
    miniRingFg.style.strokeDashoffset = String(MINI_RING_C * (1 - (running ? progress : 1)));
    miniTimerBtn.classList.toggle('paused', !running || paused);
    if (miniPopOpen) {
      miniPopPhase.textContent = running ? PHASE_META[phase].label : 'no session running';
      miniPopTime.textContent = fmt(secs);
      miniPopSub.textContent = running ? phaseSub.textContent : 'start a session from the timer tab';
    }
  }

  function openMiniPop() {
    if (!miniPop) return;
    miniPopOpen = true;
    miniPop.classList.remove('hidden');
    requestAnimationFrame(() => requestAnimationFrame(() => miniPop.classList.add('open')));
    updateMiniTimer();
  }
  function closeMiniPop() {
    if (!miniPop) return;
    miniPopOpen = false;
    miniPop.classList.remove('open');
    setTimeout(() => miniPop.classList.add('hidden'), 320);
  }

  miniTimerBtn && miniTimerBtn.addEventListener('click', () => (miniPopOpen ? closeMiniPop() : openMiniPop()));
  miniPause && miniPause.addEventListener('click', () => { if (running) togglePause(); });
  miniSkip && miniSkip.addEventListener('click', () => { if (running) advance(); });
  miniGo && miniGo.addEventListener('click', () => switchTab('timer'));
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && miniPopOpen) closeMiniPop(); });

  /* ---------- planner: month calendar + day editor + week rows ---------- */
  let calCursor = new Date(); // any day within the month being viewed

  function renderPlanner() {
    updateTargetLabels();
    renderCalendar();
    renderPlanList();
    renderWeekRows();
  }

  function renderCalendar() {
    if (!calGrid) return;
    const y = calCursor.getFullYear();
    const m = calCursor.getMonth();
    calTitle.textContent = calCursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

    if (calDowRow && !calDowRow.children.length) {
      DOW_NAMES.forEach((n) => {
        const s = document.createElement('span');
        s.textContent = n;
        calDowRow.appendChild(s);
      });
    }

    calGrid.innerHTML = '';
    const firstDow = new Date(y, m, 1).getDay(); // Sunday = 0 (leftmost column)
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const daysInPrev = new Date(y, m, 0).getDate();
    const today = todayKey();

    for (let i = 0; i < 42; i++) {
      const dayNum = i - firstDow + 1;
      let cellDate;
      let other = false;
      if (dayNum < 1) {
        cellDate = new Date(y, m - 1, daysInPrev + dayNum);
        other = true;
      } else if (dayNum > daysInMonth) {
        cellDate = new Date(y, m + 1, dayNum - daysInMonth);
        other = true;
      } else {
        cellDate = new Date(y, m, dayNum);
      }
      const k = keyOf(cellDate);
      const dayTasks = tasksFor(k);
      const pending = dayTasks.filter((t) => !t.done).length;

      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'cal-cell'
        + (other ? ' other' : '')
        + (k === today ? ' today' : '')
        + (k === selectedDate ? ' selected' : '');

      let dotsHtml = '';
      const shown = dayTasks.slice(0, 3);
      for (let j = 0; j < shown.length; j++) {
        dotsHtml += '<i class="' + (pending === 0 ? 'all-done' : '') + '"></i>';
      }
      cell.innerHTML = '<span class="dnum">' + cellDate.getDate() + '</span><span class="dots">' + dotsHtml + '</span>';
      cell.setAttribute('aria-label', k + (dayTasks.length ? ', ' + dayTasks.length + ' tasks' : ''));

      cell.addEventListener('click', () => {
        selectedDate = k;
        if (other) calCursor = new Date(cellDate); // jump months like iCloud
        renderCalendar();
        renderPlanList();
        renderWeekRows();
        renderWeek();
        renderTasks();
      });
      calGrid.appendChild(cell);
    }
  }

  calPrev && calPrev.addEventListener('click', () => {
    calCursor = new Date(calCursor.getFullYear(), calCursor.getMonth() - 1, 1);
    renderCalendar();
  });
  calNext && calNext.addEventListener('click', () => {
    calCursor = new Date(calCursor.getFullYear(), calCursor.getMonth() + 1, 1);
    renderCalendar();
  });
  calTodayBtn && calTodayBtn.addEventListener('click', () => {
    calCursor = new Date();
    selectedDate = todayKey();
    renderCalendar();
    renderPlanList();
    renderWeekRows();
    renderWeek();
    renderTasks();
  });

  function renderPlanList() {
    if (!planList) return;
    const list = tasksFor(selectedDate);
    const doneCount = list.filter((t) => t.done).length;
    planDayLabel.textContent = prettyDay(selectedDate);
    planCount.textContent = list.length ? doneCount + ' of ' + list.length + ' done' : '';

    renderTaskGroups(planList, selectedDate);
  }

  function renderWeekRows() {
    if (!weekRows) return;
    weekRows.innerHTML = '';
    const monday = new Date(new Date(selectedDate + 'T12:00:00').getTime());
    const dow = monday.getDay(); // week starts Sunday
    monday.setDate(monday.getDate() - dow);

    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const k = keyOf(d);
      const list = tasksFor(k);
      const done = list.filter((t) => t.done).length;
      const pct = list.length ? Math.round((done / list.length) * 100) : 0;

      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'week-row' + (k === selectedDate ? ' selected' : '') + (list.length > 0 && done === list.length ? ' complete' : '');
      row.innerHTML =
        '<span class="wr-dow">' + DOW_NAMES[i] + '</span>' +
        '<span class="wr-bar"><span class="wr-fill" style="width:' + pct + '%"></span></span>' +
        '<span class="wr-count">' + done + '/' + list.length + '</span>';
      row.addEventListener('click', () => {
        selectedDate = k;
        renderCalendar();
        renderPlanList();
        renderWeekRows();
        renderWeek();
        renderTasks();
      });
      weekRows.appendChild(row);
    }
  }

  planForm && planForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = planInput.value.trim();
    if (!text) return;
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const cat = activeCat;
    todos[selectedDate] = tasksFor(selectedDate).concat({ id, text, done: false, cat });
    saveTodos();
    planInput.value = '';
    refreshAllTaskViews();
    planList.scrollTop = planList.scrollHeight;
  });

  /* ---------- new-category creators ---------- */
  function wireCatCreator(toggleBtn, wrap, input, createBtn) {
    if (!toggleBtn || !wrap) return;
    toggleBtn.addEventListener('click', () => {
      wrap.classList.toggle('hidden');
      if (!wrap.classList.contains('hidden') && input) input.focus();
    });
    const create = () => {
      if (!input) return;
      const cat = addCategory(input.value);
      if (cat) {
        input.value = '';
        wrap.classList.add('hidden');
        refreshAllTaskViews();
      }
    };
    createBtn && createBtn.addEventListener('click', create);
    input && input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); create(); } });
  }
  wireCatCreator($('#todoCatToggle'), $('#todoCatNew'), $('#todoCatInput'), $('#todoCatAdd'));
  wireCatCreator($('#planCatToggle'), $('#planCatNew'), $('#planCatInput'), $('#planCatAdd'));

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
  applyTabVisibility();
  updateTargetLabels();
  updateMiniTimer();
  if (activeTab === 'planner') renderPlanner();
  showScreen(setupEl);
})();
