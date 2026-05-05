#!/usr/bin/env node
/**
 * Post-build script for the Expo web export:
 * - Patches index.html with viewport, safe-area, theme-color, manifest link.
 * - Copies the icon variants into backend/dist/public.
 * - Emits a proper PWA manifest.json so Android shows the right name and a
 *   sharp icon when installed to home screen.
 */
const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, '..', 'backend', 'dist', 'public');
const ASSETS_DIR = path.join(__dirname, '..', 'mobile', 'assets');
const HTML_PATH = path.join(PUBLIC_DIR, 'index.html');

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
  background_color: '#E8EFDD',
  theme_color: '#1B7A55',
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

// 3) Patch index.html.
let html = fs.readFileSync(HTML_PATH, 'utf-8');

// Viewport with safe-area support
html = html.replace(
  'width=device-width, initial-scale=1, shrink-to-fit=no',
  'width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover',
);

const extraHead = `
    <meta name="application-name" content="MargeBar Pro" />
    <meta name="apple-mobile-web-app-title" content="MargeBar Pro" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <meta name="theme-color" content="#1B7A55" />
    <link rel="manifest" href="manifest.json" />
    <link rel="icon" type="image/png" sizes="192x192" href="icon-192.png" />
    <link rel="icon" type="image/png" sizes="512x512" href="icon-512.png" />
    <link rel="apple-touch-icon" sizes="192x192" href="icon-192.png" />
    <link rel="apple-touch-icon" sizes="512x512" href="icon-512.png" />
    <style id="layout-fix">
      html, body, #root {
        height: 100%;
        width: 100%;
        margin: 0;
        padding: 0;
      }
    </style>
`;

html = html.replace('</head>', `${extraHead}  </head>`);

fs.writeFileSync(HTML_PATH, html, 'utf-8');
console.log('✓ Patched index.html, copied icons, emitted manifest.json');
