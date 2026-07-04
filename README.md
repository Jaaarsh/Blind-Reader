# Blind Reader

A camera reader **built blind-first**. Point the phone at a page, a sign, a poster, a pill bottle, a menu — tap anywhere on the screen — and hear it read aloud in a natural voice. No sight is needed to operate it: the app talks, buzzes, and beeps its way through everything, including telling you *how to move the phone* when a photo doesn't come out.

It understands what it sees (via Claude, Anthropic's AI), so it does far more than OCR:

- Reads books and documents in proper reading order, page by page ("turn the page and tap again").
- Reads signs and posters with the important part first.
- Reads medicine labels and medical material **exactly as printed** — dosages and numbers are never paraphrased.
- Describes diagrams, charts, and pictures in line ("There is a diagram here showing…").
- Translates foreign-language text aloud and says what language it was.
- **Ask**: after any reading, press one button and ask a question out loud — *"What's the dosage?"*, *"When does this expire?"*, *"Summarize this page"* — and hear the answer.
- Gives spoken camera-aiming coaching: *"I can see the top of the page but the bottom is cut off. Tilt the phone down a little and tap again."*

Speech output uses the phone's **free built-in voices** (works offline, costs nothing). The only running cost is the AI reading itself — roughly **a few cents per photo** on best quality, or **well under a cent** on the budget model.

---

## How a blind person uses it (the whole manual)

1. Hold the phone about 30 cm above the page, back of the phone facing the text.
2. **Tap anywhere on the top of the screen.** The phone clicks (photo taken), ticks softly (thinking), then reads aloud.
3. Tap again while it's talking to make it stop.
4. Three big buttons across the bottom, left to right:
   - **Again** — repeat the last reading.
   - **Ask** — ask a spoken question about what was just read.
   - **Help** — the app explains itself out loud. (Holding a finger anywhere on the main screen also speaks help.)
5. If the photo was bad, the app says how to move the phone. No error codes, ever.

Every state change has a distinct sound and vibration: click = photo, soft ticking = thinking, rising ding = success, low buzz = try again.

It also works fine **with** VoiceOver/TalkBack running (all controls are real, labeled buttons), but it does not require a screen reader.

---

## Setup (10 minutes, done once by a sighted helper)

### Step 1 — Get a Claude API key

1. Go to [platform.claude.com](https://platform.claude.com), create an account, add a small amount of credit ($5 lasts a long time — hundreds of pages).
2. Create an API key (starts with `sk-ant-`).

### Step 2 — Pick ONE of these two ways to run the app

**Option A — simplest: key on the phone.**
Host the files anywhere that serves HTTPS (GitHub Pages, Netlify, Cloudflare Pages — all free; just upload this folder). Open the site on the phone, tap the small **Setup** link in the top-right corner, paste the API key, press **Test the connection**, then **Save**. The key is stored only on that phone.

**Option B — key on a server (nothing secret on the phone).**
On any machine with [Node.js](https://nodejs.org) (a home PC, Raspberry Pi, or a free-tier cloud box):

```bash
ANTHROPIC_API_KEY=sk-ant-your-key node server.js
```

That's the whole server — no installation, no dependencies. Open `http://<that-machine>:8787` on the phone.

> **HTTPS note:** phone browsers only allow camera access over HTTPS (or on `localhost`). For Option B on a home network, the easiest fixes are a [Tailscale](https://tailscale.com) network with `tailscale serve` (free, one command), or any reverse proxy / tunnel that gives you an HTTPS URL. Static hosts in Option A are HTTPS already.

### Step 3 — Put it on the home screen

In the phone's browser: **Share / menu → Add to Home Screen.** It installs like an app, opens full-screen, and works from a single touch. Consider making it the only icon on the first home-screen page.

### Step 4 — Walk through it together once

Press **Help** and listen together. Practice one page and one "Ask" question. That's it.

### Settings worth knowing (on the Setup page)

| Setting | Notes |
|---|---|
| Model | **Best quality** (Claude Opus 4.8) — recommended for medical/dense material. **Lower cost** (Claude Haiku 4.5) for everyday reading. |
| Speaking speed | Experienced blind users often like 1.5×–2×. |
| Voice | Any voice installed on the phone. |
| Language | Used for the spoken **Ask** questions. |

---

## Costs, kept honest

| Item | Cost |
|---|---|
| The app, hosting (static), speech voices | Free |
| Claude reading, budget model (Haiku 4.5) | well under 1¢ per photo |
| Claude reading, best model (Opus 4.8) | a few cents per photo |

There is no subscription — you pay Anthropic only for what is actually read, from the credit on the API account. The helper can watch usage on the Anthropic console.

## Privacy

Photos go to Anthropic's API to be read, over HTTPS, and are not used to train models under Anthropic's standard API terms. Nothing is stored by the app beyond the last photo (kept in memory so "Ask" works) and the settings on the device. Be mindful when photographing other people's documents.

## Tech notes (for developers)

- Plain HTML/CSS/JS progressive web app. **Zero dependencies, no build step.** `server.js` is a single-file Node proxy (also zero dependencies).
- Vision + understanding: Anthropic Messages API with structured outputs (`output_config.format`), so aiming guidance and content come back as guaranteed-parseable JSON. Browser-direct mode uses the `anthropic-dangerous-direct-browser-access` CORS opt-in; server mode proxies `/api/read` with a model allowlist and token cap.
- Speech out: Web Speech `speechSynthesis`, sentence-chunked (avoids engine cutoffs, makes stop instant). Speech in ("Ask"): `SpeechRecognition` where available (Chrome/Android, iOS Safari), with a graceful spoken fallback message elsewhere.
- Camera: `getUserMedia` rear camera, frames downscaled to ≤2048 px JPEG to balance legibility of small print against token cost; `<input type=file capture>` fallback when live camera is unavailable.
- Offline: service worker caches the shell; the app opens and explains itself with no connection, and says clearly when the network is needed.

## Files

```
index.html          the reader (one giant button + three big buttons)
settings.html       one-time setup page for a sighted helper
js/                 app modules (camera, speech, sounds, Claude API, storage)
css/app.css         high-contrast, huge-target styling
server.js           optional zero-dependency key-holding proxy + static server
sw.js               offline shell caching
manifest.webmanifest, icons/   installable-app packaging
```
