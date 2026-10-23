import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { useUI } from './store/ui'
// 顺序要紧：tokens 提供默认值，themes 用属性选择器覆盖，同权重时后者生效
import './styles/radix.css'
import './styles/tokens.css'
import './styles/themes.css'
import './styles/global.css'
import './styles/workbench-simple.css'
import 'katex/dist/katex.min.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Service Worker 更新后不自动刷新 —— 自动刷新会把用户正在写的心得、正在填的
// 表格直接冲掉。改成提示一句，由用户自己决定什么时候刷新。
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js')
      .then((reg) => {
        reg.update().catch(() => {})
      })
      .catch(() => {})

    const hadController = !!navigator.serviceWorker.controller
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      // 首次接管不算更新
      if (!hadController) return
      useUI.getState().showToast('新版本已就绪', {
        label: '立即刷新',
        run: () => location.reload(),
      })
    })
  })
}
