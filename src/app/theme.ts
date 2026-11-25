import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'

export type Theme = 'light' | 'dark'

const LIGHT_QUERY = '(prefers-color-scheme: light)'
const STORAGE_KEY = 'theme'

function subscribeToSystemTheme(onChange: () => void): () => void {
  const query = window.matchMedia(LIGHT_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

function readSystemTheme(): Theme {
  return window.matchMedia(LIGHT_QUERY).matches ? 'light' : 'dark'
}

/** Returns the theme that the person chose in an earlier visit, or null when no choice is stored. */
export function readStoredTheme(): Theme | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY)
    return value === 'light' || value === 'dark' ? value : null
  } catch {
    // A browser can refuse the storage, for example in a private window. The theme then follows the system.
    return null
  }
}

function storeTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // A browser can refuse the storage, for example in a private window. The choice then lasts for this page only.
  }
}

/**
 * Sets the stored theme on the html element before the first render.
 * The CSS follows the operating system when no theme is set, so only a stored choice needs this.
 */
export function applyStoredTheme(): void {
  const stored = readStoredTheme()
  if (stored !== null) document.documentElement.dataset.theme = stored
}

/**
 * Returns the theme of the page and a function that switches to the other theme.
 * The theme follows the operating system until the person uses the switch. The browser keeps the choice.
 */
export function useTheme(): { theme: Theme; toggleTheme: () => void } {
  const systemTheme = useSyncExternalStore(subscribeToSystemTheme, readSystemTheme)
  const [chosenTheme, setChosenTheme] = useState<Theme | null>(readStoredTheme)
  const theme = chosenTheme ?? systemTheme

  useEffect(() => {
    // The CSS reads the theme from this attribute on the html element.
    document.documentElement.dataset.theme = theme
  }, [theme])

  const toggleTheme = useCallback(() => {
    const next = theme === 'dark' ? 'light' : 'dark'
    storeTheme(next)
    setChosenTheme(next)
  }, [theme])

  return { theme, toggleTheme }
}
