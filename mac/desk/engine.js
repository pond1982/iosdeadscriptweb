// Character-by-character behavior of the office machine in the Mac game.
import { SECTIONS } from "./lessons.js";

const FINGER_KEYS = {
  left_little: "`1qaz",
  left_ring: "2wsx",
  left_middle: "3edc",
  left_index: "45rtfgvb",
  right_index: "67yuhjnm",
  right_middle: "8ik,",
  right_ring: "9ol.",
  right_little: "0-=p[]\\;'/⌫",
};
const SHIFTED = Object.fromEntries(
  [...'~!@#$%^&*()_+{}|:"<>?'].map((key, i) => [key, "`1234567890-=[]\\;',./"[i]])
);
const DELETE = "⌫";

export function fingerCue(ch) {
  const cue = { key: "", fingers: [], shift: "", eitherThumb: false };
  if (ch === " ") return { key: " ", fingers: ["left_thumb", "right_thumb"], shift: "", eitherThumb: true };
  if (typeof ch !== "string" || ch.length !== 1 || (ch !== DELETE && !/^[!-~]$/.test(ch))) return cue;
  const physical = SHIFTED[ch] ?? ch.toLowerCase();
  for (const [finger, keys] of Object.entries(FINGER_KEYS)) {
    if (keys.includes(physical)) {
      cue.key = physical;
      cue.fingers.push(finger);
      if (ch !== physical) cue.shift = finger.startsWith("left_") ? "right_little" : "left_little";
      break;
    }
  }
  return cue;
}

function sheetAt(section, sheet) {
  if (!Number.isInteger(section) || !Number.isInteger(sheet)) return undefined;
  return SECTIONS[section]?.sheets[sheet];
}

function shuffled(values) {
  const result = [...values];
  for (let end = result.length - 1; end > 0; end--) {
    const draw = Math.floor(Math.random() * (end + 1));
    [result[end], result[draw]] = [result[draw], result[end]];
  }
  return result;
}

function loadLine(state, page) {
  state.prompt = state.lines[state.line];
  state.typed = page.edit ?? "";
  state.correctionPending = !!page.edit;
  if (page.field) {
    state.targets = state.prompt.split(" ");
    state.prompt = state.targets.length === 1 ? state.targets[0] : "";
  }
}

export function createSheet(section, sheet, { sample = false, previousFirst = "" } = {}) {
  const page = sheetAt(section, sheet);
  if (!page) throw new RangeError("Unknown desk sheet");
  const warmups = shuffled(page.drills ?? []);
  const proofs = shuffled(page.pool);
  const first = warmups.length ? warmups : proofs;
  if (first.length > 1 && first[0] === previousFirst) {
    const swap = 1 + Math.floor(Math.random() * (first.length - 1));
    [first[0], first[swap]] = [first[swap], first[0]];
  }
  const lines = [...(sample ? warmups.slice(0, 1) : warmups), ...(sample || page.field ? proofs.slice(0, 1) : proofs)];
  const state = {
    section, sheet, sample, lines, line: 0, prompt: "", typed: "", correctionPending: false,
    targets: [], selected: "", done: false, attempts: 0, mistakes: 0, misses: {},
    fieldLimit: page.seconds ?? 0, fieldTime: 0, fieldPasses: 0, fieldStarted: false,
  };
  loadLine(state, page);
  return state;
}

export function nextKeys(state) {
  if (state.done) return [];
  if (state.correctionPending) return [DELETE];
  if (state.targets.length && !state.selected) return state.targets.map(word => word[0]);
  return [state.prompt[state.typed.length]];
}

function miss(state, key) {
  state.mistakes++;
  if (key) state.misses[key] = (state.misses[key] ?? 0) + 1;
  return "miss";
}

function erase(state) {
  if (!state.typed) return "none";
  if (state.correctionPending) {
    state.correctionPending = false;
    state.attempts++;
  }
  state.typed = state.typed.slice(0, -1);
  if (!state.typed && state.targets.length) {
    state.selected = "";
    state.prompt = state.targets.length === 1 ? state.targets[0] : "";
  }
  return "erase";
}

export function accept(state, key) {
  if (state.done) return "none";
  if (key === DELETE || key === "Backspace" || key === "Delete") return erase(state);
  if (typeof key !== "string" || !/^[ -~]$/.test(key)) return "none";
  state.attempts++;
  if (state.correctionPending) return miss(state, DELETE);
  if (state.targets.length && !state.selected) {
    const word = state.targets.find(target => target[0] === key);
    if (!word) return miss(state, state.targets.length === 1 ? state.targets[0][0] : "");
    state.prompt = word;
    state.selected = word;
  }
  const expected = state.prompt[state.typed.length];
  if (key !== expected) return miss(state, expected);
  state.typed += key;
  state.fieldStarted = true;
  if (state.typed.length < state.prompt.length) return "correct";
  if (state.selected) {
    state.targets = state.targets.filter(word => word !== state.selected);
    state.selected = "";
    if (state.targets.length) {
      state.prompt = state.targets.length === 1 ? state.targets[0] : "";
      state.typed = "";
      return "correct";
    }
  }
  if (state.line + 1 < state.lines.length) {
    state.line++;
    loadLine(state, sheetAt(state.section, state.sheet));
    return "line_done";
  }
  state.done = true;
  return "sheet_done";
}

export function accuracy(state) {
  return state.attempts ? Math.round(100 * (state.attempts - state.mistakes) / state.attempts) : 100;
}

export function weakKey(state) {
  let highest = 0;
  let result = "";
  for (const [key, count] of Object.entries(state.misses)) {
    if (count > highest) {
      result = key;
      highest = count;
    }
  }
  return result;
}

export function tick(state, deltaSeconds, relaxed = false) {
  if (state.done || !state.fieldStarted || !state.fieldLimit || !Number.isFinite(deltaSeconds)) return;
  state.fieldTime += Math.max(0, deltaSeconds) * (relaxed ? 0.5 : 1);
  state.fieldPasses += Math.floor(state.fieldTime / state.fieldLimit);
  state.fieldTime %= state.fieldLimit;
}

export function nextSheet(section, sheet) {
  if (!sheetAt(section, sheet)) return null;
  if (sheetAt(section, sheet + 1)) return { section, sheet: sheet + 1 };
  return sheetAt(section + 1, 0) ? { section: section + 1, sheet: 0 } : null;
}

const isRecord = value => value !== null && typeof value === "object" && !Array.isArray(value);
const isCount = value => Number.isSafeInteger(value) && value >= 0;

function validLines(lines, page, sample) {
  if (!Array.isArray(lines)) return false;
  const drills = page.drills ?? [];
  const drillCount = sample ? Math.min(drills.length, 1) : drills.length;
  const proofCount = sample || page.field ? 1 : page.pool.length;
  return lines.length === drillCount + proofCount && new Set(lines).size === lines.length &&
    lines.every((line, i) => (i < drillCount ? drills : page.pool).includes(line));
}

// Only authored prompts and reachable typing positions are restored. Invalid or
// older shapes can be safely treated as a fresh sheet by the caller.
export function restoreSheet(saved) {
  if (!isRecord(saved)) return null;
  const { section, sheet, sample, lines, line, typed, correctionPending, selected, targets, done } = saved;
  const page = sheetAt(section, sheet);
  if (!page || typeof sample !== "boolean" || !validLines(lines, page, sample)) return null;
  if (!isCount(line) || line >= lines.length || typeof typed !== "string" || !Array.isArray(targets) ||
      typeof done !== "boolean" || typeof correctionPending !== "boolean" || typeof saved.fieldStarted !== "boolean") return null;
  if (!isCount(saved.attempts) || !isCount(saved.mistakes) || saved.mistakes > saved.attempts || !isRecord(saved.misses)) return null;
  const misses = {};
  let knownMisses = 0;
  for (const [key, count] of Object.entries(saved.misses)) {
    if (!fingerCue(key).key || !isCount(count) || !count) return null;
    misses[key] = count;
    knownMisses += count;
  }
  if (knownMisses > saved.mistakes) return null;
  const fieldLimit = page.seconds ?? 0;
  if (!Number.isFinite(saved.fieldTime) || saved.fieldTime < 0 || !isCount(saved.fieldPasses)) return null;
  if (fieldLimit ? saved.fieldTime >= fieldLimit : saved.fieldTime !== 0 || saved.fieldPasses !== 0) return null;
  if (!saved.fieldStarted && (saved.fieldTime || saved.fieldPasses)) return null;
  let prompt = lines[line];
  if (page.field) {
    const words = prompt.split(" ");
    if (correctionPending || targets.length > words.length || new Set(targets).size !== targets.length ||
        targets.some(word => !words.includes(word)) || (done !== (targets.length === 0))) return null;
    if (done) {
      if (selected !== "" || !words.includes(typed)) return null;
      prompt = typed;
    } else if (selected) {
      if (!targets.includes(selected) || !typed) return null;
      prompt = selected;
    } else {
      if (selected !== "" || typed) return null;
      prompt = targets.length === 1 ? targets[0] : "";
    }
  } else if (targets.length || selected !== "" || (done && line !== lines.length - 1)) {
    return null;
  }
  if (correctionPending) {
    if (!page.edit || done || typed !== page.edit) return null;
  } else if (!prompt.startsWith(typed) || (done ? typed !== prompt : (prompt && typed === prompt))) {
    return null;
  }
  if (!saved.fieldStarted && (line > 0 || done || (typed && !correctionPending) ||
      (page.field && targets.length !== page.field))) return null;
  // Erasing and retyping can raise the count. A real bookmark always has at
  // least one successful strike for each completed impression or edit.
  let minimumStrikes;
  if (page.field) {
    const finishedWords = lines[line].split(" ").filter(word => !targets.includes(word));
    minimumStrikes = finishedWords.join("").length + (done ? 0 : typed.length);
  } else {
    const earlierImpressions = lines.slice(0, line).join("").length;
    const currentImpressions = correctionPending ? 0 : typed.length;
    const corrections = page.edit ? line + Number(!correctionPending) : 0;
    minimumStrikes = earlierImpressions + currentImpressions + corrections;
  }
  if (minimumStrikes > saved.attempts - saved.mistakes) return null;
  return {
    section, sheet, sample, lines: [...lines], line, prompt, typed, correctionPending, targets: [...targets], selected,
    done, attempts: saved.attempts, mistakes: saved.mistakes, misses,
    fieldLimit, fieldTime: saved.fieldTime, fieldPasses: saved.fieldPasses, fieldStarted: saved.fieldStarted,
  };
}

export function restoreMarks(value) {
  const marks = {};
  if (!isRecord(value)) return marks;
  SECTIONS.forEach((section, s) => section.sheets.forEach((_, i) => {
    const key = s + "." + i;
    if (Object.hasOwn(value, key) && isCount(value[key]) && value[key] <= 100) marks[key] = value[key];
  }));
  return marks;
}

export function recordBest(marks, state) {
  const result = restoreMarks(marks);
  if (state.done && !state.sample) {
    const key = state.section + "." + state.sheet;
    result[key] = Math.max(result[key] ?? 0, accuracy(state));
  }
  return result;
}
