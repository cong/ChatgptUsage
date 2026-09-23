import { app } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import {
  DEFAULT_SETTINGS,
  DEFAULT_PANEL_PREFERENCES,
  DEFAULT_WINDOW_PREFERENCES,
  normalizePanelPreferences,
  normalizeSettings,
  normalizeWindowPreferences,
  type PanelPreferences,
  type PersistedState,
  type WindowKeeperPersistedState,
  type WindowPreferences
} from '../../shared/capsule'

const STATE_FILE_NAME = 'chatgpt-usage-state.json'
// 旧版本 state 文件名;首次加载新文件失败时回退读取并迁移,迁移后删除旧文件避免遗留
const LEGACY_STATE_FILE_NAME = 'codex-status-state.json'

export async function loadPersistedState(): Promise<PersistedState> {
  const filePath = getStateFilePath()

  try {
    const content = await fs.readFile(filePath, 'utf8')
    const parsed = getRecord(JSON.parse(content))

    return {
      settings: normalizeSettings(
        getRecord(parsed?.settings) as Partial<typeof DEFAULT_SETTINGS> | undefined
      ),
      window: normalizeWindowPreferences(
        getRecord(parsed?.window) as Partial<WindowPreferences> | undefined
      ),
      panel: normalizePanelPreferences(
        getRecord(parsed?.panel) as Partial<PanelPreferences> | undefined
      ),
      windowKeeper: normalizeWindowKeeperState(getRecord(parsed?.windowKeeper)),
      islandViewedEventIds: normalizeEventIds(parsed?.islandViewedEventIds)
    }
  } catch {
    // 新文件不存在时尝试从旧版本文件迁移一次
    const migrated = await tryMigrateLegacyState()
    if (migrated) return migrated
    return createDefaultState()
  }
}

async function tryMigrateLegacyState(): Promise<PersistedState | undefined> {
  const legacyPath = path.join(app.getPath('userData'), LEGACY_STATE_FILE_NAME)
  try {
    const content = await fs.readFile(legacyPath, 'utf8')
    const parsed = getRecord(JSON.parse(content))
    const state: PersistedState = {
      settings: normalizeSettings(
        getRecord(parsed?.settings) as Partial<typeof DEFAULT_SETTINGS> | undefined
      ),
      window: normalizeWindowPreferences(
        getRecord(parsed?.window) as Partial<WindowPreferences> | undefined
      ),
      panel: normalizePanelPreferences(
        getRecord(parsed?.panel) as Partial<PanelPreferences> | undefined
      ),
      windowKeeper: normalizeWindowKeeperState(getRecord(parsed?.windowKeeper)),
      islandViewedEventIds: normalizeEventIds(parsed?.islandViewedEventIds)
    }
    // 写入新文件并删除旧文件,完成迁移
    await savePersistedState(state)
    await fs.unlink(legacyPath).catch(() => undefined)
    return state
  } catch {
    return undefined
  }
}

export async function savePersistedState(state: PersistedState): Promise<void> {
  const filePath = getStateFilePath()
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
}

function createDefaultState(): PersistedState {
  return {
    settings: { ...DEFAULT_SETTINGS },
    window: { ...DEFAULT_WINDOW_PREFERENCES },
    panel: { ...DEFAULT_PANEL_PREFERENCES }
  }
}

function getStateFilePath(): string {
  return path.join(app.getPath('userData'), STATE_FILE_NAME)
}

function getRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function normalizeWindowKeeperState(
  input: Record<string, unknown> | undefined
): WindowKeeperPersistedState | undefined {
  if (!input) {
    return undefined
  }
  const windowId = getString(input.windowId)
  const resetAt = getString(input.resetAt)
  const lastTriggeredAt = getString(input.lastTriggeredAt)
  const verified = input.verified === true
  if (!windowId && !resetAt && !lastTriggeredAt && !verified) {
    return undefined
  }
  return { windowId, resetAt, lastTriggeredAt, verified }
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function normalizeEventIds(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const ids = value.filter((item): item is string => typeof item === 'string' && item.length > 0)
  return [...new Set(ids)].slice(-256)
}
