interface ReleasableWindow {
  isDestroyed(): boolean
  isVisible(): boolean
  destroy(): void
}

interface ReleaseTimers {
  setTimeout(callback: () => void, delayMs: number): unknown
  clearTimeout(handle: unknown): void
}

const defaultTimers: ReleaseTimers = {
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>)
}

/** 留出短暂重开窗口的时间，超时后释放隐藏窗口及其 renderer。 */
export class HiddenWindowRelease {
  private timer: unknown
  private readonly delayMs: number
  private readonly timers: ReleaseTimers

  constructor(delayMs = 60_000, timers: ReleaseTimers = defaultTimers) {
    this.delayMs = delayMs
    this.timers = timers
  }

  schedule(window: ReleasableWindow): void {
    this.cancel()
    this.timer = this.timers.setTimeout(() => {
      this.timer = undefined
      if (!window.isDestroyed() && !window.isVisible()) window.destroy()
    }, this.delayMs)
  }

  cancel(): void {
    if (this.timer !== undefined) {
      this.timers.clearTimeout(this.timer)
      this.timer = undefined
    }
  }
}
