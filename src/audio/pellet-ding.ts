/**
 * Synthesized bell "ding" via Web Audio — no sample file, no third-party license.
 * Unlock audio on the same user gesture that starts riding (required on iOS).
 */
let audioCtx: AudioContext | null = null

export function primePelletAudio(): void {
  audioCtx ??= new AudioContext()
  if (audioCtx.state === 'suspended') {
    void audioCtx.resume()
  }
}

function playTone(
  ctx: AudioContext,
  frequency: number,
  start: number,
  duration: number,
  peakGain: number,
): void {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()

  osc.type = 'sine'
  osc.frequency.setValueAtTime(frequency, start)
  osc.connect(gain)
  gain.connect(ctx.destination)

  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(peakGain, start + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)

  osc.start(start)
  osc.stop(start + duration + 0.05)
}

function playStandardDing(ctx: AudioContext, start: number): void {
  // E6 + bright overtone — classic arcade "ding"
  playTone(ctx, 1318.51, start, 0.55, 1)
  playTone(ctx, 2637.02, start, 0.28, 0.55)
}

/** Loud two-partial bell ding; each pellet replays the same ding 90 ms apart. */
export function playPelletDing(count = 1): void {
  primePelletAudio()
  if (!audioCtx) return

  const ctx = audioCtx
  const now = ctx.currentTime

  for (let i = 0; i < count; i += 1) {
    playStandardDing(ctx, now + i * 0.09)
  }
}
