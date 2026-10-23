import { defineConfig } from 'vite';
import { resolve } from 'path';
import { readFileSync, readdirSync } from 'fs';

// Include runtime dependency licenses in every deployment and release archive.
// Build tooling is not shipped; all production dependencies are included conservatively.
function thirdPartyLicensesPlugin() {
  return {
    name: 'third-party-licenses',
    apply: 'build',
    generateBundle() {
      const projectDir = import.meta.dirname;
      const lock = JSON.parse(readFileSync(resolve(projectDir, 'package-lock.json'), 'utf8'));
      const sections = [
        'Third-party notices',
        'This distribution includes the following production dependencies and their license texts.',
        'Font Awesome: CSS/code is MIT, fonts are OFL-1.1, and SVG/JS icons are CC-BY-4.0.',
        'Inconsolata: SIL OFL-1.1; see licenses/Inconsolata-OFL.txt. Font source: https://github.com/google/fonts/tree/main/ofl/inconsolata',
      ];

      for (const [packagePath, entry] of Object.entries(lock.packages)) {
        if (!packagePath || entry.dev) continue;
        const packageDir = resolve(projectDir, packagePath);
        const metadata = JSON.parse(readFileSync(resolve(packageDir, 'package.json'), 'utf8'));
        if (metadata.version !== entry.version) {
          throw new Error(`Dependency version differs from lockfile: ${packagePath}`);
        }
        const files = readdirSync(packageDir, { withFileTypes: true })
          .filter(
            (file) =>
              file.isFile() && /^(licen[cs]e|notice|copying|copyright)([.-]|$)/i.test(file.name)
          )
          .map((file) => file.name)
          .sort();
        if (!files.some((file) => /^(licen[cs]e|copying)([.-]|$)/i.test(file))) {
          throw new Error(`Missing dependency license text: ${packagePath}`);
        }
        sections.push(
          `\n${metadata.name} ${entry.version}\nLicense: ${metadata.license || entry.license}`
        );
        for (const file of files) {
          sections.push(`\n--- ${file} ---\n${readFileSync(resolve(packageDir, file), 'utf8')}`);
        }
      }

      this.emitFile({
        type: 'asset',
        fileName: 'THIRD-PARTY-NOTICES.txt',
        source: sections.join('\n\n'),
      });
      this.emitFile({
        type: 'asset',
        fileName: 'LICENSE.txt',
        source: readFileSync(resolve(projectDir, 'LICENSE'), 'utf8'),
      });
    },
  };
}

/**
 * Collects HTML entry files under src/ and maps page names to their absolute paths.
 *
 * Scans the src directory for files ending with `.html`, uses the filename without
 * the `.html` extension as the page name, and returns a map of page name → absolute path.
 *
 * @returns {Object.<string,string>} An object mapping page names (filename without `.html`) to the resolved absolute path of each HTML file.
 */
function getHtmlInputs() {
  const srcDir = resolve(import.meta.dirname, 'src');
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
          (key) => key.endsWith('.woff2') && key.includes('fa-')
        );

        if (faFonts.length === 0) return html;

        // Prefer fa-solid-900 (used by fa-solid icons e.g. fa-bell);
        // fall back to all FA fonts if none match.
        const criticalFonts = faFonts.filter(
          (f) => f.includes('fa-solid-900') || f.includes('fa-regular-400')
        );
        const fontsToPreload = criticalFonts.length > 0 ? criticalFonts : faFonts;

        const preloadLinks = fontsToPreload
          .map(
            (file) =>
              `  <link rel="preload" href="/${file}" as="font" type="font/woff2" crossorigin="">`
          )
          .join('\n');

        return html.replace('</head>', `${preloadLinks}\n</head>`);
      },
    },
  };
}

export default defineConfig({
  plugins: [faFontPreloadPlugin(), thirdPartyLicensesPlugin()],
  appType: 'mpa',
  root: resolve(import.meta.dirname, 'src'),
  envDir: resolve(import.meta.dirname),
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, 'src'),
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
