'use client'

import React, { createContext, useContext, useEffect, useState, useMemo } from 'react'

type Theme = 'light' | 'dark' | 'system'

type ThemeProviderContextProps = {
  theme: Theme
  setTheme: (theme: Theme) => void
  actualTheme: 'light' | 'dark' // il tema effettivo applicato
}

const ThemeProviderContext = createContext<ThemeProviderContextProps | undefined>(undefined)

export function ThemeProvider({
  children,
  defaultTheme = 'system',
}: {
  children: React.ReactNode
  defaultTheme?: Theme
}) {
  // Inizializza il tema dal localStorage se disponibile
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window !== 'undefined') {
      const savedTheme = localStorage.getItem('biblioflow-theme') as Theme
      return savedTheme || defaultTheme
    }
    return defaultTheme
  })
  
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    }
    return 'light'
  })

  // Calcola il tema effettivo
  const actualTheme = useMemo(() => {
    if (theme === 'system') {
      return systemTheme
    }
    return theme
  }, [theme, systemTheme])

  // Applica il tema al DOM
  useEffect(() => {
    const root = window.document.documentElement
    root.classList.remove('light', 'dark')
    root.classList.add(actualTheme)

    // Salva nel localStorage
    localStorage.setItem('biblioflow-theme', theme)
  }, [theme, actualTheme])

  // Ascolta i cambiamenti del tema di sistema
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    
    const handleChange = (e: MediaQueryListEvent) => {
      setSystemTheme(e.matches ? 'dark' : 'light')
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  const value = {
    theme,
    setTheme,
    actualTheme,
  }

  return (
    <ThemeProviderContext.Provider value={value}>
      {children}
    </ThemeProviderContext.Provider>
  )
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext)

  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }

  return context
}