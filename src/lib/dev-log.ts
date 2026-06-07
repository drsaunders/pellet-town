type LogLevel = 'info' | 'warn' | 'error'

export function devLog(level: LogLevel, message: string, data?: Record<string, unknown>): void {
  const payload = data ? { ...data } : undefined
  const line = payload ? `${message} ${JSON.stringify(payload)}` : message

  if (level === 'error') console.error(`[Pellet Town] ${line}`)
  else if (level === 'warn') console.warn(`[Pellet Town] ${line}`)
  else console.log(`[Pellet Town] ${line}`)

  if (!import.meta.env.DEV) return

  void fetch('/__pellet-town/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ level, message, data: payload }),
  }).catch(() => {
    // Dev server not running or log endpoint unavailable — browser console is enough.
  })
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error('Aborted'))
      return
    }

    const timer = window.setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timer)
        reject(signal.reason ?? new Error('Aborted'))
      },
      { once: true },
    )
  })
}
