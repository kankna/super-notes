import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
    globals: true,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // d3-drag（React Flow 依赖）在 jsdom 卸载时会抛 "reading 'document'"，
    // 属于 jsdom 环境噪音，不影响断言。
    dangerouslyIgnoreUnhandledErrors: true,
  },
})
