import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'

export type Theme = 'light' | 'dark'

const LIGHT_QUERY = '(prefers-color-scheme: light)'

function subscribeToSystemTheme(onChange: () => void): () => void {
  const query = window.matchMedia(LIGHT_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

function readSystemTheme(): Theme {
  return window.matchMedia(LIGHT_QUERY).matches ? 'light' : 'dark'
}

/**
 * Returns the theme of the page and a function that switches to the other theme.
 * The theme follows the operating system until the person uses the switch.
 */
export function useTheme(): { theme: Theme; toggleTheme: () => void } {
  const systemTheme = useSyncExternalStore(subscribeToSystemTheme, readSystemTheme)
  const [chosenTheme, setChosenTheme] = useState<Theme | null>(null)
  const theme = chosenTheme ?? systemTheme

  useEffect(() => {
    // The CSS reads the theme from this attribute on the html element.
    document.documentElement.dataset.theme = theme
  }, [theme])

  const toggleTheme = useCallback(() => {
    setChosenTheme(theme === 'dark' ? 'light' : 'dark')
  }, [theme])

  return { theme, toggleTheme }
}
