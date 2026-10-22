import { promises as fs } from 'node:fs'
import path from 'node:path'
import { serialize, deserialize } from 'node:v8'

let directory: string | undefined

export function configureUsageStorage(value: string): void {
  directory = value
}

export async function readUsageStorage<T>(key: string): Promise<T | undefined> {
  if (!directory) return undefined
  try {
    const value = deserialize(await fs.readFile(path.join(directory, `${key}.bin`)))
    return value?.version === 1 ? (value.data as T) : undefined
  } catch {
    return undefined
  }
}

export async function writeUsageStorage(key: string, data: unknown): Promise<void> {
  if (!directory) return
  const target = path.join(directory, `${key}.bin`)
  const temporary = `${target}.${process.pid}.tmp`
  try {
    await fs.mkdir(directory, { recursive: true })
    await fs.writeFile(temporary, serialize({ version: 1, data }))
    await fs.rename(temporary, target)
  } catch {
    // 缓存不能写入时仍可显示统计；下次启动重新导入。
    await fs.unlink(temporary).catch(() => undefined)
  }
}
