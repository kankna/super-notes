import 'fake-indexeddb/auto'
import '@testing-library/jest-dom/vitest'

// jsdom 的 createObjectURL 要求真 Blob，而 fake-indexeddb 取回来的是普通对象。
// 这里统一替换成占位地址，测试只关心数据流，不关心图片渲染。
globalThis.URL.createObjectURL = () => 'blob:mock'
globalThis.URL.revokeObjectURL = () => {}

if (!globalThis.matchMedia) {
  globalThis.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof globalThis.matchMedia
}

// React Flow 依赖这两个 jsdom 里没有的 API
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof globalThis.ResizeObserver
}

if (!globalThis.DOMMatrixReadOnly) {
  globalThis.DOMMatrixReadOnly = class {
    constructor(_transform?: string) {}
  } as unknown as typeof globalThis.DOMMatrixReadOnly
}

