"use client"

/**
 * GitChangeManager — manages git commits, pull requests, and displays
 * code diffs using the Monaco editor in read-only mode.
 *
 * Theme system:
 *  - Uses CSS custom properties (--accent, --accent-2, --text-*, --glass-*)
 *    for dynamic teal/cyan theming.
 *  - Glass morphism classes: `glass` (standard) and `glass-raised` (glow).
 *  - Semantic colors (emerald for success/PR) are kept as Tailwind classes.
 */

import React, { useState, useEffect } from "react"
import {
  GitBranch,
  GitCommit,
  GitPullRequest,
  Check,
  FileDiff,
  Send,
  Plus
} from "lucide-react"
import Editor from "./editor"

/* ── Prop types ─────────────────────────────────────────────────────────── */

interface GitChangeManagerProps {
  /** Map of file paths → file content that are currently staged / active */
  activeFiles: Record<string, string>
  /** Optional callback to propagate state changes back to the parent */
  onUpdateState?: (
    files: Record<string, string>,
    explanation: string,
    applied: string[],
    validation: any,
    sandbox: any,
    git: any
  ) => void
}

/* ── Component ──────────────────────────────────────────────────────────── */

export default function GitChangeManager({
  activeFiles,
  onUpdateState,
}: GitChangeManagerProps) {
  /* ── Local state ─────────────────────────────────────────────────────── */

  const [gitState, setGitState] = useState<any>({
    branch: "main",
    commits: [],
    prCreated: false,
    prTitle: "",
    prDescription: ""
  })
  const [commitMessage, setCommitMessage] = useState(
    "feat(devops): bootstrap compliant orders microservice deployment manifests"
  )
  const [prTitle, setPrTitle] = useState(
    "feat(devops): ordermanagement k8s and pipeline deployment"
  )
  const [prDesc, setPrDesc] = useState(
    "Coordinated infrastructure changes generated and self-repaired dynamically under Inframind standards."
  )
  const [loading, setLoading] = useState(false)
  const [diffFile, setDiffFile] = useState("")

  /* ── Fetch active git state from the API ─────────────────────────────── */

  const fetchGitState = async () => {
    try {
      const response = await fetch("/api/git", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get_state" }),
      })
      const data = await response.json()
      if (response.ok) {
        setGitState(data.gitState)
      }
    } catch (e) {
      console.error(e)
    }
  }

  /** Load git state on first mount */
  useEffect(() => {
    fetchGitState()
  }, [])

  /** Auto-select the first file when active files change */
  useEffect(() => {
    const keys = Object.keys(activeFiles)
    if (keys.length > 0 && !diffFile) {
      setDiffFile(keys[0])
    }
  }, [activeFiles, diffFile])

  /* ── Execute Commit ──────────────────────────────────────────────────── */

  const handleCommit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!commitMessage.trim() || Object.keys(activeFiles).length === 0) return

    setLoading(true)
    try {
      const response = await fetch("/api/git", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "commit",
          message: commitMessage.trim(),
          files: activeFiles
        }),
      })

      const data = await response.json()
      if (response.ok) {
        fetchGitState()
        setCommitMessage(
          "feat(devops): refine orders deployment limits and configurations"
        )
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  /* ── Create Pull Request ─────────────────────────────────────────────── */

  const handleCreatePR = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!prTitle.trim() || Object.keys(activeFiles).length === 0) return

    setLoading(true)
    try {
      const response = await fetch("/api/git", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_pr",
          title: prTitle.trim(),
          description: prDesc.trim()
        }),
      })

      const data = await response.json()
      if (response.ok) {
        fetchGitState()
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  /* ── Render ──────────────────────────────────────────────────────────── */

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

      {/* ────────────────────────────────────────────────────────────────── */}
      {/* Git Actions Forms (1 col)                                         */}
      {/* ────────────────────────────────────────────────────────────────── */}
      <div className="xl:col-span-1 flex flex-col gap-6">

        {/* ── Branch / Status Card ──────────────────────────────────────── */}
        <div className="glass p-5 rounded-xl flex flex-col gap-4">
          {/* Section header */}
          <div className="flex items-center gap-2 border-b border-white/5 pb-2">
            <GitBranch
              size={16}
              style={{ color: "rgb(var(--accent))" }}
            />
            <h3
              className="font-semibold text-xs uppercase tracking-wider"
              style={{ color: "rgb(var(--text-primary))" }}
            >
              Version Management
            </h3>
          </div>

          {/* Active branch indicator */}
          <div className="flex justify-between items-center text-xs font-mono">
            <span style={{ color: "rgb(var(--text-muted))" }}>
              ACTIVE BRANCH:
            </span>
            <span
              className="font-bold px-2 py-0.5 rounded"
              style={{
                color: "rgb(var(--accent))",
                background: "rgba(var(--accent),0.12)",
                borderWidth: 1,
                borderStyle: "solid",
                borderColor: "rgba(var(--accent),0.25)",
              }}
            >
              {gitState.branch}
            </span>
          </div>
        </div>

        {/* ── Commit Form ───────────────────────────────────────────────── */}
        {Object.keys(activeFiles).length > 0 && !gitState.prCreated && (
          <div className="glass p-5 rounded-xl flex flex-col gap-4 animate-fade-in-up">
            {/* Section header */}
            <div className="flex items-center gap-2 border-b border-white/5 pb-2">
              <GitCommit
                size={16}
                style={{ color: "rgb(var(--accent))" }}
              />
              <h3
                className="font-semibold text-xs uppercase tracking-wider font-mono"
                style={{ color: "rgb(var(--text-primary))" }}
              >
                Commit Changes
              </h3>
            </div>

            <form onSubmit={handleCommit} className="flex flex-col gap-3">
              {/* Commit message textarea */}
              <div className="flex flex-col gap-1.5 text-xs font-mono">
                <label
                  className="text-[10px] uppercase"
                  style={{ color: "rgb(var(--text-muted))" }}
                >
                  Commit Message
                </label>
                <textarea
                  value={commitMessage}
                  onChange={(e) => setCommitMessage(e.target.value)}
                  rows={2}
                  className="glass-input p-2.5 rounded-lg resize-none font-mono text-[11px]"
                  style={{ color: "rgb(var(--text-primary))" }}
                />
              </div>

              {/* Submit button — accent themed */}
              <button
                type="submit"
                disabled={loading || !commitMessage.trim()}
                className="w-full disabled:opacity-50 text-white font-bold text-xs py-2 rounded-lg transition-colors flex items-center justify-center gap-1 shadow-md hover:brightness-110 active:brightness-90"
                style={{ background: "rgb(var(--accent))" }}
              >
                Create Git Commit
              </button>
            </form>
          </div>
        )}

        {/* ── Pull Request creation card ────────────────────────────────── */}
        {gitState.commits.length > 0 && !gitState.prCreated && (
          <div className="glass-raised p-5 rounded-xl flex flex-col gap-4 animate-fade-in-up">
            {/* Section header — semantic emerald for PR */}
            <div className="flex items-center gap-2 border-b border-white/5 pb-2">
              <GitPullRequest size={16} className="text-emerald-400" />
              <h3
                className="font-semibold text-xs uppercase tracking-wider font-mono"
                style={{ color: "rgb(var(--text-primary))" }}
              >
                Initiate Pull Request
              </h3>
            </div>

            <form onSubmit={handleCreatePR} className="flex flex-col gap-3">
              {/* PR title */}
              <div className="flex flex-col gap-1 text-xs font-mono">
                <label
                  className="text-[9px] uppercase"
                  style={{ color: "rgb(var(--text-muted))" }}
                >
                  PR Title
                </label>
                <input
                  type="text"
                  value={prTitle}
                  onChange={(e) => setPrTitle(e.target.value)}
                  className="glass-input px-2.5 py-1.5 rounded-lg"
                  style={{ color: "rgb(var(--text-primary))" }}
                />
              </div>

              {/* PR description */}
              <div className="flex flex-col gap-1 text-xs font-mono">
                <label
                  className="text-[9px] uppercase"
                  style={{ color: "rgb(var(--text-muted))" }}
                >
                  PR Description
                </label>
                <textarea
                  value={prDesc}
                  onChange={(e) => setPrDesc(e.target.value)}
                  rows={2}
                  className="glass-input p-2.5 rounded-lg resize-none text-[11px]"
                  style={{ color: "rgb(var(--text-primary))" }}
                />
              </div>

              {/* Submit — semantic emerald for PR action */}
              <button
                type="submit"
                disabled={loading || !prTitle.trim()}
                className="w-full bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs py-2 rounded-lg transition-colors flex items-center justify-center gap-1 shadow-md"
              >
                Open Pull Request
              </button>
            </form>
          </div>
        )}

        {/* ── Pull Request Active dashboard ─────────────────────────────── */}
        {gitState.prCreated && (
          <div className="bg-emerald-600/10 border border-emerald-500/20 p-5 rounded-xl flex flex-col gap-4 animate-fade-in-up text-xs font-mono">
            {/* PR header — semantic emerald */}
            <div className="flex items-center gap-2 border-b border-emerald-500/20 pb-2 text-emerald-400">
              <GitPullRequest size={16} />
              <h3 className="font-bold text-xs uppercase tracking-wider">
                PR #124 Mapped successfully
              </h3>
            </div>

            {/* PR metadata */}
            <div
              className="flex flex-col gap-2.5"
              style={{ color: "rgb(var(--text-secondary))" }}
            >
              <div className="flex justify-between">
                <span>TITLE:</span>
                <span
                  className="font-black truncate max-w-[150px]"
                  style={{ color: "rgb(var(--text-primary))" }}
                >
                  {gitState.prTitle}
                </span>
              </div>
              <div className="flex justify-between">
                <span>BRANCH MERGING:</span>
                <span
                  className="font-bold"
                  style={{ color: "rgb(var(--accent))" }}
                >
                  {gitState.branch} → main
                </span>
              </div>
              <div className="flex justify-between">
                <span>STATUS:</span>
                <span className="text-emerald-400 font-bold uppercase animate-pulse">
                  Running check suites
                </span>
              </div>
            </div>

            {/* PR description block */}
            <div
              className="p-3 rounded-lg text-[10px]"
              style={{
                background: "var(--glass-bg)",
                borderWidth: 1,
                borderStyle: "solid",
                borderColor: "var(--glass-border)",
                color: "rgb(var(--text-muted))",
              }}
            >
              {gitState.prDescription}
            </div>
          </div>
        )}
      </div>

      {/* ────────────────────────────────────────────────────────────────── */}
      {/* Git Diff Code Viewer (2 cols) — powered by Monaco editor          */}
      {/* ────────────────────────────────────────────────────────────────── */}
      <div className="xl:col-span-2 flex flex-col gap-4">
        {Object.keys(activeFiles).length === 0 ? (
          /* Empty state placeholder */
          <div
            className="glass p-10 rounded-xl text-center h-full flex items-center justify-center"
            style={{ color: "rgb(var(--text-muted))" }}
          >
            Deploy and validate configurations first to track code commits.
          </div>
        ) : (
          <div className="glass rounded-xl flex flex-col items-stretch overflow-hidden h-full">

            {/* ── Header / file selector ────────────────────────────────── */}
            <div
              className="px-5 py-3 flex items-center justify-between text-xs font-mono"
              style={{
                background: "var(--glass-bg)",
                borderBottom: "1px solid var(--glass-border)",
              }}
            >
              <div className="flex items-center gap-2">
                <FileDiff
                  size={14}
                  style={{ color: "rgb(var(--accent))" }}
                />
                <span style={{ color: "rgb(var(--text-secondary))" }}>
                  Git Code Diff Viewer
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className="text-[10px]"
                  style={{ color: "rgb(var(--text-muted))" }}
                >
                  FILE:
                </span>
                <select
                  value={diffFile}
                  onChange={(e) => setDiffFile(e.target.value)}
                  className="rounded px-2.5 py-1 outline-none"
                  style={{
                    background: "var(--glass-bg)",
                    borderWidth: 1,
                    borderStyle: "solid",
                    borderColor: "var(--glass-border)",
                    color: "rgb(var(--text-secondary))",
                  }}
                >
                  {Object.keys(activeFiles).map((f) => (
                    <option key={f} value={f}>
                      {f.split("/").pop()}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* ── Monaco diff display (read-only) ──────────────────────── */}
            <div className="flex-1">
              {diffFile && activeFiles[diffFile] ? (
                <Editor
                  value={activeFiles[diffFile] || ""}
                  filePath={diffFile}
                  readOnly={true}
                  minHeight={350}
                />
              ) : (
                <div
                  className="p-5 text-xs font-mono"
                  style={{ color: "rgb(var(--text-muted))" }}
                >
                  Select an active file.
                </div>
              )}
            </div>

            {/* ── Commit Log history list ───────────────────────────────── */}
            {gitState.commits.length > 0 && (
              <div
                className="p-5 flex flex-col gap-3 font-mono text-xs max-h-[180px] overflow-y-auto"
                style={{
                  background: "var(--glass-bg)",
                  borderTop: "1px solid var(--glass-border)",
                }}
              >
                {/* History section label */}
                <span
                  className="text-[10px] font-bold uppercase tracking-widest pb-1"
                  style={{
                    color: "rgb(var(--text-muted))",
                    borderBottom: "1px solid var(--glass-border)",
                  }}
                >
                  Git Commit History logs
                </span>

                {/* Individual commit entries */}
                <div className="flex flex-col gap-2">
                  {gitState.commits.map((commit: any) => (
                    <div
                      key={commit.hash}
                      className="flex items-center justify-between pb-2 text-[11px]"
                      style={{
                        borderBottom: "1px solid var(--glass-border)",
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <span style={{ color: "rgb(var(--text-muted))" }}>
                          [{commit.hash}]
                        </span>
                        <span
                          className="truncate max-w-[280px]"
                          title={commit.message}
                          style={{ color: "rgb(var(--text-primary))" }}
                        >
                          {commit.message}
                        </span>
                      </div>
                      <span
                        className="text-[10px]"
                        style={{ color: "rgb(var(--text-muted))" }}
                      >
                        {commit.date}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
