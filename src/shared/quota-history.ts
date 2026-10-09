export interface QuotaUsageSample {
  atMs: number
  usedPercent: number
}

/** 保留最近 7 个本地自然日，每分钟只取最新的一次额度采样。 */
export function normalizeQuotaSamples(value: unknown, nowMs = Date.now()): QuotaUsageSample[] {
  if (!Array.isArray(value)) return []
  const firstDay = new Date(nowMs)
  firstDay.setHours(0, 0, 0, 0)
  firstDay.setDate(firstDay.getDate() - 6)
  const oldestAtMs = firstDay.getTime()
  const byMinute = new Map<number, QuotaUsageSample>()
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const { atMs, usedPercent } = item as Partial<QuotaUsageSample>
    if (
      typeof atMs !== 'number' ||
      !Number.isFinite(atMs) ||
      atMs > nowMs ||
      atMs < oldestAtMs ||
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
