<p align="center"><img src="icons/icon.svg" width="110" alt="Blind Reader icon: an open book with sound waves"></p>

# Blind Reader

**Point the camera at anything with words on it — tap the screen or press the space bar — hear it read aloud.**

📱 **Phones & tablets** — the whole screen is one big touch target &nbsp;·&nbsp; 💻 **Desktops & laptops** — full keyboard controls (space bar reads) with any webcam &nbsp;·&nbsp; 🌐 **Any modern browser** — nothing to install, same app everywhere

📚 **Built for serious reading, not just labels.** Designed from the start for educational and professional material — textbooks, medical and technical documents, multi-column pages, **charts, diagrams and figures described in full detail** (every label and marking, atlas-style) — as well as regular books, mail, prescriptions, and signs.

🔑 **Bring your own AI.** The app has no AI of its own and no service behind it — you connect it to an AI provider with your own key: **Anthropic Claude** (paid, best reading quality), **Google Gemini** (free tier, no credit card), or **OpenAI** (paid). Your key and your photos go straight from your device to the provider you chose — nothing in between.

This started as a small project for one person: a friend, a doctor in his eighties who lost his sight and could no longer read his books and medical materials. It grew into a complete blind-first reading app, and it's shared here so **anyone who needs it can use it** — no installation, no app store, no subscription. Just a phone, tablet, or computer with a browser, and an AI key (there's a genuinely free option).

## Use it yourself

- **Easiest:** open the app at **[jaaarsh.github.io/Blind-Reader](https://jaaarsh.github.io/Blind-Reader/)** on any phone, tablet, or computer, tap **Setup** (top right, twice), and add your own AI key — Google Gemini's is free, no credit card ([details below](#step-1--get-an-api-key-paid-best-quality-or-free)). Your key and settings stay on your own device; the app has no server and collects nothing.
- **Or run your own copy:** fork this repo, then in your fork go to **Settings → Pages → Source → "GitHub Actions"**. A minute later it's live at `https://<your-name>.github.io/Blind-Reader/`. Everything auto-deploys from there.

It's a hobby project maintained for one user first — issues and suggestions are welcome, but there are no promises. MIT licensed: copy it, change it, host it for someone you love.

---

A camera reader **built blind-first**. Point the phone at a page, a sign, a poster, a pill bottle, a menu — tap anywhere on the screen — and hear it read aloud in a natural voice. No sight is needed to operate it: the app talks, buzzes, and beeps its way through everything, including telling you *how to move the phone* when a photo doesn't come out.

It understands what it sees (an AI vision model — Claude by default, Gemini or GPT if you prefer), so it does far more than OCR:

- Reads books and documents in proper reading order, page by page ("turn the page and tap again").
- Reads signs and posters with the important part first.
- Reads medicine labels and medical material **exactly as printed** — dosages and numbers are never paraphrased.
- Describes diagrams, charts, and pictures in line ("There is a diagram here showing…").
- Translates foreign-language text aloud and says what language it was.
- **Ask**: press one button any time and ask out loud about whatever the camera sees — *"What page is this book open to?"*, *"What's the dosage?"*, *"Summarize this page"* — and hear the answer. No need to read first.
- Gives spoken camera-aiming coaching: *"I can see the top of the page but the bottom is cut off. Tilt the phone down a little and tap again."*
- **Runs everywhere**: on a phone or tablet, everything is done by touch — big targets, simple gestures. On a desktop or laptop with a webcam, everything is done by keyboard — space bar reads, Enter continues, A asks — and pressing any other key speaks the controls out loud.

Speech output uses the phone's **free built-in voices** (works offline, costs nothing). The only running cost is the AI reading itself — roughly **a few cents per photo** on best quality, or **well under a cent** on the budget model.

---

## How a blind person uses it (the whole manual)

1. Hold the phone about a foot above the page, back of the phone facing the text.
2. **Tap anywhere on the top of the screen.** The phone clicks (photo taken), ticks softly (thinking), then reads aloud.
3. Tap again while it's talking to make it stop.
4. Three big buttons across the bottom, left to right:
   - **Again** — continues from the sentence where the voice stopped, or repeats the reading.
   - **Ask** — ask a spoken question about whatever the camera is pointed at ("what page is this book open to?"), or about what was just read.
   - **Help** — the app explains itself out loud. (Holding a finger anywhere on the main screen also speaks help.)
5. **Slide a finger up** the screen to make the voice talk faster, **down** to slow it — the confirmation is spoken at the new speed.
6. Reading a book? After each page it says *"Turn the page and tap to continue."*
7. If the photo was bad, the app says how to move the phone. No error codes, ever.

The **very first tap ever** gives a spoken tour automatically, so the app teaches itself. Every state change has a distinct sound and vibration: click = photo, soft ticking = thinking, rising ding = success, low buzz = try again.

It also works fine **with** VoiceOver/TalkBack running (all controls are real, labeled buttons), but it does not require a screen reader.

### Designed so nothing can go wrong solo

- **Never silent:** a tap while it's thinking answers "Still working, one moment"; requests time out after 90 seconds with a spoken message; even an internal crash speaks ("close the app and open it again") instead of freezing quietly.
- **Never lost:** the Setup link cannot be opened by a stray touch (a single tap explains it out loud; only a deliberate second tap opens it), the setup page announces itself and has a giant yellow "Back to the reader" button, and pull-to-refresh / zoom / text-selection are all disabled.
- **Never asleep:** the app holds the screen awake while in use, and speech recovers automatically if the screen blanks mid-sentence.
- **Nothing destructive exists:** every button only ever talks. There is nothing to delete, buy, send, or misconfigure from the reader screen.

---

## Setup (10 minutes, done once by a sighted helper)

### Step 1 — Get an API key (paid best-quality, or free)

Blind Reader works with three AI services — pick one:

| Service | Cost | Notes |
|---|---|---|
| **Anthropic Claude** (recommended) | ~cents per page | Best reading quality, especially medical/dense material. [platform.claude.com](https://platform.claude.com) → add ~$5 credit → create a key (`sk-ant-…`). |
| **Google Gemini** | **Free tier** | Genuinely free, no credit card: [aistudio.google.com/apikey](https://aistudio.google.com/apikey) → "Get API key". Daily limit on the free tier (the Flash model has the roomiest quota). Quality is good, a notch below Claude on complex pages. |
| **OpenAI** | ~cents per page | [platform.openai.com](https://platform.openai.com) → create a key. |

Choose the service and paste its key on the Setup page. You can switch services at any time — even keep a Claude key on his phone and a free Gemini key as a spare browser setup.

> **Why a key at all?** None of the AI providers offer a "sign in with…" option that would let a web app use their AI on your behalf — an API key is the only door they provide, so pasting one key once is as easy as it can get. Blind Reader softens it three ways: the **Test button** tells you instantly if the key works, the **setup link** means it's pasted once ever (every other device gets configured by opening a link), and **server mode** (Option B below) means nobody pastes anything except the person hosting.

### Step 2 — Pick ONE of these two ways to run the app

**Option A — simplest: key on the phone.**
Host the files anywhere that serves HTTPS. The easiest: this repo already contains a GitHub Pages workflow — merge to the default branch, then in the repo go to **Settings → Pages → Source → GitHub Actions**, and the app is live at `https://<user>.github.io/<repo>/` a minute later (Netlify/Cloudflare Pages work too).

Then connect the phone **without typing anything on it**:

1. Open `…/settings.html` on **your own computer**, paste the API key, press **Test the connection**, then **Save**.
2. Press **Create setup link** and text/email that link to the phone.
3. Open the link on the phone — it announces "Setup complete" and the app is ready. Delete the message afterwards (the link contains the key).

The key is stored only on that phone. You can also do it directly on the phone via its Setup page if you prefer.

**Option B — keys on a server (no keys on any phone or PC — the easiest setup for everyone else).**
On any machine with [Node.js](https://nodejs.org) (a home PC, Raspberry Pi, or a free-tier cloud box), start the server with whichever provider keys you have — any subset works:

```bash
ANTHROPIC_API_KEY=sk-ant-… GEMINI_API_KEY=… OPENAI_API_KEY=… node server.js
```

That's the whole server — no installation, no dependencies. Open `http://<that-machine>:8787` on the phone: devices using it need **no key at all** (in Setup, just pick the AI service and leave the key empty). This is the way to host for family or a community — one person manages the keys, everyone else just opens the app.

If the server is reachable from the internet, also set a passcode so strangers can't spend your API credit — and it rate-limits per address on top of that:

```bash
ANTHROPIC_API_KEY=sk-ant-your-key READER_PASSCODE="any phrase" node server.js
```

Enter the same phrase once on the phone's Setup page under "Server passcode".

> **HTTPS note:** phone browsers only allow camera access over HTTPS (or on `localhost`). For Option B on a home network, the easiest fixes are a [Tailscale](https://tailscale.com) network with `tailscale serve` (free, one command), or any reverse proxy / tunnel that gives you an HTTPS URL. Static hosts in Option A are HTTPS already.

### Step 3 — Put it on the home screen

In the phone's browser: **Share / menu → Add to Home Screen.** It installs like an app, opens full-screen, and works from a single touch. Consider making it the only icon on the first home-screen page.

### Step 4 — Lock the phone into the app (strongly recommended)

For someone who can't see and doesn't love technology, the biggest risk is a stray touch leaving the app. Both platforms can physically pin the phone to Blind Reader:

- **iPhone — Guided Access:** Settings → Accessibility → Guided Access → on (set a passcode only the helper knows). Open Blind Reader, then **triple-click the side button**. The phone now cannot leave the app until the helper triple-clicks again.
- **Android — App pinning:** Settings → Security → App pinning → on. Open Blind Reader, open the recent-apps view, tap the app's icon → **Pin**.

A cheap spare phone dedicated to nothing but this app + Guided Access is a genuinely great setup: it becomes a single-purpose reading machine with one physical action to learn ("pick it up, tap the screen").

### Step 5 — Walk through it together once

The first tap plays a spoken tour automatically. Practice one page, one "Ask" question, and the speed swipe. That's it.

### Settings worth knowing (on the Setup page)

| Setting | Notes |
|---|---|
| AI service | Anthropic Claude (best quality, paid), Google Gemini (free tier), or OpenAI (paid). |
| Model | **Best quality** — recommended for medical/dense material. **Lower cost / free** for everyday reading (on Gemini's free tier, Flash allows far more readings per day). |
| Speaking speed | Experienced blind users often like 1.5×–2×. |
| Voice | Any voice installed on the phone. |
| Language | Used for the spoken **Ask** questions. |

---

## Using it on a PC (webcam + keyboard)

The same app works great on a computer — often better for someone who prefers big physical keys over a touchscreen:

1. **Camera:** point a webcam down at the desk (a gooseneck webcam stand or a "document camera" works perfectly; a laptop's built-in camera can also be aimed at a book propped in front of it).
2. **Browser:** open the same app URL in Chrome or Edge (voice questions don't work in Firefox). Do setup via the same setup link, or the Setup page.
3. **Pick the right camera:** Setup page → "Camera" → Detect cameras → choose the document webcam → Save.
4. **Keyboard controls** (pressing any other key speaks this list out loud):

| Key | Action |
|---|---|
| **Space bar** | Take a picture and read it / stop the voice |
| **Enter** | Continue where the voice stopped, or repeat |
| **A** | Ask a spoken question |
| **H** | Help, spoken |
| **Up / Down arrows** | Voice faster / slower |

A useful desk setup: book flat on the desk, webcam above it, space bar within reach — reading a book becomes *turn page, press space, listen*.

**One-click kiosk shortcut** (opens the reader full-screen with nothing else on screen):

- **Windows:** right-click the desktop → New → Shortcut, and paste as the location (adjust the URL if yours differs):
  ```
  "C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk --app=https://jaaarsh.github.io/Blind-Reader/
  ```
  Name it "Reader". Opening that shortcut puts the reader full-screen; Alt+F4 exits.
- **Mac:** in Terminal, run `nano ~/Desktop/Reader.command`, paste the line below, save, then run `chmod +x ~/Desktop/Reader.command` once. Double-clicking "Reader" on the desktop opens the reader full-screen (⌘Q exits):
  ```
  open -na "Google Chrome" --args --kiosk --app=https://jaaarsh.github.io/Blind-Reader/
  ```

## Recommended desk setup (hardware that matters more than software)

- **A desk lamp aimed at the page.** Poor light is the #1 cause of bad readings.
- **A gooseneck phone holder or webcam stand** pointing straight down, so reading is hands-free.
- **A book weight or page holder** (a few dollars) — curled pages are the #2 cause of misreads.
- **A charging cradle where the reader lives.** The phone should have one home, always charging.
- If hearing is reduced: pick the clearest voice in Setup, slightly slower, and consider a small external speaker on the PC.

## Beyond this app (the rest of the toolkit)

Blind Reader is best at **personal material**: medical texts, mail, labels, notes, anything that exists only on your desk. For other needs, pair it with:

- **[Bookshare](https://www.bookshare.org)** — huge accessible library of published books, free for US readers with a qualifying print disability (a doctor's certification qualifies). Whole books, no camera.
- **NLS BARD** ([loc.gov/nls](https://www.loc.gov/nls/)) — the Library of Congress free talking-book program.
- **[Be My Eyes](https://www.bemyeyes.com)** — free video call to a sighted volunteer for anything a camera app can't handle.

## Troubleshooting

**Start with the built-in [Helper's Guide](helper.html)** (`…/helper.html` on your deployed site) — plain words, large print, printable, written for a non-technical helper. Its one-button check-up tests the key, internet, voice, and camera and says what's wrong in plain language.

- **"This app has not been set up yet" / reading errors in a new browser or phone:** settings (including the key) are stored per browser, per device. Open the setup link in that browser once, or fill in its Setup page. The setup link is reusable — keep it somewhere private.
- **Ask says voice questions aren't supported:** the browser lacks voice input. Firefox doesn't support it on any website; use Chrome, Edge, or Safari. Reading itself works everywhere.
- **Camera won't open:** the site must be served over HTTPS (GitHub Pages is), and the browser needs camera permission — check the padlock icon next to the address.

## Costs, kept honest

| Item | Cost |
|---|---|
| The app, hosting (static), speech voices | Free |
| Claude reading, budget model (Haiku 4.5) | well under 1¢ per photo |
| Claude reading, best model (Opus 4.8) | a few cents per photo |

There is no subscription — you pay Anthropic only for what is actually read, from the credit on the API account. The helper can watch usage on the Anthropic console.

## Privacy

The app itself has no server and collects nothing. Photos go over HTTPS directly from your device to **the AI provider you connected** — Anthropic, Google, or OpenAI — to be read, under that provider's API terms (check the current data policy of whichever you choose; free tiers can have different terms than paid API use). Nothing is stored by the app beyond the last photo (kept in memory so "Ask" works) and the settings on the device. Be mindful when photographing other people's documents.

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

## License

[MIT](LICENSE) — free for anyone to use, copy, change, and re-host. If you set this up for someone who needs it, that's exactly what it's for.
