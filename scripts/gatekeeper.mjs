#!/usr/bin/env node
/**
 * Public front door for the DeepSeek Harness Web UI.
 *
 * `dsh web` mints a fresh random launch token on every process start and prints
 * it in a URL that a browser must open once, to exchange it for a signed
 * session cookie. On a PaaS nobody can read that printed line, so this
 * gatekeeper sits between the platform router and dsh:
 *
 *   1. starts `dsh web` on an internal loopback port,
 *   2. scrapes the launch token from its startup URL,
 *   3. proxies $PORT -> dsh and redeems the token on the root document on the
 *      visitor's behalf, so the public domain simply works — and keeps working
 *      across restarts, because the token is re-scraped on every boot.
 *
 * Set HARNESS_ACCESS_KEY to require a shared access key: the first visit must
 * carry it (`/?key=...` or the small form), which mints an HttpOnly cookie so
 * the UI, its assets and its WebSocket all ride the same session. Without the
 * variable the deployment is open to anyone with the URL.
 *
 * Every upstream detail (Host header, cookies, WebSocket upgrades) is forwarded
 * untouched, which is what dsh's browser-trust fence requires.
 */
import { spawn } from 'node:child_process';
import { createHash, timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLIC_PORT = Number(process.env.PORT || 3080);
const INTERNAL_PORT = Number(process.env.DSH_INTERNAL_PORT || 3081);
const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// The preloaded settings.yaml (Venice provider + models) lives in ./dsh-home.
const DSH_HOME = process.env.DSH_HOME || path.join(APP_ROOT, 'dsh-home');
const ACCESS_KEY = process.env.HARNESS_ACCESS_KEY || '';
const ACCESS_COOKIE = 'harness-access';
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const PUBLIC_URL = (
  process.env.DSH_PUBLIC_URL ||
  (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : '')
).replace(/\/+$/, '');
const SECURE_COOKIES = PUBLIC_URL.startsWith('https://');

let launchToken = null;

/* ------------------------------------------------------------------ dsh --- */

const args = ['web', '--host', '127.0.0.1', '--port', String(INTERNAL_PORT), '--no-open'];
if (PUBLIC_URL) {
  args.push('--public-url', `${PUBLIC_URL}/`);
  args.push('--trusted-host', new URL(PUBLIC_URL).host);
}
for (const host of (process.env.DSH_TRUSTED_HOSTS || '').split(',').map((h) => h.trim()).filter(Boolean)) {
  args.push('--trusted-host', host);
}

console.log(`[gatekeeper] public :${PUBLIC_PORT} -> dsh :${INTERNAL_PORT}${PUBLIC_URL ? ` (${PUBLIC_URL})` : ''}`);
console.log(`[gatekeeper] DSH_HOME=${DSH_HOME}`);
console.log(`[gatekeeper] access key ${ACCESS_KEY ? 'required' : 'not set'}`);

const child = spawn(dshCommand(), args, {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, DSH_HOME },
});

function dshCommand() {
  if (process.env.DSH_BIN) return process.env.DSH_BIN;
  const here = path.dirname(fileURLToPath(import.meta.url));
  const local = path.resolve(here, '..', 'node_modules', '.bin', 'dsh');
  return existsSync(local) ? local : 'dsh';
}

const TOKEN_RE = /[?&]token=([A-Za-z0-9\-_.]+)/;
function scan(chunk) {
  const text = chunk.toString();
  process.stdout.write(text);
  const match = text.match(TOKEN_RE);
  if (match && match[1] !== launchToken) {
    launchToken = match[1];
    console.log('[gatekeeper] launch token captured; public entry is live');
  }
}
child.stdout.on('data', scan);
child.stderr.on('data', scan);
child.on('error', (err) => {
  console.error(`[gatekeeper] failed to start dsh: ${err.message}`);
  process.exit(1);
});
child.on('exit', (code, signal) => {
  console.error(`[gatekeeper] dsh exited (code=${code} signal=${signal}); shutting down`);
  process.exit(code ?? 1);
});

/* --------------------------------------------------------------- helpers --- */

const accessDigest = ACCESS_KEY
  ? createHash('sha256').update(`harness-access:${ACCESS_KEY}`).digest('hex')
  : '';

function cookieValue(header, name) {
  for (const part of String(header || '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return undefined;
}

function keyMatches(candidate) {
  if (!ACCESS_KEY || typeof candidate !== 'string' || candidate.length === 0) return false;
  const given = createHash('sha256').update(`harness-access:${candidate}`).digest();
  const wanted = Buffer.from(accessDigest, 'hex');
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

function hasAccess(req) {
  if (!ACCESS_KEY) return true;
  return cookieValue(req.headers.cookie, ACCESS_COOKIE) === accessDigest;
}

function accessCookie() {
  return `${ACCESS_COOKIE}=${accessDigest}; Path=/; Max-Age=${MAX_AGE_SECONDS}; HttpOnly; SameSite=Lax${SECURE_COOKIES ? '; Secure' : ''}`;
}

function loginPage(res, failed) {
  res.writeHead(failed ? 401 : 200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  res.end(`<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>DeepSeek Harness</title>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#fff;font:16px/1.5 system-ui,sans-serif;color:#16202c">
<form method="post" action="/__access" style="width:min(92vw,360px);display:grid;gap:14px;padding:28px;border:1px solid #e6e9ee;border-radius:14px">
  <div style="font-weight:650;font-size:19px">🐴 DeepSeek Harness</div>
  <div style="color:#5b6875;font-size:14px">Enter the access key to continue.</div>
  ${failed ? '<div style="color:#c2410c;font-size:14px">That key did not match.</div>' : ''}
  <input name="key" type="password" autofocus autocomplete="current-password" placeholder="Access key"
    style="padding:11px 12px;border:1px solid #cfd6de;border-radius:9px;font-size:15px">
  <button type="submit" style="padding:11px 12px;border:0;border-radius:9px;background:#f97316;color:#fff;font-size:15px;font-weight:600;cursor:pointer">Open harness</button>
</form>`);
}

function startingPage(res) {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  res.end(
    '<!doctype html><meta charset="utf-8"><title>Starting…</title>' +
      '<meta http-equiv="refresh" content="2">' +
      '<body style="font:15px/1.5 system-ui;padding:2rem">Starting the DeepSeek Harness…</body>',
  );
}

function forward(req, res, target, heal = false) {
  const upstream = http.request(
    { host: '127.0.0.1', port: INTERNAL_PORT, method: req.method, path: target, headers: req.headers },
    (up) => {
      // A session cookie from an earlier process (deploy, restart) gets a 401.
      // Drop it and bounce to the root, which re-redeems the launch token.
      if (heal && up.statusCode === 401) {
        up.resume();
        const stale = String(req.headers.cookie || '')
          .split(';')
          .map((part) => part.trim().split('=')[0])
          .filter((name) => name.startsWith('dsh-auth-'))
          .map((name) => `${name}=; Path=/; Max-Age=0`);
        const headers = { location: '/', 'cache-control': 'no-store' };
        if (stale.length) headers['set-cookie'] = stale;
        res.writeHead(302, headers);
        return res.end();
      }
      res.writeHead(up.statusCode || 502, up.headers);
      up.pipe(res);
    },
  );
  upstream.on('error', (err) => {
    if (!res.headersSent) {
      res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
    }
    res.end(`harness unavailable: ${err.message}\n`);
  });
  req.pipe(upstream);
}

/* ---------------------------------------------------------------- server --- */

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://gatekeeper.invalid');

  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
    return res.end(launchToken ? 'ready\n' : 'starting\n');
  }

  // Access gate: a keyed link (/?key=…) or the small form mints the cookie.
  if (ACCESS_KEY && !hasAccess(req)) {
    if (keyMatches(url.searchParams.get('key'))) {
      const clean = new URL(url.href);
      clean.searchParams.delete('key');
      res.writeHead(302, { location: `${clean.pathname}${clean.search}`, 'set-cookie': accessCookie(), 'cache-control': 'no-store' });
      return res.end();
    }
    if (url.pathname === '/__access' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; if (body.length > 4096) req.destroy(); });
      req.on('end', () => {
        const candidate = new URLSearchParams(body).get('key') || '';
        if (keyMatches(candidate)) {
          res.writeHead(302, { location: '/', 'set-cookie': accessCookie(), 'cache-control': 'no-store' });
          return res.end();
        }
        loginPage(res, true);
      });
      return;
    }
    return loginPage(res, false);
  }

  if (!launchToken) return startingPage(res);

  const hasSession = /(?:^|;\s*)dsh-auth-/.test(req.headers.cookie || '');

  // The root document is the only place dsh accepts the launch token. Redeem
  // it for visitors without a session cookie; visitors who already hold one
  // get the document directly (dsh bounces any request carrying a token).
  if (url.pathname === '/' && (req.method === 'GET' || req.method === 'HEAD')) {
    if (hasSession) return forward(req, res, '/', true);
    const query = new URLSearchParams(url.search);
    query.set('token', launchToken);
    return forward(req, res, `/?${query.toString()}`);
  }

  // Anything else needs the session cookie; send cookieless visitors to the root.
  if (!hasSession) {
    res.writeHead(302, { location: '/', 'cache-control': 'no-store' });
    return res.end();
  }

  forward(req, res, `${url.pathname}${url.search}`);
});

server.on('upgrade', (req, socket, head) => {
  const hasSession = /(?:^|;\s*)dsh-auth-/.test(req.headers.cookie || '');
  if (!hasAccess(req) || !hasSession) {
    socket.destroy();
    return;
  }
  const upstream = net.connect(INTERNAL_PORT, '127.0.0.1', () => {
    const lines = Object.entries(req.headers).map(([k, v]) =>
      Array.isArray(v) ? v.map((item) => `${k}: ${item}`).join('\r\n') : `${k}: ${v}`,
    );
    upstream.write(`${req.method} ${req.url} HTTP/1.1\r\n${lines.join('\r\n')}\r\n\r\n`);
    if (head && head.length) upstream.write(head);
    upstream.pipe(socket);
    socket.pipe(upstream);
  });
  upstream.on('error', () => socket.destroy());
  socket.on('error', () => upstream.destroy());
});

server.listen(PUBLIC_PORT, '0.0.0.0', () => {
  console.log(`[gatekeeper] listening on 0.0.0.0:${PUBLIC_PORT}`);
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    try { child.kill(signal); } catch {}
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
