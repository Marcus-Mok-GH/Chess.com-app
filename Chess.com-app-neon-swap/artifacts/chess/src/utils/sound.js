const MATCH_SOUND_URL = '/sounds/match-found.mp3';

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
    const audio = new Audio(MATCH_SOUND_URL);
    audio.volume = volume;
    audio.play().catch(() => {});
    return;
  }

  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.type = 'sine';

    switch (type) {
      case 'capture':
        oscillator.frequency.setValueAtTime(520, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(220, audioContext.currentTime + 0.15);
        break;
      case 'check':
        oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(660, audioContext.currentTime + 0.2);
        break;
      case 'move':
      default:
        oscillator.frequency.setValueAtTime(440, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(520, audioContext.currentTime + 0.1);
        break;
    }

    gainNode.gain.setValueAtTime(Math.max(0.001, volume * 0.15), audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.2);

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.22);
  } catch (error) {
    if (type === 'match') return;
  }
}

export function playMatchFoundSound(settings) {
  playSoundEffect(settings, { type: 'match' });
}
