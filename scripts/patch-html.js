#!/usr/bin/env node
/**
 * Post-build script for the Expo web export (backend/dist/public):
 * - Patches index.html with viewport, safe-area, theme-color, manifest link,
 *   the app background (#F3F6F4, so there is no white flash before the JS and
 *   the fonts load), preloads for the Plus Jakarta Sans files, the build id
 *   (<meta name="margebar-build">) and a tiny inline listener that keeps the
 *   browser's install prompt (`beforeinstallprompt`) if it fires before the
 *   app bundle runs (utils/pwaInstall.ts picks it up).
 * - Copies the icon variants into backend/dist/public.
 * - Emits a PWA manifest.json (installable on Chrome, Edge and Android).
 * - Emits version.json { buildId, version, builtAt }: the running app polls it
 *   and offers « Nouvelle version disponible » when it changes
 *   (utils/appUpdate.ts).
 * - Emits sw.js, a small, safe service worker (see SERVICE_WORKER below). Its
 *   cache names carry the build id, so every deploy gets fresh caches.
 *
 * The build id is unique per build: a UTC timestamp + a short hash of the
 * main bundle (e.g. « 20261022-134501-3f9a1c2e »).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'backend', 'dist', 'public');
const ASSETS_DIR = path.join(ROOT, 'mobile', 'assets');
const HTML_PATH = path.join(PUBLIC_DIR, 'index.html');
const APP_JSON = path.join(ROOT, 'mobile', 'app.json');

const APP_BG = '#F3F6F4';

function findFiles(dir, test, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) findFiles(full, test, out);
    else if (test(entry.name)) out.push(full);
  }
  return out;
}

let html = fs.readFileSync(HTML_PATH, 'utf-8');

// 0) Build id: timestamp + short hash of the main bundle (the <script src> of
//    index.html; every JS file of the export as a fallback).
const scriptSrcs = [...html.matchAll(/<script[^>]+src="(\/_expo\/static\/[^"]+\.js)"/g)].map((m) => m[1]);
const bundleFiles = scriptSrcs.length
  ? scriptSrcs.map((src) => path.join(PUBLIC_DIR, ...src.split('/').filter(Boolean)))
  : findFiles(path.join(PUBLIC_DIR, '_expo'), (n) => n.endsWith('.js'));
const hash = crypto.createHash('sha256');
for (const file of bundleFiles.sort()) {
  if (fs.existsSync(file)) hash.update(fs.readFileSync(file));
}
const builtAt = new Date();
const stamp = builtAt.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15); // 20261022-134501
const BUILD_ID = `${stamp}-${hash.digest('hex').slice(0, 8)}`;
const APP_VERSION = (() => {
  try {
    return String(JSON.parse(fs.readFileSync(APP_JSON, 'utf-8')).expo.version || '');
  } catch {
    return '';
  }
})();

// 1) Copy icon variants next to index.html. index.html links them with
//    ABSOLUTE paths (/manifest.json, /icon-192.png…): a relative href on a deep
//    URL such as /produits/:id would request /produits/manifest.json, which the
//    SPA fallback answers with index.html. Inside manifest.json the icon src
//    values are absolute too.
const iconCopies = ['icon-192.png', 'icon-512.png', 'icon-maskable.png', 'favicon.png', 'apple-touch-icon.png'];
for (const name of iconCopies) {
  const src = path.join(ASSETS_DIR, name);
  const dst = path.join(PUBLIC_DIR, name);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dst);
  }
}

// 2) Emit the PWA manifest (Chrome / Edge / Android installability: name,
//    icons 192 + 512, start_url, display standalone; `id` keeps the installed
//    app the same one if start_url ever changes).
const manifest = {
  id: '/',
  name: 'MargeBar Pro',
  short_name: 'MargeBar',
  description: 'Marges, prix de vente et droits d’alcool de votre bar, au barème officiel des douanes. Gratuit.',
  lang: 'fr',
  dir: 'ltr',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  orientation: 'portrait',
  background_color: APP_BG,
  theme_color: APP_BG,
  categories: ['business', 'finance', 'productivity'],
  icons: [
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/icon-maskable.png', sizes: '1024x1024', type: 'image/png', purpose: 'maskable' },
  ],
};
fs.writeFileSync(path.join(PUBLIC_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');

// 3) version.json: polled by the running app (no-cache, see backend/src/index.ts).
fs.writeFileSync(
  path.join(PUBLIC_DIR, 'version.json'),
  JSON.stringify({ buildId: BUILD_ID, version: APP_VERSION, builtAt: builtAt.toISOString() }, null, 2),
  'utf-8',
);

// 4) Service worker. Rules:
//    - install: precache the app shell « / » (and warm the hashed scripts and
//      fonts it references, best effort, so an offline start can boot); skipWaiting.
//    - activate: delete the caches of older builds, then clients.claim().
//    - fetch: never touches non-GET, /api/*, or cross-origin requests.
//      Navigations: network first (never a stale app while online), the cached
//      shell only when the network fails (offline). /_expo/static/* and /assets/*
//      (content-hashed, immutable): cache first, cached at runtime. Everything
//      else (version.json, manifest, icons…): network, untouched.
//    - message: SKIP_WAITING (the app's « Mettre à jour »), CACHE_URLS (the
//      app hands over the hashed files it loaded before the worker controlled it).
const SERVICE_WORKER = `/* MargeBar Pro service worker. Generated by scripts/patch-html.js: do not edit. Build ${BUILD_ID} */
'use strict';
const BUILD_ID = ${JSON.stringify(BUILD_ID)};
const PREFIX = 'margebar-';
const SHELL_CACHE = PREFIX + 'shell-' + BUILD_ID;
const STATIC_CACHE = PREFIX + 'static-' + BUILD_ID;
const SHELL_URL = '/';

function isHashedAsset(url) {
  return url.pathname.startsWith('/_expo/static/') || url.pathname.startsWith('/assets/');
}
function isHtml(res) {
  return (res.headers.get('content-type') || '').indexOf('text/html') !== -1;
}
/** Only real files: a missing asset gets the SPA's index.html (200, text/html), never cache that. */
function cacheable(res) {
  return !!res && res.ok && res.type === 'basic' && !isHtml(res);
}
async function warm(href) {
  const cache = await caches.open(STATIC_CACHE);
  if (await cache.match(href)) return;
  const res = await fetch(href, { credentials: 'same-origin' });
  if (cacheable(res)) await cache.put(href, res);
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil((async () => {
    const res = await fetch(new Request(SHELL_URL, { cache: 'reload', credentials: 'same-origin' }));
    if (!res.ok || !isHtml(res)) throw new Error('App shell unavailable (' + res.status + ')');
    const shell = await caches.open(SHELL_CACHE);
    await shell.put(SHELL_URL, res.clone());
    try {
      const text = await res.text();
      const refs = text.match(/(?:src|href)="\\/(?:_expo\\/static|assets)\\/[^"]+"/g) || [];
      const hrefs = refs.map((r) => new URL(r.slice(r.indexOf('"') + 1, -1).replace(/&amp;/g, '&'), self.location.origin).href);
      await Promise.all(hrefs.map((h) => warm(h).catch(() => undefined)));
    } catch (e) {
      // best effort: the files are cached at runtime anyway
    }
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== SHELL_CACHE && k !== STATIC_CACHE).map((k) => caches.delete(k)));
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch (e) { /* unsupported */ }
    }
    await self.clients.claim();
  })());
});

async function networkFirstNavigation(event) {
  try {
    const res = (await event.preloadResponse) || (await fetch(event.request));
    if (res && res.ok && isHtml(res)) {
      const copy = res.clone();
      event.waitUntil(caches.open(SHELL_CACHE).then((c) => c.put(SHELL_URL, copy)).catch(() => undefined));
    }
    return res;
  } catch (err) {
    const cached = (await caches.match(SHELL_URL, { cacheName: SHELL_CACHE })) || (await caches.match(SHELL_URL));
    return cached || Response.error();
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (cacheable(res)) {
    const copy = res.clone();
    cache.put(request, copy).catch(() => undefined);
  }
  return res;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  let url;
  try {
    url = new URL(request.url);
  } catch (e) {
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(event));
    return;
  }
  if (isHashedAsset(url)) event.respondWith(cacheFirst(request));
  // Everything else goes straight to the network.
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
  if (data.type === 'CACHE_URLS' && Array.isArray(data.urls)) {
    const hrefs = [];
    for (const u of data.urls.slice(0, 100)) {
      try {
        const url = new URL(String(u), self.location.origin);
        if (url.origin === self.location.origin && isHashedAsset(url)) hrefs.push(url.href);
      } catch (e) {
        // ignore
      }
    }
    event.waitUntil(Promise.all(hrefs.map((h) => warm(h).catch(() => undefined))));
  }
});
`;
fs.writeFileSync(path.join(PUBLIC_DIR, 'sw.js'), SERVICE_WORKER, 'utf-8');

// 5) Find the exported Plus Jakarta Sans files to preload them (they are
//    hashed by the export, so look them up instead of hard-coding).
const fontFiles = findFiles(path.join(PUBLIC_DIR, 'assets'), (n) => /^PlusJakartaSans_(400Regular|500Medium|600SemiBold|700Bold|800ExtraBold)\..*\.ttf$/.test(n))
  .map((f) => '/' + path.relative(PUBLIC_DIR, f).split(path.sep).join('/'));
// expo-font requests `<file>?platform=web&hash=<hash>`: preload that exact URL
// so the browser reuses the preloaded response.
const fontPreloads = fontFiles
  .map((href) => {
    const m = href.match(/\.([0-9a-f]{32})\.ttf$/);
    const query = m ? `?platform=web&amp;hash=${m[1]}` : '';
    return `    <link rel="preload" href="${encodeURI(href)}${query}" as="font" type="font/ttf" crossorigin />`;
  })
  .join('\n');

// 6) Patch index.html (idempotent: a second run replaces its own block).
if (!html.includes('viewport-fit=cover')) {
  html = html.replace(
    'width=device-width, initial-scale=1, shrink-to-fit=no',
    'width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover',
  );
}
html = html.replace('<html lang="en">', '<html lang="fr">');
// Expo adds its own theme-color: ours (below) is the only one.
html = html.replace(/\s*<meta name="theme-color"[^>]*>/g, '');
html = html.replace(/\s*<!-- margebar:head -->[\s\S]*?<!-- \/margebar:head -->/g, '');

const extraHead = `
    <!-- margebar:head -->
    <meta name="margebar-build" content="${BUILD_ID}" />
    <meta name="application-name" content="MargeBar Pro" />
    <meta name="description" content="${manifest.description}" />
    <meta name="apple-mobile-web-app-title" content="MargeBar" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <meta name="theme-color" content="${APP_BG}" />
    <meta name="color-scheme" content="light" />
    <link rel="manifest" href="/manifest.json" />
    <link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png" />
    <link rel="icon" type="image/png" sizes="512x512" href="/icon-512.png" />
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
${fontPreloads}
    <script>
      // Keep the browser's install prompt if it fires before the app bundle runs
      // (read by utils/pwaInstall.ts).
      (function (w) {
        w.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); w.__mbInstallPrompt = e; });
        w.addEventListener('appinstalled', function () { w.__mbInstallPrompt = null; w.__mbAppInstalledAt = Date.now(); });
      })(window);
    </script>
    <style id="layout-fix">
      html, body, #root {
        height: 100%;
        width: 100%;
        margin: 0;
        padding: 0;
      }
      html, body {
        background-color: ${APP_BG};
        overscroll-behavior: none;
        -webkit-tap-highlight-color: transparent;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
        text-rendering: optimizeLegibility;
      }
    </style>
    <!-- /margebar:head -->
`;

html = html.replace('</head>', `${extraHead}  </head>`);

fs.writeFileSync(HTML_PATH, html, 'utf-8');
console.log(
  `✓ Patched index.html (${fontFiles.length} font preloads), copied icons, emitted manifest.json, sw.js and version.json (build ${BUILD_ID}, v${APP_VERSION})`,
);
