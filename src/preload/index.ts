import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type {
  AnnouncementState,
  AppSettings,
  BootstrapPayload,
  BroadcastSendResult,
  CapsuleDragMovePayload,
  CapsuleMinimalPayload,
  ChatgptUsageApi,
  PanelView,
  PreferencesPayload,
  ReactionSendResult,
  ShowPanelOptions,
  SpendUsage,
  TokenUsageHour,
  TokenUsageMinute,
  TokenUsageOverview,
  UpdateCheckResult,
  UsageSnapshot,
  UsageWindow,
  WindowPreferences
} from '../shared/capsule'
import type { IslandPresentation, IslandSnapshot } from '../shared/island'

const CHANNELS = {
  bootstrap: 'chatgpt-usage:bootstrap',
  refresh: 'chatgpt-usage:refresh',
  updateSettings: 'chatgpt-usage:update-settings',
  closePanel: 'chatgpt-usage:close-panel',
  moveCapsuleWindow: 'chatgpt-usage:move-capsule-window',
  finishCapsuleWindowDrag: 'chatgpt-usage:finish-capsule-window-drag',
  openExternal: 'chatgpt-usage:open-external',
  panelReady: 'chatgpt-usage:panel-ready',
  capsuleReady: 'chatgpt-usage:capsule-ready',
  showPanel: 'chatgpt-usage:show-panel',
  snapshotUpdated: 'chatgpt-usage:snapshot-updated',
  preferencesUpdated: 'chatgpt-usage:preferences-updated',
  command: 'chatgpt-usage:command',
  checkUpdate: 'chatgpt-usage:check-update',
  downloadUpdate: 'chatgpt-usage:download-update',
  installUpdate: 'chatgpt-usage:install-update',
  tokenUsage: 'chatgpt-usage:token-usage',
  spendUsage: 'chatgpt-usage:spend-usage',
  tokenUsageRange: 'chatgpt-usage:token-usage-range',
  tokenUsageHourly: 'chatgpt-usage:token-usage-hourly',
  tokenUsageMinutely: 'chatgpt-usage:token-usage-minutely',
  setCapsuleSize: 'chatgpt-usage:set-capsule-size',
  setCapsuleMinimal: 'chatgpt-usage:set-capsule-minimal',
  updateProgress: 'chatgpt-usage:update-progress',
  sendBroadcast: 'chatgpt-usage:send-broadcast',
  broadcastMessage: 'chatgpt-usage:broadcast-message',
  announcementUpdated: 'chatgpt-usage:announcement-updated',
  markAnnouncementRead: 'chatgpt-usage:mark-announcement-read',
  acknowledgeAnnouncement: 'chatgpt-usage:acknowledge-announcement',
  sendReaction: 'chatgpt-usage:send-reaction',
  reaction: 'chatgpt-usage:reaction',
  islandUpdated: 'chatgpt-usage:island-updated',
  islandReady: 'chatgpt-usage:island-ready',
  islandPresentation: 'chatgpt-usage:island-presentation',
  islandHidden: 'chatgpt-usage:island-hidden',
  islandInteractive: 'chatgpt-usage:island-interactive',
  islandOpenTask: 'chatgpt-usage:island-open-task',
  islandDismissTask: 'chatgpt-usage:island-dismiss-task'
} as const

const api: ChatgptUsageApi = {
  bootstrap: () => ipcRenderer.invoke(CHANNELS.bootstrap) as Promise<BootstrapPayload>,
  refreshStatus: () => ipcRenderer.invoke(CHANNELS.refresh) as Promise<UsageSnapshot>,
  updateSettings: (patch: Partial<AppSettings>) =>
    ipcRenderer.invoke(CHANNELS.updateSettings, patch) as Promise<PreferencesPayload>,
  closePanel: () => ipcRenderer.invoke(CHANNELS.closePanel) as Promise<void>,
  moveCapsuleWindow: (payload: CapsuleDragMovePayload) =>
    ipcRenderer.invoke(CHANNELS.moveCapsuleWindow, payload) as Promise<WindowPreferences>,
  finishCapsuleWindowDrag: () =>
    ipcRenderer.invoke(CHANNELS.finishCapsuleWindowDrag) as Promise<WindowPreferences>,
  openExternal: (url) => ipcRenderer.invoke(CHANNELS.openExternal, url) as Promise<void>,
  notifyPanelReady: () => ipcRenderer.invoke(CHANNELS.panelReady) as Promise<void>,
  notifyCapsuleReady: () => ipcRenderer.invoke(CHANNELS.capsuleReady) as Promise<void>,
  showPanel: (view: PanelView, options?: ShowPanelOptions) =>
    ipcRenderer.invoke(CHANNELS.showPanel, view, options) as Promise<void>,
  checkForUpdate: () => ipcRenderer.invoke(CHANNELS.checkUpdate) as Promise<UpdateCheckResult>,
  getTokenUsage: (window: UsageWindow) =>
    ipcRenderer.invoke(CHANNELS.tokenUsage, window) as Promise<TokenUsageOverview>,
  getTokenUsageRange: (startMs: number, endMs: number) =>
    ipcRenderer.invoke(CHANNELS.tokenUsageRange, startMs, endMs) as Promise<TokenUsageOverview>,
  getTokenUsageHourly: (dateMs: number) =>
    ipcRenderer.invoke(CHANNELS.tokenUsageHourly, dateMs) as Promise<TokenUsageHour[]>,
  getTokenUsageMinutely: (dateMs: number, hour: number) =>
    ipcRenderer.invoke(CHANNELS.tokenUsageMinutely, dateMs, hour) as Promise<TokenUsageMinute[]>,
  getSpendUsage: (window: UsageWindow) =>
    ipcRenderer.invoke(CHANNELS.spendUsage, window) as Promise<SpendUsage>,
  setCapsuleSize: (size: { width: number; height: number }) =>
    ipcRenderer.invoke(CHANNELS.setCapsuleSize, size) as Promise<void>,
  setCapsuleMinimal: (payload: CapsuleMinimalPayload) =>
    ipcRenderer.invoke(CHANNELS.setCapsuleMinimal, payload) as Promise<void>,
  sendBroadcast: (text: string) =>
    ipcRenderer.invoke(CHANNELS.sendBroadcast, text) as Promise<BroadcastSendResult>,
  markAnnouncementRead: (id: string) =>
    ipcRenderer.invoke(CHANNELS.markAnnouncementRead, id) as Promise<void>,
  acknowledgeAnnouncement: (id: string) =>
    ipcRenderer.invoke(CHANNELS.acknowledgeAnnouncement, id) as Promise<void>,
  sendReaction: (targetPeerId: string, action: 'add' | 'remove') =>
    ipcRenderer.invoke(CHANNELS.sendReaction, targetPeerId, action) as Promise<ReactionSendResult>,
  downloadUpdate: () => ipcRenderer.invoke(CHANNELS.downloadUpdate) as Promise<void>,
  installUpdate: () => ipcRenderer.invoke(CHANNELS.installUpdate) as Promise<void>,
  onSnapshotUpdated: (listener) => subscribe(CHANNELS.snapshotUpdated, listener),
  onPreferencesUpdated: (listener) => subscribe(CHANNELS.preferencesUpdated, listener),
  onCommand: (listener) => subscribe(CHANNELS.command, listener),
  onUpdateProgress: (listener) => subscribe(CHANNELS.updateProgress, listener),
  onBroadcastMessage: (listener) => subscribe(CHANNELS.broadcastMessage, listener),
  onAnnouncementUpdated: (listener: (state: AnnouncementState | null) => void) =>
    subscribe(CHANNELS.announcementUpdated, listener),
  onReaction: (listener) => subscribe(CHANNELS.reaction, listener),
  onIslandUpdated: (listener: (snapshot: IslandSnapshot) => void) =>
    subscribe(CHANNELS.islandUpdated, listener),
  onIslandPresentation: (listener: (presentation: IslandPresentation) => void) =>
    subscribe(CHANNELS.islandPresentation, listener),
  notifyIslandReady: () => ipcRenderer.invoke(CHANNELS.islandReady) as Promise<void>,
  notifyIslandHidden: (revision: number) =>
    ipcRenderer.invoke(CHANNELS.islandHidden, revision) as Promise<void>,
  setIslandInteractive: (interactive: boolean) =>
    ipcRenderer.invoke(CHANNELS.islandInteractive, interactive) as Promise<void>,
  openIslandTask: (threadId: string) =>
    ipcRenderer.invoke(CHANNELS.islandOpenTask, threadId) as Promise<boolean>,
  dismissIslandTask: (threadId: string) =>
    ipcRenderer.invoke(CHANNELS.islandDismissTask, threadId) as Promise<boolean>
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('chatgptUsage', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.chatgptUsage = api
}

function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const wrappedListener = (_event: Electron.IpcRendererEvent, payload: T): void => {
    listener(payload)
  }

  ipcRenderer.on(channel, wrappedListener)
  return () => {
    ipcRenderer.removeListener(channel, wrappedListener)
  }
}
