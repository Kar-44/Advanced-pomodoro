/**
 * FocusFlow — Advanced Pomodoro Timer
 * app.js — Timer logic, settings management, phase transitions
 */

'use strict';

// ─── Constants ────────────────────────────────────────────────────────────────

const PHASES = ['study', 'break', 'recall'];

const FIELD_META = {
  study: {
    title: 'Study Phase',
    desc: 'Choose the length of your Study phase. This is your core deep-work block — stay fully focused on one task.',
    rec: 'Recommended: 25–50 min',
    color: 'var(--clr-study)',
  },
  break: {
    title: 'Short Break',
    desc: 'A brief mental rest between Study and Recall. Step away from your desk, hydrate, or breathe — but avoid screens.',
    rec: 'Recommended: 5–10 min',
    color: 'var(--clr-break)',
  },
  recall: {
    title: 'Recall Phase',
    desc: 'Actively retrieve what you just studied — write key ideas from memory. This dramatically boosts retention.',
    rec: 'Recommended: 5–15 min',
    color: 'var(--clr-recall)',
  },
  cycles: {
    title: 'Cycles',
    desc: 'The number of Study → Break → Recall cycles completed before a Long Break is triggered.',
    rec: 'Recommended: 3–5 cycles',
    color: '#ec4899',
  },
  longbreak: {
    title: 'Long Break',
    desc: 'A longer recovery period after completing all cycles. Essential for full mental restoration and memory consolidation.',
    rec: 'Recommended: 20–40 min',
    color: 'var(--clr-longbreak)',
  },
};

const PHASE_LABELS = {
  study:     'Study',
  break:     'Short Break',
  recall:    'Recall',
  longbreak: 'Long Break',
};

const PHASE_COUNTS = {
  study:  '1 / 3',
  break:  '2 / 3',
  recall: '3 / 3',
  longbreak: '—',
};

// ─── DOM References ────────────────────────────────────────────────────────────

const $ = (id) => document.getElementById(id);

const dom = {
  inputs: {
    study:     $('input-study'),
    break:     $('input-break'),
    recall:    $('input-recall'),
    cycles:    $('input-cycles'),
    longbreak: $('input-longbreak'),
  },
  cards: document.querySelectorAll('.setting-card'),
  tooltipText: $('tooltip-text'),
  tooltipArea: $('tooltip-area'),
  progress:    $('timer-progress'),
  timerDisplay: $('timer-display'),
  timerSubtext: $('timer-subtext'),
  phaseBadge:  $('phase-badge'),
  phaseLabel:  $('phase-label'),
  phaseDot:    $('phase-dot'),
  ringWrapper: document.querySelector('.ring-wrapper'),
  ringGlow:    $('ring-glow'),
  btnStart:    $('btn-start'),
  btnStartLabel: document.querySelector('#btn-start #btn-start-label') || $('btn-start').querySelector('span:last-child'),
  btnReset:    $('btn-reset'),
  cyclesDisplay: $('cycles-display'),
  phaseCountDisplay: $('phase-count-display'),
  nextPhaseDisplay: $('next-phase-display'),
};

// ─── State ────────────────────────────────────────────────────────────────────

let state = {
  running:       false,
  phase:         'study',       // current phase key
  cycleIndex:    0,             // position within PHASES array (0,1,2)
  completedCycles: 0,           // full Study→Break→Recall cycles done
  secondsLeft:   0,
  totalSeconds:  0,
  intervalId:    null,
  inLongBreak:   false,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getSettings() {
  return {
    study:     Math.max(1, parseInt(dom.inputs.study.value, 10)     || 25),
    break:     Math.max(1, parseInt(dom.inputs.break.value, 10)     || 5),
    recall:    Math.max(1, parseInt(dom.inputs.recall.value, 10)    || 10),
    cycles:    Math.max(1, parseInt(dom.inputs.cycles.value, 10)    || 4),
    longbreak: Math.max(1, parseInt(dom.inputs.longbreak.value, 10) || 30),
  };
}

function formatTime(secs) {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function phaseDurationSecs(phase) {
  const s = getSettings();
  return (s[phase] || 25) * 60;
}

function nextPhaseKey(current) {
  if (current === 'longbreak') return 'study';
  const idx = PHASES.indexOf(current);
  return PHASES[(idx + 1) % PHASES.length] || 'study';
}

// ─── UI Updates ───────────────────────────────────────────────────────────────

function updateRing(value) {
  // value: 0–100
  dom.progress.setAttribute('value', value);

  // Fallback sync for browsers without attr() support
  if (!CSS.supports('width: attr(value type(<number>))')) {
    dom.progress.style.setProperty('--value', value);
  }
}

function setPhaseColors(phase) {
  document.body.setAttribute('data-phase', phase);
}

function updatePhaseUI(phase) {
  const label = PHASE_LABELS[phase] || phase;
  dom.phaseLabel.textContent = label;
  dom.phaseCountDisplay.textContent = PHASE_COUNTS[phase] || '—';
  setPhaseColors(phase);

  // Next phase hint
  const next = nextPhaseKey(phase);
  dom.nextPhaseDisplay.textContent = PHASE_LABELS[next] || next;
}

function updateCyclesUI() {
  const s = getSettings();
  dom.cyclesDisplay.textContent = `${state.completedCycles} / ${s.cycles}`;
}

function updateTimerDisplay() {
  dom.timerDisplay.textContent = formatTime(state.secondsLeft);
  const progress = state.totalSeconds > 0
    ? (state.secondsLeft / state.totalSeconds) * 100
    : 100;
  updateRing(Math.round(progress));
}

function setRunningUI(running) {
  const btnLabelEl = dom.btnStart.querySelector('span:last-child');
  const btnIconEl  = dom.btnStart.querySelector('.btn-icon');

  if (running) {
    dom.btnStart.classList.add('paused');
    if (btnLabelEl) btnLabelEl.textContent = 'Pause';
    if (btnIconEl)  btnIconEl.textContent  = '⏸';
    dom.timerSubtext.textContent = 'Focusing…';
    if (state.phase === 'break')     dom.timerSubtext.textContent = 'Resting…';
    if (state.phase === 'recall')    dom.timerSubtext.textContent = 'Recalling…';
    if (state.phase === 'longbreak') dom.timerSubtext.textContent = 'Long Rest…';
  } else {
    dom.btnStart.classList.remove('paused');
    if (btnLabelEl) btnLabelEl.textContent = 'Start';
    if (btnIconEl)  btnIconEl.textContent  = '▶';
    dom.timerSubtext.textContent = state.secondsLeft < state.totalSeconds ? 'Paused' : 'Ready';
  }
}

function triggerPhaseChangeAnimation() {
  dom.ringWrapper.classList.remove('phase-change');
  void dom.ringWrapper.offsetWidth; // reflow
  dom.ringWrapper.classList.add('phase-change');
  setTimeout(() => dom.ringWrapper.classList.remove('phase-change'), 450);
}

function triggerCompleteFlash() {
  dom.ringWrapper.classList.remove('phase-complete');
  void dom.ringWrapper.offsetWidth;
  dom.ringWrapper.classList.add('phase-complete');
  setTimeout(() => dom.ringWrapper.classList.remove('phase-complete'), 550);
}

// ─── Timer Logic ──────────────────────────────────────────────────────────────

function loadPhase(phase) {
  state.phase = phase;
  state.inLongBreak = (phase === 'longbreak');
  state.totalSeconds = phaseDurationSecs(phase);
  state.secondsLeft = state.totalSeconds;
  updatePhaseUI(phase);
  updateTimerDisplay();
  updateCyclesUI();
  setRunningUI(false);
  triggerPhaseChangeAnimation();
}

function advancePhase() {
  triggerCompleteFlash();
  const s = getSettings();

  if (state.inLongBreak) {
    // After long break: reset cycle count, start fresh
    state.completedCycles = 0;
    state.cycleIndex = 0;
    setTimeout(() => loadPhase('study'), 200);
    return;
  }

  const currentPhasesIdx = PHASES.indexOf(state.phase);

  if (currentPhasesIdx === PHASES.length - 1) {
    // End of a full cycle (recall just finished)
    state.cycleIndex++;
    state.completedCycles++;
    updateCyclesUI();

    if (state.completedCycles >= s.cycles) {
      // Trigger long break
      setTimeout(() => loadPhase('longbreak'), 200);
    } else {
      setTimeout(() => loadPhase('study'), 200);
    }
  } else {
    // Move to next phase in current cycle
    const nextPhase = PHASES[currentPhasesIdx + 1];
    setTimeout(() => loadPhase(nextPhase), 200);
  }
}

function startTimer() {
  if (state.running) return;
  state.running = true;
  setRunningUI(true);

  state.intervalId = setInterval(() => {
    if (state.secondsLeft <= 0) {
      clearInterval(state.intervalId);
      state.running = false;
      advancePhase();
      return;
    }
    state.secondsLeft--;
    updateTimerDisplay();
  }, 1000);
}

function pauseTimer() {
  if (!state.running) return;
  state.running = false;
  clearInterval(state.intervalId);
  setRunningUI(false);
}

function resetPhase() {
  pauseTimer();
  loadPhase(state.phase);
  dom.timerSubtext.textContent = 'Ready';
}

// ─── Settings Tooltip ─────────────────────────────────────────────────────────

function showTooltip(field) {
  const meta = FIELD_META[field];
  if (!meta) return;

  const el = dom.tooltipText;
  el.classList.add('fade-enter');

  requestAnimationFrame(() => {
    el.textContent = `${meta.desc} ${meta.rec}.`;
    el.style.borderColor = `${meta.color.replace('var(', '').replace(')', '')}33` || 'rgba(139,92,246,0.2)';
    requestAnimationFrame(() => el.classList.remove('fade-enter'));
  });
}

function hideTooltip() {
  dom.tooltipText.textContent = 'Click any setting above to learn more about it.';
  dom.tooltipText.style.borderColor = '';
}

// ─── Event Listeners ──────────────────────────────────────────────────────────

// Settings cards — tooltip on focus/click
dom.cards.forEach((card) => {
  const field = card.dataset.field;

  card.addEventListener('click', () => {
    dom.cards.forEach(c => c.classList.remove('active'));
    card.classList.add('active');
    showTooltip(field);
    const input = dom.inputs[field];
    if (input) input.focus();
  });

  const input = dom.inputs[field];
  if (input) {
    input.addEventListener('focus', () => {
      dom.cards.forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      showTooltip(field);
    });

    input.addEventListener('blur', () => {
      // small delay so we don't flicker on tab
      setTimeout(() => {
        if (!document.activeElement?.closest('.setting-card')) {
          dom.cards.forEach(c => c.classList.remove('active'));
          hideTooltip();
        }
      }, 150);
    });

    // Prevent non-numeric input
    input.addEventListener('keydown', (e) => {
      const allowed = ['Backspace', 'Delete', 'Tab', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter'];
      if (!allowed.includes(e.key) && !/^\d$/.test(e.key)) {
        e.preventDefault();
      }
    });

    // When settings change and timer is not running, refresh phase display
    input.addEventListener('change', () => {
      if (!state.running) {
        loadPhase(state.phase);
      }
      updateCyclesUI();
    });
  }
});

// Start / Pause button
dom.btnStart.addEventListener('click', () => {
  if (state.running) {
    pauseTimer();
  } else {
    startTimer();
  }
});

// Reset Phase button
dom.btnReset.addEventListener('click', resetPhase);

// ─── MutationObserver fallback for attr() ─────────────────────────────────────

if (!CSS.supports('width: attr(value type(<number>))')) {
  const observer = new MutationObserver(() => {
    dom.progress.style.setProperty('--value', dom.progress.getAttribute('value'));
  });
  observer.observe(dom.progress, { attributes: true, attributeFilter: ['value'] });
}

// ─── Init ─────────────────────────────────────────────────────────────────────

function init() {
  loadPhase('study');
  updateCyclesUI();
}

init();
