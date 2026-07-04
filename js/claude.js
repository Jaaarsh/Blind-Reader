// The understanding engine: Claude vision reads and explains what the camera
// sees. Two transports:
//   direct — the phone calls the Anthropic API itself (key stored on device)
//   server — the phone calls this app's own /api/read proxy (key stays on the
//            server; nothing secret on the phone)

import { loadSettings, modelId } from './store.js';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

const READ_SYSTEM = `You are the vision engine inside "Blind Reader", an app whose user is completely blind. They pointed their phone camera at something and want to hear what it says. Your entire output is spoken aloud by text-to-speech, so write plain flowing sentences: no markdown, no bullet points, no headers, no emoji, no visual formatting of any kind.

If the photo contains readable material, set readable to true and put the full reading in "content":
- Read the actual text faithfully and in its natural reading order. Do not summarize unless the text is enormous (like a wall of fine print), and if you must condense, say so first.
- READING ORDER MATTERS. Before you start, work out the page layout. If the page has multiple columns, read the ENTIRE left column from top to bottom first, then the next column to its right, and so on — never jump between columns. If two facing book pages are visible, read the left page completely before the right page. Sidebars and boxed insets come after the main text they sit beside, introduced with a phrase like "There is also a box here that says...".
- For signs, posters, and notices: lead with the most important message, then the supporting details.
- For books and documents: the page number is the VERY FIRST thing you say, before anything else — "Page 132." — so the listener immediately knows where they are. If two facing pages are visible say "Pages 132 and 133." If no page number is visible on a book or document page, start with "No page number visible." Then a visible chapter or section heading, then read the page from top to bottom.
- For medicine labels, medical documents, dosages, and numbers: read them exactly as printed, digit by digit where precision matters. Never paraphrase a dosage, date, or amount.
- DIAGRAMS, FIGURES, AND ILLUSTRATIONS DESERVE A FULL DESCRIPTION, not a passing mention. The listener may be a professional who needs the figure's actual content. When you reach one, pause the text and describe it thoroughly and in an organized way: first say what it depicts overall and from what view or orientation, then walk through it region by region — every label, marking, arrow, shaded area, and callout, saying where each one sits (for example "at the crown of the head", "just behind the ear", "the arrow pointing from the third vertebra") and what it is marking. Read the figure number and caption exactly. For anatomical, medical, and scientific figures, name the structures with the same precision an atlas would. For charts and graphs, give the axes, units, the overall trend, and the notable values. Then say you are returning to the text and continue. Only skip images that are purely decorative.
- Expand awkward abbreviations only when the expansion is certain, otherwise read them as letters.
- If the text is not in the user's language, read a faithful translation and say which language the original is in.
- If several distinct items are visible, say what you can see in one sentence, then read the most prominent one, then mention the user can aim closer at the others.

If the photo cannot be read (too blurry, too dark, too far, mostly cut off, lens covered, or nothing readable in view), set readable to false and put SHORT physical instructions in "guidance" — concrete, body-relative directions a blind person can follow, for example: "I can see the top of a page but the bottom is cut off. Tilt the phone down a little and hold it about thirty centimeters above the page, then tap again." Mention lighting if the image is dark. Never scold; always end guidance with an invitation to try again.

If the photo is readable but part of the material is clearly cut off, read what is visible and put a short aiming tip in "guidance" as well.

Always fill "kind" with the best matching category.`;

const READ_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['readable', 'kind', 'content', 'guidance'],
  properties: {
    readable: { type: 'boolean', description: 'True if any useful text or content could be read from the image.' },
    kind: {
      type: 'string',
      enum: ['document', 'book', 'sign', 'poster', 'label', 'handwriting', 'screen', 'scene', 'other'],
      description: 'What the photographed thing is.',
    },
    content: { type: 'string', description: 'The full spoken reading. Empty string when readable is false.' },
    guidance: { type: 'string', description: 'Short spoken camera-aiming help. Empty string when nothing needs adjusting.' },
  },
};

const ASK_SYSTEM = `You are the assistant inside "Blind Reader", an app for a completely blind user. They asked a spoken question and the app took a photo of whatever the camera sees right now. You may also receive an earlier photo, the transcript of the last thing read aloud, and earlier questions and answers from this session — treat those as running conversation history, so follow-ups like "and what artery supplies it?" or "say that again more slowly" make sense. Note the current photo may show a completely different scene or page than the earlier one.

How to answer, in this order:
1. If the answer is in the photographed material, answer from it. Typical questions: what page is this book open to, what is this object, what is the dosage, is anything expired, summarize this page. Be precise with any numbers, dosages, dates, and names, exactly as printed.
2. If the question goes beyond what is on the page — a related topic, background, a comparison, or something else entirely — answer it from your own knowledge like a knowledgeable colleague would, but FIRST make the source clear with a short phrase such as "That is not on this page, but from general knowledge:". Never present general knowledge as if it were printed in front of them. The user may be a medical professional, so answer technical questions at a professional level.
3. If the question is about the page but the relevant part is not visible in the photo, say so and suggest how to aim the camera to capture it.
4. If you are unsure of a fact, say you are unsure rather than guessing — the listener cannot double-check you visually.

Your answer is spoken aloud by text-to-speech: plain conversational sentences, no markdown or formatting. Keep it reasonably brief unless detail was requested.`;

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function usingDirect(settings) {
  return settings.mode === 'direct' || (settings.mode === 'auto' && settings.apiKey);
}

// Never leave a blind user waiting forever: hard timeout on every request.
const REQUEST_TIMEOUT_MS = 90000;

async function callClaude(body) {
  const settings = loadSettings();
  const useDirect = usingDirect(settings);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);

  let res;
  try {
    if (useDirect) {
      res = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        signal: ctrl.signal,
        headers: {
          'content-type': 'application/json',
          'x-api-key': settings.apiKey,
          'anthropic-version': '2023-06-01',
          // Required opt-in for calling the Anthropic API from a browser.
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify(body),
      });
    } else {
      const headers = { 'content-type': 'application/json' };
      if (settings.serverCode) headers['x-reader-code'] = settings.serverCode;
      res = await fetch('api/read', {
        method: 'POST',
        signal: ctrl.signal,
        headers,
        body: JSON.stringify(body),
      });
    }
  } catch (err) {
    throw new ApiError(err && err.name === 'AbortError' ? -1 : 0, 'network');
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json())?.error?.message || ''; } catch {}
    throw new ApiError(res.status, detail);
  }
  return res.json();
}

function imageBlock(base64Jpeg) {
  return {
    type: 'image',
    source: { type: 'base64', media_type: 'image/jpeg', data: base64Jpeg },
  };
}

function firstText(response) {
  const block = (response.content || []).find(b => b.type === 'text');
  return block ? block.text : '';
}

/** Photograph → { readable, kind, content, guidance } */
export async function readImage(base64Jpeg) {
  const response = await callClaude({
    model: modelId(loadSettings()),
    max_tokens: 16000,
    system: READ_SYSTEM,
    output_config: { format: { type: 'json_schema', schema: READ_SCHEMA } },
    messages: [{
      role: 'user',
      content: [
        imageBlock(base64Jpeg),
        { type: 'text', text: 'Here is what my camera sees right now. Please read it to me.' },
      ],
    }],
  });
  try {
    return JSON.parse(firstText(response));
  } catch {
    // Extremely rare with structured outputs, but never leave the user hanging.
    return { readable: true, kind: 'other', content: firstText(response), guidance: '' };
  }
}

/**
 * Spoken question about what the camera sees (and, if available, the last
 * thing that was read). Returns spoken answer text.
 */
export async function askAboutImage({ currentImage, previousImage, previousReading, history, question }) {
  const content = [];
  if (previousImage && previousImage !== currentImage) {
    content.push({ type: 'text', text: 'Earlier photo, from the last reading:' });
    content.push(imageBlock(previousImage));
  }
  if (currentImage) {
    content.push({ type: 'text', text: 'Current photo, what the camera sees right now:' });
    content.push(imageBlock(currentImage));
  }
  let text = '';
  if (previousReading) text += `The last thing read aloud to me was: "${previousReading}"\n\n`;
  if (history && history.length) {
    text += 'Earlier questions and answers in this session:\n';
    for (const h of history) text += `I asked: ${h.q}\nYou answered: ${h.a}\n`;
    text += '\n';
  }
  text += `My question now: ${question}`;
  content.push({ type: 'text', text });

  const response = await callClaude({
    model: modelId(loadSettings()),
    max_tokens: 16000,
    system: ASK_SYSTEM,
    messages: [{ role: 'user', content }],
  });
  return firstText(response);
}

/** Turn an API failure into a sentence a blind user can act on. */
export function explainError(err) {
  const status = err && err.status;
  const direct = usingDirect(loadSettings());
  if (status === -1) return 'That took too long. Please tap to try again.';
  if (status === 0) return 'I could not reach the internet. Please check the connection, then tap to try again.';
  if (status === 401 || status === 403) {
    return direct
      ? 'The access key was rejected. Please ask your helper to open Setup and check the key.'
      : 'The reading server would not let this phone in. Please ask your helper to check the passcode in Setup.';
  }
  if (status === 429) return 'The reading service says we are going too fast. Please wait a minute, then tap to try again.';
  if (status === 404 && !direct) return 'This app has not been set up yet. Please ask a sighted helper to open the Setup page.';
  if (status >= 500) return 'The reading service had a temporary problem. Please tap to try again.';
  return 'Something went wrong while reading. Please tap to try again.';
}
