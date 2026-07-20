// One tiny "are we connected?" test against the configured AI service.
// Shared by the Setup page and the Helper's Guide check-up.

import { PROVIDERS, providerOf } from './store.js';

export async function pingService(s) {
  const provider = providerOf(s);
  const budgetModel = PROVIDERS[provider].models.budget.id; // cheapest ping
  const ping = 'Reply with the single word: ready';
  let where = 'the reading service';
  let res;

  try {
    if (provider === 'google') {
      where = 'Google Gemini';
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${budgetModel}:generateContent`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': s.apiKey },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: ping }] }],
            generationConfig: { maxOutputTokens: 20 },
          }),
        }
      );
    } else if (provider === 'openai') {
      where = 'OpenAI';
      res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${s.apiKey}` },
        body: JSON.stringify({
          model: budgetModel,
          max_completion_tokens: 20,
          messages: [{ role: 'user', content: ping }],
        }),
      });
    } else {
      where = 'Claude';
      const useDirect = s.mode === 'direct' || (s.mode === 'auto' && s.apiKey);
      const body = { model: budgetModel, max_tokens: 20, messages: [{ role: 'user', content: ping }] };
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
        where = "this app's server";
        const headers = { 'content-type': 'application/json' };
        if (s.serverCode) headers['x-reader-code'] = s.serverCode;
        res = await fetch('api/read', { method: 'POST', headers, body: JSON.stringify(body) });
      }
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
