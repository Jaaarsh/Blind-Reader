// Helper's Guide page: one big button that checks the whole reader and
// reports in plain words. Written for an elderly sighted helper.

import { loadSettings, PROVIDERS, providerOf } from './store.js';
import { pingService } from './ping.js';

const $ = id => document.getElementById(id);

$('print-button').addEventListener('click', () => window.print());

function addResult(ok, text) {
  const line = document.createElement('p');
  line.className = 'check-line ' + (ok === true ? 'good' : ok === false ? 'bad' : 'busy');
  line.textContent = (ok === true ? '✅ ' : ok === false ? '❌ ' : '⏳ ') + text;
  $('check-results').appendChild(line);
  return line;
}

$('check-button').addEventListener('click', async () => {
  const out = $('check-results');
  out.innerHTML = '';
  const settings = loadSettings();
  const provider = providerOf(settings);
  let problems = 0;

  // 1. Is the reading service set up on this device?
  const serverMode = provider === 'anthropic' && settings.mode === 'server';
  if (settings.apiKey || serverMode) {
    addResult(true, `The reading service is set up on this device (${PROVIDERS[provider].label.split(' (')[0]}).`);
  } else {
    problems += 1;
    addResult(false, 'No key is saved on this device. Open Setup and paste the API key, or open the setup link on this device.');
  }

  // 2. Internet.
  let online = navigator.onLine;
  if (online) {
    try {
      await fetch('manifest.webmanifest?check=1', { cache: 'no-store' });
    } catch { online = false; }
  }
  if (online) addResult(true, 'The internet connection works.');
  else { problems += 1; addResult(false, 'No internet. Check the Wi-Fi, or try opening any website.'); }

  // 3. The voice.
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance('The voice works.');
    u.rate = Number(settings.speechRate) || 1;
    speechSynthesis.speak(u);
    addResult(true, 'The voice test just spoke the words "The voice works." If you did NOT hear it: turn the volume up, and on iPhone check the orange silent switch on the left side.');
  } catch {
    problems += 1;
    addResult(false, 'The voice could not start on this device.');
  }

  // 4. The camera.
  const camLine = addResult(null, 'Checking the camera…');
  try {
    const constraints = settings.cameraId
      ? { video: { deviceId: { exact: settings.cameraId } } }
      : { video: { facingMode: { ideal: 'environment' } } };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    stream.getTracks().forEach(t => t.stop());
    camLine.className = 'check-line good';
    camLine.textContent = '✅ The camera opens.';
  } catch {
    problems += 1;
    camLine.className = 'check-line bad';
    camLine.textContent = '❌ The camera would not open. Make sure nothing covers it, and that camera permission is allowed for this browser in the device settings.';
  }

  // 5. The AI reading service itself.
  if (settings.apiKey || serverMode) {
    const aiLine = addResult(null, 'Checking the reading service — this takes a few seconds…');
    const result = await pingService(settings);
    if (result.ok) {
      aiLine.className = 'check-line good';
      aiLine.textContent = `✅ ${result.where} answered. Reading will work.`;
    } else {
      problems += 1;
      aiLine.className = 'check-line bad';
      aiLine.textContent = result.status === 0
        ? `❌ Could not reach ${result.where}. If the internet check above passed, try again in a minute.`
        : `❌ ${result.where} said no (${result.status}${result.message ? ': ' + result.message : ''}). Open Setup, check the key, and press Test the connection.`;
    }
  }

  const verdict = document.createElement('p');
  verdict.className = 'check-verdict ' + (problems ? 'bad' : 'good');
  verdict.textContent = problems
    ? `Something needs attention — see the red line${problems > 1 ? 's' : ''} above.`
    : 'Everything looks good. The reader is ready to use.';
  out.appendChild(verdict);
});
