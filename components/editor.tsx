"use client"

/**
 * Editor — a thin, SSR-safe wrapper around @monaco-editor/react.
 *
 * Features:
 *  - Dynamic import (no SSR) to avoid Next.js hydration mismatches.
 *  - Auto-detects language from file extension / name.
 *  - Responds to the InfraMind theme (dark → vs-dark, light → light).
 *  - Exposes onChange so parent components can receive live edits.
 */

import React, { useRef, useCallback } from "react"
import type { editor } from "monaco-editor"
import dynamic from "next/dynamic"
import { useTheme } from "@/lib/theme-context"

// Lazy-load Monaco entirely on the client
const MonacoEditorPkg = dynamic(
  () => import("@monaco-editor/react").then(mod => mod.default),
  { ssr: false, loading: () => <EditorSkeleton /> }
)

/* ── helpers ──────────────────────────────────────────────────────────── */

/** Maps file names / paths to Monaco language IDs. */
function detectLanguage(filePath: string): string {
  const name = filePath.split("/").pop()?.toLowerCase() ?? ""

  if (name === "dockerfile" || name.startsWith("dockerfile.")) return "dockerfile"
  if (name.endsWith(".yaml") || name.endsWith(".yml"))          return "yaml"
  if (name.endsWith(".tf")   || name.endsWith(".tfvars"))       return "hcl"
  if (name.endsWith(".json"))                                    return "json"
  if (name.endsWith(".sh"))                                      return "shell"
  if (name.endsWith(".ts")   || name.endsWith(".tsx"))          return "typescript"
  if (name.endsWith(".js")   || name.endsWith(".jsx"))          return "javascript"
  if (name.endsWith(".py"))                                      return "python"
  if (name.endsWith(".go"))                                      return "go"
  if (name.endsWith(".md"))                                      return "markdown"
  return "plaintext"
}

/** Skeleton shown while Monaco bundle loads. */
function EditorSkeleton() {
  return (
    <div className="w-full h-full flex items-center justify-center bg-[#1e1e1e]">
      <div className="flex flex-col items-center gap-3 text-[#4fc1ff]">
        <svg className="animate-spin h-6 w-6" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" />
        </svg>
        <span className="text-xs font-mono tracking-widest uppercase opacity-60">Loading Editor…</span>
      </div>
    </div>
  )
}

/* ── Component props ──────────────────────────────────────────────────── */

export interface EditorProps {
  /** Content to display in the editor */
  value: string
  /** File name / path — used to auto-detect the language */
  filePath?: string
  /** Explicit language override */
  language?: string
  /** Called whenever the user edits the content */
  onChange?: (value: string) => void
  /** Minimum height in pixels (default 400) */
  minHeight?: number
  /** If true the editor is read-only */
  readOnly?: boolean
}

/* ── Main component ───────────────────────────────────────────────────── */

export default function Editor({
  value,
  filePath = "",
  language,
  onChange,
  minHeight = 400,
  readOnly = false,
}: EditorProps) {
  const { theme } = useTheme()
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)

  /** Fires once the editor mounts — store the ref for future imperative calls. */
  const handleEditorDidMount = useCallback(
    (editorInstance: editor.IStandaloneCodeEditor) => {
      editorRef.current = editorInstance
      // Smooth font rendering
      editorInstance.updateOptions({ fontLigatures: true })
    },
    []
  )

  const resolvedLanguage = language ?? detectLanguage(filePath)

  /**
   * Monaco theme map:
   *  dark  → "vs-dark" (Monaco built-in)
   *  light → "light"   (Monaco built-in)
   */
  const monacoTheme = theme === "dark" ? "vs-dark" : "light"

  return (
    <div style={{ minHeight }} className="monaco-host">
      <MonacoEditorPkg
        height="100%"
        defaultLanguage={resolvedLanguage}
        language={resolvedLanguage}
        value={value}
        theme={monacoTheme}
        onChange={val => onChange?.(val ?? "")}
        onMount={handleEditorDidMount}
        options={{
          fontSize: 13,
          lineHeight: 22,
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          fontLigatures: true,
          minimap:          { enabled: false },
          scrollBeyondLastLine: false,
          wordWrap:         "on",
          readOnly,
          automaticLayout:  true,
          tabSize:          2,
          insertSpaces:     true,
          renderLineHighlight: "gutter",
          cursorBlinking:   "smooth",
          cursorSmoothCaretAnimation: "on",
          smoothScrolling:  true,
          padding:          { top: 16, bottom: 16 },
          scrollbar: {
            verticalScrollbarSize:   6,
            horizontalScrollbarSize: 6,
          },
        }}
      />
    </div>
  )
}
