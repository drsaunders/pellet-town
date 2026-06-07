/** Keeps the screen on while riding so GPS updates continue. */
export class ScreenWakeLock {
  private sentinel: WakeLockSentinel | null = null
  private wanted = false

  get isSupported(): boolean {
    return 'wakeLock' in navigator
  }

  get isActive(): boolean {
    return this.sentinel !== null && !this.sentinel.released
  }

  async request(): Promise<boolean> {
    this.wanted = true
    return this.acquire()
  }

  async acquire(): Promise<boolean> {
    if (!this.wanted || !this.isSupported) return false

    try {
      if (this.sentinel && !this.sentinel.released) return true
      this.sentinel = await navigator.wakeLock.request('screen')
      this.sentinel.addEventListener('release', () => {
        this.sentinel = null
      })
      return true
    } catch {
      return false
    }
  }

  async release(): Promise<void> {
    this.wanted = false
    try {
      await this.sentinel?.release()
    } catch {
      // Already released when tab hidden, etc.
    }
    this.sentinel = null
  }
}
