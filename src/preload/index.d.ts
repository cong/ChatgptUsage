import { ElectronAPI } from '@electron-toolkit/preload'
import type { ChatgptUsageApi } from '../shared/capsule'

declare global {
  interface Window {
    electron: ElectronAPI
    chatgptUsage: ChatgptUsageApi
  }
}
