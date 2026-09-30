/**
 * Tiny synthesized sound effects (Web Audio) — no audio files to load.
 * Every call is best-effort: unsupported browsers simply stay silent.
 */
type Cue = "success" | "fail" | "timeout" | "complete";

const NOTES: Record<Cue, { freq: number; at: number; length: number }[]> = {
  success: [
    { freq: 660, at: 0, length: 0.09 },
    { freq: 880, at: 0.08, length: 0.12 },
  ],
  fail: [
    { freq: 300, at: 0, length: 0.12 },
    { freq: 220, at: 0.1, length: 0.16 },
  ],
  timeout: [
    { freq: 440, at: 0, length: 0.08 },
    { freq: 440, at: 0.14, length: 0.08 },
    { freq: 330, at: 0.28, length: 0.18 },
  ],
  complete: [
    { freq: 523, at: 0, length: 0.1 },
    { freq: 659, at: 0.1, length: 0.1 },
    { freq: 784, at: 0.2, length: 0.1 },
    { freq: 1047, at: 0.3, length: 0.22 },
  ],
};

let context: AudioContext | null = null;

/** Plays a cue at `volume` (0..1). Never affects word pronunciation. */
export function playCue(cue: Cue, volume = 0.6): void {
  if (volume <= 0) return;
  try {
    const AudioCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return;
    context ??= new AudioCtor();
    const ctx = context;
    const start = ctx.currentTime + 0.01;
    for (const note of NOTES[cue]) {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = note.freq;
      gain.gain.setValueAtTime(0.0001, start + note.at);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, 0.2 * volume), start + note.at + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + note.at + note.length);
      oscillator.connect(gain).connect(ctx.destination);
      oscillator.start(start + note.at);
      oscillator.stop(start + note.at + note.length + 0.02);
    }
  } catch {
    // Audio blocked or unsupported.
  }
}
