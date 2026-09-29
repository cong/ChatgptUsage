import assert from 'node:assert/strict'
import test from 'node:test'
import { appendQuotaSample, normalizeQuotaSamples } from '../src/shared/quota-history.ts'

test('同一分钟只保留最新的官方额度读数，跨天清理旧样本', () => {
  const first = new Date(2026, 8, 28, 23, 59, 10).getTime()
  const latest = new Date(2026, 8, 28, 23, 59, 50).getTime()
  const nextDay = new Date(2026, 8, 29, 0, 0, 5).getTime()
  const sameDay = appendQuotaSample([{ atMs: first, usedPercent: 20 }], {
    atMs: latest,
    usedPercent: 25
  })
  assert.deepEqual(sameDay, [{ atMs: latest, usedPercent: 25 }])
  assert.deepEqual(appendQuotaSample(sameDay, { atMs: nextDay, usedPercent: 0 }), [
    { atMs: nextDay, usedPercent: 0 }
  ])
})

test('持久化读取排除无效值和未来记录', () => {
  const now = new Date(2026, 8, 29, 12, 0).getTime()
  assert.deepEqual(
    normalizeQuotaSamples(
      [
        { atMs: now - 60_000, usedPercent: 42.5 },
        { atMs: now + 60_000, usedPercent: 43 },
        { atMs: now - 120_000, usedPercent: 110 },
        { atMs: 'invalid', usedPercent: 10 }
      ],
      now
    ),
    [{ atMs: now - 60_000, usedPercent: 42.5 }]
  )
})
