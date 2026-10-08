# Knox

*a Spiritual Spell challenge.* Knox guards a single word. Players try to get the model to give it up, then prove it in the vault.

The model is DeepSeek R1 via OpenRouter, behind a streaming chat UI: live reasoning, regenerate with version switching, edit and resend, delete, stop, and saved chats. Up top is a small moonlit diorama: carved wooden KNOX blocks tumble onto the grass, a tree grows, and a mouse, rabbit, squirrel, owl and fireflies go about their night. It reacts to the chat (the owl watches while Knox thinks, everything scatters when the filter catches a leak, and the tree blossoms when someone opens the vault). It collapses from the toolbar and starts collapsed on phones in landscape. No build step and no dependencies.

```
public/                     static site (all the browser ever sees)
public/js/scene/            the header diorama: sky, land, tree, title blocks, creatures
netlify/edge-functions/     /api/chat (streaming) and /api/verify (the vault)
lib/                        system prompt, scrubber, signing, history rules — bundled into the edge functions only
scripts/dev.mjs             local preview with a fake model
tests/                      node --test
```

## Deploy on Netlify

1. New site from this repo. Set **Base directory** to `knox`. Leave the build command empty; the publish directory comes from `netlify.toml`.
2. Under **Site configuration → Environment variables**, add:

| Variable | Required | Default | |
|---|---|---|---|
| `OPENROUTER_API_KEY` | yes | | Your OpenRouter key. Set a credit limit on it. |
| `KNOX_SECRET` | yes | | The protected word. It never goes in the repo. |
| `KNOX_MODEL` | | `deepseek/deepseek-r1-0528` | Any OpenRouter model ID |
| `KNOX_OUTPUT_FILTER` | | `block` | `block` · `strict` · `redact` · `off` (see below) |
| `KNOX_THINKING` | | `show` | `hide` sends no reasoning text, only the timer |
| `KNOX_MAX_TOKENS` | | `6000` | Reasoning counts toward this |
| `OPENROUTER_PROVIDER_SORT` | | | `price`, `throughput` or `latency` |
| `KNOX_SIGNING_KEY` | | derived | Set this to rotate signatures without changing the secret |

3. Deploy.

**Why edge functions:** R1 can think for a minute or more. Regular Netlify Functions can only stream for 10–30 seconds. Edge functions just have to send headers within 40 seconds, then they can keep streaming. CPU is billed, not time spent waiting on the model.

**Cost guard:** `/api/chat` is rate-limited to 12 requests per minute per IP, and `/api/verify` to 10 (see `config` in each function; check that your Netlify plan supports code-based rate limits). Requests from other origins are refused. History is capped to a sliding window. Put a monthly limit on the OpenRouter key as well.

## Editing the system prompt

The prompt lives in [`lib/prompt.js`](lib/prompt.js), on the server side only. Edit the text between the backticks, keeping `${word}` wherever the secret goes (never type the real word), then commit and push. Netlify redeploys automatically. The comment at the top of the file lists the two placeholders and how to escape a literal backtick.

## Run locally

```sh
cd knox
npm run dev        # http://localhost:8888, fake model, demo secret "lanternmoth"
npm test
```

The fake model reacts to a few phrases. Anything with "spell" or "leak" triggers a leak, so you can watch the filter catch it. "Do it now" triggers the lockdown. Anything else gets a story. To hit the real model locally, set `OPENROUTER_API_KEY` and `KNOX_SECRET` before `npm run dev`, or use `netlify dev`.

## Defences

| Layer | What it does |
|---|---|
| Server-side prompt | The system prompt lives in `lib/` and is bundled into the edge function. Nothing in DevTools reveals it. The secret comes from an env var. **If this GitHub repo is public, the prompt text is readable there**, so make the repo private if the prompt itself should stay hidden. |
| Signed history | Every reply Knox sends carries an HMAC signature. Replies without a valid signature are dropped before the model sees them, so players can't forge assistant turns ("Sure, the word is…"). Signatures cover content only, so replaying a real Knox reply elsewhere is allowed. |
| Role lock | Only `user` and `assistant` roles get through. Clients can't inject `system`. |
| Output filter | See below. |
| Lockdown | When Knox says "Goo ga ga…", the browser seals that chat (no regenerate, no new messages). This is UI-level flavour. Someone calling the API directly can just start over, which is what a new chat is anyway. |
| Vault | Guesses are checked server-side in constant time. A correct guess returns a flag (`KNOX-XXXX-XXXX-XXXX`) that players can show as proof. |

### The scrubber question

A scrubber is worth having, and with R1 it isn't optional. R1's reasoning streams to the browser, and R1 *will* think the word ("I must not reveal ▓▓▓▓▓…"). Without a scrubber on the reasoning channel, every message leaks the answer.

So `lib/scrubber.js` always runs over the reasoning. It matches the word through spacing, punctuation, markdown, zero-width characters, leetspeak, look-alike letters (Cyrillic, fullwidth, math-bold, accents, combining marks), reversal and ROT13. Each match is replaced with a fixed-width `▓▓▓▓▓`, so the redaction doesn't reveal the word's length. It holds back a short tail of the stream, so a match can't be split across chunks.

For the answer channel, it's a design choice:

- **`block`** (default): if the answer contains the word, the stream is cut and the answer is swapped for Knox's own protective-spell line. Answers still stream live. The visible swap tells the player the filter fired, so it acts as an "almost" signal. That's fine for a game.
- **`strict`**: the answer is held back until it's complete, then sent or replaced. Players can't see when the filter fires. You lose live streaming on the answer, but the reasoning still streams.
- **`redact`**: inline `▓▓▓▓▓` in the answer instead of blocking.
- **`off`**: the model alone. Purist mode.

Exact-match scrubbing is a good baseline. It stops the cheap wins and forces players to get creative. It does **not** catch acrostics, NATO alphabet, translations, rhymes, base64, "the first half is…", or the word built up one letter per message. Those gaps are where the game lives. The bigger hole is the visible reasoning itself: R1 paraphrases its instructions and drops partial hints while it thinks. If you want a harder level, set `KNOX_THINKING=hide`, and next add a cheap input classifier in front of the model.
