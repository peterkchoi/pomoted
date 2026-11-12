/* ============================================================
   Stillpoint — calm pomodoro timer
   Vanilla JS, no dependencies. Settings persist in localStorage.
   ============================================================ */
(() => {
  'use strict';

  /* ---------------- helpers ---------------- */
  const $  = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const DEFAULTS = { focus: 25, short: 5, long: 15, sessions: 4, theme: 'ocean', sound: true };
  const STORE_KEY = 'stillpoint-settings';

  const PHASE_META = {
    focus: { label: 'Focus',       toast: 'Time to focus' },
    short: { label: 'Short break', toast: 'Breathe — short break' },
    long:  { label: 'Long break',  toast: 'Rest well — long break' },
  };

  const THEME_COLORS = {
    ocean: '#12232e', dawn: '#f7c3b4', forest: '#0e3a2c',
    dusk: '#3d1d6e', midnight: '#0b0e1f', mist: '#dde4ea',
  };

  /* ---------------- elements ---------------- */
  const setupEl    = $('#setup');
  const sessionEl  = $('#session');
  const timeEl     = $('#time');
  const ringFg     = $('#ringFg');
  const phaseLabel = $('#phaseLabel');
  const roundLabel = $('#roundLabel');
  const dotsEl     = $('#dots');
  const toastEl    = $('#toast');
  const pauseBtn   = $('#pauseBtn');
  const skipBtn    = $('#skipBtn');
  const endBtn     = $('#endBtn');
  const startBtn   = $('#start');
  const soundInput = $('#sound');
  const metaTheme  = $('#metaTheme');
  const inputs = {
    focus: $('#focus'), short: $('#short'),
    long: $('#long'),   sessions: $('#sessions'),
  };

  const RING_C = 2 * Math.PI * 140; // circle r = 140
  ringFg.style.strokeDasharray = String(RING_C);

  /* ---------------- settings ---------------- */
  let settings = loadSettings();

  function loadSettings() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE_KEY));
      return Object.assign({}, DEFAULTS, raw || {});
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
  let running   = false;     // session screen is active
  let paused    = false;
  let timeLeft  = 0;         // seconds remaining in current phase
  let totalTime = 1;         // seconds in current phase (for the ring)
  let endAt     = 0;         // timestamp the phase ends (accurate when tab is throttled)

  let wakeLock   = null;
  let toastTimer = null;
  let idleTimer  = null;
  let audioCtx   = null;

  /* ---------------- setup screen ---------------- */
  function initSetup() {
    inputs.focus.value    = settings.focus;
    inputs.short.value    = settings.short;
    inputs.long.value     = settings.long;
    inputs.sessions.value = settings.sessions;
    soundInput.checked    = settings.sound;
    applyTheme(settings.theme);
  }

  function applyTheme(theme) {
    settings.theme = theme;
    document.body.dataset.theme = theme;
    if (metaTheme) metaTheme.setAttribute('content', THEME_COLORS[theme] || '#12232e');
    $$('.swatch').forEach((s) => s.classList.toggle('active', s.dataset.theme === theme));
  }

  // +/- steppers
  $$('.stepper button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = inputs[btn.dataset.step];
      if (!input) return;
      const dir = Number(btn.dataset.dir);
      const min = Number(input.min || 1);
      const max = Number(input.max || 999);
      const cur = parseInt(input.value, 10);
      input.value = Math.min(max, Math.max(min, (isNaN(cur) ? min : cur) + dir));
    });
  });

  // theme swatches
  $$('.swatch').forEach((sw) => {
    sw.addEventListener('click', () => {
      applyTheme(sw.dataset.theme);
      saveSettings();
    });
  });

  soundInput.addEventListener('change', () => {
    settings.sound = soundInput.checked;
    saveSettings();
  });

  function clampInt(v, min, max, fallback) {
    const n = parseInt(v, 10);
    if (isNaN(n)) return fallback;
    return Math.min(max, Math.max(min, n));
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

  /* ---------------- wake lock (keep screen on) ---------------- */
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
    document.title = fmt(timeLeft) + ' · ' + PHASE_META[phase].label + ' — Stillpoint';
  }

  function renderMeta() {
    const n = settings.sessions;
    const done = completed % n;
    // the long break still belongs to the round it just completed
    let round = Math.floor(completed / n) + 1;
    if (phase === 'long' && done === 0 && completed > 0) round = completed / n;
    const sessionNum = phase === 'focus' ? done + 1 : (done === 0 ? n : done);
    roundLabel.textContent = 'Round ' + round + ' · Session ' + sessionNum + ' of ' + n;

    let filled = done;
    if (phase === 'long' && done === 0) filled = n; // just finished the full round
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
    void toastEl.offsetWidth; // restart animation
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.classList.remove('show');
      toastEl.classList.add('hidden');
    }, 2600);
  }

  function setPauseIcon() {
    const pauseIcon = pauseBtn.querySelector('.icon-pause');
    const playIcon  = pauseBtn.querySelector('.icon-play');
    pauseIcon.classList.toggle('hidden', paused);
    playIcon.classList.toggle('hidden', !paused);
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
    phaseLabel.textContent = PHASE_META[phase].label;
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

  // single tick loop; timestamp-based so it stays accurate in background tabs
  setInterval(() => {
    if (!running || paused) return;
    timeLeft = Math.max(0, Math.round((endAt - Date.now()) / 1000));
    updateUI();
    if (timeLeft <= 0) advance();
  }, 250);

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
    advance(); // skips straight into the next phase
  });

  function endSession() {
    running = false;
    paused  = false;
    releaseWakeLock();
    sessionEl.classList.add('hidden');
    sessionEl.classList.remove('paused');
    setupEl.classList.remove('hidden');
    document.body.dataset.phase = 'focus';
    document.title = 'Stillpoint · Pomodoro Timer';
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
    settings.focus    = clampInt(inputs.focus.value,    1, 180, DEFAULTS.focus);
    settings.short    = clampInt(inputs.short.value,    1, 60,  DEFAULTS.short);
    settings.long     = clampInt(inputs.long.value,     1, 120, DEFAULTS.long);
    settings.sessions = clampInt(inputs.sessions.value, 1, 12,  DEFAULTS.sessions);
    settings.sound    = soundInput.checked;
    saveSettings();
    unlockAudio();

    phase     = 'focus';
    completed = 0;
    running   = true;
    paused    = false;
    setPauseIcon();

    setupEl.classList.add('hidden');
    sessionEl.classList.remove('hidden');
    sessionEl.classList.remove('idle');

    startPhase();
    requestWakeLock();
  });

  /* ---------------- boot ---------------- */
  initSetup();
})();
