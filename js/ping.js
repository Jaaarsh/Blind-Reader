// One tiny "are we connected?" test against the configured AI service.
// Shared by the Setup page and the Helper's Guide check-up.

import { PROVIDERS, providerOf } from './store.js';

export async function pingService(s) {
  const provider = providerOf(s);
  const model = PROVIDERS[provider].models.budget.id; // cheapest ping
  const ping = 'Reply with the single word: ready';
  const direct = s.mode === 'direct' || (s.mode === 'auto' && s.apiKey);

  let url, headers, payload;
  let where = PROVIDERS[provider].label.split(' (')[0];
  if (provider === 'google') {
    url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    headers = { 'content-type': 'application/json', 'x-goog-api-key': s.apiKey };
    payload = {
      contents: [{ role: 'user', parts: [{ text: ping }] }],
      generationConfig: { maxOutputTokens: 20 },
    };
  } else if (provider === 'openai') {
    url = 'https://api.openai.com/v1/chat/completions';
    headers = { 'content-type': 'application/json', authorization: `Bearer ${s.apiKey}` };
    payload = { model, max_completion_tokens: 20, messages: [{ role: 'user', content: ping }] };
  } else {
    url = 'https://api.anthropic.com/v1/messages';
    headers = {
      'content-type': 'application/json',
      'x-api-key': s.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    };
    payload = { model, max_tokens: 20, messages: [{ role: 'user', content: ping }] };
  }

  let res;
  try {
    if (direct) {
      res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) });
    } else {
      where = "this app's server";
      const proxyHeaders = { 'content-type': 'application/json' };
      if (s.serverCode) proxyHeaders['x-reader-code'] = s.serverCode;
      res = await fetch('api/read', {
        method: 'POST',
        headers: proxyHeaders,
        body: JSON.stringify({ provider, model, payload }),
      });
    }
  } catch {
    return { ok: false, where, status: 0, message: 'network' };
  }

  if (res.ok) return { ok: true, where };
  const detail = await res.json().catch(() => null);
  return {
    ok: false,
    where,
    status: res.status,
    message: detail?.error?.message || detail?.error?.status || '',
  };
}
