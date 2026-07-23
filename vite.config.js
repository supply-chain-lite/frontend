import { defineConfig } from 'vite';
import { resolve } from 'path';
import { readdirSync } from 'fs';

/**
 * Collects HTML entry files under src/ and maps page names to their absolute paths.
 *
 * Scans the src directory for files ending with `.html`, uses the filename without
 * the `.html` extension as the page name, and returns a map of page name → absolute path.
 *
 * @returns {Object.<string,string>} An object mapping page names (filename without `.html`) to the resolved absolute path of each HTML file.
 */
function getHtmlInputs() {
  const srcDir = resolve(__dirname, 'src');
  const inputs = {};
  readdirSync(srcDir)
    .filter((file) => file.endsWith('.html'))
    .forEach((file) => {
      const name = file.replace('.html', '');
      inputs[name] = resolve(srcDir, file);
    });
  return inputs;
}

/**
 * Vite plugin: inject <link rel="preload" as="font"> for Font Awesome woff2 files.
 *
 * Font Awesome is loaded via SCSS → JS bundle. Even though Vite extracts the
 * CSS to a <link> in <head>, the browser only discovers the woff2 font URLs
 * after parsing that CSS file. On slow connections this creates a window where
 * FA icons are invisible (FOIT). Preloading the font files tells the browser
 * to fetch them in parallel with the CSS, eliminating the sequential delay.
 */
function faFontPreloadPlugin() {
  return {
    name: 'fa-font-preload',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (!ctx.bundle) return html; // dev mode — skip, Vite uses HMR

        // Collect Font Awesome woff2 files emitted by the build
        const faFonts = Object.keys(ctx.bundle).filter(
          (key) => key.endsWith('.woff2') && key.includes('fa-'),
        );

        if (faFonts.length === 0) return html;

        // Prefer fa-solid-900 (used by fa-solid icons e.g. fa-bell);
        // fall back to all FA fonts if none match.
        const criticalFonts = faFonts.filter(
          (f) => f.includes('fa-solid-900') || f.includes('fa-regular-400'),
        );
        const fontsToPreload = criticalFonts.length > 0 ? criticalFonts : faFonts;

        const preloadLinks = fontsToPreload
          .map(
            (file) =>
              `  <link rel="preload" href="/${file}" as="font" type="font/woff2" crossorigin="">`,
          )
          .join('\n');

        return html.replace('</head>', `${preloadLinks}\n</head>`);
      },
    },
  };
}

export default defineConfig({
  plugins: [faFontPreloadPlugin()],
  appType: 'mpa',
  root: resolve(__dirname, 'src'),
  envDir: resolve(__dirname),
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: getHtmlInputs(),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
