import { SECTIONS } from './lessons.js';
import { createSheet, restoreSheet, restoreMarks, recordBest, accept, nextKeys, fingerCue, accuracy, weakKey, nextSheet, tick } from './engine.js';
import { mountMachine } from './machine.js';

const get = id => document.getElementById(id);
const input = get('desk-input');
const play = get('play-toggle');
const index = get('lessons');
const receipt = get('receipt');
const sound = get('sound-toggle');
const stage = get('stage');
const machine = mountMachine(stage);
const motion = matchMedia('(prefers-reduced-motion: reduce)');
const storageKey = 'dead-script.scribes-desk.v1';
const first = 'first-sitting';
const emptyInput = '\u200b'; // Mobile keyboards need a character to erase at the left margin.

const sheetId = (section, sheet) => section + '.' + sheet;
const sectionData = () => SECTIONS[state.section];
const sheetData = () => sectionData().sheets[state.sheet];
let hasStorage = true;
function stored() {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) || '{}');
    return value?.version === 1 ? value : {};
  } catch {
    return {};
  }
}
function validSlot(id, value) {
  const sheet = restoreSheet(value);
  if (!sheet) return null;
  if (!sheet.sample) return id === sheetId(sheet.section, sheet.sheet) ? sheet : null;
  const isSamplePage = (sheet.section === 0 && sheet.sheet === 1) || (sheet.section === 5 && sheet.sheet === 3);
  return id === first && isSamplePage ? sheet : null;
}

function savedSound(book) {
  if (book.sound !== false) return true;
  if (book.soundChosen === true) return false;
  // The original desk wrote its silent default just by visiting. Keep
  // established players' setting and give untouched desks the new default.
  return !Object.values(book.sheets || {}).some(sheet => sheet?.attempts > 0);
}

const book = stored();
const sessions = {};
for (const [id, value] of Object.entries(book.sheets || {})) {
  const sheet = validSlot(id, value);
  if (sheet) sessions[id] = sheet;
}
let marks = restoreMarks(book.marks);
let active = Object.hasOwn(sessions, book.active) ? book.active : first;
let state = sessions[active] || createSheet(0, 1, { sample: true });
let mode = state.done ? 'filed' : state.attempts ? 'paused' : 'ready';
let soundEnabled = savedSound(book);
let relaxed = book.relaxed === true;
let feedTimer = 0;
let composing = false;

function persist(kind = 'sheet') {
  if (kind === 'sheet') sessions[active] = state;
  try {
    const other = stored();
    for (const [id, score] of Object.entries(restoreMarks(other.marks))) {
      marks[id] = Math.max(marks[id] ?? 0, score);
    }
    localStorage.setItem(storageKey, JSON.stringify({
      version: 1, marks, active: kind === 'sheet' ? active : other.active,
      sound: kind === 'sound' ? soundEnabled : savedSound(other),
      soundChosen: kind === 'sound' || other.soundChosen === true,
      relaxed: kind === 'relaxed' ? relaxed : other.relaxed === true,
      sheets: kind === 'sheet' ? { ...(other.sheets || {}), [active]: state } : other.sheets || {},
    }));
  } catch {
    hasStorage = false;
    get('save-status').textContent = 'Practice is available for this visit. This browser could not save your place.';
  }
}

function node(tag, text, cls) {
  const item = document.createElement(tag);
  if (text !== undefined) item.textContent = text;
  if (cls) item.className = cls;
  return item;
}
function keyName(key) {
  if (key === ' ') return 'Space';
  if (key === '⌫') return 'Delete';
  return key;
}
function speak(message) { get('announcer').textContent = message; }
function resetInput() {
  input.value = emptyInput;
  input.setSelectionRange(input.value.length, input.value.length);
}
function visualProps() {
  const keys = nextKeys(state);
  return {
    line: state.prompt, typed: state.typed, expected: keys[0] || '', next: keys,
    history: state.lines.slice(0, state.line), correction: state.correctionPending,
    cover: mode === 'ready' && active === first && !state.attempts && state.section === 0,
    reducedMotion: motion.matches, targets: state.targets, selected: state.selected,
    fieldTime: state.fieldTime, fieldLimit: state.fieldLimit,
  };
}
function paintReadout() {
  const out = get('readout');
  out.replaceChildren();
  if (!state.prompt && state.targets.length) {
    state.targets.forEach((word, index) => {
      if (index) out.append(node('span', ' or ', 'word-divider'));
      out.append(node('span', word[0], 'focus-char'), word.slice(1));
    });
  } else if (state.correctionPending) {
    out.append(node('span', state.typed, 'stray'), ' ', state.prompt);
  } else {
    const pos = state.typed.length;
    out.append(node('span', state.typed, 'struck'));
    if (!state.done) {
      const next = state.prompt[pos];
      out.append(node('span', next === ' ' ? '␣' : next, 'focus-char'), state.prompt.slice(pos + 1));
    }
  }
  get('line-label').textContent = state.done ? 'Filed impression' : state.correctionPending ? 'Lift the stray letter' : !state.prompt ? 'Choose either word' : 'Copy the faded line';
}
function paintKeys(keys) {
  const holder = get('next-key');
  holder.replaceChildren();
  if (!keys.length) { holder.textContent = 'Sheet filed'; return; }
  keys.forEach((key, i) => {
    if (i) holder.append(node('span', 'or'));
    const cue = fingerCue(key);
    if (cue.shift) holder.append(node('kbd', (cue.shift.startsWith('left') ? 'Left' : 'Right') + ' Shift', 'modifier'), '+');
    const label = /^[a-z]$/i.test(cue.key) ? cue.key.toUpperCase() : keyName(cue.key);
    holder.append(node('kbd', label));
  });
}
function updateFeedback(message, kind = '') {
  const el = get('desk-feedback');
  el.dataset.kind = kind;
  el.textContent = message || (state.done ? 'Your impression is filed.' : state.correctionPending
    ? 'Press Delete or Backspace to lift the stray e. Then copy the note, starting with a capital E.'
    : mode === 'paused' ? 'Your place is held. Resume when you’re ready.'
    : active === first && state.section === 0 ? 'Use F and J with your index fingers. Tap Space with either thumb when a gap is marked.'
    : sheetData().hint.replace('Mac Delete', 'Delete or Backspace'));
}
function updateTimer() {
  if (state.fieldLimit) {
    const remaining = Math.ceil((state.fieldLimit - state.fieldTime) * (relaxed ? 2 : 1));
    const label = 'Pass ' + (state.fieldPasses + 1) + ' · ' + remaining + 's until the carriage returns';
    const timer = get('field-cycle');
    if (timer.textContent !== label) timer.textContent = label;
  }
}
function paint() {
  const keys = nextKeys(state);
  const trialHome = active === first && state.section === 0;
  get('file-name').textContent = active === first ? 'The first sitting' : 'File ' + String(state.section + 1).padStart(2, '0') + ' / ' + sectionData().title;
  get('sheet-title').textContent = active === first && !trialHome ? 'The clerk’s proof' : sheetData().title;
  get('sheet-brief').textContent = trialHome ? 'A property slip has come under the office door. Elias feeds a sheet into his typewriter to compare its marks with his own.' : sheetData().clue;
  get('notes-heading').textContent = get('sheet-title').textContent;
  get('sheet-help').textContent = sheetData().hint.replace('Mac Delete', 'Delete or Backspace');
  get('sheet-line').textContent = 'Line ' + (state.line + 1) + ' of ' + state.lines.length;
  let written = state.lines.slice(0, state.line).join('').length + (state.correctionPending ? 0 : state.typed.length);
  let total = state.lines.join('').length;
  if (sheetData().field) {
    const words = state.lines[0].split(' ');
    total = words.join('').length;
    written = words.filter(w => !state.targets.includes(w)).join('').length + (state.done ? 0 : state.typed.length);
  }
  get('line-progress').max = total;
  get('line-progress').value = written;
  get('sheet-percent').textContent = Math.round(written * 100 / total) + '%';
  stage.dataset.mode = mode;
  input.disabled = mode === 'filed' || mode === 'feeding';
  play.disabled = mode === 'feeding';
  const action = mode === 'filed' ? 'View finding' : mode === 'typing' ? 'Pause' : mode === 'paused' ? 'Resume typing' : mode === 'feeding' ? 'Feeding proof' : 'Start typing';
  play.textContent = action;
  play.dataset.action = mode === 'typing' ? 'pause' : 'start';
  if (mode !== 'typing' && mode !== 'feeding') play.append(node('span', ' →'));
  sound.disabled = false;
  get('sound-label').textContent = soundEnabled ? 'Sound on' : 'Sound off';
  sound.title = soundEnabled ? 'Mute typewriter sound' : 'Enable typewriter sound';
  sound.setAttribute('aria-pressed', String(soundEnabled));
  paintKeys(keys);
  paintReadout();
  machine.render(visualProps());
  const target = state.prompt || state.targets.join(' or ');
  const finger = keys.map(k => {
    const cue = fingerCue(k);
    const side = cue.eitherThumb ? 'either thumb' : (cue.fingers[0] || '').replace('_', ' ') + ' finger';
    const shift = cue.shift ? ' with ' + cue.shift.split('_')[0] + ' Shift' : '';
    return keyName(k) + ', ' + side + shift;
  }).join(' or ');
  get('input-description').textContent = state.done ? 'Sheet complete.' : 'Copy ' + target + '. Next key ' + finger + '.';
  get('tempo').hidden = !state.fieldLimit;
  get('field-cycle').hidden = !state.fieldLimit;
  get('relaxed-pace').checked = relaxed;
  updateTimer();
  updateFeedback();
}
function begin() {
  if (state.done || mode === 'feeding') return;
  mode = 'typing';
  machine.sound(soundEnabled);
  resetInput();
  paint();
  input.focus({ preventScroll: true });
  runFieldClock();
}
function pause() {
  if (mode !== 'typing') return;
  mode = 'paused';
  stage.dataset.mode = mode;
  play.textContent = 'Resume typing →';
  play.dataset.action = 'start';
}
function choose(id, section, sheet, repeat = false) {
  clearTimeout(feedTimer);
  const remote = stored();
  const previous = validSlot(id, remote.sheets?.[id]) || sessions[id];
  active = id;
  if (repeat || !previous || previous.done) {
    state = createSheet(section, sheet, { sample: id === first, previousFirst: previous?.lines[0] });
  } else {
    state = previous;
  }
  mode = 'ready';
  if (receipt.open) receipt.close();
  if (index.open) index.close();
  persist();
  begin();
  speak(get('input-description').textContent);
}
function showResult() {
  const sample = active === first;
  const last = state.sheet === sectionData().sheets.length - 1;
  get('result-game').hidden = !(sample || !nextSheet(state.section, state.sheet));
  get('result-kicker').textContent = sample ? 'The first sitting' : 'Filed in the casebook';
  get('result-title').textContent = sample ? 'The corrected proof' : sheetData().title;
  get('result-clue').textContent = sample ? 'The double-struck J matched my office carbon. I folded the clerk’s note into my coat. A light still burned in the archive.' : last ? sectionData().finding : sheetData().clue;
  const weak = weakKey(state);
  get('result-score').textContent = accuracy(state) + '% ' + (sample ? 'proof accuracy' : 'accuracy') + ' · ' + state.attempts + ' keystrokes' + (weak ? ' · Practice ' + keyName(weak) : '');
  get('next-sheet').textContent = sample ? 'Begin the full course →' : nextSheet(state.section, state.sheet) ? 'Next sheet →' : 'Back to lessons →';
  get('repeat-sheet').textContent = sample ? 'Repeat first sitting' : 'Repeat sheet';
  if (!receipt.open) receipt.showModal();
  get('next-sheet').focus();
}
function takeKey(key) {
  if (mode !== 'typing') return;
  const result = accept(state, key);
  if (result === 'none') return;
  const physicalKey = (key === 'Backspace' || key === 'Delete') ? '⌫' : key;
  machine.strike(physicalKey, { correct: result !== 'miss' });
  if (result === 'sheet_done' && state.sample && state.section === 0) {
    machine.feed({ sheet: true });
    state = createSheet(5, 3, { sample: true });
    mode = 'feeding';
    // Keep the real input focused through the sheet change on touch keyboards.
    persist();
    play.disabled = true;
    play.textContent = 'Feeding proof';
    speak('The clerk’s proof is rolling into the typewriter.');
    feedTimer = setTimeout(() => {
      mode = document.activeElement === input && !document.hidden ? 'typing' : 'paused';
      paint();
      speak('The clerk’s proof. Press Delete or Backspace to lift the stray e. Copy ' + state.prompt);
    }, motion.matches ? 0 : 520);
    return;
  }
  if (result === 'sheet_done') {
    mode = 'filed';
    marks = recordBest(marks, state);
    machine.feed({ filed: true });
    persist();
    paint();
    showResult();
    return;
  }
  if (result === 'line_done') machine.feed();
  paint();
  if (result === 'miss') {
    const message = state.correctionPending ? 'Lift the stray e with Delete or Backspace before you type.' : 'Try ' + nextKeys(state).map(keyName).join(' or ') + ' again. Your letters are still on the page.';
    updateFeedback(message, 'miss');
    speak(message);
  } else if (result === 'line_done') {
    speak('Next line. ' + get('input-description').textContent);
  } else if (result === 'erase' && !state.typed) {
    speak(get('input-description').textContent);
  }
  runFieldClock();
  persist();
}

function showIndex() {
  if (index.open) return;
  pause();
  if (receipt.open) receipt.close();
  const catalog = get('course-index');
  catalog.replaceChildren();
  get('filed-count').textContent = Object.keys(marks).length + ' of 33 sheets filed. Open any file to practise its lessons.';
  SECTIONS.forEach((section, s) => {
    const group = node('details');
    group.open = s === (active === first ? 0 : state.section);
    group.append(node('summary', section.title), node('p', section.story));
    const list = node('ol');
    section.sheets.forEach((lesson, i) => {
      const id = sheetId(s, i);
      const item = node('li');
      const button = node('button', lesson.title);
      button.type = 'button';
      if (id === active) button.setAttribute('aria-current', 'true');
      const bookmarked = sessions[id];
      const caption = marks[id] !== undefined ? 'Filed · ' + marks[id] + '%' : bookmarked?.attempts ? 'Resume' : String(i + 1).padStart(2, '0');
      button.append(node('span', caption, 'sheet-mark'));
      button.addEventListener('click', () => choose(id, s, i));
      item.append(button);
      list.append(item);
    });
    group.append(list);
    catalog.append(group);
  });
  index.showModal();
  index.querySelector('[data-close]').focus({ preventScroll: true });
}
function openIndex() {
  if (location.hash !== '#lessons') history.pushState({ deskIndex: true }, '', '#lessons');
  showIndex();
}
get('open-index').addEventListener('click', event => {
  if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  openIndex();
});
window.addEventListener('hashchange', () => {
  if (location.hash === '#lessons') showIndex();
  else if (index.open) index.close();
});
index.addEventListener('close', () => {
  if (location.hash !== '#lessons') return;
  if (history.state?.deskIndex) history.back();
  else history.replaceState(null, '', location.pathname + location.search);
});
get('open-first').addEventListener('click', () => choose(first, 0, 1));
get('repeat-sheet').addEventListener('click', () => active === first ? choose(first, 0, 1, true) : choose(active, state.section, state.sheet, true));
get('next-sheet').addEventListener('click', () => {
  const next = active === first ? { section: 0, sheet: 0 } : nextSheet(state.section, state.sheet);
  if (next) choose(sheetId(next.section, next.sheet), next.section, next.sheet);
  else openIndex();
});
const notes = get('sheet-notes');
get('open-notes').addEventListener('click', () => {
  pause();
  notes.showModal();
  notes.querySelector('[data-close]').focus({ preventScroll: true });
});
for (const modal of [index, receipt, notes]) {
  modal.querySelector('[data-close]').addEventListener('click', () => modal.close());
  modal.addEventListener('click', event => {
    if (event.target !== modal) return;
    const box = modal.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) modal.close();
  });
}

play.addEventListener('click', () => {
  if (mode === 'filed') showResult();
  else if (mode === 'typing') { pause(); play.focus(); }
  else begin();
});
stage.addEventListener('click', () => {
  if (mode === 'filed') showResult();
  else begin();
});
get('relaxed-pace').addEventListener('change', event => {
  relaxed = event.target.checked;
  updateTimer();
  persist('relaxed');
});
sound.addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  machine.sound(soundEnabled);
  paint();
  persist('sound');
});
input.addEventListener('focus', () => {
  if (mode === 'ready' || mode === 'paused') begin();
});
input.addEventListener('blur', event => {
  if (event.relatedTarget !== play) pause();
});
document.addEventListener('focusin', event => {
  if (event.target !== play && event.target !== input) pause();
});
input.addEventListener('keydown', event => {
  if (event.isComposing || event.keyCode === 229 || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    pause();
    play.focus();
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    return;
  }
  if (/^[ -~]$/.test(event.key) || event.key === 'Backspace' || event.key === 'Delete') {
    event.preventDefault();
    if (!event.repeat) takeKey(event.key);
    resetInput();
  }
});
function insertText(value) {
  for (const ch of value.replaceAll('’', "'").replaceAll('‘', "'").replaceAll('“', '"').replaceAll('”', '"')) takeKey(ch);
}
input.addEventListener('beforeinput', event => {
  if (composing || event.isComposing || !event.cancelable) return;
  if (event.inputType.startsWith('delete')) {
    event.preventDefault(); takeKey('Backspace'); resetInput();
  } else if (event.inputType === 'insertText') {
    event.preventDefault(); insertText(event.data || ''); resetInput();
  } else if (!event.inputType.includes('Composition')) {
    event.preventDefault();
  }
});
input.addEventListener('compositionstart', () => { composing = true; });
input.addEventListener('compositionend', () => { composing = false; });
input.addEventListener('input', event => {
  if (composing || event.isComposing) return;
  const value = input.value.replaceAll(emptyInput, '');
  if (event.inputType.startsWith('delete')) takeKey('Backspace');
  else if (event.inputType === 'insertText' || event.inputType.includes('Composition')) insertText(value || event.data || '');
  resetInput();
});
for (const event of ['paste', 'drop']) input.addEventListener(event, e => e.preventDefault());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { pause(); input.blur(); }
});
window.addEventListener('storage', event => {
  if (event.key !== storageKey) return;
  const latest = stored();
  marks = restoreMarks(latest.marks);
  for (const [id, value] of Object.entries(latest.sheets || {})) {
    const saved = validSlot(id, value);
    if (saved) sessions[id] = saved;
  }
  if (mode !== 'typing' && mode !== 'feeding' && sessions[active] && !receipt.open) {
    state = sessions[active];
    mode = state.done ? 'filed' : state.attempts ? 'paused' : 'ready';
    paint();
  }
});
motion.addEventListener('change', () => machine.render(visualProps()));
let clockPending = false;
function runFieldClock() {
  if (clockPending || !state.fieldLimit || !state.fieldStarted) return;
  let last = performance.now();
  function advance(now) {
    if (mode !== 'typing' || document.activeElement !== input || document.hidden || !state.fieldLimit || !state.fieldStarted) {
      clockPending = false;
      return;
    }
    tick(state, Math.min(.3, (now - last) / 1000), relaxed);
    last = now;
    updateTimer();
    if (motion.matches) {
      setTimeout(() => advance(performance.now()), 200);
    } else {
      machine.render(visualProps());
      requestAnimationFrame(advance);
    }
  }
  clockPending = true;
  requestAnimationFrame(advance);
}
const explore = get('explore-menu');
document.addEventListener('click', event => {
  if (!explore.open) return;
  if (!explore.contains(event.target) || event.target.closest('.explore-links a')) explore.open = false;
});
explore.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  explore.open = false;
  get('explore-toggle').focus();
  event.preventDefault();
});

for (const link of document.querySelectorAll('[data-practice-file]')) {
  link.addEventListener('click', event => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const file = Number(link.dataset.practiceFile);
    const sheet = Number(link.dataset.practiceSheet ?? 0);
    if (!Number.isInteger(file) || !Number.isInteger(sheet) || !SECTIONS[file]?.sheets[sheet]) return;
    event.preventDefault();
    history.replaceState(null, '', location.pathname + location.search);
    choose(sheetId(file, sheet), file, sheet);
    window.scrollTo({ top: 0, behavior: 'instant' });
  });
}

const full = get('fullscreen-toggle');
const root = document.documentElement;
const enterScreen = root.requestFullscreen || root.webkitRequestFullscreen;
const leaveScreen = document.exitFullscreen || document.webkitExitFullscreen;
const fullscreenElement = () => document.fullscreenElement || document.webkitFullscreenElement;
function syncScreen() {
  const on = Boolean(fullscreenElement());
  const label = on ? 'Exit full screen' : 'Full screen';
  full.setAttribute('aria-pressed', String(on));
  full.setAttribute('aria-label', label);
  full.title = label;
  get('fullscreen-label').textContent = label;
  root.toggleAttribute('data-desk-fullscreen', on);
}
if ((document.fullscreenEnabled || document.webkitFullscreenEnabled) && enterScreen && leaveScreen) {
  full.hidden = false;
  syncScreen();
  full.addEventListener('click', async () => {
    const status = get('screen-status');
    status.textContent = '';
    try {
      if (fullscreenElement()) {
        await leaveScreen.call(document);
      } else {
        window.scrollTo({ top: 0, behavior: 'instant' });
        await enterScreen.call(root);
      }
    } catch {
      status.textContent = 'Full screen is unavailable in this window. You can keep typing here.';
    }
    syncScreen();
  });
  document.addEventListener('fullscreenchange', syncScreen);
  document.addEventListener('webkitfullscreenchange', syncScreen);
}
const mast = document.querySelector('.desk-mast');
new ResizeObserver(() => {
  document.body.style.setProperty('--mast-actual', mast.getBoundingClientRect().height + 'px');
}).observe(mast);

// A software keyboard can cover part of Safari’s layout viewport.
const viewport = window.visualViewport;
if (viewport) {
  function fitKeyboard() {
    const wasOpen = document.body.classList.contains('keyboard-open');
    const open = document.activeElement === input && Math.abs(viewport.scale - 1) < .03 &&
      window.innerHeight - viewport.height > 100;
    document.body.classList.toggle('keyboard-open', open);
    if (open) {
      document.body.style.setProperty('--usable-view', viewport.height + 'px');
      if (!wasOpen) requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    } else {
      document.body.style.removeProperty('--usable-view');
    }
  }
  viewport.addEventListener('resize', fitKeyboard);
  input.addEventListener('focus', fitKeyboard);
  input.addEventListener('blur', fitKeyboard);
}

resetInput();
paint();
if (!sessions[active]) persist();
if (location.hash === '#lessons') showIndex();
