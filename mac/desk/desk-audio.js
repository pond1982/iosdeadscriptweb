// These are the Writing Desk's original samples and effects-player levels.
const nativeLevels = new Map([
  ["key", -8],
  ["error", -8],
  ["desk-line-feed", -7],
  ["desk-carriage", -8],
]);

export function createDeskAudio() {
  const bytes = new Map();
  const buffers = new Map();
  const decoding = new Map();
  const voices = new Set();
  let pending = [];
  let context;
  let enabled = false;
  let closed = false;

  function fetchSample(name) {
    if (!bytes.has(name)) {
      const url = new URL("./media/" + name + ".wav", import.meta.url);
      bytes.set(name, fetch(url).then(response => {
        if (!response.ok) throw new Error("Unable to load desk sound");
        return response.arrayBuffer();
      }).catch(() => {
        bytes.delete(name);
        return null;
      }));
    }
    return bytes.get(name);
  }

  // Fetch on entry. Starting the real-time audio context waits for a gesture.
  for (const name of nativeLevels.keys()) fetchSample(name);

  function playVoice(name, time) {
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffers.get(name);
    gain.gain.value = 10 ** (nativeLevels.get(name) / 20);
    source.connect(gain).connect(context.destination);
    source.onended = () => {
      voices.delete(source);
      source.disconnect();
      gain.disconnect();
    };
    voices.add(source);
    source.start(time);
  }

  function flush() {
    if (!enabled || document.hidden || context?.state !== "running") return;
    if (!pending.length || !buffers.has(pending[0].name)) return;

    // Preserve the first strike on a cold load. A slow request should never
    // replay an entire line of stale keystrokes when the samples arrive.
    const now = performance.now();
    const origin = Math.max(now - 110, pending[0].at);
    const first = pending[0];
    while (pending.length && buffers.has(pending[0].name)) {
      const stroke = pending.shift();
      if (stroke !== first && stroke.at < origin) continue;
      playVoice(stroke.name, context.currentTime + Math.max(0, stroke.at - origin) / 1000);
    }
  }

  function prepare(name) {
    if (!context || buffers.has(name) || decoding.has(name)) return;
    decoding.set(name, fetchSample(name).then(async data => {
      if (!data || closed) return;
      const buffer = await context.decodeAudioData(data.slice(0));
      if (!closed) buffers.set(name, buffer);
    }).catch(() => {
      bytes.delete(name);
    }).finally(() => {
      decoding.delete(name);
      if (!buffers.has(name)) pending = pending.filter(stroke => stroke.name !== name);
      flush();
    }));
  }

  function activate() {
    if (!context) {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      try {
        context = new Audio({ latencyHint: "interactive" });
      } catch {
        return;
      }
      context.onstatechange = flush;
      for (const name of nativeLevels.keys()) prepare(name);
    }
    // iOS can interrupt an existing context after a call or an app switch.
    // Retry within the current key/tap gesture so the first resumed key lands.
    if (context.state !== "running") context.resume().then(flush).catch(() => {});
  }

  function silence() {
    pending.length = 0;
    for (const source of voices) source.stop();
    voices.clear();
  }

  function onHidden() {
    if (document.hidden) silence();
  }
  document.addEventListener("visibilitychange", onHidden);

  return {
    toggle(on) {
      if (closed) return;
      enabled = Boolean(on);
      if (enabled) activate();
      else silence();
    },
    play(name) {
      if (!enabled || closed || document.hidden || !nativeLevels.has(name)) return;
      activate();
      if (!context) return;
      prepare(name);
      if (pending.length >= 12) pending.splice(1, 1);
      pending.push({ name, at: performance.now() });
      flush();
    },
    destroy() {
      if (closed) return;
      enabled = false;
      closed = true;
      silence();
      document.removeEventListener("visibilitychange", onHidden);
      if (context) {
        context.onstatechange = null;
        context.close().catch(() => {});
      }
    },
  };
}
