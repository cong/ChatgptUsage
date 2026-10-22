/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import test from 'node:test'
import { HiddenWindowRelease } from '../src/main/services/hidden-window-release.ts'

function fixture() {
  const callbacks = new Map()
  let nextId = 0
  const timers = {
    setTimeout(callback, delayMs) {
      assert.equal(delayMs, 60_000)
      const id = nextId++
      callbacks.set(id, callback)
      return id
    },
    clearTimeout(id) {
      callbacks.delete(id)
    }
  }
  const window = {
    visible: false,
    destroyed: false,
    destroyCount: 0,
    isVisible() {
      return this.visible
    },
    isDestroyed() {
      return this.destroyed
    },
    destroy() {
      this.destroyed = true
      this.destroyCount++
    }
  }
  const release = new HiddenWindowRelease(60_000, timers)
  const expire = () => {
    const pending = [...callbacks.values()]
    callbacks.clear()
    for (const callback of pending) callback()
  }
  return { window, release, expire, callbacks }
}

test('隐藏窗口超时后销毁一次，释放 renderer', () => {
  const { window, release, expire } = fixture()
  release.schedule(window)
  assert.equal(window.destroyCount, 0)
  expire()
  assert.equal(window.destroyCount, 1)
  expire()
  assert.equal(window.destroyCount, 1)
})

test('快速重开取消释放，即使 timer 句柄为 0', () => {
  const { window, release, expire, callbacks } = fixture()
  release.schedule(window)
  release.cancel()
  assert.equal(callbacks.size, 0)
  window.visible = true
  expire()
  assert.equal(window.destroyCount, 0)
})

test('关闭重开再关闭，只有新的释放计时生效', () => {
  const { window, release, expire, callbacks } = fixture()
  release.schedule(window)
  release.cancel()
  release.schedule(window)
  assert.equal(callbacks.size, 1)
  expire()
  assert.equal(window.destroyCount, 1)
})

test('超时前窗口已显示或已销毁时，不销毁有效窗口或重复销毁', () => {
  for (const property of ['visible', 'destroyed']) {
    const { window, release, expire } = fixture()
    release.schedule(window)
    window[property] = true
    expire()
    assert.equal(window.destroyCount, 0)
  }
})
