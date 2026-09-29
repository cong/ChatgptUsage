export interface QuotaUsageSample {
  atMs: number
  usedPercent: number
}

function localDayKey(atMs: number): string {
  const date = new Date(atMs)
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

/** 只保留今天每分钟最新的一次有效额度采样。 */
export function normalizeQuotaSamples(value: unknown, nowMs = Date.now()): QuotaUsageSample[] {
  if (!Array.isArray(value)) return []
  const today = localDayKey(nowMs)
  const byMinute = new Map<number, QuotaUsageSample>()
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const { atMs, usedPercent } = item as Partial<QuotaUsageSample>
    if (
      typeof atMs !== 'number' ||
      !Number.isFinite(atMs) ||
      atMs > nowMs ||
      localDayKey(atMs) !== today ||
      typeof usedPercent !== 'number' ||
      !Number.isFinite(usedPercent) ||
      usedPercent < 0 ||
      usedPercent > 100
    )
      continue
    const minute = Math.floor(atMs / 60_000)
    const previous = byMinute.get(minute)
    if (!previous || atMs > previous.atMs) byMinute.set(minute, { atMs, usedPercent })
  }
  return [...byMinute.values()].sort((a, b) => a.atMs - b.atMs)
}

export function appendQuotaSample(
  samples: QuotaUsageSample[] | undefined,
  sample: QuotaUsageSample
): QuotaUsageSample[] {
  return normalizeQuotaSamples([...(samples ?? []), sample], sample.atMs)
}
