// Setup page logic — used by a sighted helper, so it is a normal visual form.

import { loadSettings, saveSettings } from './store.js';

const $ = id => document.getElementById(id);
const settings = loadSettings();

$('api-key').value = settings.apiKey;
$('mode').value = settings.mode;
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
    apiKey: $('api-key').value.trim(),
    mode: $('mode').value,
    modelChoice: $('model').value,
    speechRate: Number($('rate').value),
    voiceURI: $('voice').value,
    language: $('language').value,
  };
}

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

  const s = collect();
  const useDirect = s.mode === 'direct' || (s.mode === 'auto' && s.apiKey);
  const body = {
    model: 'claude-haiku-4-5', // cheapest possible ping
    max_tokens: 20,
    messages: [{ role: 'user', content: 'Reply with the single word: ready' }],
  };

  try {
    let res;
    if (useDirect) {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': s.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify(body),
      });
    } else {
      res = await fetch('api/read', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    }
    if (res.ok) {
      out.className = 'ok';
      out.textContent = useDirect
        ? 'Success — the key works. Claude answered.'
        : 'Success — the server answered. Claude is connected.';
    } else {
      const detail = await res.json().catch(() => null);
      out.className = 'bad';
      out.textContent = `Failed (${res.status}): ${detail?.error?.message || 'check the key / server setup.'}`;
    }
  } catch {
    out.className = 'bad';
    out.textContent = useDirect
      ? 'Network error — could not reach the Claude API from this device.'
      : 'Network error — is the Blind Reader server running? (See README.)';
  }
});
