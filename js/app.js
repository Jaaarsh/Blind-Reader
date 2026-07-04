// Blind Reader — main flow.
// One giant button: tap → photograph → Claude reads it → spoken aloud.
// Hardened for solo use by an elderly, completely blind user: the app must
// never go silent, never get stuck, and never let them fall out of it.

import { loadSettings, saveSettings } from './store.js';
import { startCamera, cameraRunning, captureFrame, fileToBase64Jpeg } from './camera.js';
import {
  speak, stopSpeaking, isSpeaking, configureSpeech,
  hasPendingReading, resumeReading, isReadingActive,
  listenOnce, recognitionSupported,
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
let resumeHintsGiven = 0; // "press Again to continue" nudges per session
let askHistory = [];     // recent Ask exchanges, so follow-up questions work

const HELP_TEXT =
  'Here is how Blind Reader works. Hold the phone about a foot above a page, sign, or label, ' +
  'with the back of the phone facing what you want to read. Tap once anywhere on the top of the screen to take a picture and hear it read aloud. ' +
  'Tap again while it is talking to make it stop. ' +
  'Along the bottom edge of the screen there are three wide buttons, side by side. ' +
  'The left button is Again. It continues from where the voice stopped, or repeats the reading. ' +
  'The middle button is Ask. Press it any time and ask a question out loud about whatever the camera is pointed at, for example, what page is this book open to, or what is the dosage. You can also ask about things that are not on the page, and I will answer from general knowledge and say so. ' +
  'The right button is this help. ' +
  'To make the voice talk faster, slide one finger up the screen. To slow it down, slide down. ' +
  'On a computer keyboard, the space bar reads or stops the voice, Enter continues, the letter A asks, the letter H is help, and the up and down arrows change the speed. ' +
  'When a picture does not come out well, I will tell you how to move the phone. Take your time, and tap to try again.';

const KEY_GUIDE =
  'Keyboard controls. The space bar takes a picture and reads it, or stops the voice. ' +
  'Enter continues the reading or repeats it. The letter A asks a question. The letter H speaks the help. ' +
  'The up and down arrow keys make the voice faster or slower.';

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
    await startCamera(el.preview, settings.cameraId);
  }
}

// A blind user can't see the battery icon — warn out loud, once per session,
// when it's low and unplugged (supported on Android/Chrome; silent elsewhere).
let batteryChecked = false;
async function warnIfBatteryLow() {
  if (batteryChecked || !navigator.getBattery) return false;
  batteryChecked = true;
  try {
    const battery = await navigator.getBattery();
    if (battery.level <= 0.15 && !battery.charging) {
      await announce(
        `One note before we start: the battery is at ${Math.round(battery.level * 100)} percent. ` +
        'Please plug in the charger soon so the reader does not shut off. Now, tap to read.'
      );
      return true;
    }
  } catch { /* not supported here */ }
  return false;
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

  if (await warnIfBatteryLow()) return;

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
    const started = await startCamera(el.preview, loadSettings().cameraId);
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
  if (state === 'listening') return;
  await ensureReady();

  // Pressing Again while the reading itself is playing restarts it (below).
  // In every other case — silence, or some other speech like an Ask answer
  // playing — a paused reading continues from the interrupted sentence.
  const readingWasPlaying = isReadingActive();
  stopSpeaking();
  if (!readingWasPlaying && hasPendingReading()) {
    el.status.textContent = 'Continuing.';
    await speak('Continuing.');
    await resumeReading();
    return;
  }
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
  if (cameraRunning() || await startCamera(el.preview, loadSettings().cameraId)) {
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
      history: askHistory,
      question,
    });
    if (currentImage) lastImage = currentImage;
    askHistory.push({ q: question, a: answer.slice(0, 800) });
    if (askHistory.length > 8) askHistory.shift();
    sounds.stopWorkingTicks();
    state = 'idle';
    sounds.successDing();
    setBigState('Tap to read');
    // Spoken non-resumable on purpose: a paused reading keeps its place, so
    // "Again" continues the book where it left off, not the answer.
    await announce(answer);
    if (hasPendingReading() && resumeHintsGiven < 2) {
      resumeHintsGiven += 1;
      await speak('To continue the reading where it stopped, press the left button, Again.');
    }
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

// Keyboard controls, so the whole app works from a PC with a webcam:
// Space = read/stop, Enter = again, A = ask, H = help, arrows = speed.
// Any other key speaks the key guide, so he can never be lost at a keyboard.
let lastKeyGuide = 0;
window.addEventListener('keydown', e => {
  const tag = (e.target && e.target.tagName) || '';
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  if (e.ctrlKey || e.altKey || e.metaKey) return;
  if (e.repeat) { e.preventDefault(); return; }

  // Blur any focused button so the browser doesn't also "click" it.
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();

  const k = e.key;
  if (k === ' ' || k === 'Spacebar') { e.preventDefault(); captureAndRead(); }
  else if (k === 'Enter') { e.preventDefault(); repeatLast(); }
  else if (k === 'a' || k === 'A') { e.preventDefault(); askQuestion(); }
  else if (k === 'h' || k === 'H' || k === '?') { e.preventDefault(); speakHelp(); }
  else if (k === 'ArrowUp') { e.preventDefault(); sounds.unlockAudio(); changeSpeed(+1); }
  else if (k === 'ArrowDown') { e.preventDefault(); sounds.unlockAudio(); changeSpeed(-1); }
  else if (k.length === 1 || k.startsWith('Arrow')) {
    // An unknown key must never be silence — teach the mapping instead.
    e.preventDefault();
    const now = Date.now();
    if (now - lastKeyGuide > 5000 && state !== 'listening') {
      lastKeyGuide = now;
      ensureReady().then(() => { stopSpeaking(); announce(KEY_GUIDE); });
    }
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
  startCamera(el.preview, loadSettings().cameraId).then(ok => { if (ok) firstInteraction = false; });
});
