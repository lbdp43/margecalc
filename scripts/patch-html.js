#!/usr/bin/env node
/**
 * Post-build script for the Expo web export:
 * - Patches index.html with viewport, safe-area, theme-color, manifest link,
 *   the app background (#F3F6F4, so there is no white flash before the JS and
 *   the fonts load) and preloads for the Plus Jakarta Sans files.
 * - Copies the icon variants into backend/dist/public.
 * - Emits a proper PWA manifest.json so Android shows the right name and a
 *   sharp icon when installed to home screen.
 */
const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, '..', 'backend', 'dist', 'public');
const ASSETS_DIR = path.join(__dirname, '..', 'mobile', 'assets');
const HTML_PATH = path.join(PUBLIC_DIR, 'index.html');

const APP_BG = '#F3F6F4';

// 1) Copy icon variants next to index.html so the manifest can reference
//    them with relative paths.
const iconCopies = ['icon-192.png', 'icon-512.png', 'icon-maskable.png', 'favicon.png'];
for (const name of iconCopies) {
  const src = path.join(ASSETS_DIR, name);
  const dst = path.join(PUBLIC_DIR, name);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dst);
  }
}

// 2) Emit the PWA manifest.
const manifest = {
  name: 'MargeBar Pro',
  short_name: 'MargeBar',
  description: 'Calculateur de marges et de droits d’alcool pour bars et restaurants.',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  orientation: 'portrait',
  background_color: APP_BG,
  theme_color: APP_BG,
  lang: 'fr',
  icons: [
    { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: 'icon-maskable.png', sizes: '1024x1024', type: 'image/png', purpose: 'maskable' },
  ],
};
fs.writeFileSync(
  path.join(PUBLIC_DIR, 'manifest.json'),
  JSON.stringify(manifest, null, 2),
  'utf-8',
);

// 3) Find the exported Plus Jakarta Sans files to preload them (they are
//    hashed by the export, so look them up instead of hard-coding).
function findFiles(dir, test, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) findFiles(full, test, out);
    else if (test(entry.name)) out.push(full);
  }
  return out;
}
const fontFiles = findFiles(path.join(PUBLIC_DIR, 'assets'), (n) => /^PlusJakartaSans_(400Regular|500Medium|600SemiBold|700Bold|800ExtraBold)\..*\.ttf$/.test(n))
  .map((f) => '/' + path.relative(PUBLIC_DIR, f).split(path.sep).join('/'));
const fontPreloads = fontFiles
  .map((href) => `    <link rel="preload" href="${encodeURI(href)}" as="font" type="font/ttf" crossorigin />`)
  .join('\n');

// 4) Patch index.html.
let html = fs.readFileSync(HTML_PATH, 'utf-8');

// Viewport with safe-area support
html = html.replace(
  'width=device-width, initial-scale=1, shrink-to-fit=no',
  'width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover',
);
html = html.replace('<html lang="en">', '<html lang="fr">');

const extraHead = `
    <meta name="application-name" content="MargeBar Pro" />
    <meta name="apple-mobile-web-app-title" content="MargeBar Pro" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <meta name="theme-color" content="${APP_BG}" />
    <meta name="color-scheme" content="light" />
    <link rel="manifest" href="manifest.json" />
    <link rel="icon" type="image/png" sizes="192x192" href="icon-192.png" />
    <link rel="icon" type="image/png" sizes="512x512" href="icon-512.png" />
    <link rel="apple-touch-icon" sizes="192x192" href="icon-192.png" />
    <link rel="apple-touch-icon" sizes="512x512" href="icon-512.png" />
${fontPreloads}
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
`;

html = html.replace('</head>', `${extraHead}  </head>`);

fs.writeFileSync(HTML_PATH, html, 'utf-8');
console.log(`✓ Patched index.html (${fontFiles.length} font preloads), copied icons, emitted manifest.json`);
