// =============================================================
//  Spelling Practice App
//  Features: Spaced Repetition (SM-2 simplified), Web Speech API
// =============================================================

const STORAGE_KEY = 'spellingApp_v1';

// SRS review intervals in days, indexed by consecutive-correct count (0-based)
const SRS_INTERVALS = [1, 3, 7, 14, 30, 60];

// ─────────────────────────────────────────────
//  Utilities
// ─────────────────────────────────────────────

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function today() {
  return new Date().toISOString().split('T')[0];
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─────────────────────────────────────────────
//  Data persistence
// ─────────────────────────────────────────────

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return {
    words: [],
    settings: { childName: '', streakDays: 0, lastPracticeDate: null },
    history: []
  };
}

function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

// ─────────────────────────────────────────────
//  Spaced Repetition
// ─────────────────────────────────────────────

function getWordsDueToday(words) {
  const t = today();
  return words.filter(w => !w.dueDate || w.dueDate <= t);
}

/**
 * Update a word's SRS fields after a practice attempt.
 * @param {object} word   - word object (mutated in place)
 * @param {boolean} correct - whether the answer was correct on first try
 */
function updateSRS(word, correct) {
  const t = today();
  if (correct) {
    word.streak = (word.streak || 0) + 1;
    const idx = Math.min(word.streak - 1, SRS_INTERVALS.length - 1);
    word.interval = SRS_INTERVALS[idx];
  } else {
    word.streak = 0;
    word.interval = 1;
  }
  word.lastReviewed = t;
  word.dueDate = addDays(t, word.interval);
}

// ─────────────────────────────────────────────
//  Text-to-Speech
// ─────────────────────────────────────────────

function speakWord(word) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();

  const doSpeak = () => {
    const utt = new SpeechSynthesisUtterance(word);
    utt.rate = 0.82;
    utt.pitch = 1.0;
    utt.volume = 1.0;
    window.speechSynthesis.speak(utt);
  };

  // Voices may not be loaded yet in some browsers
  if (window.speechSynthesis.getVoices().length === 0) {
    window.speechSynthesis.addEventListener('voiceschanged', doSpeak, { once: true });
  } else {
    doSpeak();
  }
}

// ─────────────────────────────────────────────
//  Tab Navigation
// ─────────────────────────────────────────────

function switchTab(name) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === name);
  });
  document.querySelectorAll('.tab-content').forEach(tab => {
    tab.classList.toggle('active', tab.id === 'tab-' + name);
  });

  if (name === 'practice') renderPracticeHome();
  if (name === 'words')    renderWords();
  if (name === 'progress') renderProgress();
}

// ─────────────────────────────────────────────
//  Practice – Home Screen
// ─────────────────────────────────────────────

function renderPracticeHome() {
  const data = loadData();
  const due  = getWordsDueToday(data.words);
  const el   = document.getElementById('practice-home');

  // Update header subtitle
  const childName = data.settings.childName || 'Speller';
  document.getElementById('header-subtitle').textContent =
    'Hi ' + childName + '! Ready to practice?';

  if (data.words.length === 0) {
    el.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📝</div>
        <h2>No words yet!</h2>
        <p>Go to the <strong>Words</strong> tab to add this week's spelling words.</p>
        <button onclick="switchTab('words')" class="btn btn-primary">Add Words</button>
      </div>`;
    return;
  }

  const mastered = data.words.filter(w => (w.streak || 0) >= SRS_INTERVALS.length).length;
  const streak   = data.settings.streakDays || 0;

  const streakHtml = streak > 0
    ? `<div class="streak-badge">🔥 ${streak} day streak!</div>`
    : '';

  if (due.length === 0) {
    el.innerHTML = `
      <div class="practice-home">
        ${streakHtml}
        <div class="all-done">
          <div class="done-icon">🎉</div>
          <h2>All caught up, ${escapeHtml(childName)}!</h2>
          <p>No words are due right now. Come back tomorrow!</p>
          <div class="count-row">
            <div class="count-card">
              <span class="count-number">${data.words.length}</span>
              <span class="count-label">Total Words</span>
            </div>
            <div class="count-card">
              <span class="count-number">${mastered}</span>
              <span class="count-label">Mastered ⭐</span>
            </div>
          </div>
        </div>
      </div>`;
    return;
  }

  el.innerHTML = `
    <div class="practice-home">
      ${streakHtml}
      <div class="greeting">
        <h2>Ready to practice, ${escapeHtml(childName)}?</h2>
      </div>
      <div class="count-row">
        <div class="count-card highlight">
          <span class="count-number">${due.length}</span>
          <span class="count-label">Due Today</span>
        </div>
        <div class="count-card">
          <span class="count-number">${data.words.length}</span>
          <span class="count-label">Total Words</span>
        </div>
        <div class="count-card">
          <span class="count-number">${mastered}</span>
          <span class="count-label">Mastered ⭐</span>
        </div>
      </div>
      <button onclick="startSession()" class="btn btn-primary btn-large">
        Start Practice ▶
      </button>
    </div>`;
}

// ─────────────────────────────────────────────
//  Practice – Session
// ─────────────────────────────────────────────

let _session = null; // { data, words, index, results, attempts }

function startSession() {
  const data = loadData();
  const due  = getWordsDueToday(data.words);

  // Shuffle
  const words = due.slice().sort(() => Math.random() - 0.5);

  _session = { data, words, index: 0, results: [], attempts: 0 };

  document.getElementById('practice-home').style.display    = 'none';
  document.getElementById('practice-session').style.display = 'block';

  renderSessionWord();
}

// ─────────────────────────────────────────────
//  Letter Tiles
// ─────────────────────────────────────────────

function scrambleLetters(word) {
  const tiles = word.split('').map((letter, i) => ({ letter, id: i }));
  let shuffled;
  let tries = 0;
  do {
    shuffled = tiles.slice().sort(() => Math.random() - 0.5);
    tries++;
  } while (tries < 20 && word.length > 2 &&
           shuffled.map(t => t.letter).join('') === word);
  return shuffled;
}

function renderTiles() {
  const s       = _session;
  const { tiles, placed, locked } = s.tileState;
  const placedSet = new Set(placed);

  // ── Answer row ──
  const answerEl = document.getElementById('tile-answer');
  if (answerEl) {
    answerEl.innerHTML = placed.length === 0
      ? '<span class="tile-placeholder">Tap letters to build the word</span>'
      : placed.map((id, idx) => {
          const t = tiles.find(x => x.id === id);
          const cls = locked ? 'letter-tile tile-placed tile-locked' : 'letter-tile tile-placed';
          const handler = locked ? '' : `onclick="removePlaced(${idx})"`;
          return `<button class="${cls}" ${handler}>${t.letter.toUpperCase()}</button>`;
        }).join('');
  }

  // ── Pool ──
  const poolEl = document.getElementById('tile-pool');
  if (poolEl) {
    poolEl.innerHTML = tiles.map(t => {
      if (placedSet.has(t.id)) {
        return `<button class="letter-tile tile-ghost" disabled></button>`;
      }
      const cls = locked ? 'letter-tile tile-available tile-locked' : 'letter-tile tile-available';
      const handler = locked ? 'disabled' : `onclick="tapTile(${t.id})"`;
      return `<button class="${cls}" ${handler}>${t.letter.toUpperCase()}</button>`;
    }).join('');
  }

  // Auto-check when all tiles placed
  const wordLen = s.words[s.index].word.length;
  if (!locked && placed.length === wordLen) {
    setTimeout(checkAnswer, 280);
  }
}

function tapTile(id) {
  const s = _session;
  if (s.tileState.locked) return;
  if (!s.tileState.placed.includes(id)) {
    s.tileState.placed.push(id);
    renderTiles();
  }
}

function removePlaced(idx) {
  const s = _session;
  if (s.tileState.locked) return;
  s.tileState.placed.splice(idx, 1);
  renderTiles();
}

function clearTiles() {
  const s = _session;
  if (s.tileState.locked) return;
  s.tileState.placed = [];
  renderTiles();
}

// ─────────────────────────────────────────────

function renderSessionWord() {
  const s = _session;
  if (s.index >= s.words.length) { renderSessionComplete(); return; }

  const word = s.words[s.index];
  s.attempts = 0;
  s.tileState = { tiles: scrambleLetters(word.word), placed: [], locked: false };

  const pct      = Math.round((s.index / s.words.length) * 100);
  const progress = `${s.index + 1} / ${s.words.length}`;

  document.getElementById('practice-session').innerHTML = `
    <div class="session-wrap">
      <div class="session-top">
        <button class="btn-icon" onclick="confirmEndSession()" title="End session">✕</button>
        <div class="progress-track">
          <div class="progress-fill" style="width:${pct}%"></div>
        </div>
        <span class="progress-label">${progress}</span>
      </div>

      <div class="word-card" id="word-card">
        <p class="listen-label">Tap to hear the word, then build it:</p>
        <button class="btn-speak" onclick="speakWord(${JSON.stringify(word.word)})">
          🔊 Hear the Word
        </button>
        ${word.hint ? `<p class="hint-label">💡 ${escapeHtml(word.hint)}</p>` : ''}
      </div>

      <div class="tile-answer-area" id="tile-answer"></div>
      <div class="tile-pool" id="tile-pool"></div>

      <div class="tile-actions">
        <button class="btn btn-secondary" onclick="clearTiles()">Clear</button>
      </div>

      <div id="feedback" class="feedback"></div>
    </div>`;

  renderTiles();
}

function checkAnswer() {
  const s    = _session;
  const word = s.words[s.index];
  const { tiles, placed } = s.tileState;

  // Guard: only check when all tiles are placed and not already locked
  if (s.tileState.locked) return;
  if (placed.length < word.word.length) return;

  s.tileState.locked = true;
  s.attempts++;

  const typed   = placed.map(id => tiles.find(t => t.id === id).letter).join('');
  const correct = typed.toLowerCase() === word.word.toLowerCase();

  const card     = document.getElementById('word-card');
  const feedback = document.getElementById('feedback');

  // Re-render tiles in locked state to disable further tapping
  renderTiles();

  if (correct) {
    const firstTry = s.attempts === 1;

    const w = s.data.words.find(x => x.id === word.id);
    if (w) updateSRS(w, firstTry);

    s.results.push({ word: word.word, correct: firstTry, attempts: s.attempts });
    _updateStreakForToday(s.data);
    saveData(s.data);

    card.classList.add('state-correct');

    const msgs = ['Amazing! 🌟', 'Brilliant! 🎉', 'Perfect! ✨', 'Superstar! ⭐', 'Fantastic! 🚀', 'You got it! 🎈'];
    const msg  = msgs[Math.floor(Math.random() * msgs.length)];

    feedback.innerHTML = `
      <div class="feedback-box feedback-correct">
        <span class="feedback-icon">✅</span>
        <span>${msg}</span>
        <strong>${escapeHtml(word.word)}</strong>
      </div>`;

    if (firstTry) launchConfetti();

    setTimeout(() => { s.index++; renderSessionWord(); }, 1600);

  } else {
    card.classList.add('state-incorrect');
    setTimeout(() => card.classList.remove('state-incorrect'), 500);

    if (s.attempts >= 2) {
      // Two strikes – mark wrong, show the word
      const w = s.data.words.find(x => x.id === word.id);
      if (w) updateSRS(w, false);

      s.results.push({ word: word.word, correct: false, attempts: s.attempts });
      saveData(s.data);

      feedback.innerHTML = `
        <div class="feedback-box feedback-wrong">
          <span class="feedback-icon">❌</span>
          <span>The word is: <strong>${escapeHtml(word.word)}</strong></span>
          <button onclick="advanceSession()" class="btn btn-secondary">Next →</button>
        </div>`;
    } else {
      // Shake, then unlock and reset tiles for another try
      feedback.innerHTML = `
        <div class="feedback-box feedback-retry">
          <span class="feedback-icon">🤔</span>
          <span>Not quite — try again!</span>
          <button onclick="speakWord(${JSON.stringify(word.word)})" class="btn-link">🔊 Hear it again</button>
        </div>`;

      setTimeout(() => {
        s.tileState.placed = [];
        s.tileState.locked = false;
        renderTiles();
      }, 700);
    }
  }
}

function advanceSession() {
  _session.index++;
  renderSessionWord();
}

function confirmEndSession() {
  if (_session && _session.results.length > 0) {
    if (!confirm('End this session? Your progress so far will be saved.')) return;
  }
  endSession();
}

function endSession() {
  window.speechSynthesis && window.speechSynthesis.cancel();
  _session = null;
  document.getElementById('practice-home').style.display    = 'block';
  document.getElementById('practice-session').style.display = 'none';
  renderPracticeHome();
}

function renderSessionComplete() {
  const s       = _session;
  const correct = s.results.filter(r => r.correct).length;
  const total   = s.results.length;
  const pct     = total > 0 ? Math.round((correct / total) * 100) : 100;

  // Final streak/history save
  _updateStreakForToday(s.data);
  if (!s.data.history) s.data.history = [];
  s.data.history.push({ date: today(), wordsCorrect: correct, wordsTotal: total });
  saveData(s.data);

  let emoji, msg;
  if (pct === 100) { emoji = '🏆'; msg = "Perfect score! You're a spelling champion!"; }
  else if (pct >= 80) { emoji = '🌟'; msg = 'Great job! Almost perfect!'; }
  else if (pct >= 60) { emoji = '👍'; msg = 'Good effort! Keep practising!'; }
  else                { emoji = '💪'; msg = 'Practice makes perfect – keep it up!'; }

  const rows = s.results.map(r => `
    <div class="result-row ${r.correct ? 'ok' : 'bad'}">
      <span class="result-icon">${r.correct ? '✅' : '❌'}</span>
      <span>${escapeHtml(r.word)}</span>
    </div>`).join('');

  document.getElementById('practice-session').innerHTML = `
    <div class="session-complete">
      <div class="complete-emoji">${emoji}</div>
      <h2>Session Complete!</h2>
      <p class="complete-msg">${msg}</p>

      <div class="score-card">
        <span class="score-number">${correct}/${total}</span>
        <span class="score-label">Correct</span>
        <div class="score-bar">
          <div class="score-bar-fill" style="width:${pct}%"></div>
        </div>
        <span class="score-pct">${pct}%</span>
      </div>

      <div class="results-list">${rows}</div>

      <div class="session-actions">
        <button onclick="endSession()" class="btn btn-primary">Done</button>
        ${s.results.some(r => !r.correct)
            ? `<button onclick="retryWrong()" class="btn btn-secondary">Retry Missed Words</button>`
            : ''}
      </div>
    </div>`;

  if (pct === 100) launchConfetti();
}

function retryWrong() {
  const s = _session;
  const wrongWords = s.results
    .filter(r => !r.correct)
    .map(r => s.words.find(w => w.word === r.word))
    .filter(Boolean);

  s.words   = wrongWords;
  s.index   = 0;
  s.results = [];
  s.attempts = 0;
  renderSessionWord();
}

// ─────────────────────────────────────────────
//  Streak helpers
// ─────────────────────────────────────────────

function _updateStreakForToday(data) {
  const t    = today();
  const last = data.settings.lastPracticeDate;
  if (last === t) return; // already updated today

  const yesterday = addDays(t, -1);
  if (last === yesterday) {
    data.settings.streakDays = (data.settings.streakDays || 0) + 1;
  } else {
    data.settings.streakDays = 1;
  }
  data.settings.lastPracticeDate = t;
}

// ─────────────────────────────────────────────
//  Words Management
// ─────────────────────────────────────────────

function renderWords() {
  const data = loadData();

  // Populate name input
  document.getElementById('child-name-input').value = data.settings.childName || '';

  // Render word list card
  _renderWordListCard(data.words);
}

function _renderWordListCard(words) {
  const t   = today();
  const el  = document.getElementById('word-list-card');

  if (words.length === 0) {
    el.innerHTML = `
      <h2>Words (0)</h2>
      <p class="empty-words">No words yet. Add your first word above!</p>`;
    return;
  }

  const items = words.map(w => {
    const streak  = w.streak || 0;
    const stars   = '⭐'.repeat(Math.min(streak, SRS_INTERVALS.length)) ||
                    '<span style="color:#ccc">○○○○○○</span>';
    const isDue   = !w.dueDate || w.dueDate <= t;
    const dueTxt  = isDue
      ? '<span class="due-badge">Due Today</span>'
      : `<span class="due-date-label">Next: ${w.dueDate}</span>`;

    return `
      <div class="word-item">
        <div class="word-item-main">
          <button class="btn-speak-sm" onclick="speakWord(${JSON.stringify(w.word)})" title="Hear word">🔊</button>
          <span class="word-text">${escapeHtml(w.word)}</span>
          ${w.hint ? `<span class="word-hint">— ${escapeHtml(w.hint)}</span>` : ''}
        </div>
        <div class="word-item-meta">
          <span class="mastery-stars">${stars}</span>
          ${dueTxt}
        </div>
        <button class="btn-danger" onclick="deleteWord(${JSON.stringify(w.id)})" title="Delete">🗑️</button>
      </div>`;
  }).join('');

  el.innerHTML = `
    <div class="word-list-header">
      <h2>Words (${words.length})</h2>
    </div>
    <div class="word-list">${items}</div>`;
}

function saveName() {
  const data = loadData();
  data.settings.childName = document.getElementById('child-name-input').value.trim();
  saveData(data);

  const btn = document.querySelector('#tab-words .btn-secondary');
  const orig = btn.textContent;
  btn.textContent = 'Saved ✓';
  setTimeout(() => { btn.textContent = orig; }, 1600);
}

function addWord() {
  const wordEl  = document.getElementById('new-word-input');
  const hintEl  = document.getElementById('new-hint-input');
  const errorEl = document.getElementById('add-word-error');

  const word = wordEl.value.trim().toLowerCase();
  const hint = hintEl.value.trim();

  errorEl.textContent = '';

  if (!word) {
    errorEl.textContent = 'Please enter a word.';
    wordEl.focus();
    return;
  }
  if (!/^[a-z'-]+$/.test(word)) {
    errorEl.textContent = 'Words should contain only letters (a–z), hyphens, or apostrophes.';
    return;
  }

  const data = loadData();
  if (data.words.some(w => w.word === word)) {
    errorEl.textContent = `"${word}" is already in the list.`;
    return;
  }

  data.words.push({
    id: generateId(),
    word,
    hint,
    addedDate: today(),
    streak: 0,
    interval: 1,
    dueDate: today(),       // due immediately
    lastReviewed: null
  });

  saveData(data);
  wordEl.value = '';
  hintEl.value = '';
  wordEl.focus();

  _renderWordListCard(data.words);
}

function deleteWord(id) {
  if (!confirm('Remove this word from your list?')) return;
  const data = loadData();
  data.words = data.words.filter(w => w.id !== id);
  saveData(data);
  _renderWordListCard(data.words);
}

// ─────────────────────────────────────────────
//  Progress
// ─────────────────────────────────────────────

function renderProgress() {
  const data = loadData();
  const el   = document.getElementById('tab-progress');

  if (data.words.length === 0) {
    el.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📊</div>
        <h2>No progress yet</h2>
        <p>Add some words and start practising to see your stats here!</p>
      </div>`;
    return;
  }

  const t       = today();
  const due     = getWordsDueToday(data.words).length;
  const mastered = data.words.filter(w => (w.streak || 0) >= SRS_INTERVALS.length).length;
  const streak  = data.settings.streakDays || 0;

  // Group words by mastery level
  const levels = [
    { label: '🆕 New',        color: '#9e9e9e', min: 0,  max: 0 },
    { label: '📖 Learning',   color: '#f59e0b', min: 1,  max: 2 },
    { label: '✏️ Practising', color: '#3b82f6', min: 3,  max: 4 },
    { label: '⭐ Mastered',   color: '#22c55e', min: 5,  max: 999 },
  ];

  const sections = levels.map(lv => {
    const group = data.words.filter(w => {
      const s = w.streak || 0;
      return s >= lv.min && s <= lv.max;
    });
    if (group.length === 0) return '';
    return `
      <div class="mastery-section">
        <h3 style="color:${lv.color}">${lv.label} (${group.length})</h3>
        <div class="chip-list">
          ${group.map(w => `<span class="chip">${escapeHtml(w.word)}</span>`).join('')}
        </div>
      </div>`;
  }).join('');

  el.innerHTML = `
    <div class="progress-page">
      <h2>Progress</h2>
      <div class="stats-grid">
        <div class="stat-card">
          <span class="stat-num">${data.words.length}</span>
          <span class="stat-label">Total Words</span>
        </div>
        <div class="stat-card">
          <span class="stat-num">${due}</span>
          <span class="stat-label">Due Today</span>
        </div>
        <div class="stat-card">
          <span class="stat-num">${mastered}</span>
          <span class="stat-label">Mastered ⭐</span>
        </div>
        <div class="stat-card">
          <span class="stat-num">${streak}</span>
          <span class="stat-label">Day Streak 🔥</span>
        </div>
      </div>
      <div class="mastery-sections">${sections}</div>
    </div>`;
}

// ─────────────────────────────────────────────
//  Confetti
// ─────────────────────────────────────────────

function launchConfetti() {
  const canvas = document.getElementById('confetti-canvas');
  const ctx    = canvas.getContext('2d');
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  canvas.style.display = 'block';

  const pieces = Array.from({ length: 90 }, () => ({
    x:     Math.random() * canvas.width,
    y:     Math.random() * canvas.height - canvas.height,
    r:     Math.random() * 7 + 4,
    color: `hsl(${Math.random() * 360},90%,60%)`,
    vx:    (Math.random() - 0.5) * 5,
    vy:    Math.random() * 4 + 2,
    spin:  (Math.random() - 0.5) * 0.18,
    angle: Math.random() * Math.PI * 2
  }));

  const start = Date.now();
  let raf;

  (function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pieces.forEach(p => {
      p.x     += p.vx;
      p.y     += p.vy;
      p.angle += p.spin;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 0.55);
      ctx.restore();
    });
    if (Date.now() - start < 2800) {
      raf = requestAnimationFrame(animate);
    } else {
      cancelAnimationFrame(raf);
      canvas.style.display = 'none';
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  })();
}

// ─────────────────────────────────────────────
//  Initialise
// ─────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Tab buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Words tab – allow Enter on the word input
  document.getElementById('new-word-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') addWord();
  });

  // Initial render
  renderPracticeHome();
});
