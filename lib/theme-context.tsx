"use client"

import React, { createContext, useContext, useState, useEffect } from "react"

/** Supported themes for InfraMind. */
export type Theme = "dark" | "light"

interface ThemeContextValue {
  theme: Theme
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  toggleTheme: () => {},
})

/**
 * ThemeProvider wraps the app and injects the current theme class
 * onto <html> so all Tailwind dark: variants respond correctly.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("dark")

  // Persist theme preference to localStorage
  useEffect(() => {
    const saved = (localStorage.getItem("inframind-theme") as Theme) || "dark"
    setTheme(saved)
    document.documentElement.classList.toggle("dark", saved === "dark")
  }, [])

  const toggleTheme = () => {
    setTheme(prev => {
      const next: Theme = prev === "dark" ? "light" : "dark"
      localStorage.setItem("inframind-theme", next)
      document.documentElement.classList.toggle("dark", next === "dark")
      return next
    })
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

/** Hook to consume the theme context anywhere in the component tree. */
export function useTheme() {
  return useContext(ThemeContext)
}
