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
const API_KEY = process.env.ANTHROPIC_API_KEY || '';
const ROOT = __dirname;

// Guard rails on the proxy: only the models the app offers, bounded output.
const ALLOWED_MODELS = new Set(['claude-opus-4-8', 'claude-haiku-4-5']);
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

function proxyToAnthropic(payload, res) {
  const body = JSON.stringify(payload);
  const upstream = https.request(
    {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body),
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01',
      },
    },
    up => {
      res.writeHead(up.statusCode || 502, { 'content-type': 'application/json' });
      up.pipe(res);
    }
  );
  upstream.on('error', () => json(res, 502, { error: { message: 'Could not reach the Anthropic API.' } }));
  upstream.end(body);
}

async function handleRead(req, res) {
  if (!API_KEY) {
    json(res, 500, { error: { message: 'Server is missing ANTHROPIC_API_KEY.' } });
    return;
  }
  let payload;
  try {
    payload = JSON.parse((await readBody(req, MAX_BODY_BYTES)).toString('utf8'));
  } catch (err) {
    json(res, err.message === 'too-large' ? 413 : 400, { error: { message: 'Bad request body.' } });
    return;
  }
  if (!payload || typeof payload !== 'object' || !ALLOWED_MODELS.has(payload.model)) {
    json(res, 400, { error: { message: 'Model not allowed.' } });
    return;
  }
  payload.max_tokens = Math.min(Number(payload.max_tokens) || 1024, MAX_TOKENS_CAP);
  proxyToAnthropic(payload, res);
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
  if (pathname === '/api/health') { json(res, 200, { ok: true, keyConfigured: Boolean(API_KEY) }); return; }
  if (req.method === 'GET' || req.method === 'HEAD') { serveStatic(req, res); return; }
  res.writeHead(405); res.end();
});

server.listen(PORT, () => {
  console.log(`Blind Reader server running on http://localhost:${PORT}`);
  console.log(API_KEY
    ? 'API key configured — phones using this server need no key of their own.'
    : 'WARNING: ANTHROPIC_API_KEY is not set. Reading will fail unless the phone has its own key in Setup.');
});
