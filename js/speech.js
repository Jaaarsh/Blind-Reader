// Text-to-speech and speech recognition, both from the free built-in Web
// Speech APIs — no cloud cost, works offline on most phones.

let currentRate = 1.0;
let preferredVoiceURI = '';
let speakingNow = false;
let onSpeechEnd = null; // resolves the active speak() promise

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
// into sentence-sized chunks avoids that and makes stop() feel instant.
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

/**
 * Speak text aloud. Interrupts anything currently being spoken.
 * Resolves when done speaking (or when interrupted).
 */
export function speak(text) {
  stopSpeaking();
  const chunks = chunkText(text);
  if (!chunks.length || !('speechSynthesis' in window)) return Promise.resolve();

  return new Promise(resolve => {
    speakingNow = true;
    let index = 0;
    let finished = false;

    const done = () => {
      if (finished) return;
      finished = true;
      speakingNow = false;
      onSpeechEnd = null;
      resolve();
    };
    onSpeechEnd = done;

    const next = () => {
      if (finished) return;
      if (index >= chunks.length) { done(); return; }
      const u = new SpeechSynthesisUtterance(chunks[index++]);
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

export function stopSpeaking() {
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  if (onSpeechEnd) onSpeechEnd();
}

// iOS/Safari populates the voice list asynchronously; poke it early.
if ('speechSynthesis' in window) {
  speechSynthesis.getVoices();
  speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices();
}

/* ---------------- Speech recognition (for the Ask feature) --------------- */

export function recognitionSupported() {
  return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

/**
 * Listen for one spoken phrase. Resolves with the transcript string,
 * or rejects on error / silence.
 */
export function listenOnce(lang = 'en') {
  return new Promise((resolve, reject) => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { reject(new Error('unsupported')); return; }
    const rec = new SR();
    rec.lang = lang;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    let settled = false;

    rec.onresult = e => {
      settled = true;
      resolve(e.results[0][0].transcript);
    };
    rec.onerror = e => { if (!settled) { settled = true; reject(new Error(e.error || 'recognition-error')); } };
    rec.onend = () => { if (!settled) { settled = true; reject(new Error('no-speech')); } };
    try { rec.start(); } catch (err) { if (!settled) { settled = true; reject(err); } }
  });
}
