/**
 * Learn-Quize · brand asset generator.
 *
 *   node scripts/generate-assets.mjs
 *
 * Renders every launcher/splash asset from the app's actual identity — the
 * serif-italic "Q" in cyan on deep teal, exactly the logo mark the sign-in
 * screen draws (sign-in.tsx logoMark) — using the same Newsreader italic the
 * app ships. Deterministic: same inputs, same pixels. Expo derives all
 * platform densities from these at build time.
 *
 * Colors are src/theme/index.ts values: brandInk #0A3043, cyan #5FCFDE,
 * bg #EAF4F7 (splash background lives in app.json, not here).
 */

import { Resvg } from '@resvg/resvg-js';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ASSETS = join(HERE, '..', 'assets');
const FONT = join(
  HERE, '..',
  'node_modules', '@expo-google-fonts', 'newsreader',
  '500Medium_Italic', 'Newsreader_500Medium_Italic.ttf',
);

const TEAL = '#0A3043';
const CYAN = '#5FCFDE';
const WHITE = '#FFFFFF';

/** The Q, optically centred. `size` is the canvas, `fontSize` the glyph. */
function glyph(size, fontSize, fill) {
  // The italic Q hangs a long tail below the baseline, so true centring means
  // placing the baseline above canvas centre: bowl above, tail below.
  const x = size / 2;
  const y = size / 2 + fontSize * 0.215;
  return `<text x="${x}" y="${y}" text-anchor="middle" font-family="Newsreader" font-style="italic" font-weight="500" font-size="${fontSize}" fill="${fill}">Q</text>`;
}

function render(name, svg) {
  const resvg = new Resvg(svg, {
    font: { fontFiles: [FONT], loadSystemFonts: false, defaultFontFamily: 'Newsreader' },
  });
  const png = resvg.render().asPng();
  writeFileSync(join(ASSETS, name), png);
  console.log(`  ${name}  ${(png.length / 1024).toFixed(1)} kB`);
}

const S = 1024;

// App icon: full-bleed teal, big Q. Stores and launchers round the corners.
render('icon.png', `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}">
  <rect width="${S}" height="${S}" fill="${TEAL}"/>
  ${glyph(S, 620, CYAN)}
</svg>`);

// Adaptive foreground: transparent, glyph inside the central 66% safe zone.
render('android-icon-foreground.png', `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}">
  ${glyph(S, 430, CYAN)}
</svg>`);

// Adaptive background: solid teal.
render('android-icon-background.png', `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}">
  <rect width="${S}" height="${S}" fill="${TEAL}"/>
</svg>`);

// Adaptive monochrome: white glyph, transparent ground (Android 13 theming).
render('android-icon-monochrome.png', `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}">
  ${glyph(S, 430, WHITE)}
</svg>`);

// Splash mark: the sign-in logo tile — rounded teal square, cyan Q — shown
// small (imageWidth 180) on the pale #EAF4F7 splash ground.
const SP = 512;
render('splash-icon.png', `<svg xmlns="http://www.w3.org/2000/svg" width="${SP}" height="${SP}">
  <rect width="${SP}" height="${SP}" rx="118" fill="${TEAL}"/>
  ${glyph(SP, 300, CYAN)}
</svg>`);

// Web favicon.
const F = 64;
render('favicon.png', `<svg xmlns="http://www.w3.org/2000/svg" width="${F}" height="${F}">
  <rect width="${F}" height="${F}" rx="14" fill="${TEAL}"/>
  ${glyph(F, 38, CYAN)}
</svg>`);

console.log('\nAssets written to mobile/assets/.');
