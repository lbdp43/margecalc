#!/usr/bin/env node
/**
 * Post-build script to patch the generated index.html
 * - Adds viewport-fit=cover for iOS safe areas
 * - Adds safe-area CSS padding
 * - Adds PWA meta tags
 */
const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '..', 'backend', 'dist', 'public', 'index.html');

let html = fs.readFileSync(htmlPath, 'utf-8');

// Fix viewport meta to support safe areas
html = html.replace(
  'width=device-width, initial-scale=1, shrink-to-fit=no',
  'width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover'
);

// Add safe-area CSS and PWA meta tags before </head>
const extraHead = `
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <meta name="theme-color" content="#1B4332" />
    <style id="safe-area-fix">
      #root {
        padding-top: env(safe-area-inset-top, 0px);
        padding-bottom: env(safe-area-inset-bottom, 0px);
        box-sizing: border-box;
      }
    </style>
`;

html = html.replace('</head>', extraHead + '  </head>');

fs.writeFileSync(htmlPath, html, 'utf-8');
console.log('✓ Patched index.html with safe-area support');
