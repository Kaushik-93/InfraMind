"use client"

import React, { useState } from "react"
import { Search, FileCode, Check, RefreshCw, Layers } from "lucide-react"

/**
 * SemanticSearch – Provides a semantic vector-based pattern search UI.
 *
 * Users type a natural-language query and the component calls `/api/retrieve`
 * to find matching infrastructure / deployment configuration chunks.
 * Results are displayed in glass cards with similarity scores and copy actions.
 *
 * Theme: uses CSS-variable inline styles (--accent, --text-primary, etc.)
 * so the component adapts to the global teal/cyan colour scheme.
 */
export default function SemanticSearch() {
  /* ------------------------------------------------------------------ */
  /*  Local state                                                        */
  /* ------------------------------------------------------------------ */
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<any[]>([])
  const [searched, setSearched] = useState(false)
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)

  /* ------------------------------------------------------------------ */
  /*  Handlers                                                           */
  /* ------------------------------------------------------------------ */

  /** Fire a POST to /api/retrieve with the current query string. */
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!query.trim()) return

    setLoading(true)
    setSearched(true)
    try {
      const response = await fetch("/api/retrieve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      })

      const data = await response.json()
      if (response.ok) {
        setResults(data.results || [])
      }
    } catch (e) {
      console.error("Retrieve error:", e)
    } finally {
      setLoading(false)
    }
  }

  /** Copy a result chunk to the clipboard and flash a confirmation. */
  const handleCopy = (content: string, index: number) => {
    navigator.clipboard.writeText(content)
    setCopiedIndex(index)
    setTimeout(() => setCopiedIndex(null), 2000)
  }

  /* ------------------------------------------------------------------ */
  /*  Render                                                             */
  /* ------------------------------------------------------------------ */
  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto">

      {/* ============================================================= */}
      {/* Search Bar Input                                               */}
      {/* ============================================================= */}
      <div className="glass p-6 rounded-xl flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          {/* Section heading */}
          <h3
            className="font-semibold text-sm uppercase tracking-wider"
            style={{ color: "rgb(var(--text-primary))" }}
          >
            Semantic Pattern Search
          </h3>

          {/* Helper description */}
          <p
            className="text-xs"
            style={{ color: "rgb(var(--text-muted))" }}
          >
            Query across the scanned infrastructure and deployment
            configurations. infraMind retrieves patterns using semantic
            vector matching.
          </p>
        </div>

        {/* Search form */}
        <form onSubmit={handleSearch} className="flex gap-2">
          {/* Query input with search icon */}
          <div className="relative flex-1">
            <Search
              className="absolute left-3 top-3"
              size={16}
              style={{ color: "rgb(var(--text-muted))" }}
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. Find order service db parameters or dockerfile exposed port config..."
              className="glass-input w-full pl-10 pr-3 py-2.5 rounded-lg text-xs font-mono"
              style={{ color: "rgb(var(--text-secondary))" }}
            />
          </div>

          {/* Submit / retrieve button – accent background */}
          <button
            type="submit"
            disabled={loading}
            className="text-white font-semibold text-xs px-5 py-2.5 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shadow-md disabled:opacity-50 hover:brightness-110 active:brightness-90"
            style={{ background: "rgb(var(--accent))" }}
          >
            {loading ? (
              <RefreshCw size={14} className="animate-spin" />
            ) : (
              <Search size={14} />
            )}
            {loading ? "Searching..." : "Retrieve Pattern"}
          </button>
        </form>
      </div>

      {/* ============================================================= */}
      {/* Results grid                                                   */}
      {/* ============================================================= */}
      <div className="flex flex-col gap-4">

        {/* Loading spinner */}
        {loading && (
          <div
            className="flex flex-col items-center justify-center p-12 gap-2"
            style={{ color: "rgb(var(--text-muted))" }}
          >
            <RefreshCw
              size={24}
              className="animate-spin"
              style={{ color: "rgb(var(--accent))" }}
            />
            <span className="text-xs font-mono">
              Querying vector similarity collections...
            </span>
          </div>
        )}

        {/* Empty-state notice */}
        {searched && results.length === 0 && !loading && (
          <div
            className="glass p-10 rounded-xl text-center flex flex-col items-center gap-2"
            style={{ color: "rgb(var(--text-muted))" }}
          >
            <Layers
              size={32}
              style={{ color: "rgb(var(--text-muted))" }}
            />
            <span className="text-xs font-mono">
              No matching deployment templates found. Try broadening
              keywords.
            </span>
          </div>
        )}

        {/* Result cards */}
        {results.map((result, idx) => (
          <div
            key={result.id}
            className="glass rounded-xl flex flex-col overflow-hidden animate-fade-in-up"
            style={{ animationDelay: `${idx * 0.1}s` }}
          >
            {/* ----- Header row ----- */}
            <div
              className="px-5 py-3 flex items-center justify-between"
              style={{
                background: "rgba(var(--accent), 0.06)",
                borderBottom: "1px solid var(--glass-border)",
              }}
            >
              {/* File info */}
              <div className="flex items-center gap-2">
                <FileCode
                  size={14}
                  style={{ color: "rgb(var(--accent))" }}
                />
                <span
                  className="text-xs font-mono font-bold"
                  style={{ color: "rgb(var(--text-secondary))" }}
                >
                  {result.fileName}
                </span>
                <span
                  className="text-[9px] font-mono uppercase bg-white/5 border border-white/10 px-1.5 py-0.5 rounded"
                  style={{ color: "rgb(var(--text-muted))" }}
                >
                  {result.fileType}
                </span>
              </div>

              {/* Similarity score & copy button */}
              <div className="flex items-center gap-4 text-[10px] font-mono">
                <div className="flex items-center gap-1">
                  <span style={{ color: "rgb(var(--text-muted))" }}>
                    Similarity Match:
                  </span>
                  {/* Semantic colour: emerald = success → keep Tailwind */}
                  <span className="text-emerald-400 font-extrabold">
                    {result.score || 1.0} index
                  </span>
                </div>

                <button
                  onClick={() => handleCopy(result.content, idx)}
                  className="bg-white/5 hover:bg-white/10 px-2.5 py-1 rounded border border-white/5 transition-all flex items-center gap-1 active:scale-95"
                  style={{ color: "rgb(var(--text-secondary))" }}
                >
                  {copiedIndex === idx ? (
                    <Check size={10} className="text-emerald-400" />
                  ) : null}
                  {copiedIndex === idx ? "Copied" : "Copy Chunk"}
                </button>
              </div>
            </div>

            {/* ----- Content summary ----- */}
            <div
              className="px-5 py-3 bg-white/5 font-mono italic text-[11px] leading-relaxed"
              style={{
                color: "rgb(var(--text-secondary))",
                borderBottom: "1px solid var(--glass-border)",
              }}
            >
              {result.summary}
            </div>

            {/* ----- Code block ----- */}
            <div
              className="p-5 overflow-x-auto max-h-[220px] font-mono text-[11px] leading-relaxed whitespace-pre"
              style={{
                background: "rgba(0,0,0,0.35)",
                color: "rgb(var(--text-secondary))",
              }}
            >
              {result.content}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
