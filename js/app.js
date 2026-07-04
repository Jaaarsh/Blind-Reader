// Blind Reader — main flow.
// One giant button: tap → photograph → Claude reads it → spoken aloud.
// Hardened for solo use by an elderly, completely blind user: the app must
// never go silent, never get stuck, and never let them fall out of it.

import { loadSettings, saveSettings } from './store.js';
import { startCamera, cameraRunning, captureFrame, fileToBase64Jpeg } from './camera.js';
import {
  speak, stopSpeaking, isSpeaking, configureSpeech,
  hasPendingReading, resumeReading, listenOnce, recognitionSupported,
} from './speech.js';
import { readImage, askAboutImage, explainError } from './claude.js';
import * as sounds from './sounds.js';

const el = {
  readButton: document.getElementById('read-button'),
  againButton: document.getElementById('again-button'),
  askButton: document.getElementById('ask-button'),
  helpButton: document.getElementById('help-button'),
  bigState: document.getElementById('big-state'),
  caption: document.getElementById('caption'),
  status: document.getElementById('status'),
  preview: document.getElementById('preview'),
  fileFallback: document.getElementById('file-fallback'),
  settingsLink: document.getElementById('settings-link'),
};

const ONBOARD_KEY = 'blind-reader-onboarded-v1';

let state = 'idle';      // idle | working | listening
let lastImage = null;    // base64 JPEG of the last capture
let lastReading = '';    // last spoken content
let firstInteraction = true;
let pageHintsGiven = 0;  // "turn the page" nudges per session

const HELP_TEXT =
  'Here is how Blind Reader works. Hold the phone about a foot above a page, sign, or label, ' +
  'with the back of the phone facing what you want to read. Tap once anywhere on the top of the screen to take a picture and hear it read aloud. ' +
  'Tap again while it is talking to make it stop. ' +
  'Along the bottom edge of the screen there are three wide buttons, side by side. ' +
  'The left button is Again. It continues from where the voice stopped, or repeats the reading. ' +
  'The middle button is Ask. Press it any time and ask a question out loud about whatever the camera is pointed at, for example, what page is this book open to, or what is the dosage. ' +
  'The right button is this help. ' +
  'To make the voice talk faster, slide one finger up the screen. To slow it down, slide down. ' +
  'When a picture does not come out well, I will tell you how to move the phone. Take your time, and tap to try again.';

/* ------------------------------ speech + UI ------------------------------ */

function setBigState(text, busy = false) {
  el.bigState.textContent = text;
  el.readButton.classList.toggle('busy', busy);
}

function announce(text, { caption = true, resumable = false } = {}) {
  el.status.textContent = text;                 // screen-reader live region
  if (caption) el.caption.textContent = text;   // visible caption for helpers
  return speak(text, { resumable });
}

/* ------------------------- keep the screen awake ------------------------- */

let wakeLock = null;
async function keepAwake() {
  try {
    if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
  } catch { /* not critical */ }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !firstInteraction) keepAwake();
});

/* --------------------------------- flow ---------------------------------- */

async function ensureReady() {
  // First gesture: unlock audio, start the camera, hold the screen awake.
  sounds.unlockAudio();
  const settings = loadSettings();
  configureSpeech({ rate: settings.speechRate, voiceURI: settings.voiceURI });
  if (firstInteraction) {
    firstInteraction = false;
    keepAwake();
    await startCamera(el.preview);
  }
}

async function captureAndRead() {
  if (state === 'working') {
    // Never silent: a confused tap during processing gets a calm answer.
    speak('Still working. One moment.');
    return;
  }
  if (state === 'listening') return;
  await ensureReady();

  // Very first tap ever: explain the app instead of surprising them.
  if (!localStorage.getItem(ONBOARD_KEY)) {
    localStorage.setItem(ONBOARD_KEY, '1');
    setBigState('Tap to read');
    await announce('Welcome to Blind Reader. ' + HELP_TEXT + ' That is everything. Now, tap anywhere to read your first page.');
    return;
  }

  // A tap while speaking means "stop talking" — the next tap reads.
  if (isSpeaking()) {
    stopSpeaking();
    setBigState('Tap to read');
    return;
  }

  let image = null;
  if (cameraRunning()) {
    sounds.shutter();
    image = captureFrame();
  } else {
    // No live camera (permission denied / unsupported): use the native
    // camera app through the file input instead.
    const started = await startCamera(el.preview);
    if (started) {
      sounds.shutter();
      image = captureFrame();
    } else {
      announce('I could not open the camera directly. I will open your camera app instead. Take the picture, then confirm it.');
      el.fileFallback.click();
      return;
    }
  }

  if (!image) {
    sounds.errorBuzz();
    announce('The camera did not give me a picture. Please tap to try again.');
    return;
  }
  await processImage(image);
}

async function processImage(image) {
  state = 'working';
  setBigState('Reading…', true);
  el.caption.textContent = '';
  sounds.startWorkingTicks();
  announce('Reading.', { caption: false });

  try {
    const result = await readImage(image);
    sounds.stopWorkingTicks();
    state = 'idle';
    lastImage = image;

    if (result.readable && result.content) {
      lastReading = result.content;
      sounds.successDing();
      setBigState('Tap to read');
      let extras = result.guidance ? ' ' + result.guidance : '';
      if ((result.kind === 'book' || result.kind === 'document') && pageHintsGiven < 2) {
        pageHintsGiven += 1;
        extras += ' Turn the page and tap to continue.';
      }
      await announce(result.content + extras, { resumable: true });
    } else {
      sounds.errorBuzz();
      setBigState('Tap to try again');
      await announce(result.guidance || 'I could not read anything in that picture. Please adjust the phone and tap to try again.');
    }
  } catch (err) {
    sounds.stopWorkingTicks();
    state = 'idle';
    sounds.errorBuzz();
    setBigState('Tap to try again');
    await announce(explainError(err));
  }
}

async function repeatLast() {
  if (state === 'working') { speak('Still working. One moment.'); return; }
  await ensureReady();

  // Stopped mid-reading? Continue from that sentence instead of restarting.
  if (!isSpeaking() && hasPendingReading()) {
    el.status.textContent = 'Continuing.';
    await speak('Continuing.');
    await resumeReading();
    return;
  }

  stopSpeaking();
  if (!lastReading) {
    announce('Nothing has been read yet. Point the camera and tap the top of the screen.');
    return;
  }
  announce(lastReading, { resumable: true });
}

async function askQuestion() {
  if (state === 'working') { speak('Still working. One moment.'); return; }
  if (state === 'listening') return;
  await ensureReady();
  stopSpeaking();

  if (!recognitionSupported()) {
    announce('Voice questions are not supported in this browser. Try Chrome on Android or Safari on iPhone.');
    return;
  }

  state = 'listening';
  el.askButton.setAttribute('aria-pressed', 'true');
  setBigState('Listening…', true);
  await announce('What is your question?', { caption: false });
  sounds.listenCue();

  let question = '';
  try {
    question = await listenOnce(loadSettings().language);
  } catch {
    state = 'idle';
    el.askButton.setAttribute('aria-pressed', 'false');
    setBigState('Tap to read');
    sounds.errorBuzz();
    announce('I did not catch that. Press the middle button and try again.');
    return;
  }

  el.askButton.setAttribute('aria-pressed', 'false');

  // Photograph whatever is in front of the camera right now, so questions
  // like "what page is the book open to" work without reading first.
  let currentImage = null;
  if (cameraRunning() || await startCamera(el.preview)) {
    sounds.shutter();
    currentImage = captureFrame();
  }
  if (!currentImage && !lastImage) {
    sounds.errorBuzz();
    setBigState('Tap to read');
    state = 'idle';
    announce('The camera did not give me a picture to look at. Please try again.');
    return;
  }

  state = 'working';
  setBigState('Thinking…', true);
  el.caption.textContent = 'Q: ' + question;
  sounds.startWorkingTicks();

  try {
    const answer = await askAboutImage({
      currentImage: currentImage || lastImage,
      previousImage: lastImage,
      previousReading: lastReading,
      question,
    });
    if (currentImage) lastImage = currentImage;
    sounds.stopWorkingTicks();
    state = 'idle';
    sounds.successDing();
    setBigState('Tap to read');
    await announce(answer, { resumable: true });
  } catch (err) {
    sounds.stopWorkingTicks();
    state = 'idle';
    sounds.errorBuzz();
    setBigState('Tap to read');
    await announce(explainError(err));
  }
}

async function speakHelp() {
  if (state === 'listening') return;
  await ensureReady();
  stopSpeaking();
  announce(HELP_TEXT);
}

/* --------------------- speech speed by swiping ---------------------------- */

function changeSpeed(direction) {
  const settings = loadSettings();
  const next = Math.round(Math.min(2, Math.max(0.5, settings.speechRate + 0.1 * direction)) * 10) / 10;
  const atEdge = next === settings.speechRate;
  settings.speechRate = next;
  saveSettings(settings);
  configureSpeech({ rate: next });
  const label = direction > 0
    ? (atEdge ? 'This is the fastest speed.' : 'Faster.')
    : (atEdge ? 'This is the slowest speed.' : 'Slower.');
  // Spoken at the new rate, so the word itself is the demonstration.
  speak(label);
  el.status.textContent = label;
}

/* ------------------------------ wiring ----------------------------------- */

let press = null;        // pointer gesture tracking on the main surface
let suppressClick = false;
let helpTimer = null;

el.readButton.addEventListener('pointerdown', e => {
  press = { x: e.clientX, y: e.clientY, moved: false };
  helpTimer = setTimeout(() => { helpTimer = null; suppressClick = true; speakHelp(); }, 900);
});

el.readButton.addEventListener('pointermove', e => {
  if (!press) return;
  if (Math.abs(e.clientX - press.x) > 20 || Math.abs(e.clientY - press.y) > 20) {
    press.moved = true;
    if (helpTimer) { clearTimeout(helpTimer); helpTimer = null; }
  }
});

el.readButton.addEventListener('pointerup', e => {
  if (helpTimer) { clearTimeout(helpTimer); helpTimer = null; }
  if (!press) return;
  const dy = e.clientY - press.y;
  const dx = e.clientX - press.x;
  press = null;
  if (Math.abs(dy) > 70 && Math.abs(dy) > Math.abs(dx) * 1.5) {
    suppressClick = true;
    sounds.unlockAudio();
    changeSpeed(dy < 0 ? +1 : -1); // swipe up = faster
  }
});

el.readButton.addEventListener('pointercancel', () => {
  press = null;
  if (helpTimer) { clearTimeout(helpTimer); helpTimer = null; }
});

el.readButton.addEventListener('click', () => {
  if (suppressClick) { suppressClick = false; return; }
  captureAndRead();
});

el.againButton.addEventListener('click', repeatLast);
el.askButton.addEventListener('click', askQuestion);
el.helpButton.addEventListener('click', speakHelp);

// The Setup link is for sighted helpers. Guard it so a stray touch cannot
// dump a blind user onto a visual page: the first tap explains, a second
// deliberate tap within a few seconds opens it.
let setupArmedAt = 0;
el.settingsLink.addEventListener('click', e => {
  const now = Date.now();
  if (now - setupArmedAt < 4000) return; // second tap → navigate normally
  e.preventDefault();
  setupArmedAt = now;
  ensureReady().then(() =>
    announce('That is the setup link, meant for your sighted helper. Tap it again to open setup, or tap the middle of the screen to keep reading.')
  );
});

el.fileFallback.addEventListener('change', async () => {
  const file = el.fileFallback.files && el.fileFallback.files[0];
  el.fileFallback.value = '';
  if (!file) return;
  try {
    const image = await fileToBase64Jpeg(file);
    await processImage(image);
  } catch {
    sounds.errorBuzz();
    announce('I could not use that picture. Please tap to try again.');
  }
});

// Last-resort safety net: an unexpected crash must never leave silence.
let lastPanic = 0;
function panic() {
  const now = Date.now();
  if (now - lastPanic < 10000) return;
  lastPanic = now;
  try {
    sounds.stopWorkingTicks();
    sounds.errorBuzz();
    state = 'idle';
    setBigState('Tap to read');
    announce('Something went wrong inside the app. Please tap to try again, or close the app fully and open it again.');
  } catch { /* nothing left to do */ }
}
window.addEventListener('error', panic);
window.addEventListener('unhandledrejection', e => { e.preventDefault(); panic(); });

// A "#setup=..." fragment carries settings from a helper's setup link —
// opening the link configures this phone with zero typing.
function importSetupLink() {
  const match = location.hash.match(/#setup=([A-Za-z0-9_-]+)/);
  if (!match) return false;
  history.replaceState(null, '', location.pathname + location.search);
  try {
    const b64 = match[1].replace(/-/g, '+').replace(/_/g, '/');
    const imported = JSON.parse(decodeURIComponent(escape(atob(b64))));
    if (!imported || typeof imported !== 'object') return false;
    saveSettings({ ...loadSettings(), ...imported });
    return true;
  } catch {
    return false;
  }
}

// Greet on first load. Speech can only start after a gesture on most phones,
// so also show it on screen; the first tap will speak from then on.
window.addEventListener('load', () => {
  setBigState('Tap to read');
  if (importSetupLink()) {
    el.caption.textContent = 'Setup complete — this phone is connected. Tap anywhere above to read.';
    el.status.textContent = el.caption.textContent;
    // Speak the confirmation as soon as a gesture allows it.
    localStorage.removeItem(ONBOARD_KEY); // fresh phone → give the tour on first tap
  } else {
    el.caption.textContent = 'Blind Reader ready. Tap anywhere above to read. Hold your finger down for spoken help.';
    el.status.textContent = el.caption.textContent;
  }
  // Try to start the camera right away so the first read is instant; if the
  // permission prompt needs a gesture, ensureReady() retries on first tap.
  startCamera(el.preview).then(ok => { if (ok) firstInteraction = false; });
});
