#!/usr/bin/env node
// Blind Reader server — optional, zero dependencies.
//
// Serves the app AND proxies reading requests to the Anthropic API so the
// API key lives here, never on the phone. Run with:
//
//   ANTHROPIC_API_KEY=sk-ant-... node server.js
//
// Then open http://<this-machine>:8787 on the phone (same Wi-Fi), or put it
// behind any HTTPS host. Note: phone browsers require HTTPS (or localhost)
// for camera access — see README for easy HTTPS options.

'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 8787);
// Optional: set READER_PASSCODE to any phrase to stop strangers from using
// your API credit if this server is reachable from the internet. Enter the
// same phrase once in the app's Setup page ("Server passcode").
const PASSCODE = process.env.READER_PASSCODE || '';
const ROOT = __dirname;

// The server can hold keys for any subset of the supported AI services —
// devices using this server then need no keys of their own.
const UPSTREAMS = {
  anthropic: {
    key: process.env.ANTHROPIC_API_KEY || '',
    host: 'api.anthropic.com',
    path: () => '/v1/messages',
    models: new Set(['claude-opus-4-8', 'claude-haiku-4-5']),
    headers: key => ({ 'x-api-key': key, 'anthropic-version': '2023-06-01' }),
    cap: p => { p.max_tokens = Math.min(Number(p.max_tokens) || 1024, MAX_TOKENS_CAP); },
  },
  google: {
    key: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '',
    host: 'generativelanguage.googleapis.com',
    path: model => `/v1beta/models/${model}:generateContent`,
    models: new Set(['gemini-2.5-pro', 'gemini-2.5-flash']),
    headers: key => ({ 'x-goog-api-key': key }),
    cap: p => {
      p.generationConfig = p.generationConfig || {};
      p.generationConfig.maxOutputTokens = Math.min(Number(p.generationConfig.maxOutputTokens) || 1024, MAX_TOKENS_CAP);
    },
  },
  openai: {
    key: process.env.OPENAI_API_KEY || '',
    host: 'api.openai.com',
    path: () => '/v1/chat/completions',
    models: new Set(['gpt-5', 'gpt-5-mini']),
    headers: key => ({ authorization: `Bearer ${key}` }),
    cap: p => { p.max_completion_tokens = Math.min(Number(p.max_completion_tokens) || 1024, MAX_TOKENS_CAP); },
  },
};

// Gentle rate limit: far above real reading pace, low enough to stop abuse.
const RATE_LIMIT = 40;              // requests…
const RATE_WINDOW_MS = 10 * 60000;  // …per 10 minutes per address
const rateLog = new Map();          // ip -> [timestamps]

function rateLimited(ip) {
  const now = Date.now();
  const log = (rateLog.get(ip) || []).filter(t => now - t < RATE_WINDOW_MS);
  log.push(now);
  rateLog.set(ip, log);
  if (rateLog.size > 5000) rateLog.clear(); // memory cap; resets counters
  return log.length > RATE_LIMIT;
}

// Guard rails on the proxy: only the models the app offers, bounded output.
const MAX_TOKENS_CAP = 16000;
const MAX_BODY_BYTES = 12 * 1024 * 1024; // photos arrive base64-encoded

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function json(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) });
  res.end(body);
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > limit) { reject(new Error('too-large')); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function proxyUpstream(upstream, model, payload, res) {
  const body = JSON.stringify(payload);
  const request = https.request(
    {
      hostname: upstream.host,
      path: upstream.path(model),
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body),
        ...upstream.headers(upstream.key),
      },
    },
    up => {
      res.writeHead(up.statusCode || 502, { 'content-type': 'application/json' });
      up.pipe(res);
    }
  );
  request.on('error', () => json(res, 502, { error: { message: 'Could not reach the AI service.' } }));
  request.end(body);
}

async function handleRead(req, res) {
  if (PASSCODE && req.headers['x-reader-code'] !== PASSCODE) {
    json(res, 401, { error: { message: 'Bad or missing server passcode.' } });
    return;
  }
  if (rateLimited(req.socket.remoteAddress || 'unknown')) {
    json(res, 429, { error: { message: 'Too many requests. Wait a few minutes.' } });
    return;
  }
  let body;
  try {
    body = JSON.parse((await readBody(req, MAX_BODY_BYTES)).toString('utf8'));
  } catch (err) {
    json(res, err.message === 'too-large' ? 413 : 400, { error: { message: 'Bad request body.' } });
    return;
  }
  if (!body || typeof body !== 'object') {
    json(res, 400, { error: { message: 'Bad request body.' } });
    return;
  }

  // Current clients send { provider, model, payload }; older cached clients
  // send a bare Anthropic messages body — accept both.
  let provider = 'anthropic';
  let model;
  let payload;
  if (body.payload && typeof body.payload === 'object') {
    provider = String(body.provider || 'anthropic');
    model = String(body.model || '');
    payload = body.payload;
  } else {
    model = String(body.model || '');
    payload = body;
  }

  const upstream = UPSTREAMS[provider];
  if (!upstream || !upstream.models.has(model)) {
    json(res, 400, { error: { message: 'Model not allowed.' } });
    return;
  }
  if (!upstream.key) {
    json(res, 500, { error: { message: `Server has no key configured for ${provider}.` } });
    return;
  }
  upstream.cap(payload);
  proxyUpstream(upstream, model, payload, res);
}

function serveStatic(req, res) {
  let urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(ROOT, path.normalize(urlPath));
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }

  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('Not found'); return; }
    const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'content-type': type, 'cache-control': 'no-cache' });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://x').pathname;
  if (pathname === '/api/read' && req.method === 'POST') { handleRead(req, res); return; }
  if (pathname === '/api/health') {
    const providers = Object.keys(UPSTREAMS).filter(name => UPSTREAMS[name].key);
    json(res, 200, { ok: true, providers, keyConfigured: providers.length > 0, needsCode: Boolean(PASSCODE) });
    return;
  }
  if (req.method === 'GET' || req.method === 'HEAD') { serveStatic(req, res); return; }
  res.writeHead(405); res.end();
});

server.listen(PORT, () => {
  console.log(`Blind Reader server running on http://localhost:${PORT}`);
  const providers = Object.keys(UPSTREAMS).filter(name => UPSTREAMS[name].key);
  console.log(providers.length
    ? `Keys configured for: ${providers.join(', ')} — devices using this server need no keys of their own.`
    : 'WARNING: no AI keys set (ANTHROPIC_API_KEY / GEMINI_API_KEY / OPENAI_API_KEY). Reading will fail unless each device has its own key in Setup.');
  if (!PASSCODE) console.log('Tip: set READER_PASSCODE to keep strangers from using your keys if this server is reachable from the internet.');
});
