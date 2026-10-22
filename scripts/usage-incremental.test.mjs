/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import test from 'node:test'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { readJsonlIncrementally, skipNonUsageLine } from '../src/main/services/jsonl-cursor.ts'
import { parseSessionFile, dedupParsedFiles } from '../src/main/services/usage.ts'
import { parseClaudeFileIncrementally } from '../src/main/services/agents.ts'
import { readLatestRateLimitSnapshot } from '../src/main/services/quota.ts'
import {
  configureUsageStorage,
  readUsageStorage,
  writeUsageStorage
} from '../src/main/services/usage-storage.ts'

async function fixture(run) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'usage-incremental-'))
  try {
    await run(path.join(directory, 'session.jsonl'), directory)
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
}
const jsonl = (...items) => items.map((item) => JSON.stringify(item)).join('\n') + '\n'
const token = (total, last, time = '2026-10-09T02:00:00Z') => ({
  timestamp: time,
  type: 'event_msg',
  payload: {
    type: 'token_count',
    info: {
      total_token_usage: { input_tokens: total, total_tokens: total },
      ...(last === undefined
        ? {}
        : { last_token_usage: { input_tokens: last, total_tokens: last } })
    }
  }
})
const state = (result) => ({
  kind: 'codex',
  mtimeMs: result.cursor.mtimeMs,
  parsed: result.file,
  cursor: result.cursor,
  continuation: result.continuation
})

test('cursor: unchanged files deliver no lines; appended UTF-8 and partial lines are counted once', async () => {
  await fixture(async (file) => {
    await fs.writeFile(file, '历史\n半')
    const lines = []
    let cursor = await readJsonlIncrementally(
      file,
      undefined,
      () => {},
      (line) => lines.push(line)
    )
    assert.deepEqual(lines, ['历史'])
    await fs.appendFile(file, '行\n新增\n')
    cursor = await readJsonlIncrementally(
      file,
      cursor,
      (append) => assert.equal(append, true),
      (line) => lines.push(line)
    )
    assert.deepEqual(lines, ['历史', '半行', '新增'])
    await readJsonlIncrementally(
      file,
      cursor,
      (append) => assert.equal(append, true),
      () => assert.fail('unchanged content read')
    )
    assert.equal(cursor.offset, (await fs.stat(file)).size)
  })
})

test('cursor: truncation and rewrite plus append trigger reimport', async () => {
  await fixture(async (file) => {
    await fs.writeFile(file, 'original\n')
    const cursor = await readJsonlIncrementally(
      file,
      undefined,
      () => {},
      () => {}
    )
    await fs.writeFile(file, 'rewritten\nmore\n')
    const lines = []
    const next = await readJsonlIncrementally(
      file,
      cursor,
      (append) => assert.equal(append, false),
      (line) => lines.push(line)
    )
    assert.deepEqual(lines, ['rewritten', 'more'])
    await fs.writeFile(file, 'x\n')
    await readJsonlIncrementally(
      file,
      next,
      (append) => assert.equal(append, false),
      (line) => assert.equal(line, 'x')
    )
  })
})

test('Codex: incremental deltas, duplicate suppression and model continuation equal full import', async () => {
  await fixture(async (file) => {
    await fs.writeFile(
      file,
      jsonl(token(100, 100), { type: 'turn_context', payload: { model: 'gpt-5.4' } })
    )
    const first = await parseSessionFile(file, undefined)
    await fs.appendFile(file, jsonl(token(100, 100), token(160, undefined)))
    const next = await parseSessionFile(file, undefined, state(first))
    const full = await parseSessionFile(file, undefined)
    assert.deepEqual(next, full)
    assert.equal(next.file.events.at(-1).delta.input, 60)
    assert.equal(next.file.events.at(-1).model, 'gpt-5.4')
    assert.equal(
      dedupParsedFiles([{ threadId: undefined, file: next.file }]).reduce(
        (sum, e) => sum + e.tokens.input,
        0
      ),
      160
    )
  })
})

test('Codex: no-token initial import keeps metadata and handles partial event after restart', async () => {
  await fixture(async (file, directory) => {
    const id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    await fs.writeFile(
      file,
      jsonl({ type: 'session_meta', payload: { id }, timestamp: '2026-10-09T01:00:00Z' }) +
        JSON.stringify(token(25, 25)).slice(0, 30)
    )
    const first = await parseSessionFile(file, id)
    configureUsageStorage(path.join(directory, 'cache'))
    await writeUsageStorage('codex', state(first))
    const restored = await readUsageStorage('codex')
    assert.ok(restored.continuation.lastSignatureBySource instanceof Map)
    await fs.appendFile(file, JSON.stringify(token(25, 25)).slice(30) + '\n')
    const next = await parseSessionFile(file, id, restored)
    assert.deepEqual(next, await parseSessionFile(file, id))
    assert.equal(next.file.events.length, 1)
  })
})

test('Claude: later final usage replaces partial usage without double counting', async () => {
  await fixture(async (file) => {
    const assistant = (output) => ({
      type: 'assistant',
      timestamp: '2026-10-09T01:00:00Z',
      message: {
        id: 'msg-1',
        model: 'claude-sonnet',
        usage: { input_tokens: 10, output_tokens: output },
        stop_reason: output > 1 ? 'end_turn' : null
      }
    })
    await fs.writeFile(file, jsonl(assistant(1)))
    const first = await parseClaudeFileIncrementally(file)
    await fs.appendFile(file, jsonl(assistant(20)))
    const next = await parseClaudeFileIncrementally(file, first)
    assert.equal(next.events.length, 1)
    assert.equal(next.events[0].tokens.output, 20)
    assert.deepEqual(next, await parseClaudeFileIncrementally(file))
  })
})

test('quota fallback: appended snapshot replaces old snapshot; unchanged file retains it', async () => {
  await fixture(async (file) => {
    const quota = (percent) => ({
      ...token(1, 1),
      payload: { ...token(1, 1).payload, rate_limits: { primary: { used_percent: percent } } }
    })
    await fs.writeFile(file, jsonl(quota(5)))
    assert.equal((await readLatestRateLimitSnapshot(file)).primary.usedPercent, 5)
    await fs.appendFile(file, jsonl(quota(9)))
    assert.equal((await readLatestRateLimitSnapshot(file)).primary.usedPercent, 9)
    assert.equal((await readLatestRateLimitSnapshot(file)).primary.usedPercent, 9)
  })
})

test('cache: corrupt persisted cache is discarded', async () => {
  await fixture(async (file, directory) => {
    configureUsageStorage(directory)
    await fs.writeFile(path.join(directory, 'codex.bin'), 'broken')
    assert.equal(await readUsageStorage('codex'), undefined)
  })
})

test('Codex: completed final JSON without newline is imported once, then continues on append', async () => {
  await fixture(async (file) => {
    await fs.writeFile(file, JSON.stringify(token(10, 10)))
    const first = await parseSessionFile(file, undefined)
    assert.equal(first.file.events.length, 1)
    assert.equal(first.cursor.offset, first.cursor.size)
    await fs.appendFile(file, '\n' + jsonl(token(15, undefined)))
    const next = await parseSessionFile(file, undefined, state(first))
    assert.equal(next.file.events.length, 2)
    assert.equal(next.file.events[1].delta.input, 5)
    assert.deepEqual(next, await parseSessionFile(file, undefined))
  })
})

test('cursor: replaced file with same size and timestamp is reimported', async () => {
  await fixture(async (file) => {
    await fs.writeFile(file, 'old\n')
    const original = await fs.stat(file)
    const cursor = await readJsonlIncrementally(
      file,
      undefined,
      () => {},
      () => {}
    )
    await fs.rename(file, file + '.old')
    await fs.writeFile(file, 'new\n')
    await fs.utimes(file, original.atime, original.mtime)
    const lines = []
    await readJsonlIncrementally(
      file,
      cursor,
      (append) => assert.equal(append, false),
      (line) => lines.push(line)
    )
    assert.deepEqual(lines, ['new'])
  })
})

test('stream: large unrelated single line is discarded in chunks without parsing chat content', async () => {
  await fixture(async (file) => {
    const handle = await fs.open(file, 'w')
    try {
      await handle.write('{"type":"response_item","payload":"')
      const chunk = Buffer.alloc(1024 * 1024, 120)
      for (let i = 0; i < 32; i++) await handle.write(chunk)
      await handle.write('"}\n' + jsonl(token(1, 1)))
    } finally {
      await handle.close()
    }
    const lines = []
    await readJsonlIncrementally(
      file,
      undefined,
      () => {},
      (line) => lines.push(line),
      skipNonUsageLine
    )
    assert.equal(lines.length, 1)
    assert.equal(JSON.parse(lines[0]).payload.type, 'token_count')
  })
})
