"use client"

/**
 * DevopsGenerator — AI-powered DevOps configuration generator with
 * a conversational chat refiner and a Monaco-based code editor.
 *
 * Theme: Uses the InfraMind teal/cyan design-system CSS variables
 * for all accent colours, text, and glass surfaces.
 *
 * Key capabilities:
 *  - Prompt-driven multi-file infrastructure generation
 *  - Live conversational refinement of generated files
 *  - Full Monaco editor with auto-save & real-time validation
 */

import React, { useState, useEffect } from "react"
import {
  Terminal,
  Send,
  RefreshCw,
  Sparkles,
  FileCode,
  MessageSquare,
} from "lucide-react"
import Editor from "./editor"

/* ── Prop types ─────────────────────────────────────────────────────────── */

interface DevopsGeneratorProps {
  /** Map of filename → file content for the active workspace */
  activeFiles: Record<string, string>
  /** Human-readable explanation of what was generated */
  explanation: string
  /** List of conventions that were applied during generation */
  appliedConventions: string[]
  /** Latest lint / security validation result */
  validationResult: any
  /** Callback to propagate updated workspace state to the parent */
  onUpdateState: (
    updatedFiles: Record<string, string>,
    explanation: string,
    appliedConventions: string[],
    validation: any
  ) => void
  /** Convention rules object used during generation */
  conventions: any
}

/* ── Component ──────────────────────────────────────────────────────────── */

export default function DevopsGenerator({
  activeFiles,
  explanation,
  appliedConventions,
  validationResult,
  onUpdateState,
  conventions,
}: DevopsGeneratorProps) {
  /* ── Generation state ─────────────────────────────────────────────── */
  const [prompt, setPrompt] = useState(
    "Create a production-ready FastAPI microservice with PostgreSQL, Redis, autoscaling, and GitHub Actions"
  )
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState("")

  /* ── Conversational Chat Refiner state ────────────────────────────── */
  const [chatInput, setChatInput] = useState("")
  const [chatMessages, setChatMessages] = useState<
    Array<{ sender: "user" | "ai"; text: string }>
  >([])

  /* ── Editor state ─────────────────────────────────────────────────── */
  const [editorContent, setEditorContent] = useState("")
  const [editingFile, setEditingFile] = useState("")
  const [savingStatus, setSavingStatus] = useState<
    "saved" | "saving" | "dirty"
  >("saved")

  /* ── Preset prompts ───────────────────────────────────────────────── */
  const presets = [
    "FastAPI order-service microservice with Postgres, replica limits, and CI/CD",
    "NodeJS web application running as USER node on port 8080 with healthchecks",
    "AWS EKS clusters with security group bindings using Terraform main.tf",
  ]

  /* ── Set initial tab once files are loaded ────────────────────────── */
  useEffect(() => {
    const fileKeys = Object.keys(activeFiles)
    if (fileKeys.length > 0 && !activeTab) {
      setActiveTab(fileKeys[0])
    }
  }, [activeFiles, activeTab])

  /* ── Update editor when active tab switches ───────────────────────── */
  useEffect(() => {
    if (activeTab && activeFiles[activeTab] !== undefined) {
      setEditorContent(activeFiles[activeTab])
      setEditingFile(activeTab)
      setSavingStatus("saved")
    }
  }, [activeTab, activeFiles])

  /* ── Debounced Auto-Save & Validate on manual edits ───────────────── */
  useEffect(() => {
    if (savingStatus !== "dirty" || !editingFile) return

    setSavingStatus("saving")
    const delayDebounceFn = setTimeout(async () => {
      try {
        const updatedFiles = {
          ...activeFiles,
          [editingFile]: editorContent,
        }

        const response = await fetch("/api/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ files: updatedFiles }),
        })

        const data = await response.json()
        if (response.ok) {
          onUpdateState(
            updatedFiles,
            explanation,
            appliedConventions,
            data.validationResult
          )
          setSavingStatus("saved")
        }
      } catch (err) {
        console.error("Auto-validate error:", err)
        setSavingStatus("dirty")
      }
    }, 1200)

    return () => clearTimeout(delayDebounceFn)
  }, [editorContent, editingFile, savingStatus])

  /* ── Trigger coordinated multi-file generation ────────────────────── */
  const handleGenerate = async () => {
    if (!prompt.trim()) return

    setLoading(true)
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      })

      const data = await response.json()
      if (response.ok) {
        onUpdateState(
          data.files,
          data.explanation,
          data.conventionsApplied,
          data.validationResult
        )
        const fileKeys = Object.keys(data.files)
        if (fileKeys.length > 0) {
          setActiveTab(fileKeys[0])
        }
        setChatMessages([
          {
            sender: "ai",
            text: `I have successfully constructed these coordinated deployment manifests for your workspace based on: "${prompt}". You can modify them manually or request additional refinements right here in chat!`,
          },
        ])
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  /* ── Conversational chat refine handler ────────────────────────────── */
  const handleChatSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!chatInput.trim() || Object.keys(activeFiles).length === 0) return

    const userMsg = chatInput.trim()
    setChatMessages((prev) => [...prev, { sender: "user", text: userMsg }])
    setChatInput("")
    setLoading(true)

    try {
      // Send current state files (preserving any manual typing!)
      const currentWorkspaceFiles = {
        ...activeFiles,
        [editingFile]: editorContent,
      }

      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instruction: userMsg,
          refine: true,
          files: currentWorkspaceFiles,
        }),
      })

      const data = await response.json()
      if (response.ok) {
        onUpdateState(
          data.files,
          data.explanation,
          data.conventionsApplied,
          data.validationResult
        )
        setChatMessages((prev) => [
          ...prev,
          {
            sender: "ai",
            text: `Refined files successfully. Applied: "${userMsg}".`,
          },
        ])
      }
    } catch (err) {
      console.error("Refine error:", err)
    } finally {
      setLoading(false)
    }
  }

  /* ── Render ───────────────────────────────────────────────────────── */

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
      {/* ───────────────────────────────────────────────────────────────
          Left Pane — Generator / Refinement controls (5 cols)
      ─────────────────────────────────────────────────────────────── */}
      <div className="lg:col-span-5 flex flex-col gap-6">
        {/* Presets and initial prompt generation */}
        <div className="glass p-5 rounded-xl flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Sparkles
              size={16}
              style={{ color: "rgb(var(--accent))" }}
            />
            <h3
              className="font-semibold text-xs uppercase tracking-wider"
              style={{ color: "rgb(var(--text-primary))" }}
            >
              DevOps Config Generator
            </h3>
          </div>

          {/* Requirements prompt textarea */}
          <div className="flex flex-col gap-1">
            <label
              className="text-[10px] font-mono uppercase"
              style={{ color: "rgb(var(--text-muted))" }}
            >
              Input Requirements Prompt
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={2}
              className="glass-input p-3 rounded-lg text-xs font-mono resize-none leading-relaxed"
              style={{ color: "rgb(var(--text-secondary))" }}
            />
          </div>

          {/* Quick presets */}
          <div className="flex flex-col gap-1.5">
            <span
              className="text-[9px] font-mono uppercase"
              style={{ color: "rgb(var(--text-muted))" }}
            >
              Interactive Presets
            </span>
            <div className="flex flex-col gap-1">
              {presets.map((preset, idx) => (
                <button
                  key={idx}
                  onClick={() => setPrompt(preset)}
                  className="text-left text-[10px] font-mono p-2 rounded truncate transition-all"
                  style={{
                    color: "rgb(var(--text-secondary))",
                    background: "rgba(var(--accent),0.05)",
                    border: "1px solid rgba(var(--accent),0.08)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background =
                      "rgba(var(--accent),0.12)"
                    e.currentTarget.style.borderColor =
                      "rgba(var(--accent),0.25)"
                    e.currentTarget.style.color =
                      "rgb(var(--text-primary))"
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background =
                      "rgba(var(--accent),0.05)"
                    e.currentTarget.style.borderColor =
                      "rgba(var(--accent),0.08)"
                    e.currentTarget.style.color =
                      "rgb(var(--text-secondary))"
                  }}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          {/* Generate button — primary accent */}
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="w-full text-white font-bold text-xs py-2.5 rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-md disabled:opacity-50"
            style={{ background: "rgb(var(--accent))" }}
          >
            {loading ? (
              <RefreshCw size={14} className="animate-spin" />
            ) : (
              <Sparkles size={14} />
            )}
            {loading
              ? "Orchestrating AI..."
              : "Generate Infrastructure Assets"}
          </button>
        </div>

        {/* ─────────────────────────────────────────────────────────────
            Conversational Chat Refiner panel
        ───────────────────────────────────────────────────────────── */}
        {Object.keys(activeFiles).length > 0 && (
          <div className="glass p-5 rounded-xl flex flex-col gap-4 flex-1 min-h-[300px]">
            {/* Header */}
            <div
              className="flex items-center gap-2 pb-2"
              style={{ borderBottom: "1px solid var(--glass-border)" }}
            >
              <MessageSquare size={16} className="text-emerald-400" />
              <h3
                className="font-semibold text-xs uppercase tracking-wider font-mono"
                style={{ color: "rgb(var(--text-primary))" }}
              >
                Chat Refiner
              </h3>
            </div>

            {/* Scrolling chat bubbles */}
            <div className="flex-1 overflow-y-auto max-h-[220px] pr-1 flex flex-col gap-3 font-mono text-xs">
              {chatMessages.length === 0 ? (
                <div
                  className="flex flex-col items-center justify-center text-center h-full gap-2"
                  style={{ color: "rgb(var(--text-muted))" }}
                >
                  <Terminal size={24} className="opacity-40" />
                  <span className="text-[10px] leading-relaxed max-w-[200px]">
                    No chat inputs. Ask me to &quot;change port to
                    9090&quot; or &quot;increase replica limit&quot; to
                    refine generated files.
                  </span>
                </div>
              ) : (
                chatMessages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex flex-col max-w-[85%] rounded-lg p-2.5 leading-relaxed ${
                      msg.sender === "user" ? "self-end" : "self-start"
                    }`}
                    style={
                      msg.sender === "user"
                        ? {
                            background: "rgba(var(--accent),0.12)",
                            border: "1px solid rgba(var(--accent),0.25)",
                            color: "rgb(var(--accent-2))",
                          }
                        : {
                            background: "var(--glass-bg)",
                            border: "1px solid var(--glass-border)",
                            color: "rgb(var(--text-secondary))",
                          }
                    }
                  >
                    <span
                      className="text-[9px] uppercase font-black tracking-widest mb-0.5"
                      style={{ color: "rgb(var(--text-muted))" }}
                    >
                      {msg.sender === "user"
                        ? "Developer"
                        : "InfraMind AI"}
                    </span>
                    <span>{msg.text}</span>
                  </div>
                ))
              )}
            </div>

            {/* Chat input form */}
            <form
              onSubmit={handleChatSend}
              className="flex gap-2 pt-3"
              style={{ borderTop: "1px solid var(--glass-border)" }}
            >
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Modify: change replica count to 4..."
                className="glass-input flex-1 px-3 py-2 rounded-lg text-xs font-mono"
                style={{ color: "rgb(var(--text-secondary))" }}
              />
              <button
                type="submit"
                disabled={loading || !chatInput.trim()}
                className="bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-50 text-white p-2 rounded-lg transition-colors shadow-md"
              >
                <Send size={14} />
              </button>
            </form>
          </div>
        )}
      </div>

      {/* ───────────────────────────────────────────────────────────────
          Right Pane — Monaco Code Editor workbench (7 cols)
      ─────────────────────────────────────────────────────────────── */}
      <div className="lg:col-span-7 flex flex-col gap-4">
        {Object.keys(activeFiles).length === 0 ? (
          /* Empty-state placeholder */
          <div className="glass p-10 rounded-xl flex flex-col items-center justify-center text-center gap-4 h-full min-h-[480px]">
            <FileCode
              size={48}
              className="animate-pulse"
              style={{ color: "rgb(var(--text-muted))" }}
            />
            <div className="flex flex-col gap-1 max-w-sm">
              <h3
                className="text-base font-bold"
                style={{ color: "rgb(var(--text-primary))" }}
              >
                DevOps Editor Workspace
              </h3>
              <p
                className="text-xs"
                style={{ color: "rgb(var(--text-secondary))" }}
              >
                Input your requirements prompt on the left to generate
                coordinated files. You can then edit them manually in a
                full editor and check security validations in real-time.
              </p>
            </div>
          </div>
        ) : (
          /* Editor panel with tabs, Monaco, and status bar */
          <div
            className="glass rounded-xl flex flex-col items-stretch overflow-hidden h-full flex-1"
            style={{ border: "1px solid var(--glass-border)" }}
          >
            {/* ── Tab bar ──────────────────────────────────────────── */}
            <div
              className="px-4 pt-2.5 flex items-center justify-between"
              style={{
                background: "rgba(var(--accent),0.04)",
                borderBottom: "1px solid var(--glass-border)",
              }}
            >
              <div className="flex gap-1 overflow-x-auto">
                {Object.keys(activeFiles).map((fileName) => {
                  const isSelected = activeTab === fileName
                  return (
                    <button
                      key={fileName}
                      onClick={() => setActiveTab(fileName)}
                      className="text-xs font-mono px-3.5 py-2 rounded-t-md transition-all shrink-0"
                      style={
                        isSelected
                          ? {
                              background: "var(--glass-bg)",
                              borderTop:
                                "2px solid rgb(var(--accent))",
                              borderLeft:
                                "1px solid var(--glass-border)",
                              borderRight:
                                "1px solid var(--glass-border)",
                              color: "rgb(var(--accent))",
                              fontWeight: 700,
                            }
                          : {
                              borderTop: "2px solid transparent",
                              background: "transparent",
                              color: "rgb(var(--text-muted))",
                            }
                      }
                    >
                      {fileName.split("/").pop()}
                    </button>
                  )
                })}
              </div>

              {/* Saved-status indicator (semantic colours kept) */}
              <div className="flex items-center gap-2 mb-2">
                <span
                  className={`text-[10px] font-mono font-semibold uppercase px-2 py-0.5 rounded border ${
                    savingStatus === "saved"
                      ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                      : savingStatus === "saving"
                        ? "bg-amber-500/10 border-amber-500/20 text-amber-400 animate-pulse"
                        : "bg-rose-500/10 border-rose-500/20 text-rose-400"
                  }`}
                >
                  {savingStatus === "saved"
                    ? "✓ Sync"
                    : savingStatus === "saving"
                      ? "Auto-validating..."
                      : "● Unsaved"}
                </span>
              </div>
            </div>

            {/* ── Monaco Editor ────────────────────────────────────── */}
            <Editor
              value={editorContent}
              filePath={activeTab}
              onChange={(val) => {
                setEditorContent(val)
                setSavingStatus("dirty")
              }}
              minHeight={380}
            />

            {/* ── Status bar / footer ──────────────────────────────── */}
            <div
              className="px-5 py-3 flex items-center justify-between text-xs font-mono"
              style={{
                background: "var(--glass-bg)",
                borderTop: "1px solid var(--glass-border)",
                color: "rgb(var(--text-secondary))",
              }}
            >
              <div className="flex items-center gap-1">
                <span>Active File:</span>
                <span
                  className="font-bold"
                  style={{ color: "rgb(var(--accent))" }}
                >
                  {editingFile}
                </span>
              </div>
              {/* Error & warning counts — semantic colours */}
              <div className="flex gap-4">
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                  <span>
                    {validationResult.summary.errors} errors
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  <span>
                    {validationResult.summary.warnings} warnings
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
