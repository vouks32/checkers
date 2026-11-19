let audioCtx: AudioContext | null = null;
let isMuted = false;

export function setSoundMuted(muted: boolean): void {
  isMuted = muted;
}

export function getSoundMuted(): boolean {
  return isMuted;
}

function getContext(): AudioContext | null {
  if (isMuted || typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return null;
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === 'suspended') {
    void audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export function playMoveSound(): void {
  const ctx = getContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(220, now);
  osc.frequency.exponentialRampToValueAtTime(110, now + 0.07);
  gain.gain.setValueAtTime(0.14, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.08);
}

export function playCaptureSound(): void {
  const ctx = getContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(320, now);
  osc.frequency.exponentialRampToValueAtTime(140, now + 0.11);
  gain.gain.setValueAtTime(0.18, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.12);
}

export function playPromoteSound(): void {
  const ctx = getContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  [330, 440, 554.37].forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    const start = now + idx * 0.055;
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0.1, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.16);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.17);
  });
}
