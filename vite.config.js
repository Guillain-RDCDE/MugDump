import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// One source tree (src/) builds the web app into docs/ (served by GitHub Pages)
// and the same output is what the Electron shell loads — no duplicated renderer.
/** In dev, let the HMR websocket through the page's Content-Security-Policy. */
const devCsp = () => ({
  name: 'mugdump-dev-csp',
  apply: 'serve',
  transformIndexHtml: (html) =>
    html.replace(
      /connect-src 'self'/,
      "connect-src 'self' ws://localhost:5173 http://localhost:5173",
    ),
});

export default defineConfig({
  plugins: [devCsp()],
  root: 'src',
  publicDir: 'public',
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    outDir: '../docs',
    emptyOutDir: true,
    // Readable, diff-friendly output: docs/ is committed for GitHub Pages.
    minify: false,
    sourcemap: false,
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
