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
    focus: { label: 'Focus',       toast: 'Time to Focus' },
    short: { label: 'Short Break', toast: 'Breathe — Short Break' },
    long:  { label: 'Long Break',  toast: 'Rest Well — Long Break' },
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
    phaseSub.textContent = 'Round ' + round + ' · Session ' + sessionNum + ' of ' + n;

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
    return [{ id: 'general', name: 'General', closed: false }];
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
      el.innerHTML = 'Adding to: <b></b>';
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
    if (k === todayKey()) return 'Today';
    const d = new Date(k + 'T12:00:00');
    const t = new Date(); t.setHours(12, 0, 0, 0);
    const tomorrow = new Date(t); tomorrow.setDate(t.getDate() + 1);
    if (k === keyOf(tomorrow)) return 'Tomorrow';
    const yesterday = new Date(t); yesterday.setDate(t.getDate() - 1);
    if (k === keyOf(yesterday)) return 'Yesterday';
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
      // show every category, even empty ones, so you can target + fill them right away
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
    miniPhase.textContent = running ? PHASE_META[phase].label : 'Ready';
    const progress = totalTime > 0 ? timeLeft / totalTime : 0;
    miniRingFg.style.strokeDashoffset = String(MINI_RING_C * (1 - (running ? progress : 1)));
    miniTimerBtn.classList.toggle('paused', !running || paused);
    if (miniPopOpen) {
      miniPopPhase.textContent = running ? PHASE_META[phase].label : 'No session running';
      miniPopTime.textContent = fmt(secs);
      miniPopSub.textContent = running ? phaseSub.textContent : 'Start a session from the Timer tab';
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

  /* ---------------- spotify player ---------------- */
  const SPOTIFY_KEY = 'pomoted-spotify';
  const CID_KEY = 'pomoted-spotify-cid';
  const TOKEN_KEY = 'pomoted-spotify-tokens';
  const musicBtn    = $('#musicBtn');
  const musicEq     = $('#musicEq');
  const musicPanel  = $('#musicPanel');
  const musicClose  = $('#musicClose');
  const musicFrame  = $('#musicFrame');
  const musicForm   = $('#musicForm');
  const musicInput  = $('#musicInput');
  const musicHint   = $('#musicHint');
  const musicGuest  = $('#musicGuest');
  const nowPlaying  = $('#nowPlaying');
  const npArt       = $('#npArt');
  const npTrack     = $('#npTrack');
  const npArtist    = $('#npArtist');
  const npPlay      = $('#npPlay');
  const npPrev      = $('#npPrev');
  const npNext      = $('#npNext');
  const libraryWrap = $('#libraryWrap');
  const libList     = $('#libList');
  const libTabPlaylists = $('#libTabPlaylists');
  const libTabAlbums    = $('#libTabAlbums');
  const connectBtn  = $('#musicConnect');
  const clientIdRow = $('#clientIdRow');
  const clientIdInput = $('#clientIdInput');
  const clientIdSave  = $('#clientIdSave');

  // default: Spotify's "lofi beats" editorial playlist
  const DEFAULT_SPOTIFY = 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M';

  let spotifyUrl = loadSpotify();
  let musicOpen = false;

  /* ---------- auth (PKCE, no backend needed) ---------- */
  let spTokens = loadTokens();
  let spClientId = loadClientId();
  let npTimer = null;

  function loadClientId() {
    try { return localStorage.getItem(CID_KEY) || ''; } catch { return ''; }
  }
  function saveClientId(id) {
    try { localStorage.setItem(CID_KEY, id); } catch { /* ignore */ }
  }
  function loadTokens() {
    try {
      const t = JSON.parse(localStorage.getItem(TOKEN_KEY));
      // tokens from before the streaming scope was added can't drive the SDK
      if (t && t.v === 2) return t;
      return null;
    } catch { return null; }
  }
  function saveTokens(t) {
    try { localStorage.setItem(TOKEN_KEY, JSON.stringify(t)); } catch { /* ignore */ }
  }
  function isConnected() { return !!(spTokens && spTokens.access_token); }

  function randomString(len) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let out = '';
    const arr = new Uint8Array(len);
    crypto.getRandomValues(arr);
    for (let i = 0; i < len; i++) out += chars[arr[i] % chars.length];
    return out;
  }

  async function sha256b64(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return btoa(String.fromCharCode.apply(null, new Uint8Array(buf)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  async function spotifyLogin() {
    if (!spClientId) {
      if (clientIdRow) clientIdRow.classList.remove('hidden');
      if (musicHint) musicHint.textContent = 'Paste your Spotify Client ID first (free at developer.spotify.com), then Save and Connect.';
      return;
    }
    const verifier = randomString(64);
    const challenge = await sha256b64(verifier);
    try { sessionStorage.setItem('pomoted-spotify-verifier', verifier); } catch { /* ignore */ }
    const redirectUri = location.origin + location.pathname;
    const params = new URLSearchParams({
      client_id: spClientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      code_challenge_method: 'S256',
      code_challenge: challenge,
      scope: 'streaming user-read-email user-read-private user-read-currently-playing user-read-playback-state user-modify-playback-state user-library-read playlist-read-private playlist-read-collaborative',
    });
    location.href = 'https://accounts.spotify.com/authorize?' + params.toString();
  }

  async function handleSpotifyCallback() {
    const params = new URLSearchParams(location.search);
    const code = params.get('code');
    if (!code) return;
    let verifier = null;
    try { verifier = sessionStorage.getItem('pomoted-spotify-verifier'); } catch { /* ignore */ }
    // clean the URL
    try { history.replaceState(null, '', location.origin + location.pathname); } catch { /* ignore */ }
    if (!verifier || !spClientId) return;
    try {
      const res = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: spClientId,
          grant_type: 'authorization_code',
          code: code,
          redirect_uri: location.origin + location.pathname,
          code_verifier: verifier,
        }),
      });
      const data = await res.json();
      if (data.access_token) {
        spTokens = {
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          expires_at: Date.now() + data.expires_in * 1000,
          v: 2, // scope version: includes streaming
        };
        saveTokens(spTokens);
        renderMusicPanel();
      }
    } catch { /* network fail — stay in guest mode */ }
  }

  async function refreshSpotifyToken() {
    if (!spTokens || !spTokens.refresh_token) return false;
    try {
      const res = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: spClientId,
          grant_type: 'refresh_token',
          refresh_token: spTokens.refresh_token,
        }),
      });
      const data = await res.json();
      if (data.access_token) {
        spTokens.access_token = data.access_token;
        if (data.refresh_token) spTokens.refresh_token = data.refresh_token;
        spTokens.expires_at = Date.now() + data.expires_in * 1000;
        saveTokens(spTokens);
        return true;
      }
    } catch { /* ignore */ }
    return false;
  }

  async function spotifyFetch(path, options) {
    if (!spTokens) return null;
    if (Date.now() > spTokens.expires_at - 60000) {
      const ok = await refreshSpotifyToken();
      if (!ok) return null;
    }
    try {
      const res = await fetch('https://api.spotify.com/v1' + path, Object.assign({}, options, {
        headers: { Authorization: 'Bearer ' + spTokens.access_token },
      }));
      if (res.status === 401) { // token died — force one refresh retry
        const ok = await refreshSpotifyToken();
        if (!ok) return null;
        const retry = await fetch('https://api.spotify.com/v1' + path, Object.assign({}, options, {
          headers: { Authorization: 'Bearer ' + spTokens.access_token },
        }));
        if (retry.status === 204) return {};
        return retry.ok ? retry.json() : null;
      }
      if (res.status === 204) return {};
      return res.ok ? res.json() : null;
    } catch { return null; }
  }

  function spotifyLogout() {
    spTokens = null;
    try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
    renderMusicPanel();
  }

  /* ---------- Web Playback SDK (browser becomes a playback device) ---------- */
  let spPlayer = null;
  let spDeviceId = null;
  let sdkReady = false;
  let sdkFailed = false;

  function loadSpotifySdk() {
    if (document.getElementById('spotify-sdk') || !isConnected()) return;
    const s = document.createElement('script');
    s.id = 'spotify-sdk';
    s.src = 'https://sdk.scdn.co/spotify-player.js';
    s.onerror = () => { sdkFailed = true; };
    document.body.appendChild(s);
  }

  // called by the SDK once loaded
  window.onSpotifyWebPlaybackSDKReady = () => {
    if (!isConnected() || spPlayer) return;
    spPlayer = new window.Spotify.Player({
      name: 'pomoted',
      getOAuthToken: async (cb) => {
        if (Date.now() > spTokens.expires_at - 60000) await refreshSpotifyToken();
        cb(spTokens ? spTokens.access_token : '');
      },
      volume: 0.5,
    });

    spPlayer.addListener('ready', ({ device_id }) => {
      sdkReady = true;
      spDeviceId = device_id;
      // make pomoted the active device so API commands target the browser
      spotifyFetch('/me/player', { method: 'PUT', body: JSON.stringify({ device_ids: [device_id], play: false }) });
    });
    spPlayer.addListener('not_ready', () => { sdkReady = false; });
    spPlayer.addListener('account_error', () => {
      // free accounts can't use the SDK — embed previews still work
      sdkFailed = true;
      if (musicHint) {
        musicHint.classList.remove('hidden');
        musicHint.textContent = 'Full in-browser playback needs Spotify Premium — previews still play below.';
      }
    });
    spPlayer.addListener('authentication_error', () => { sdkFailed = true; });
    spPlayer.addListener('player_state_changed', (state) => {
      if (!state) return;
      const track = state.track_window && state.track_window.current_track;
      if (track) {
        npTrack.textContent = track.name || '—';
        npArtist.textContent = (track.artists || []).map((a) => a.name).join(', ') || '—';
        const img = track.album && track.album.images && track.album.images.length
          ? track.album.images[track.album.images.length - 1].url : null;
        if (img && npArt) npArt.src = img;
        markPlayingTrack(track.uri);
      }
      npIsPlaying = !state.paused;
      if (npPlay) {
        const pauseIc = npPlay.querySelector('.ic-pause');
        const playIc = npPlay.querySelector('.ic-play');
        if (pauseIc) pauseIc.classList.toggle('hidden', !npIsPlaying);
        if (playIc) playIc.classList.toggle('hidden', npIsPlaying);
      }
    });
    spPlayer.connect();
  };

  /* ---------- panel rendering ---------- */
  function renderMusicPanel() {
    const connected = isConnected();
    // guest section stays visible when the SDK can't play (free tier) so previews still work
    const showGuest = !connected || sdkFailed;
    if (musicGuest) musicGuest.classList.toggle('hidden', !showGuest);
    if (nowPlaying) nowPlaying.classList.toggle('hidden', !connected);
    if (libraryWrap) libraryWrap.classList.toggle('hidden', !connected);
    if (connected) {
      loadSpotifySdk();
      pollNowPlaying();
      showLibraryRoot();
      // no API polling when the SDK drives the now-playing state
      if (!sdkReady) startNpPolling(); else stopNpPolling();
    } else {
      stopNpPolling();
      loadMusicFrame();
    }
  }

  /* ---------- now playing + controls ---------- */
  let npIsPlaying = false;

  async function pollNowPlaying() {
    const data = await spotifyFetch('/me/player/currently-playing');
    if (!data || !data.item) {
      npTrack.textContent = 'Nothing playing';
      npArtist.textContent = 'pick something from your library below';
      if (npArt) npArt.removeAttribute('src');
      npIsPlaying = false;
    } else {
      const item = data.item;
      npTrack.textContent = item.name || '—';
      npArtist.textContent = (item.artists || []).map((a) => a.name).join(', ') || (item.show && item.show.name) || '—';
      const img = item.album && item.album.images && item.album.images.length
        ? item.album.images[item.album.images.length - 1].url : null;
      if (img && npArt) npArt.src = img;
      npIsPlaying = !!data.is_playing;
    }
    if (npPlay) {
      const pauseIc = npPlay.querySelector('.ic-pause');
      const playIc = npPlay.querySelector('.ic-play');
      if (pauseIc) pauseIc.classList.toggle('hidden', !npIsPlaying);
      if (playIc) playIc.classList.toggle('hidden', npIsPlaying);
    }
  }

  function startNpPolling() {
    stopNpPolling();
    npTimer = setInterval(pollNowPlaying, 5000);
  }
  function stopNpPolling() {
    if (npTimer) clearInterval(npTimer);
    npTimer = null;
  }

  async function npCmd(path, method) {
    const res = await spotifyFetch(path, { method: method || 'POST' });
    setTimeout(pollNowPlaying, 400); // give the API a beat to catch up
    return res;
  }

  // transport: use the SDK player when the browser is the device, else the API
  npPlay && npPlay.addEventListener('click', () => {
    if (sdkReady && spPlayer) { spPlayer.togglePlay(); return; }
    npCmd(npIsPlaying ? '/me/player/pause' : '/me/player/play', 'PUT');
  });
  npPrev && npPrev.addEventListener('click', () => {
    if (sdkReady && spPlayer) { spPlayer.previousTrack(); return; }
    npCmd('/me/player/previous');
  });
  npNext && npNext.addEventListener('click', () => {
    if (sdkReady && spPlayer) { spPlayer.nextTrack(); return; }
    npCmd('/me/player/next');
  });

  /* ---------- library browser + track drill-down ---------- */
  let libMode = 'playlists';
  let libView = 'root'; // 'root' | 'tracks'
  let playingUri = null;
  const libBack  = $('#libBack');
  const libTitle = $('#libTitle');
  const libTabs  = $('#libTabs');

  libBack && libBack.addEventListener('click', () => showLibraryRoot());

  async function loadLibrary() {
    if (!libList) return;
    libList.innerHTML = '<div class="lib-empty">loading…</div>';
    const path = libMode === 'playlists' ? '/me/playlists?limit=50' : '/me/albums?limit=50';
    const data = await spotifyFetch(path);
    if (!data || !data.items) {
      libList.innerHTML = '<div class="lib-empty">couldn’t load your library</div>';
      return;
    }
    renderLibItems(data.items.map((it) => libMode === 'playlists' ? {
      name: it.name,
      sub: it.tracks ? it.tracks.total + ' tracks' : '',
      img: it.images && it.images.length ? it.images[it.images.length - 1].url : null,
      uri: it.uri,
      type: 'playlist',
    } : {
      name: it.album.name,
      sub: (it.album.artists || []).map((a) => a.name).join(', '),
      img: it.album.images && it.album.images.length ? it.album.images[it.album.images.length - 1].url : null,
      uri: it.album.uri,
      type: 'album',
    }));
  }

  function renderLibItems(items) {
    libList.innerHTML = '';
    if (!items.length) {
      libList.innerHTML = '<div class="lib-empty">nothing here yet</div>';
      return;
    }
    items.forEach((item) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'lib-item';
      const img = document.createElement('img');
      if (item.img) img.src = item.img;
      img.alt = '';
      const meta = document.createElement('div');
      meta.style.minWidth = '0';
      meta.style.flex = '1';
      const name = document.createElement('div');
      name.className = 'lib-name';
      name.textContent = item.name;
      const sub = document.createElement('div');
      sub.className = 'lib-sub';
      sub.textContent = item.sub;
      meta.appendChild(name);
      meta.appendChild(sub);
      btn.appendChild(img);
      btn.appendChild(meta);
      btn.addEventListener('click', () => openContent(item.uri, item.type, item.name));
      libList.appendChild(btn);
    });
  }

  /* ---------- view transitions ---------- */
  function animateLib(dir) {
    if (!libList) return;
    libList.classList.remove('slide-in-right', 'slide-in-left');
    void libList.offsetWidth; // restart animation
    libList.classList.add(dir === 'forward' ? 'slide-in-right' : 'slide-in-left');
  }

  /* ---------- drill into a playlist/album: list its tracks ---------- */
  async function openContent(uri, type, name) {
    const id = uri.split(':')[2];
    if (!id) return;
    libView = 'tracks';
    if (libBack) libBack.classList.remove('hidden');
    if (libTitle) { libTitle.classList.remove('hidden'); libTitle.textContent = name; }
    if (libTabs) libTabs.classList.add('hidden');
    libList.innerHTML = '<div class="lib-empty">loading tracks…</div>';
    animateLib('forward');

    let tracks = [];
    if (type === 'playlist') {
      // Spotify returns playlist entries as items[].track on old API shape,
      // items[].item on the new shape — support both, skip episodes/local files
      let url = '/playlists/' + id + '/tracks?limit=100';
      let guard = 0;
      while (url && guard++ < 5) {
        const data = await spotifyFetch(url);
        if (!data) {
          libList.innerHTML = '<div class="lib-empty">couldn’t load tracks — check your connection</div>';
          return;
        }
        (data.items || []).forEach((it) => {
          const t = it.track || it.item; // old + new API shapes
          if (!t || !t.uri || t.type === 'episode') return;
          tracks.push({
            name: t.name,
            sub: (t.artists || []).map((a) => a.name).join(', '),
            dur: fmtDuration(t.duration_ms),
            uri: t.uri,
            contextUri: uri,
          });
        });
        url = data.next ? data.next.replace('https://api.spotify.com/v1', '') : null;
      }
    } else if (type === 'album') {
      let url = '/albums/' + id + '/tracks?limit=50';
      let guard = 0;
      while (url && guard++ < 5) {
        const data = await spotifyFetch(url);
        if (!data) {
          libList.innerHTML = '<div class="lib-empty">couldn’t load tracks — check your connection</div>';
          return;
        }
        (data.items || []).forEach((t) => {
          if (!t || !t.uri) return;
          tracks.push({
            name: t.name,
            sub: (t.artists || []).map((a) => a.name).join(', '),
            dur: fmtDuration(t.duration_ms),
            uri: t.uri,
            contextUri: uri,
          });
        });
        url = data.next ? data.next.replace('https://api.spotify.com/v1', '') : null;
      }
    }

    libList.innerHTML = '';
    if (!tracks.length) {
      libList.innerHTML = '<div class="lib-empty">no playable tracks in this playlist</div>';
      return;
    }
    tracks.forEach((t) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'lib-item' + (t.uri === playingUri ? ' playing' : '');
      row.dataset.uri = t.uri;
      const meta = document.createElement('div');
      meta.style.minWidth = '0';
      meta.style.flex = '1';
      const nm = document.createElement('div');
      nm.className = 'lib-name';
      nm.textContent = t.name;
      const sb = document.createElement('div');
      sb.className = 'lib-sub';
      sb.textContent = t.sub;
      meta.appendChild(nm);
      meta.appendChild(sb);
      const dur = document.createElement('span');
      dur.className = 'lib-dur';
      dur.textContent = t.dur;
      row.appendChild(meta);
      row.appendChild(dur);
      row.addEventListener('click', () => playTrack(t.contextUri, t.uri));
      libList.appendChild(row);
    });
    animateLib('forward'); // replay entrance once tracks are actually in
  }

  function fmtDuration(ms) {
    if (!ms) return '';
    const s = Math.round(ms / 1000);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  function showLibraryRoot() {
    const wasTracks = libView === 'tracks';
    libView = 'root';
    if (libBack) libBack.classList.add('hidden');
    if (libTitle) libTitle.classList.add('hidden');
    if (libTabs) libTabs.classList.remove('hidden');
    loadLibrary().then(() => { if (wasTracks) animateLib('back'); });
  }

  function markPlayingTrack(uri) {
    playingUri = uri;
    if (!libList) return;
    Array.from(libList.children).forEach((row) => {
      row.classList.toggle('playing', row.dataset.uri === uri);
    });
  }

  /* ---------- playback ---------- */
  async function playTrack(contextUri, trackUri) {
    markPlayingTrack(trackUri);
    if (musicEq) musicEq.classList.remove('hidden');

    if (sdkReady && spDeviceId) {
      // full playback right here in the browser
      await spotifyFetch('/me/player/play?device_id=' + spDeviceId, {
        method: 'PUT',
        body: JSON.stringify({ context_uri: contextUri, offset: { uri: trackUri } }),
      });
      return;
    }
    // fallback: play on whatever device is active (Spotify app etc.)
    if (isConnected()) {
      const res = await spotifyFetch('/me/player/play', {
        method: 'PUT',
        body: JSON.stringify({ context_uri: contextUri, offset: { uri: trackUri } }),
      });
      setTimeout(pollNowPlaying, 500);
    }
    // and load the track into the embed so there's always visible/audible feedback
    const trackId = trackUri.split(':')[2];
    if (trackId && musicFrame) {
      musicFrame.src = 'https://open.spotify.com/embed/track/' + trackId + '?utm_source=generator&theme=0';
      if (musicGuest) musicGuest.classList.remove('hidden');
    }
  }

  async function playUri(uri, type) {
    // whole collection: play from the top
    if (sdkReady && spDeviceId) {
      await spotifyFetch('/me/player/play?device_id=' + spDeviceId, {
        method: 'PUT',
        body: JSON.stringify({ context_uri: uri }),
      });
      return;
    }
    if (isConnected()) {
      await spotifyFetch('/me/player/play', {
        method: 'PUT',
        body: JSON.stringify({ context_uri: uri }),
      });
      setTimeout(pollNowPlaying, 500);
    }
    const id = uri.split(':')[2];
    if (id) {
      spotifyUrl = 'https://open.spotify.com/' + type + '/' + id;
      saveSpotify(spotifyUrl);
      loadMusicFrame();
    }
    if (musicEq) musicEq.classList.remove('hidden');
  }

  function setLibMode(mode) {
    libMode = mode;
    if (libTabPlaylists) libTabPlaylists.classList.toggle('active', mode === 'playlists');
    if (libTabAlbums) libTabAlbums.classList.toggle('active', mode === 'albums');
    loadLibrary().then(() => animateLib(mode === 'playlists' ? 'back' : 'forward'));
  }
  libTabPlaylists && libTabPlaylists.addEventListener('click', () => setLibMode('playlists'));
  libTabAlbums && libTabAlbums.addEventListener('click', () => setLibMode('albums'));

  connectBtn && connectBtn.addEventListener('click', spotifyLogin);
  clientIdSave && clientIdSave.addEventListener('click', () => {
    const id = clientIdInput.value.trim();
    if (!id) return;
    spClientId = id;
    saveClientId(id);
    clientIdRow.classList.add('hidden');
    if (musicHint) musicHint.textContent = 'Client ID saved — now hit Connect Spotify.';
  });

  function loadSpotify() {
    try { return localStorage.getItem(SPOTIFY_KEY) || DEFAULT_SPOTIFY; } catch { return DEFAULT_SPOTIFY; }
  }
  function saveSpotify(url) {
    try { localStorage.setItem(SPOTIFY_KEY, url); } catch { /* private mode */ }
  }

  // accept open.spotify.com URLs or spotify: URIs, return embed URL
  function toEmbedUrl(url) {
    if (!url) return null;
    let m = url.match(/open\.spotify\.com\/(track|album|playlist|episode|show)\/([A-Za-z0-9]+)/);
    if (!m) m = url.match(/spotify:(track|album|playlist|episode|show):([A-Za-z0-9]+)/);
    if (!m) return null;
    return 'https://open.spotify.com/embed/' + m[1] + '/' + m[2] + '?utm_source=generator&theme=0';
  }

  function loadMusicFrame() {
    const embed = toEmbedUrl(spotifyUrl);
    if (embed && musicFrame && musicFrame.src !== embed) musicFrame.src = embed;
    if (musicEq) musicEq.classList.toggle('hidden', !embed);
  }

  function openMusic() {
    if (!musicPanel) return;
    musicOpen = true;
    musicPanel.classList.remove('hidden');
    requestAnimationFrame(() => requestAnimationFrame(() => musicPanel.classList.add('open')));
    renderMusicPanel();
    if (musicInput) musicInput.value = spotifyUrl === DEFAULT_SPOTIFY ? '' : spotifyUrl;
    if (clientIdInput && !clientIdInput.value) clientIdInput.value = spClientId || '';
  }
  function closeMusic() {
    if (!musicPanel) return;
    musicOpen = false;
    musicPanel.classList.remove('open');
    setTimeout(() => musicPanel.classList.add('hidden'), 380);
  }

  musicBtn && musicBtn.addEventListener('click', () => (musicOpen ? closeMusic() : openMusic()));
  musicClose && musicClose.addEventListener('click', closeMusic);
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && musicOpen) closeMusic(); });

  musicForm && musicForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const url = musicInput.value.trim();
    const embed = toEmbedUrl(url);
    if (!url) {
      // empty -> restore default playlist
      spotifyUrl = DEFAULT_SPOTIFY;
      saveSpotify(spotifyUrl);
      loadMusicFrame();
      return;
    }
    if (!embed) {
      musicInput.style.borderColor = '#ff9d9d';
      setTimeout(() => { musicInput.style.borderColor = ''; }, 900);
      return;
    }
    spotifyUrl = url;
    saveSpotify(url);
    loadMusicFrame();
  });

  loadMusicFrame(); // badge state on boot
  handleSpotifyCallback(); // pick up ?code= after OAuth redirect
  renderMusicPanel();

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
