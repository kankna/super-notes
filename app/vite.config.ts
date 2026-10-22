import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// GitHub Pages 部署在仓库子路径下（https://<user>.github.io/<repo>/），
// 仓库名从 GITHUB_REPOSITORY 推导；本地开发时回落到根路径。
const repo = process.env.GITHUB_REPOSITORY
const base = repo ? `/${repo.split('/')[1]}/` : '/'

export default defineConfig({
  base,
  plugins: [react()],
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1200,
  },
})
