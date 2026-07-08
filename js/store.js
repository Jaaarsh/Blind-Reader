// Settings persistence. Everything lives in localStorage so the app works
// entirely offline once the one-time setup is done.

const KEY = 'blind-reader-settings-v1';

// Supported AI services. Anthropic Claude gives the best reading quality
// (recommended for medical/dense material); Google Gemini has a genuinely
// free tier; OpenAI is offered for choice/redundancy.
export const PROVIDERS = {
  anthropic: {
    label: 'Anthropic Claude (best quality, paid)',
    keyHint: 'Create a key at platform.claude.com (starts with sk-ant-). Paid: roughly cents per page.',
    models: {
      best:   { id: 'claude-opus-4-8',  label: 'Best quality (Claude Opus 4.8) — recommended for medical and dense material' },
      budget: { id: 'claude-haiku-4-5', label: 'Lower cost (Claude Haiku 4.5) — fine for signs and everyday text' },
    },
  },
  google: {
    label: 'Google Gemini (free tier available)',
    keyHint: 'Create a free key at aistudio.google.com/apikey — no credit card needed. The free tier has a daily limit; Flash has the roomiest free quota.',
    models: {
      best:   { id: 'gemini-2.5-pro',   label: 'Best quality (Gemini 2.5 Pro) — small free daily quota' },
      budget: { id: 'gemini-2.5-flash', label: 'Faster (Gemini 2.5 Flash) — largest free quota' },
    },
  },
  openai: {
    label: 'OpenAI (paid)',
    keyHint: 'Create a key at platform.openai.com (starts with sk-). Paid: roughly cents per page.',
    models: {
      best:   { id: 'gpt-5',      label: 'Best quality (GPT-5)' },
      budget: { id: 'gpt-5-mini', label: 'Lower cost (GPT-5 mini)' },
    },
  },
};

const DEFAULTS = {
  provider: 'anthropic', // key into PROVIDERS
  apiKey: '',            // API key for the chosen provider
  serverCode: '',        // optional passcode for this app's own server
  mode: 'auto',          // 'auto' | 'direct' | 'server' (Anthropic only)
  modelChoice: 'best',   // 'best' | 'budget'
  speechRate: 1.0,       // 0.5 .. 2.0
  voiceURI: '',          // preferred speechSynthesis voice, empty = system default
  language: 'en',        // primary language of the user, used for speech recognition
  cameraId: '',          // specific camera device (e.g. a PC document webcam)
};

export function loadSettings() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(settings) {
  localStorage.setItem(KEY, JSON.stringify(settings));
}

export function providerOf(settings) {
  return PROVIDERS[settings.provider] ? settings.provider : 'anthropic';
}

export function modelId(settings) {
  const models = PROVIDERS[providerOf(settings)].models;
  return (models[settings.modelChoice] || models.best).id;
}
