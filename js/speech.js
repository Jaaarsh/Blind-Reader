// Text-to-speech and speech recognition, both from the free built-in Web
// Speech APIs — no cloud cost, works offline on most phones.
//
// Readings are spoken as "resumable" runs: if the user taps to stop mid-page,
// the position is remembered so "Again" continues from that sentence instead
// of starting the whole page over.

let currentRate = 1.0;
let preferredVoiceURI = '';
let speakingNow = false;
let onSpeechEnd = null;  // interrupts the active run
let resumable = null;    // { chunks, index } of the last stoppable reading
let activeRun = null;    // the run currently being spoken

export function configureSpeech({ rate, voiceURI } = {}) {
  if (rate) currentRate = rate;
  if (voiceURI !== undefined) preferredVoiceURI = voiceURI;
}

export function isSpeaking() {
  return speakingNow;
}

function pickVoice() {
  const voices = speechSynthesis.getVoices();
  if (!voices.length) return null;
  if (preferredVoiceURI) {
    const match = voices.find(v => v.voiceURI === preferredVoiceURI);
    if (match) return match;
  }
  return null; // let the engine pick its default
}

// Long utterances get cut off on several engines (notably Chrome); splitting
// into sentence-sized chunks avoids that, makes stop() feel instant, and
// gives us natural resume points.
function chunkText(text) {
  const clean = String(text).replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const sentences = clean.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) || [clean];
  const chunks = [];
  let buf = '';
  for (const s of sentences) {
    if ((buf + s).length > 200 && buf) { chunks.push(buf.trim()); buf = ''; }
    buf += s;
    // Very long sentence with no punctuation: hard-split on commas/spaces.
    while (buf.length > 280) {
      let cut = buf.lastIndexOf(',', 260);
      if (cut < 120) cut = buf.lastIndexOf(' ', 260);
      if (cut < 120) cut = 260;
      chunks.push(buf.slice(0, cut + 1).trim());
      buf = buf.slice(cut + 1);
    }
  }
  if (buf.trim()) chunks.push(buf.trim());
  return chunks;
}

function runChunks(run) {
  if (!run.chunks.length || !('speechSynthesis' in window)) return Promise.resolve();
  return new Promise(resolve => {
    speakingNow = true;
    activeRun = run;
    let finished = false;

    const done = naturally => {
      if (finished) return;
      finished = true;
      speakingNow = false;
      if (activeRun === run) activeRun = null;
      onSpeechEnd = null;
      if (naturally && run === resumable) resumable = null; // fully read out
      resolve();
    };

    // Interruption: remember the chunk that was cut off so resume repeats it.
    onSpeechEnd = () => {
      if (run === resumable && run.index > 0) run.index -= 1;
      done(false);
    };

    const next = () => {
      if (finished) return;
      if (run.index >= run.chunks.length) { done(true); return; }
      const u = new SpeechSynthesisUtterance(run.chunks[run.index]);
      run.index += 1;
      u.rate = currentRate;
      const voice = pickVoice();
      if (voice) u.voice = voice;
      u.onend = next;
      u.onerror = next;
      speechSynthesis.speak(u);
    };
    next();
  });
}

/**
 * Speak text aloud, interrupting anything currently being spoken.
 * Pass { resumable: true } for content readings so a stop can be resumed.
 * Resolves when done speaking (or when interrupted).
 */
export function speak(text, { resumable: isResumable = false } = {}) {
  stopSpeaking();
  const run = { chunks: chunkText(text), index: 0 };
  if (isResumable) resumable = run;
  return runChunks(run);
}

export function stopSpeaking() {
  if (onSpeechEnd) onSpeechEnd();
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}

/** True when a reading was stopped partway and can be continued. */
export function hasPendingReading() {
  return Boolean(!speakingNow && resumable && resumable.index < resumable.chunks.length);
}

/** True while the resumable reading itself is the thing currently speaking. */
export function isReadingActive() {
  return Boolean(speakingNow && activeRun && activeRun === resumable);
}

/** Continue the interrupted reading from where it stopped. */
export function resumeReading() {
  if (!resumable) return Promise.resolve();
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  return runChunks(resumable);
}

// iOS/Safari populates the voice list asynchronously; poke it early.
if ('speechSynthesis' in window) {
  speechSynthesis.getVoices();
  speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices();
  // Some engines silently pause when the screen blanks; nudge them back.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      try { speechSynthesis.resume(); } catch {}
    }
  });
}

/* ---------------- Speech recognition (for the Ask feature) --------------- */

export function recognitionSupported() {
  return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

/**
 * Listen for one spoken phrase. Resolves with the transcript string,
 * or rejects on error / silence.
 *
 * The browser gives up after only a few seconds of silence, which is too
 * fast for an elderly speaker gathering their thoughts — so silence is
 * retried quietly a few times before we report failure, roughly tripling
 * the time available to start talking.
 */
export function listenOnce(lang = 'en', { retries = 2 } = {}) {
  return new Promise((resolve, reject) => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { reject(new Error('unsupported')); return; }
    let attempts = 0;

    const tryOnce = () => {
      const rec = new SR();
      rec.lang = lang;
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      let settled = false;

      const retryOrFail = reason => {
        if (settled) return;
        settled = true;
        if ((reason === 'no-speech' || reason === 'aborted') && attempts < retries) {
          attempts += 1;
          tryOnce(); // keep listening quietly — they may just need a moment
        } else {
          reject(new Error(reason));
        }
      };

      rec.onresult = e => {
        settled = true;
        resolve(e.results[0][0].transcript);
      };
      rec.onerror = e => retryOrFail(e.error || 'recognition-error');
      rec.onend = () => retryOrFail('no-speech');
      try { rec.start(); } catch { retryOrFail('recognition-error'); }
    };
    tryOnce();
  });
}
