import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

/**
 * Emit the service worker, stamped with a build id.
 *
 * It lives in `src/` rather than `public/` and is emitted rather than copied,
 * for two reasons. `public/` is copied verbatim by a plugin whose ordering
 * against a `closeBundle` hook is not something to depend on — the first
 * version of this rewrote the file before it had been copied, silently, and
 * shipped a worker still containing the literal `__BUILD__`. And a worker in
 * `public/` is served by the dev server, where a worker sitting in front of
 * hot module replacement serves the previous copy of a file you just edited.
 *
 * The stamp is not cosmetic. A service worker whose bytes never change is one
 * the browser never re-installs: old caches are never dropped, a stale bundle
 * is served forever, and the site is broken in a way no deploy fixes.
 */
function serviceWorker() {
  return {
    name: 'service-worker',
    apply: 'build',
    generateBundle() {
      const v = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',            // exact path: scope is where it is served
        source: readFileSync('src/sw.js', 'utf8').replaceAll('__BUILD__', v),
      });
    },
  };
}

export default defineConfig({
  server: { host: '0.0.0.0', port: 5173 },
  plugins: [serviceWorker()],
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
  },
});
