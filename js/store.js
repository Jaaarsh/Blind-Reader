// Settings persistence. Everything lives in localStorage so the app works
// entirely offline once the one-time setup is done.

const KEY = 'blind-reader-settings-v1';

export const MODELS = {
  best:   { id: 'claude-opus-4-8',  label: 'Best quality (Claude Opus 4.8)' },
  budget: { id: 'claude-haiku-4-5', label: 'Lower cost (Claude Haiku 4.5)' },
};

const DEFAULTS = {
  apiKey: '',            // Anthropic API key for direct-from-phone mode
  mode: 'auto',          // 'auto' | 'direct' | 'server'
  modelChoice: 'best',   // key into MODELS
  speechRate: 1.0,       // 0.5 .. 2.0
  voiceURI: '',          // preferred speechSynthesis voice, empty = system default
  language: 'en',        // primary language of the user, used for speech recognition
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

export function modelId(settings) {
  return (MODELS[settings.modelChoice] || MODELS.best).id;
}
