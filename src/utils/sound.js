const SOUND_URLS = {
  match: '/sounds/match-found.mp3',
  move: '/sounds/move.wav',
  capture: '/sounds/capture.wav',
  check: '/sounds/check.wav',
};

const soundCache = new Map();

function getAudioElement(url) {
  if (!url) return null;
  if (!soundCache.has(url)) {
    const audio = new Audio(url);
    audio.preload = 'auto';
    soundCache.set(url, audio);
  }
  return soundCache.get(url);
}

function playAudio(url, volume) {
  const baseAudio = getAudioElement(url);
  if (!baseAudio) return;
  const audio = baseAudio.cloneNode(true);
  audio.volume = volume;
  audio.play().catch(() => {});
}

export function canPlaySound(settings) {
  if (!settings) return false;
  if (!settings.soundEnabled) return false;
  return true;
}

export function playSoundEffect(settings, { type, volumeOverride } = {}) {
  if (!canPlaySound(settings)) return;

  const volume = typeof volumeOverride === 'number'
    ? volumeOverride
    : Math.max(0, Math.min(1, (settings.soundVolume ?? 100) / 100));

  if (type === 'match') {
    playAudio(SOUND_URLS.match, volume);
    return;
  }

  const url = SOUND_URLS[type] || SOUND_URLS.move;
  playAudio(url, volume);
}

export function playMatchFoundSound(settings) {
  playSoundEffect(settings, { type: 'match' });
}
