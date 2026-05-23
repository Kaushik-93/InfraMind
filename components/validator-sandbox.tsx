"use client"

import React, { useState, useEffect, useRef } from "react"
import {
  Terminal as TerminalIcon,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Play,
  Wrench,
  RefreshCw,
  Cpu,
  ArrowRight
} from "lucide-react"

/**
 * Props for the ValidatorSandbox component.
 * - activeFiles: Record of file paths to file contents currently in the workspace.
 * - validationResult: Static validation output (issues, summary).
 * - sandboxResult: Runtime sandbox execution output (logs, status, errorType).
 * - onUpdateState: Callback to propagate updated files/state back to the parent.
 */
interface ValidatorSandboxProps {
  activeFiles: Record<string, string>
  validationResult: any
  sandboxResult: any
  onUpdateState: (updatedFiles: Record<string, string>, explanation: string, appliedConventions: string[], validation: any, sandbox: any) => void
}

/**
 * ValidatorSandbox — Validation engine + CRT-style terminal monitor.
 *
 * Left panel: Displays lint/validation issues and an AI self-repair trigger.
 * Right panel: Retro CRT terminal that streams sandbox container logs.
 *
 * Themed with teal/cyan CSS-variable accent system for dynamic theming.
 */
export default function ValidatorSandbox({
  activeFiles,
  validationResult,
  sandboxResult,
  onUpdateState
}: ValidatorSandboxProps) {
  const [running, setRunning] = useState(false)
  const [repairing, setRepairing] = useState(false)
  const terminalEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll terminal logs to the bottom when new output arrives
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: "smooth" })
    }
  }, [sandboxResult, running])

  /**
   * Run isolated container simulation.
   * Posts workspace files to the sandbox API and updates parent state
   * with the validation + runtime results.
   */
  const handleDeploy = async () => {
    if (Object.keys(activeFiles).length === 0) return

    setRunning(true)
    try {
      const response = await fetch("/api/sandbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files: activeFiles }),
      })

      const data = await response.json()
      if (response.ok) {
        onUpdateState(
          activeFiles,
          "",
          [],
          data.validationResult || validationResult,
          data.originalResult
        )
      }
    } catch (e) {
      console.error(e)
    } finally {
      setRunning(false)
    }
  }

  /**
   * Trigger conversational AI Self-Repair cycle.
   * Sends files + repair flag to the sandbox API, which analyzes runtime
   * failures, modifies assets, and returns the repaired workspace.
   */
  const handleRepair = async () => {
    if (Object.keys(activeFiles).length === 0) return

    setRepairing(true)
    try {
      const response = await fetch("/api/sandbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files: activeFiles, repair: true }),
      })

      const data = await response.json()
      if (response.ok) {
        onUpdateState(
          data.files,
          data.explanation,
          [],
          data.validationResult,
          data.repairedResult
        )
      }
    } catch (e) {
      console.error(e)
    } finally {
      setRepairing(false)
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

      {/* ──────────────────────────────────────────────────────────────
          Left panel: Lint errors list & Repair triggers
      ────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-6">

        {/* Validation Engine card */}
        <div className="glass p-5 rounded-xl flex flex-col gap-4">
          {/* Header bar */}
          <div className="flex items-center justify-between border-b border-white/5 pb-2">
            <div className="flex items-center gap-2">
              {/* Accent-colored CPU icon */}
              <Cpu size={16} style={{ color: 'rgb(var(--accent))' }} />
              <h3
                className="font-semibold text-xs uppercase tracking-wider"
                style={{ color: 'rgb(var(--text-primary))' }}
              >
                Validation Engine
              </h3>
            </div>

            {/* Deploy button — accent background */}
            <div className="flex gap-2">
              <button
                onClick={handleDeploy}
                disabled={running || repairing || Object.keys(activeFiles).length === 0}
                className="disabled:opacity-50 text-white font-bold text-[11px] px-3.5 py-1.5 rounded-lg transition-colors flex items-center gap-1 shadow-md hover:brightness-110 active:brightness-90"
                style={{ background: 'rgb(var(--accent))' }}
              >
                {running ? <RefreshCw size={12} className="animate-spin" /> : <Play size={12} />}
                {running ? "Booting Sandbox..." : "Deploy Workspace"}
              </button>
            </div>
          </div>

          {/* ── Validation summary banner ── */}
          {validationResult.summary.errors > 0 ? (
            /* Error state — semantic rose kept intact */
            <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-lg p-3.5 flex items-start gap-2.5">
              <ShieldAlert className="shrink-0 mt-0.5 animate-pulse" size={18} />
              <div className="flex flex-col gap-0.5 text-xs font-mono">
                <span className="font-bold">Security / Schema Compliance Violations</span>
                <span>Active files contain {validationResult.summary.errors} blocking errors. Workload cannot deploy.</span>
              </div>
            </div>
          ) : (
            /* Success state — semantic emerald kept intact */
            <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-lg p-3.5 flex items-start gap-2.5">
              <CheckCircle2 className="shrink-0 mt-0.5" size={18} />
              <div className="flex flex-col gap-0.5 text-xs font-mono">
                <span className="font-bold">Manifest Configuration Compliant</span>
                <span>Workspace files meet standard security admission policies. Sandbox is ready.</span>
              </div>
            </div>
          )}

          {/* ── Scrolling issues checklist ── */}
          <div className="overflow-y-auto max-h-[220px] flex flex-col gap-2 font-mono text-xs">
            {validationResult.issues.length === 0 ? (
              <div
                className="text-center py-6"
                style={{ color: 'rgb(var(--text-muted))' }}
              >
                All static validation checks passed successfully.
              </div>
            ) : (
              validationResult.issues.map((issue: any) => (
                <div
                  key={issue.id}
                  className={`border p-3 rounded-lg flex flex-col gap-1.5 ${
                    issue.severity === "error"
                      ? "bg-rose-500/5 border-rose-500/10 text-rose-300"
                      : issue.severity === "warning"
                        ? "bg-amber-500/5 border-amber-500/10 text-amber-300"
                        : "bg-white/5 border-white/5"
                  }`}
                  /* Fallback text color for "info" severity issues */
                  style={
                    issue.severity !== "error" && issue.severity !== "warning"
                      ? { color: 'rgb(var(--text-secondary))' }
                      : undefined
                  }
                >
                  <div className="flex justify-between items-center text-[10px] uppercase font-black tracking-widest border-b border-white/5 pb-1">
                    <span className="flex items-center gap-1">
                      {issue.severity === "error" ? <ShieldAlert size={10} /> : <AlertTriangle size={10} />}
                      {issue.category} check
                    </span>
                    <span>{issue.filePath.split("/").pop()}:{issue.line}</span>
                  </div>
                  <span className="font-bold">{issue.message}</span>
                  {issue.suggestion && (
                    <span
                      className="text-[10px] font-mono italic leading-relaxed"
                      style={{ color: 'rgb(var(--text-secondary))' }}
                    >
                      💡 Suggestion: {issue.suggestion}
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* ── Self-Repair control panel ──
            Only shown when sandbox has failed. Uses glass-raised for glow. */}
        {sandboxResult && sandboxResult.status !== "success" && (
          <div className="glass-raised p-5 rounded-xl flex flex-col gap-4 animate-fade-in-up">
            <div className="flex items-center gap-2">
              {/* Emerald wrench kept as semantic color */}
              <Wrench size={16} className="text-emerald-400" />
              <h3
                className="font-semibold text-xs uppercase tracking-wider font-mono"
                style={{ color: 'rgb(var(--text-primary))' }}
              >
                AI Self-Repair Loop
              </h3>
            </div>

            <p
              className="text-xs font-mono leading-relaxed"
              style={{ color: 'rgb(var(--text-secondary))' }}
            >
              InfraMind sandbox recognized container deployment failure: <code className="text-rose-400 font-black">{sandboxResult.errorType}</code>.
              Click below to initiate the self-repair loop: InfraMind will analyze the runtime logs, consult policy models, modify the assets, and hot-restart!
            </p>

            {/* Self-repair button — semantic emerald kept intact */}
            <button
              onClick={handleRepair}
              disabled={repairing}
              className="w-full bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs py-2.5 rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-md"
            >
              {repairing ? <RefreshCw size={14} className="animate-spin" /> : <Wrench size={14} />}
              {repairing ? "AI Self-Repairing Files..." : "Trigger AI Self-Repair Loop"}
            </button>
          </div>
        )}
      </div>

      {/* ──────────────────────────────────────────────────────────────
          Right panel: Scrolling Retro CRT terminal monitor
      ────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col">
        <div
          className="glass rounded-xl border border-white/10 flex flex-col flex-1 h-[450px] overflow-hidden relative crt-overlay"
          style={{ background: 'rgb(var(--bg))' }}
        >
          {/* Top terminal tab bar — deep dark background */}
          <div
            className="px-5 py-2.5 border-b border-white/5 flex items-center gap-1.5 z-20"
            style={{ background: 'rgba(var(--bg), 0.8)' }}
          >
            <TerminalIcon size={14} className="text-emerald-500" />
            <span className="text-[10px] font-mono text-emerald-500 uppercase font-black tracking-widest animate-pulse">
              Sandbox Console Monitor
            </span>
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping ml-auto"></span>
          </div>

          {/* ── Log output stream ── */}
          <div className="flex-1 overflow-y-auto p-5 font-mono text-[10px] leading-relaxed text-emerald-400/90 flex flex-col gap-1.5 z-20">
            {!sandboxResult && !running ? (
              /* Idle state */
              <div className="flex flex-col items-center justify-center text-center gap-2 h-full text-emerald-600/50">
                <TerminalIcon size={24} className="animate-pulse" />
                <span>TERMINAL IDLE. PRESS &apos;DEPLOY WORKSPACE&apos; TO INITIALISE CONTAINER LOGS STREAM.</span>
              </div>
            ) : running ? (
              /* Booting state */
              <div className="flex flex-col items-center justify-center text-center gap-2 h-full text-emerald-600/50 animate-pulse">
                <RefreshCw size={24} className="animate-spin text-emerald-500" />
                <span>MOUNTING WORKSPACE AND ALLOCATING KUBERNETES DNS WORKER CHANNELS...</span>
              </div>
            ) : (
              /* Streaming logs */
              sandboxResult.logs.map((log: any, index: number) => {
                const isErr = log.stream === "stderr"
                return (
                  <div key={index} className={`flex gap-3 items-start select-text ${isErr ? "text-rose-400 font-bold" : ""}`}>
                    <span className="opacity-30 shrink-0 select-none">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                    <span className="break-all whitespace-pre-wrap">{log.message}</span>
                  </div>
                )
              })
            )}
            {/* Invisible anchor for auto-scroll */}
            <div ref={terminalEndRef}></div>
          </div>
        </div>
      </div>
    </div>
  )
}
