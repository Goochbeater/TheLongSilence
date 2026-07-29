# Hosting

Written while turning this into something you can play on a phone. The short
version is at the bottom if you only want the recommendation.

## What is actually being shipped

Measured on the current build (`npm run build`, then `du`/`gzip` over `dist/`):

| | raw | over the wire |
|---|---|---|
| `assets/index-*.js` | 1.68 MB | **528 KB** gzip (~450 KB brotli) |
| `assets/index-*.css` | 24.9 KB | 6.5 KB gzip |
| `models/interior_kit.glb` | 2.92 MB | 2.92 MB — Draco, already compressed |
| `models/*.webp` (terrain + panels) | 2.9 MB | 2.9 MB — already compressed |
| `assets/draco_decoder-*.wasm` | 188 KB | 188 KB (one of the two is fetched) |
| `og.jpg`, icons | 250 KB | not on the critical path |
| **total on disk** | **8.6 MB** | **~6.6 MB to first frame** |

Two things fall out of that and both matter more on a phone than on a desktop:

**Six megabytes is not a CDN problem, it is a first-launch problem.** On a good
LTE connection it is six or seven seconds before the WAKE button appears. Every
host below serves it in about the same time, because 90% of the payload is
already-compressed binary that no edge can improve. The thing that actually
fixes it is `src/sw.js`, which makes the *second* launch instant. Pick a host
that lets you control cache headers and you have solved most of this.

**`assets/draco_decoder-*.js` is 702 KB of dead weight on disk.** three's
`DRACOLoader` references both the WASM decoder and a JS fallback, so Vite emits
both; only the WASM one is ever fetched by a browser that can run this game at
all. It costs deploy size and nothing else. Not worth fighting the loader over,
but do not read the 8.6 MB figure as 8.6 MB of download.

## The options

### Cloudflare Workers static assets — what this repo already uses

`wrangler.jsonc` declares a Worker with no `main`, just `assets.directory =
./dist`, on `longsilence.anshu.dev`. `npm run deploy` builds and pushes it.

- **Cost**: free. Static-asset requests do not bill as Worker invocations, so
  the 100k/day request limit on the free plan does not apply to a pure asset
  Worker. Bandwidth is not metered.
- **Headers**: `public/_headers` is honoured by Workers Assets, same syntax as
  Pages. That is what pins `/assets/*` for a year and `/sw.js` to `no-cache`.
  Verify after any wrangler major bump — this is the one behaviour here that has
  moved between versions.
- **Compression**: brotli automatically, on the fly, for text types.
- **Custom domain**: `routes: [{ custom_domain: true }]` makes Cloudflare create
  and manage the DNS record itself. Already configured.
- **Against it**: you need a Cloudflare account and the domain on Cloudflare's
  nameservers. Deploys are a CLI push rather than a git hook unless you wire up
  the GitHub integration.

### Cloudflare Pages

Same network, same `_headers`, same price. Git-integration deploys with preview
URLs per branch, 500 builds/month free. Functionally interchangeable with the
above for a static site; Cloudflare is steering new projects toward Workers, and
this project is already there. Only worth switching for the preview-per-PR
workflow.

### Netlify

- 100 GB/month bandwidth and 300 build-minutes free.
- `_headers` and `_redirects` work as written — the file syntax this repo uses
  is Netlify's originally.
- At ~6.6 MB of cold payload that is roughly **15,000 cold sessions/month**
  before the free tier runs out. With the service worker doing its job, returning
  players cost nothing, so real capacity is higher.
- **The risk**: overage is $55 per additional 100 GB and it is billed, not
  throttled. One post to the front page of somewhere and a 6.6 MB payload is a
  bill. Set a spend cap if you go this way.

### Vercel

- 100 GB/month on Hobby, similar shape to Netlify.
- No `_headers` file — headers go in `vercel.json`, so `public/_headers` would
  need porting.
- Hobby tier forbids commercial use. Fine for this; worth knowing.

### GitHub Pages

- Free, no account beyond the repo, deploy from a branch or an Action.
- 1 GB site limit and a 100 GB/month soft bandwidth limit. This build fits
  comfortably.
- **No custom headers at all.** That kills `_headers` entirely: no year-long
  immutable caching on `/assets/*`, no `no-cache` on `/sw.js`. The site still
  works — nothing here needs `SharedArrayBuffer`, so no COOP/COEP — but the
  service worker becomes riskier without control over its own cache header, and
  every asset gets GitHub's default 10 minutes.
- Best use: a mirror, or a place to park a build.

### itch.io

Not a replacement for any of the above — a *distribution channel*, and the one
place browser games are actually browsed. Upload `dist/` as a zip, mark it
"playable in browser", set the viewport to something like 960×540 with
"fullscreen button" enabled.

Things that specifically matter for the mobile build:

- The game runs in an iframe, so the permissions it needs must be granted by the
  embed. itch sets `allowfullscreen`; **motion sensors are not granted by
  default**, so tilt-to-steer will not work unless the frame carries
  `allow="gyroscope; accelerometer"`. The controls degrade cleanly — the sticks
  are unaffected — but the setting will appear to do nothing.
- `screen.orientation.lock()` only works from a fullscreen element. Inside
  itch's frame the player has to use itch's own fullscreen button first; after
  that `goImmersive()` behaves normally.
- itch's mobile page layout puts a lot of chrome around a 6.6 MB game. Test it.
- A service worker registered from inside an iframe on a different origin will
  not install. On itch the game is served from `*.hwcdn.net`, so the second
  launch will not be fast there the way it is on your own domain.

### Installing as a PWA — the biggest single mobile win

`public/site.webmanifest` declares `display: fullscreen` with a
`display_override` chain, maskable icons, a screenshot for the richer Android
install sheet, and `launch_handler: focus-existing`. `src/sw.js` is emitted to
`/sw.js` by the build and registered at runtime; with both in place, Chrome on
Android offers "Install app". Installed, the game:

- launches with no browser chrome at all, so no URL bar appearing mid-flight and
  firing a resize that rebuilds a dozen render targets;
- gets a launcher icon and appears in the app switcher as itself;
- starts from cache, so launch is bounded by shader compilation rather than by
  the radio.

This costs nothing and requires no store. It is the answer to "make it a mobile
game" for most of what that phrase means.

### Play Store, via a Trusted Web Activity

If it needs to be *in the store*: [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap)
wraps the installed PWA in an Android package that renders in Chrome without any
browser UI.

```
npx @bubblewrap/cli init --manifest https://longsilence.anshu.dev/site.webmanifest
npx @bubblewrap/cli build
```

- $25 one-time Play developer registration.
- Requires `/.well-known/assetlinks.json` on the origin, containing the signing
  key fingerprint Bubblewrap prints. Without it the TWA falls back to showing a
  browser toolbar, which defeats the point.
- The store listing needs screenshots, a feature graphic, a privacy policy URL,
  and a content rating questionnaire. That is the real cost, not the wrapper.
- Google reviews web-wrapper apps for being more than a bookmark. A game clears
  that bar easily.

Capacitor is the other route and is not worth it here: it exists to give a web
app native APIs, and this game wants exactly one thing from the platform — a
WebGL2 context — which the browser already gives it.

## Recommendation

**Stay on Cloudflare Workers static assets, and lean on the PWA.** It is already
configured, it is free at any traffic this will see, it is the only option in
the list with both no bandwidth meter and full header control, and header
control is what makes the service worker safe. Add itch.io as a second front
door for discovery, with the gyroscope caveat above. Reach for Bubblewrap only
if a Play Store listing is a goal in itself.

If Cloudflare is not an option: Netlify, with a spend cap set.

## Deploy

```
npm run build      # dist/, with sw.js stamped with a build id
npm run deploy     # vite build && wrangler deploy
npm run preview    # serve dist/ locally on :4173
node tools/smoke.mjs  http://localhost:4173/     # boot-and-fly against the build
node tools/mobile.mjs --url http://localhost:4173/   # the four handset geometries
```

Both verification tools run against the built artifact rather than the dev
server, because minification and asset-path rewriting break things the dev
server never shows.

### After a deploy, check

- `curl -I https://<host>/sw.js` returns `Cache-Control: no-cache`.
- `curl -I https://<host>/assets/index-<hash>.js` returns `max-age=31536000, immutable`.
- Chrome DevTools → Application → Manifest reports no installability errors.
- Second load of the page fetches nothing but the navigation request.
