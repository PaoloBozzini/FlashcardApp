'use strict';

// ===================================================================
// SEED DATA — example cards loaded on first visit.
// Questions cover JS fundamentals students just learned.
// ===================================================================
const SEED_CARDS = [
  {
    id: 1,
    question: 'What does DOM stand for?',
    answer: 'Document Object Model — the browser\'s live tree of HTML elements that JavaScript can read and modify.',
  },
  {
    id: 2,
    question: 'What is the difference between let and const?',
    answer: 'let allows reassignment; const does not. Both are block-scoped. var (older style) is function-scoped and should be avoided.',
  },
  {
    id: 3,
    question: 'What does addEventListener() do?',
    answer: 'It attaches a callback function to an element that runs whenever a specific event — like "click" or "submit" — fires on that element.',
  },
  {
    id: 4,
    question: 'What is a callback function?',
    answer: 'A function passed as an argument to another function, to be called later — often when an event fires or an async task completes.',
  },
  {
    id: 5,
    question: 'What does Array.map() return?',
    answer: 'A new array of the same length, where each element is the result of calling the provided function on the corresponding original element.',
  },
];

// ===================================================================
// STATE — all mutable app data lives in one object.
// Keeping state centralised means there is one place to look when
// something goes wrong — no hunting across scattered global variables.
// ===================================================================
const state = {
  deck:   [],   // { id, question, answer }[]
  nextId: 1,    // auto-increment so each card gets a unique ID

  study: {
    cards:     [],    // shuffled copy of deck used for this session
    index:     0,     // which card we're currently showing
    revealed:  false, // has the user flipped the current card?
    correct:   0,
    incorrect: 0,
  },

  // Both players go through the same deck, alternating per card.
  // After every card, control passes to the other player.
  // Scores are compared when the deck is exhausted.
  twoPlayer: {
    players:  [{ name: 'Player 1', score: 0 }, { name: 'Player 2', score: 0 }],
    current:  0,      // index of the player whose turn it is (0 or 1)
    deck:     [],     // shared shuffled deck
    index:    0,      // which card we're on
    revealed: false,
  },

  // Used by the results view to know which "play again" action to trigger
  lastMode: 'solo',  // 'solo' | 'two'
};

// ===================================================================
// SESSION STORAGE — persists the deck for the life of the browser tab.
//
// sessionStorage is like a temporary notepad: data survives page
// refreshes but is wiped when the tab closes.  This lets students
// reload the page without losing their cards, while starting fresh
// in a new tab.  (localStorage would persist across sessions — a
// reasonable alternative, but sessionStorage is safer for shared
// computers at school.)
// ===================================================================
const STORAGE_KEY = 'redi-flashcards-v1';

function loadFromStorage() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    // Malformed data — silently ignore and fall back to seed cards
    return null;
  }
}

function saveToStorage() {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
    deck:   state.deck,
    nextId: state.nextId,
  }));
}

// ===================================================================
// FISHER–YATES SHUFFLE — the correct way to shuffle an array.
//
// The naive approach `arr.sort(() => Math.random() - 0.5)` is biased:
// sort() was designed for stable orderings, not random comparators,
// so some permutations end up more likely than others.
//
// Fisher–Yates walks backwards through the array and swaps each
// element with a randomly-chosen element from the unprocessed prefix.
// Every permutation is equally likely — O(n), no bias.
// ===================================================================
function shuffle(array) {
  const a = [...array]; // work on a copy; never mutate the source deck
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]; // destructured swap — no temp variable
  }
  return a;
}

// ===================================================================
// VIEWS — one HTML page, multiple <section> elements, one visible.
// ===================================================================
const VIEW_IDS = ['manage', 'study', 'two-setup', 'two-play', 'results'];

function showView(name) {
  VIEW_IDS.forEach(id => {
    const el = document.getElementById(`view-${id}`);
    if (el) el.classList.toggle('active', id === name);
  });
  // Move focus to the top of the new view so keyboard/screen-reader
  // users land in the right place
  const active = document.querySelector('.view.active');
  if (active) active.focus({ preventScroll: true });
}

// ===================================================================
// MANAGE VIEW
// ===================================================================
function renderManage() {
  const count  = document.getElementById('card-count');
  const empty  = document.getElementById('deck-empty');
  const list   = document.getElementById('card-list');
  const btnSolo = document.getElementById('btn-start-solo');
  const btnTwo  = document.getElementById('btn-start-two');

  const n = state.deck.length;
  count.textContent   = `${n} card${n !== 1 ? 's' : ''}`;
  empty.hidden        = n > 0;
  btnSolo.disabled    = n === 0;
  btnTwo.disabled     = n === 0;

  list.innerHTML = '';
  state.deck.forEach((card, i) => {
    const li = document.createElement('li');
    li.className = 'card-list-item';
    li.innerHTML = `
      <span class="card-num">${i + 1}</span>
      <span class="card-q">${escapeHtml(card.question)}</span>
      <button class="btn-delete" data-id="${card.id}"
              aria-label="Delete card: ${escapeHtml(card.question)}">✕</button>
    `;
    list.appendChild(li);
  });
}

function handleAddCard(e) {
  e.preventDefault();
  const qInput = document.getElementById('input-question');
  const aInput = document.getElementById('input-answer');

  const question = qInput.value.trim();
  const answer   = aInput.value.trim();

  if (!question || !answer) {
    showToast('Both fields are required.', 'error');
    return;
  }

  state.deck.push({ id: state.nextId++, question, answer });
  saveToStorage();
  renderManage();

  qInput.value = '';
  aInput.value = '';
  qInput.focus();
  showToast('Card added!', 'success');

  // Animate the freshly added list item
  const items = document.querySelectorAll('.card-list-item');
  const last  = items[items.length - 1];
  if (last) last.classList.add('card-added');
}

function handleDeleteCard(id) {
  state.deck = state.deck.filter(c => c.id !== id);
  saveToStorage();
  renderManage();
}

// ===================================================================
// STUDY SESSION — single-player
// ===================================================================
function startStudy() {
  if (state.deck.length === 0) return;
  state.lastMode = 'solo';

  // Shuffle a copy — original deck order stays intact for manage view
  state.study.cards     = shuffle(state.deck);
  state.study.index     = 0;
  state.study.revealed  = false;
  state.study.correct   = 0;
  state.study.incorrect = 0;

  showView('study');
  renderStudyCard();
}

function renderStudyCard() {
  const s    = state.study;
  const card = s.cards[s.index];

  document.getElementById('card-question-text').textContent = card.question;
  document.getElementById('card-answer-text').textContent   = card.answer;
  document.getElementById('progress-label').textContent     = `${s.index + 1} / ${s.cards.length}`;

  const pct = (s.index / s.cards.length) * 100;
  document.getElementById('progress-fill').style.width = `${pct}%`;
  document.getElementById('progress-bar').setAttribute('aria-valuenow', pct);

  document.getElementById('study-score').innerHTML = `
    <span class="score-correct">✓ ${s.correct}</span>
    <span class="score-incorrect">✗ ${s.incorrect}</span>
  `;

  const inner = document.getElementById('card-inner');
  inner.style.transition = 'none';
  setRevealed(false, 'card-inner', 'study-controls');
  void inner.offsetWidth;
  inner.style.transition = '';
  s.revealed = false;
}

function flipStudyCard() {
  if (state.study.revealed) return;
  state.study.revealed = true;
  setRevealed(true, 'card-inner', 'study-controls');
  announce('Answer revealed. Press right arrow for correct, left arrow for incorrect.');
}

function advanceStudy(wasCorrect) {
  if (!state.study.revealed) return;

  if (wasCorrect) state.study.correct++;
  else            state.study.incorrect++;

  if (state.study.index + 1 >= state.study.cards.length) {
    showResults();
    return;
  }

  state.study.index++;
  animateCard('card-scene', renderStudyCard);
}

// ===================================================================
// TWO-PLAYER MODE
// ===================================================================
function startTwoPlayerSetup() {
  showView('two-setup');
}

function startTwoPlayerGame(p1Name, p2Name) {
  const tp = state.twoPlayer;
  tp.players  = [{ name: p1Name, score: 0 }, { name: p2Name, score: 0 }];
  tp.current  = 0;
  tp.deck     = shuffle(state.deck);
  tp.index    = 0;
  tp.revealed = false;
  state.lastMode = 'two';

  showView('two-play');
  renderTwoPlayerCard();
}

function renderTwoPlayerCard() {
  const tp     = state.twoPlayer;
  const card   = tp.deck[tp.index];
  const player = tp.players[tp.current];

  document.getElementById('two-question-text').textContent = card.question;
  document.getElementById('two-answer-text').textContent   = card.answer;

  const badge = document.getElementById('player-badge');
  badge.textContent = `${player.name}'s turn`;
  // Toggle player colour on the badge
  badge.classList.toggle('p2', tp.current === 1);

  updateTwoScores();
  setRevealed(false, 'two-card-inner', 'two-controls');
  tp.revealed = false;

  // Progress: each card is answered by both players, so total turns = deck * 2
  const totalTurns = tp.deck.length * 2;
  const doneTurns  = tp.index * 2 + tp.current;
  const pct = (doneTurns / totalTurns) * 100;
  document.getElementById('two-progress-fill').style.width = `${pct}%`;
  document.getElementById('two-progress-bar').setAttribute('aria-valuenow', pct);
  document.getElementById('two-progress-label').textContent =
    `Card ${tp.index + 1} of ${tp.deck.length}`;
}

function updateTwoScores() {
  const [p1, p2] = state.twoPlayer.players;
  document.getElementById('p1-score-disp').textContent = `${p1.name}: ${p1.score}`;
  document.getElementById('p2-score-disp').textContent = `${p2.name}: ${p2.score}`;
}

function flipTwoPlayerCard() {
  if (state.twoPlayer.revealed) return;
  state.twoPlayer.revealed = true;
  setRevealed(true, 'two-card-inner', 'two-controls');
  announce('Answer revealed. Press right arrow for correct, left arrow for incorrect.');
}

function advanceTwoPlayer(wasCorrect) {
  if (!state.twoPlayer.revealed) return;
  const tp = state.twoPlayer;

  if (wasCorrect) tp.players[tp.current].score++;

  if (tp.current === 0) {
    // Player 1 just answered — Player 2 sees the same card
    tp.current = 1;
    animateCard('two-card-scene', renderTwoPlayerCard);
  } else {
    // Player 2 just answered — move to next card, back to Player 1
    tp.current = 0;
    tp.index++;
    if (tp.index >= tp.deck.length) {
      showResults();
    } else {
      animateCard('two-card-scene', renderTwoPlayerCard);
    }
  }
}

// ===================================================================
// RESULTS VIEW
// ===================================================================
function showResults() {
  showView('results');

  const twoPlayer = state.lastMode === 'two';

  if (twoPlayer) {
    const [p1, p2] = state.twoPlayer.players;
    const total    = state.twoPlayer.deck.length;
    const winner   = p1.score > p2.score ? p1 : p2.score > p1.score ? p2 : null;

    document.getElementById('results-title').textContent =
      winner ? `${winner.name} Wins!` : 'It\'s a Tie!';
    document.getElementById('results-subtitle').textContent =
      winner ? 'Great game — well played!' : 'Both players scored the same. A true draw!';
    document.getElementById('trophy').textContent = winner ? '🏆' : '🤝';

    document.getElementById('results-scores').innerHTML = `
      <div class="result-row">
        <span>${escapeHtml(p1.name)}</span>
        <span class="result-num">${p1.score}<small style="font-size:0.55em;opacity:0.5"> / ${total}</small></span>
      </div>
      <div class="result-row">
        <span>${escapeHtml(p2.name)}</span>
        <span class="result-num">${p2.score}<small style="font-size:0.55em;opacity:0.5"> / ${total}</small></span>
      </div>
    `;

    document.getElementById('btn-study-again').textContent = 'Play Again';
  } else {
    const s     = state.study;
    const total = s.correct + s.incorrect;
    const pct   = total > 0 ? Math.round((s.correct / total) * 100) : 0;

    document.getElementById('results-title').textContent   = 'Session Complete!';
    document.getElementById('results-subtitle').textContent = `${pct}% correct — ${encouragement(pct)}`;
    document.getElementById('trophy').textContent = '🏆';

    document.getElementById('results-scores').innerHTML = `
      <div class="result-row">
        <span>Correct</span>
        <span class="result-num score-correct">${s.correct}</span>
      </div>
      <div class="result-row">
        <span>Incorrect</span>
        <span class="result-num score-incorrect">${s.incorrect}</span>
      </div>
      <div class="result-row result-total">
        <span>Total</span>
        <span class="result-num">${total}</span>
      </div>
    `;

    document.getElementById('btn-study-again').textContent = 'Study Again';
  }
}

function encouragement(pct) {
  if (pct === 100) return 'Perfect score!';
  if (pct >= 80)   return 'Great job!';
  if (pct >= 60)   return 'Good effort!';
  if (pct >= 40)   return 'Keep practicing!';
  return 'Keep going — you\'ll get there!';
}

// ===================================================================
// ANIMATION HELPERS
// ===================================================================

// Toggle the 3D flip on a card and show/hide the mark buttons.
function setRevealed(revealed, cardInnerId, controlsId) {
  document.getElementById(cardInnerId).classList.toggle('flipped', revealed);

  const controls = document.getElementById(controlsId);
  controls.classList.toggle('visible', revealed);
  controls.setAttribute('aria-hidden', String(!revealed));
}

// Slide the card scene out, run updateFn (which updates content and
// resets flip state), then slide it back in.  Using CSS animationend
// events means the timing is driven by CSS — no hardcoded timeouts.
function animateCard(sceneId, updateFn) {
  const scene = document.getElementById(sceneId);
  scene.classList.add('exiting');
  scene.addEventListener('animationend', function onExit() {
    scene.removeEventListener('animationend', onExit);
    scene.classList.remove('exiting');
    updateFn();
    scene.classList.add('entering');
    scene.addEventListener('animationend', function onEnter() {
      scene.removeEventListener('animationend', onEnter);
      scene.classList.remove('entering');
    });
  });
}

// ===================================================================
// EXPORT — create a JSON file and trigger a download, all in-browser.
//
// Blob holds the file data in memory.  URL.createObjectURL() gives us
// a temporary URL pointing at that blob.  We create a hidden <a> tag,
// set its href to the blob URL, and programmatically click it —
// the browser treats this exactly like clicking a download link.
// We revoke the URL shortly after to free the memory.
// ===================================================================
function exportDeck() {
  if (state.deck.length === 0) {
    showToast('No cards to export.', 'error');
    return;
  }
  const json = JSON.stringify({ cards: state.deck }, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);

  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'flashcards.json';
  a.click();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast('Deck exported!', 'success');
}

// ===================================================================
// IMPORT — read a JSON file with FileReader (asynchronous).
//
// FileReader reads the file contents as a text string.  Its onload
// callback fires when reading is complete; we parse the JSON there.
// The try/catch handles malformed files gracefully.
// ===================================================================
function handleImport(file) {
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!Array.isArray(data.cards)) throw new Error('missing cards array');

      let added = 0;
      data.cards.forEach(c => {
        if (c.question && c.answer) {
          state.deck.push({
            id:       state.nextId++,
            question: String(c.question).trim(),
            answer:   String(c.answer).trim(),
          });
          added++;
        }
      });

      saveToStorage();
      renderManage();
      showToast(`Imported ${added} card${added !== 1 ? 's' : ''}!`, 'success');
    } catch {
      showToast('Could not read file — is it a valid flashcards JSON?', 'error');
    }
  };
  reader.readAsText(file);
}

// ===================================================================
// TOAST — brief feedback messages that auto-dismiss
// ===================================================================
let toastTimer;
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className   = `toast toast-${type} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
}

// ===================================================================
// SCREEN-READER ANNOUNCEMENTS
// ===================================================================
function announce(text) {
  const region = document.getElementById('live-region');
  // Clear then set so repeated identical messages are still announced
  region.textContent = '';
  requestAnimationFrame(() => { region.textContent = text; });
}

// ===================================================================
// UTILITY
// ===================================================================
// Escape HTML special characters before inserting user text into
// innerHTML — prevents accidental (or malicious) HTML injection.
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ===================================================================
// KEYBOARD NAVIGATION
// ===================================================================
function handleKeydown(e) {
  // Never intercept keys while the user is typing in a form field
  if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

  const activeId = document.querySelector('.view.active')?.id;

  if (activeId === 'view-study') {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      flipStudyCard();
    }
    if (!state.study.revealed) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); advanceStudy(true); }
    if (e.key === 'ArrowLeft')  { e.preventDefault(); advanceStudy(false); }
    if (e.key === 'Escape')     { e.preventDefault(); showView('manage'); }
  }

  if (activeId === 'view-two-play') {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      flipTwoPlayerCard();
    }
    if (!state.twoPlayer.revealed) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); advanceTwoPlayer(true); }
    if (e.key === 'ArrowLeft')  { e.preventDefault(); advanceTwoPlayer(false); }
  }
}

// ===================================================================
// INIT — runs once after the DOM is ready
// ===================================================================
function init() {
  // Restore saved deck, or load seed cards on the very first visit
  const saved = loadFromStorage();
  if (saved && Array.isArray(saved.deck) && saved.deck.length > 0) {
    state.deck   = saved.deck;
    state.nextId = saved.nextId ?? (Math.max(...saved.deck.map(c => c.id)) + 1);
  } else {
    state.deck   = SEED_CARDS.map(c => ({ ...c }));
    state.nextId = SEED_CARDS.length + 1;
    saveToStorage();
  }

  renderManage();
  showView('manage');

  // ── Manage view ──
  document.getElementById('add-card-form')
    .addEventListener('submit', handleAddCard);

  // Event delegation: one listener handles clicks on all delete buttons
  document.getElementById('card-list')
    .addEventListener('click', e => {
      const btn = e.target.closest('.btn-delete');
      if (btn) handleDeleteCard(Number(btn.dataset.id));
    });

  document.getElementById('btn-start-solo')
    .addEventListener('click', startStudy);

  document.getElementById('btn-start-two')
    .addEventListener('click', startTwoPlayerSetup);

  document.getElementById('btn-home')
    .addEventListener('click', () => showView('manage'));

  // ── Solo study ──
  document.getElementById('card-scene')
    .addEventListener('click', flipStudyCard);

  document.getElementById('btn-correct')
    .addEventListener('click', () => advanceStudy(true));

  document.getElementById('btn-incorrect')
    .addEventListener('click', () => advanceStudy(false));

  document.getElementById('btn-end-study')
    .addEventListener('click', () => showView('manage'));

  // ── Two-player setup ──
  document.getElementById('two-player-form')
    .addEventListener('submit', e => {
      e.preventDefault();
      const p1 = document.getElementById('p1-name').value.trim() || 'Player 1';
      const p2 = document.getElementById('p2-name').value.trim() || 'Player 2';
      startTwoPlayerGame(p1, p2);
    });

  document.getElementById('btn-cancel-setup')
    .addEventListener('click', () => showView('manage'));

  // ── Two-player session ──
  document.getElementById('two-card-scene')
    .addEventListener('click', flipTwoPlayerCard);

  document.getElementById('two-btn-correct')
    .addEventListener('click', () => advanceTwoPlayer(true));

  document.getElementById('two-btn-incorrect')
    .addEventListener('click', () => advanceTwoPlayer(false));

  // ── Results ──
  document.getElementById('btn-results-home')
    .addEventListener('click', () => {
      showView('manage');
      renderManage();
    });

  document.getElementById('btn-study-again')
    .addEventListener('click', () => {
      if (state.lastMode === 'two') {
        const [p1, p2] = state.twoPlayer.players;
        startTwoPlayerGame(p1.name, p2.name);
      } else {
        startStudy();
      }
    });

  // ── Export / Import ──
  document.getElementById('btn-export')
    .addEventListener('click', exportDeck);

  document.getElementById('input-import')
    .addEventListener('change', e => {
      handleImport(e.target.files[0]);
      e.target.value = ''; // reset so the same file can be re-imported
    });

  // ── Keyboard ──
  document.addEventListener('keydown', handleKeydown);
}

document.addEventListener('DOMContentLoaded', init);
