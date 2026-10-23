import { create } from 'zustand'

export interface ToastAction {
  label: string
  run: () => void
}

interface UIState {
  reducedMotion: boolean
  toast: { text: string; action?: ToastAction } | null
  shelfQuery: string
  toggleReducedMotion: () => void
  showToast: (text: string, action?: ToastAction) => void
  hideToast: () => void
  setShelfQuery: (q: string) => void
}

const MOTION_KEY = 'sn.reducedMotion'

function readMotion(): boolean {
  if (typeof localStorage === 'undefined') return false
  const v = localStorage.getItem(MOTION_KEY)
  if (v !== null) return v === '1'
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

export const useUI = create<UIState>((set, get) => ({
  reducedMotion: readMotion(),
  toast: null,
  shelfQuery: '',
  toggleReducedMotion: () => {
    const next = !get().reducedMotion
    localStorage.setItem(MOTION_KEY, next ? '1' : '0')
    document.documentElement.classList.toggle('reduced-motion', next)
    set({ reducedMotion: next })
  },
  showToast: (text, action) => set({ toast: { text, action } }),
  hideToast: () => set({ toast: null }),
  setShelfQuery: (q) => set({ shelfQuery: q }),
}))

export function applyMotionClass(reduced: boolean) {
  if (typeof document !== 'undefined') {
    document.documentElement.classList.toggle('reduced-motion', reduced)
  }
}
