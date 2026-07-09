import { useSyncExternalStore } from 'react'

// Light/dark theme. The inline script in index.html applies the stored choice
// (or the OS preference) before first paint; this module handles toggling at
// runtime and lets React components (toggle button, Toaster) subscribe.
const KEY = 'mtgTheme'

export type Theme = 'light' | 'dark'

const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

export function currentTheme(): Theme {
  if (typeof document === 'undefined') return 'light'
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

export function setTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    /* ignore */
  }
  emit()
}

export function toggleTheme() {
  setTheme(currentTheme() === 'dark' ? 'light' : 'dark')
}

// Reactive current theme for components.
export function useTheme(): Theme {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    currentTheme,
    () => 'light' as Theme,
  )
}
