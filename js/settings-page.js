// Setup page logic — used by a sighted helper, so it is a normal visual form.

import { loadSettings, saveSettings, PROVIDERS } from './store.js';
import { pingService } from './ping.js';

const $ = id => document.getElementById(id);
const settings = loadSettings();

$('provider').value = PROVIDERS[settings.provider] ? settings.provider : 'anthropic';
$('api-key').value = settings.apiKey;
$('server-code').value = settings.serverCode || '';
$('mode').value = settings.mode;

// Per-service labels: key instructions, model names, and whether the
// key-holding server option applies (Anthropic only).
function refreshProviderUI() {
  const p = PROVIDERS[$('provider').value] || PROVIDERS.anthropic;
  $('key-hint').textContent = p.keyHint + ' The key is stored only on this device.';
  const modelSelect = $('model');
  modelSelect.options[0].textContent = p.models.best.label;
  modelSelect.options[1].textContent = p.models.budget.label;
  $('model-hint').textContent = $('provider').value === 'google'
    ? 'On the free tier, Flash allows far more readings per day than Pro.'
    : 'Rough cost per photo: a few cents on Best quality, well under a cent on Lower cost.';
}
$('provider').addEventListener('change', refreshProviderUI);
refreshProviderUI();

// If a blind user lands here by accident, orient them out loud.
// (May be muted by autoplay rules on some phones; the giant back link and the
// double-tap guard on the main screen are the primary protections.)
try {
  const u = new SpeechSynthesisUtterance(
    'This is the setup page, meant for a sighted helper. To go back to the reader, tap the very top left of the screen.'
  );
  u.rate = Number(settings.speechRate) || 1;
  speechSynthesis.speak(u);
} catch { /* fine */ }
$('model').value = settings.modelChoice;
$('rate').value = settings.speechRate;
$('rate-value').textContent = Number(settings.speechRate).toFixed(1);
$('language').value = settings.language;

function populateVoices() {
  const voices = speechSynthesis.getVoices();
  const select = $('voice');
  while (select.options.length > 1) select.remove(1);
  for (const v of voices) {
    const opt = document.createElement('option');
    opt.value = v.voiceURI;
    opt.textContent = `${v.name} (${v.lang})`;
    if (v.voiceURI === settings.voiceURI) opt.selected = true;
    select.appendChild(opt);
  }
}
if ('speechSynthesis' in window) {
  populateVoices();
  speechSynthesis.onvoiceschanged = populateVoices;
}

async function populateCameras() {
  const select = $('camera');
  while (select.options.length > 1) select.remove(1);
  const devices = await navigator.mediaDevices.enumerateDevices();
  let i = 0;
  for (const d of devices) {
    if (d.kind !== 'videoinput') continue;
    i += 1;
    const opt = document.createElement('option');
    opt.value = d.deviceId;
    opt.textContent = d.label || `Camera ${i}`;
    if (d.deviceId === settings.cameraId) opt.selected = true;
    select.appendChild(opt);
  }
}

$('detect-cameras').addEventListener('click', async () => {
  // Camera labels only appear after permission is granted once.
  try {
    const s = await navigator.mediaDevices.getUserMedia({ video: true });
    s.getTracks().forEach(t => t.stop());
  } catch { /* denied — list may show unnamed entries */ }
  await populateCameras();
});
if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) populateCameras();

$('rate').addEventListener('input', () => {
  $('rate-value').textContent = Number($('rate').value).toFixed(1);
});

$('voice-test').addEventListener('click', () => {
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance('Hello. This is how Blind Reader will sound.');
  u.rate = Number($('rate').value);
  const chosen = speechSynthesis.getVoices().find(v => v.voiceURI === $('voice').value);
  if (chosen) u.voice = chosen;
  speechSynthesis.speak(u);
});

function collect() {
  return {
    ...settings,
    provider: $('provider').value,
    apiKey: $('api-key').value.trim(),
    serverCode: $('server-code').value.trim(),
    mode: $('mode').value,
    modelChoice: $('model').value,
    speechRate: Number($('rate').value),
    voiceURI: $('voice').value,
    language: $('language').value,
    cameraId: $('camera').value,
  };
}

$('link-button').addEventListener('click', () => {
  const payload = btoa(unescape(encodeURIComponent(JSON.stringify(collect()))))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const base = location.href.replace(/settings\.html.*$/, '');
  $('setup-link').value = `${base}#setup=${payload}`;
  $('link-box').hidden = false;
});

$('copy-link').addEventListener('click', async () => {
  const input = $('setup-link');
  input.select();
  try {
    await navigator.clipboard.writeText(input.value);
    $('copy-result').textContent = 'Copied. Paste it into a message to the phone.';
  } catch {
    document.execCommand('copy');
    $('copy-result').textContent = 'Copied (or select the text above and copy it).';
  }
  setTimeout(() => { $('copy-result').textContent = ''; }, 5000);
});

$('save-button').addEventListener('click', () => {
  saveSettings(collect());
  const out = $('save-result');
  out.textContent = 'Saved. The reader will use these settings from the next reading.';
  setTimeout(() => { out.textContent = ''; }, 4000);
});

$('test-button').addEventListener('click', async () => {
  const out = $('test-result');
  out.className = '';
  out.textContent = 'Testing…';
  saveSettings(collect()); // test what was typed, not what was saved earlier

  const result = await pingService(collect());
  if (result.ok) {
    out.className = 'ok';
    out.textContent = `Success — ${result.where} answered. You're connected.`;
  } else if (result.status === 0) {
    out.className = 'bad';
    out.textContent = `Network error — could not reach ${result.where} from this device.`;
  } else {
    out.className = 'bad';
    out.textContent = `Failed (${result.status}): ${result.message || 'check the key.'}`;
  }
});
