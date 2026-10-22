import { promises as fs } from 'node:fs'

export interface JsonlCursor {
  offset: number
  size: number
  mtimeMs: number
  identity: string
  boundary: string
}

/** 只提交完整行。半行留在文件里，下次从该行起点重读，避免 UTF-8 截断或重复计入。 */
export async function readJsonlIncrementally(
  filePath: string,
  previous: JsonlCursor | undefined,
  onStart: (append: boolean) => void,
  onLine: (line: string) => void,
  skipLine?: (prefix: string) => boolean,
  includeFinalLine = true
): Promise<JsonlCursor> {
  const handle = await fs.open(filePath, 'r')
  try {
    const stat = await handle.stat()
    const identity = `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`
    let append = Boolean(
      previous &&
      previous.identity === identity &&
      stat.size >= previous.size &&
      (stat.size > previous.size || stat.mtimeMs === previous.mtimeMs)
    )
    if (append && previous) {
      append = (await boundaryAt(handle, previous.offset)) === previous.boundary
    }
    onStart(append)
    let offset = append ? previous!.offset : 0
    if (append && previous && stat.size === previous.size && previous.offset === stat.size) {
      return previous
    }
    let fragments: Buffer[] = []
    let lineBytes = 0
    let skipped = false
    const addPart = (part: Buffer): void => {
      if (lineBytes === 0 && skipLine) skipped = skipLine(part.subarray(0, 4096).toString('utf8'))
      lineBytes += part.length
      if (!skipped) fragments.push(part)
    }
    if (offset < stat.size) {
      const stream = handle.createReadStream({
        start: offset,
        end: stat.size - 1,
        autoClose: false
      })
      for await (const chunk of stream) {
        const buffer = chunk as Buffer
        let start = 0
        let end: number
        while ((end = buffer.indexOf(10, start)) >= 0) {
          const part = buffer.subarray(start, end)
          addPart(part)
          if (!skipped) {
            const line = fragments.length === 1 ? part : Buffer.concat(fragments)
            onLine(line.toString('utf8').replace(/\r$/, ''))
          }
          offset += lineBytes + 1
          fragments = []
          lineBytes = 0
          skipped = false
          start = end + 1
        }
        if (start < buffer.length) addPart(buffer.subarray(start))
      }
    }
    if (includeFinalLine && fragments.length && !skipped) {
      const line = Buffer.concat(fragments).toString('utf8')
      // 完整 JSON 即使没有换行也可提交，半行留到下次继续。
      let complete = false
      try {
        JSON.parse(line)
        complete = true
      } catch {
        /* 尚未写完 */
      }
      if (complete) {
        onLine(line)
        offset += lineBytes
      }
    }
    return {
      offset,
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      identity,
      boundary: await boundaryAt(handle, offset)
    }
  } finally {
    await handle.close()
  }
}

/** 仅在标准日志前缀明确给出顶层 type 时跳过；未知字段顺序仍交给完整解析。 */
export function skipNonUsageLine(prefix: string): boolean {
  const type = prefix.match(
    /^\s*\{(?:\s*"timestamp"\s*:\s*"[^"]*"\s*,)?\s*"type"\s*:\s*"([^"]+)"/
  )?.[1]
  return (
    type !== undefined && !['session_meta', 'turn_context', 'event_msg', 'assistant'].includes(type)
  )
}

async function boundaryAt(handle: fs.FileHandle, offset: number): Promise<string> {
  const length = Math.min(offset, 128)
  const buffer = Buffer.alloc(length)
  await handle.read(buffer, 0, length, offset - length)
  return buffer.toString('base64')
}
