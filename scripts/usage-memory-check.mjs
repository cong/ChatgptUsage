// 独立进程读取指定日志，仅输出性能指标，不输出会话内容。
import { promises as fs } from 'node:fs'
import { performance } from 'node:perf_hooks'
import { parseSessionFile } from '../src/main/services/usage.ts'

const file = process.argv[2]
if (!file) throw new Error('Provide a session JSONL path')
const started = performance.now()
const imported = await parseSessionFile(file, undefined)
if (!imported) throw new Error('Import failed')
const importedMs = performance.now() - started
const nextStarted = performance.now()
const next = await parseSessionFile(file, undefined, {
  kind: 'codex',
  mtimeMs: imported.cursor.mtimeMs,
  parsed: imported.file,
  cursor: imported.cursor,
  continuation: imported.continuation
})
console.log(
  JSON.stringify({
    fileMB: Math.round((await fs.stat(file)).size / 1048576),
    importedMs: Math.round(importedMs),
    unchangedMs: Math.round(performance.now() - nextStarted),
    peakProcessMB: Math.round(process.resourceUsage().maxRSS / 1024),
    reusedParsedData: next.file === imported.file
  })
)
