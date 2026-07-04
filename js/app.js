// Blind Reader — main flow.
// One giant button: tap → photograph → Claude reads it → spoken aloud.

import { loadSettings } from './store.js';
import { startCamera, cameraRunning, captureFrame, fileToBase64Jpeg } from './camera.js';
import { speak, stopSpeaking, isSpeaking, configureSpeech, listenOnce, recognitionSupported } from './speech.js';
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
};

let state = 'idle'; // idle | working | listening
let lastImage = null;    // base64 JPEG of the last capture
let lastReading = '';    // last spoken content
let firstInteraction = true;

const HELP_TEXT =
  'Here is how Blind Reader works. Hold the phone about thirty centimeters above a page, sign, or label, ' +
  'with the back of the phone facing what you want to read. Tap anywhere on the top of the screen to take a picture and hear it read aloud. ' +
  'Tap again while it is talking to make it stop. ' +
  'At the bottom of the screen there are three wide buttons, side by side. ' +
  'The left button is Again, it repeats the last reading. ' +
  'The middle button is Ask, it lets you ask a question out loud about what was just read, for example, what is the dosage. ' +
  'The right button is this help. ' +
  'When a picture does not come out well, I will tell you how to move the phone. Take your time, and tap to try again.';

/* ------------------------------ speech + UI ------------------------------ */

function setBigState(text, busy = false) {
  el.bigState.textContent = text;
  el.readButton.classList.toggle('busy', busy);
}

function announce(text, { caption = true } = {}) {
  el.status.textContent = text;                 // screen-reader live region
  if (caption) el.caption.textContent = text;   // visible caption for helpers
  return speak(text);
}

/* --------------------------------- flow ---------------------------------- */

async function ensureReady() {
  // First gesture: unlock audio and start the camera.
  sounds.unlockAudio();
  const settings = loadSettings();
  configureSpeech({ rate: settings.speechRate, voiceURI: settings.voiceURI });
  if (firstInteraction) {
    firstInteraction = false;
    await startCamera(el.preview);
  }
}

async function captureAndRead() {
  if (state !== 'idle') return;
  await ensureReady();

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
      const extras = result.guidance ? ' ' + result.guidance : '';
      await announce(result.content + extras);
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
  await ensureReady();
  stopSpeaking();
  if (!lastReading) {
    announce('Nothing has been read yet. Point the camera and tap the top of the screen.');
    return;
  }
  announce(lastReading);
}

async function askQuestion() {
  if (state === 'working') return;
  await ensureReady();
  stopSpeaking();

  if (!lastImage) {
    announce('Read something first, then ask me about it.');
    return;
  }
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
    announce('I did not catch that. Press Ask and try again.');
    return;
  }

  el.askButton.setAttribute('aria-pressed', 'false');
  state = 'working';
  setBigState('Thinking…', true);
  el.caption.textContent = 'Q: ' + question;
  sounds.startWorkingTicks();

  try {
    const answer = await askAboutImage(lastImage, lastReading, question);
    sounds.stopWorkingTicks();
    state = 'idle';
    sounds.successDing();
    setBigState('Tap to read');
    await announce(answer);
  } catch (err) {
    sounds.stopWorkingTicks();
    state = 'idle';
    sounds.errorBuzz();
    setBigState('Tap to read');
    await announce(explainError(err));
  }
}

async function speakHelp() {
  await ensureReady();
  stopSpeaking();
  announce(HELP_TEXT);
}

/* ------------------------------ wiring ----------------------------------- */

el.readButton.addEventListener('click', captureAndRead);
el.againButton.addEventListener('click', repeatLast);
el.askButton.addEventListener('click', askQuestion);
el.helpButton.addEventListener('click', speakHelp);

// Long-press anywhere on the main surface also speaks help.
let pressTimer = null;
el.readButton.addEventListener('pointerdown', () => {
  pressTimer = setTimeout(() => { pressTimer = null; speakHelp(); }, 900);
});
for (const evt of ['pointerup', 'pointercancel', 'pointerleave']) {
  el.readButton.addEventListener(evt, () => {
    if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
  });
}

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

// Greet on first load. Speech can only start after a gesture on most phones,
// so also show it on screen; the first tap will speak from then on.
window.addEventListener('load', () => {
  setBigState('Tap to read');
  el.caption.textContent = 'Blind Reader ready. Tap anywhere above to read. Hold your finger down for spoken help.';
  el.status.textContent = el.caption.textContent;
  // Try to start the camera right away so the first read is instant; if the
  // permission prompt needs a gesture, ensureReady() retries on first tap.
  startCamera(el.preview).then(ok => { if (ok) firstInteraction = false; });
});
