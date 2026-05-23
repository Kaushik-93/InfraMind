"use client"

/**
 * RepoScanner — scans a local repository, renders a file tree, and displays
 * learned conventions, security policies, and file content/AST metadata.
 *
 * Theme: uses CSS-variable inline styles (--accent, --text-primary, etc.)
 * so the component responds to the global teal/cyan design-system tokens.
 */

import React, { useState } from "react"
import {
  Folder,
  Terminal,
  Search,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  ChevronRight,
  ChevronDown,
  FileText,
  Compass,
  Cpu,
} from "lucide-react"
import Editor from "./editor"

/* ── Prop types ───────────────────────────────────────────────────────── */

interface RepoScannerProps {
  /** Callback fired after a successful scan with the parsed data payload */
  onScanComplete: (data: any) => void
  /** Currently active repo path (shown in the status badge) */
  activeRepoPath: string
  /** Array of files returned by the last scan */
  scannedFiles: any[]
  /** Extracted naming / infra / security conventions object */
  conventions: any
}

/* ── Component ────────────────────────────────────────────────────────── */

export default function RepoScanner({
  onScanComplete,
  activeRepoPath,
  scannedFiles,
  conventions,
}: RepoScannerProps) {
  /* ── local state ──────────────────────────────────────────────────── */
  const [repoPath, setRepoPath] = useState(
    activeRepoPath || "/Users/kaushiksathyanathsingh/Documents/Projects/Inframind/sample-repo"
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({
    k8s: true,
    terraform: true,
  })
  const [selectedFile, setSelectedFile] = useState<any | null>(null)
  const [viewingAst, setViewingAst] = useState(false)

  /* ── handlers ─────────────────────────────────────────────────────── */

  /** Submit the scan form — POST the repo path to the backend. */
  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!repoPath) return

    setLoading(true)
    setError("")
    try {
      const response = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoPath }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || "Scan failed")
      }

      onScanComplete(data)
    } catch (err: any) {
      setError(err.message || "An error occurred during scanning.")
    } finally {
      setLoading(false)
    }
  }

  /** Toggle a directory node open/closed in the file tree. */
  const toggleExpand = (nodeKey: string) => {
    setExpandedNodes((prev) => ({
      ...prev,
      [nodeKey]: !prev[nodeKey],
    }))
  }

  /** Handle clicking a file in the tree — set it as selected. */
  const handleFileClick = async (file: any) => {
    try {
      setSelectedFile(file)
    } catch (e) {
      console.error(e)
    }
  }

  /* ── tree renderer ────────────────────────────────────────────────── */

  /**
   * Builds a nested object tree from the flat scannedFiles array
   * and renders it as an interactive directory listing.
   */
  const renderTree = (files: any[]) => {
    const tree: Record<string, any> = {}

    // Group files by directory depth
    files.forEach((f) => {
      const parts = f.relativePath.split("/")
      if (parts.length === 1) {
        tree[parts[0]] = { type: "file", file: f }
      } else {
        let current = tree
        parts.forEach((part: string, index: number) => {
          if (index === parts.length - 1) {
            current[part] = { type: "file", file: f }
          } else {
            if (!current[part]) {
              current[part] = { type: "dir", children: {} }
            }
            current = current[part].children
          }
        })
      }
    })

    /** Recursively render a single tree node (file or directory). */
    const renderNode = (name: string, node: any, depth = 0, pathKey = "") => {
      const currentPath = pathKey ? `${pathKey}/${name}` : name

      /* ── File node ──────────────────────────────────────────────── */
      if (node.type === "file") {
        const isSelected =
          selectedFile?.relativePath === node.file.relativePath
        return (
          <div
            key={currentPath}
            onClick={() => handleFileClick(node.file)}
            className="flex items-center gap-2 py-1.5 px-3 rounded-md cursor-pointer transition-all"
            style={{
              marginLeft: `${depth * 16}px`,
              ...(isSelected
                ? {
                    background: "rgba(var(--accent),0.12)",
                    border: "1px solid rgba(var(--accent),0.25)",
                    color: "rgb(var(--accent-2))",
                  }
                : {
                    border: "1px solid transparent",
                    color: "rgb(var(--text-secondary))",
                  }),
            }}
          >
            <FileText
              size={14}
              style={{
                color: isSelected
                  ? "rgb(var(--accent))"
                  : "rgb(var(--text-muted))",
              }}
            />
            <span className="text-xs font-mono truncate">{name}</span>
            <span
              className="text-[10px] ml-auto font-mono"
              style={{ color: "rgb(var(--text-muted))" }}
            >
              {(node.file.sizeBytes || 0) > 1024
                ? `${((node.file.sizeBytes || 0) / 1024).toFixed(1)} KB`
                : `${node.file.sizeBytes || 0} B`}
            </span>
          </div>
        )
      }

      /* ── Directory node ─────────────────────────────────────────── */
      const isExpanded = !!expandedNodes[currentPath]

      return (
        <div key={currentPath} className="flex flex-col">
          <div
            onClick={() => toggleExpand(currentPath)}
            className="flex items-center gap-2 py-1.5 px-3 rounded-md cursor-pointer transition-colors"
            style={{
              marginLeft: `${depth * 16}px`,
              color: "rgb(var(--text-primary))",
            }}
          >
            {isExpanded ? (
              <ChevronDown
                size={14}
                style={{ color: "rgb(var(--text-muted))" }}
              />
            ) : (
              <ChevronRight
                size={14}
                style={{ color: "rgb(var(--text-muted))" }}
              />
            )}
            {/* Amber folder icon — semantic colour, kept as Tailwind */}
            <Folder
              size={14}
              className="text-amber-500/80"
              fill="rgba(245, 158, 11, 0.2)"
            />
            <span className="text-xs font-semibold font-mono">{name}</span>
          </div>
          {isExpanded && (
            <div className="flex flex-col mt-0.5">
              {Object.entries(node.children).map(
                ([childName, childNode]) =>
                  renderNode(childName, childNode, depth + 1, currentPath)
              )}
            </div>
          )}
        </div>
      )
    }

    return (
      <div className="flex flex-col gap-1 select-none">
        {Object.entries(tree).map(([name, node]) => renderNode(name, node))}
      </div>
    )
  }

  /* ── JSX ──────────────────────────────────────────────────────────── */

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* ── Left panel: Scan Controls & File Explorer ──────────────── */}
      <div className="lg:col-span-1 flex flex-col gap-6">
        {/* Repo Scan card */}
        <div className="glass-raised p-5 rounded-xl flex flex-col gap-4 relative overflow-hidden">
          {/* Decorative corner accent */}
          <div
            className="absolute top-0 right-0 h-16 w-16 rounded-bl-full pointer-events-none"
            style={{
              background: "rgba(var(--accent),0.05)",
              borderBottom: "1px solid rgba(var(--accent),0.10)",
              borderLeft: "1px solid rgba(var(--accent),0.10)",
            }}
          />

          {/* Section header */}
          <div className="flex items-center gap-2">
            <Compass
              className="animate-pulse"
              size={20}
              style={{ color: "rgb(var(--accent))" }}
            />
            <h3
              className="font-semibold text-sm uppercase tracking-wider"
              style={{ color: "rgb(var(--text-primary))" }}
            >
              Repository Explorer
            </h3>
          </div>

          {/* Scan form */}
          <form onSubmit={handleScan} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="repo-path"
                className="text-[11px] font-mono uppercase"
                style={{ color: "rgb(var(--text-muted))" }}
              >
                Local Repository Path
              </label>
              <div className="flex gap-2">
                <input
                  id="repo-path"
                  type="text"
                  value={repoPath}
                  onChange={(e) => setRepoPath(e.target.value)}
                  placeholder="Enter path or 'sample'..."
                  className="glass-input flex-1 px-3 py-2 rounded-lg text-xs font-mono"
                  style={{ color: "rgb(var(--text-primary))" }}
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="disabled:opacity-50 text-white font-semibold text-xs px-4 py-2 rounded-lg transition-colors shadow-md flex items-center gap-1.5 whitespace-nowrap"
                  style={{ background: "rgb(var(--accent))" }}
                >
                  {loading ? "Scanning..." : "Scan Path"}
                </button>
              </div>
            </div>
          </form>

          {/* Error message — semantic rose colour kept */}
          {error && (
            <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs p-3 rounded-lg flex items-start gap-2 animate-fade-in-up">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <span className="font-mono">{error}</span>
            </div>
          )}

          {/* Active-repo status badge */}
          {activeRepoPath && (
            <div
              className="flex flex-col gap-1 text-[11px] font-mono p-3 rounded-lg"
              style={{
                background: "rgba(var(--border),0.04)",
                border: "1px solid var(--glass-border)",
                color: "rgb(var(--text-muted))",
              }}
            >
              <div className="flex justify-between">
                <span>ACTIVE:</span>
                <span
                  className="truncate max-w-[200px]"
                  title={activeRepoPath}
                  style={{ color: "rgb(var(--text-primary))" }}
                >
                  {activeRepoPath.split("/").pop()}
                </span>
              </div>
              <div className="flex justify-between mt-1">
                <span>FILES SCANNED:</span>
                <span
                  className="font-bold"
                  style={{ color: "rgb(var(--accent))" }}
                >
                  {scannedFiles.length}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Directory tree viewer */}
        {scannedFiles.length > 0 && (
          <div className="glass p-5 rounded-xl flex flex-col gap-4 flex-1 max-h-[450px] overflow-hidden">
            <h4
              className="font-semibold text-xs uppercase tracking-wider font-mono"
              style={{ color: "rgb(var(--text-secondary))" }}
            >
              Workspace Files
            </h4>
            <div className="overflow-y-auto pr-1 flex-1">
              {renderTree(scannedFiles)}
            </div>
          </div>
        )}
      </div>

      {/* ── Right panel: Conventions & AST viewer ──────────────────── */}
      <div className="lg:col-span-2 flex flex-col gap-6">
        {scannedFiles.length === 0 ? (
          /* Empty state placeholder */
          <div className="glass p-10 rounded-xl flex flex-col items-center justify-center text-center gap-4 min-h-[400px]">
            <Folder
              size={48}
              className="animate-pulse"
              style={{ color: "rgb(var(--text-muted))" }}
            />
            <div className="flex flex-col gap-1 max-w-md">
              <h3
                className="text-lg font-bold"
                style={{ color: "rgb(var(--text-primary))" }}
              >
                No Scanned Repository
              </h3>
              <p
                className="text-xs"
                style={{ color: "rgb(var(--text-muted))" }}
              >
                Input your local repository directory path above or type{" "}
                <code
                  className="font-mono"
                  style={{ color: "rgb(var(--accent))" }}
                >
                  sample
                </code>{" "}
                to automatically bootstrap and scan our ecommerce sample
                microservices.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* ── Learned conventions dashboard summary ────────────── */}
            <div className="glass p-6 rounded-xl flex flex-col gap-6">
              {/* Section header */}
              <div className="flex items-center gap-2">
                {/* Emerald — semantic (success), kept as Tailwind */}
                <Cpu size={18} className="text-emerald-400" />
                <h3
                  className="font-semibold text-sm uppercase tracking-wider"
                  style={{ color: "rgb(var(--text-primary))" }}
                >
                  Learned Conventions & Standards
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* ── Naming rules card ────────────────────────────── */}
                <div
                  className="flex flex-col gap-3 p-4 rounded-xl"
                  style={{
                    background: "rgba(var(--border),0.04)",
                    border: "1px solid var(--glass-border)",
                  }}
                >
                  <span
                    className="text-[10px] font-mono font-bold uppercase tracking-widest pb-1"
                    style={{
                      color: "rgb(var(--text-muted))",
                      borderBottom: "1px solid var(--glass-border)",
                    }}
                  >
                    Naming Formats
                  </span>
                  <div className="flex flex-col gap-2.5 mt-1 text-xs">
                    <div className="flex justify-between">
                      <span style={{ color: "rgb(var(--text-muted))" }}>
                        Target Namespaces:
                      </span>
                      <span className="font-mono text-emerald-400 font-semibold">
                        {conventions.namingStandards.namespaces.join(", ") ||
                          "default"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span style={{ color: "rgb(var(--text-muted))" }}>
                        Common Microservices:
                      </span>
                      <span
                        className="font-mono"
                        style={{ color: "rgb(var(--text-primary))" }}
                      >
                        {conventions.namingStandards.services
                          .slice(0, 3)
                          .join(", ") || "none"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span style={{ color: "rgb(var(--text-muted))" }}>
                        In-house Registry:
                      </span>
                      <span
                        className="font-mono font-semibold truncate max-w-[180px]"
                        title={conventions.namingStandards.registries.join(
                          ", "
                        )}
                        style={{ color: "rgb(var(--accent))" }}
                      >
                        {conventions.namingStandards.registries[0] ||
                          "docker.io"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* ── Cloud & pipelines card ──────────────────────── */}
                <div
                  className="flex flex-col gap-3 p-4 rounded-xl"
                  style={{
                    background: "rgba(var(--border),0.04)",
                    border: "1px solid var(--glass-border)",
                  }}
                >
                  <span
                    className="text-[10px] font-mono font-bold uppercase tracking-widest pb-1"
                    style={{
                      color: "rgb(var(--text-muted))",
                      borderBottom: "1px solid var(--glass-border)",
                    }}
                  >
                    Infrastructure Stack
                  </span>
                  <div className="flex flex-col gap-2.5 mt-1 text-xs">
                    <div className="flex justify-between">
                      <span style={{ color: "rgb(var(--text-muted))" }}>
                        Cloud Provider (IaC):
                      </span>
                      <span className="font-mono text-emerald-400 font-semibold uppercase">
                        {conventions.cloudProviders.join(", ") ||
                          "Kubernetes native"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span style={{ color: "rgb(var(--text-muted))" }}>
                        Exposed Workload Ports:
                      </span>
                      <span
                        className="font-mono"
                        style={{ color: "rgb(var(--text-primary))" }}
                      >
                        {conventions.portsExposed.join(", ") || "8080"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span style={{ color: "rgb(var(--text-muted))" }}>
                        CI/CD Automation:
                      </span>
                      <span
                        className="font-mono font-semibold"
                        style={{ color: "rgb(var(--text-primary))" }}
                      >
                        {conventions.ciCdTriggers
                          .map((t: string) => `on:${t}`)
                          .join(", ") || "push"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Security Policy Standards ──────────────────────── */}
              <div className="flex flex-col gap-3">
                <span
                  className="text-[10px] font-mono font-bold uppercase tracking-widest"
                  style={{ color: "rgb(var(--text-muted))" }}
                >
                  Discovered Security Compliance Rates
                </span>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Non-root user */}
                  <div
                    className="flex items-center gap-3 p-3 rounded-lg"
                    style={{
                      background: "rgba(var(--border),0.04)",
                      border: "1px solid var(--glass-border)",
                    }}
                  >
                    {conventions.securityPolicies.runAsNonRoot ? (
                      <CheckCircle2
                        className="text-emerald-400 shrink-0"
                        size={18}
                      />
                    ) : (
                      <ShieldAlert
                        className="text-rose-400 shrink-0 animate-pulse"
                        size={18}
                      />
                    )}
                    <div className="flex flex-col text-xs">
                      <span
                        className="font-semibold"
                        style={{ color: "rgb(var(--text-primary))" }}
                      >
                        Non-Root User
                      </span>
                      <span
                        className="text-[10px]"
                        style={{ color: "rgb(var(--text-muted))" }}
                      >
                        {conventions.securityPolicies.runAsNonRoot
                          ? "Enforced Standard"
                          : "Violations Detected"}
                      </span>
                    </div>
                  </div>

                  {/* ReadOnly filesystem */}
                  <div
                    className="flex items-center gap-3 p-3 rounded-lg"
                    style={{
                      background: "rgba(var(--border),0.04)",
                      border: "1px solid var(--glass-border)",
                    }}
                  >
                    {conventions.securityPolicies.readOnlyRootFilesystem ? (
                      <CheckCircle2
                        className="text-emerald-400 shrink-0"
                        size={18}
                      />
                    ) : (
                      <AlertTriangle
                        className="text-amber-400 shrink-0"
                        size={18}
                      />
                    )}
                    <div className="flex flex-col text-xs">
                      <span
                        className="font-semibold"
                        style={{ color: "rgb(var(--text-primary))" }}
                      >
                        ReadOnly Filesystem
                      </span>
                      <span
                        className="text-[10px]"
                        style={{ color: "rgb(var(--text-muted))" }}
                      >
                        {conventions.securityPolicies.readOnlyRootFilesystem
                          ? "Enforced Standard"
                          : "Writeable Container FS"}
                      </span>
                    </div>
                  </div>

                  {/* Resource limits */}
                  <div
                    className="flex items-center gap-3 p-3 rounded-lg"
                    style={{
                      background: "rgba(var(--border),0.04)",
                      border: "1px solid var(--glass-border)",
                    }}
                  >
                    {conventions.securityPolicies.hasResourceLimits ? (
                      <CheckCircle2
                        className="text-emerald-400 shrink-0"
                        size={18}
                      />
                    ) : (
                      <AlertTriangle
                        className="text-amber-400 shrink-0"
                        size={18}
                      />
                    )}
                    <div className="flex flex-col text-xs">
                      <span
                        className="font-semibold"
                        style={{ color: "rgb(var(--text-primary))" }}
                      >
                        Resource Limits
                      </span>
                      <span
                        className="text-[10px]"
                        style={{ color: "rgb(var(--text-muted))" }}
                      >
                        {conventions.securityPolicies.hasResourceLimits
                          ? "Sized Boundary Limits"
                          : "Uncontrolled CPUs/Mems"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ── File content / AST viewer ────────────────────────── */}
            {selectedFile && (
              <div className="glass p-6 rounded-xl flex flex-col gap-4 animate-fade-in-up">
                {/* Toolbar: file name + view-mode toggle */}
                <div
                  className="flex items-center justify-between pb-3"
                  style={{ borderBottom: "1px solid var(--glass-border)" }}
                >
                  <div className="flex items-center gap-2">
                    <FileText
                      size={16}
                      style={{ color: "rgb(var(--accent))" }}
                    />
                    <span
                      className="text-xs font-mono font-bold"
                      style={{ color: "rgb(var(--text-primary))" }}
                    >
                      {selectedFile.relativePath}
                    </span>
                  </div>

                  {/* View-mode toggle buttons */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => setViewingAst(false)}
                      className="text-[10px] font-mono px-2.5 py-1 rounded-md"
                      style={
                        !viewingAst
                          ? {
                              background: "rgba(var(--accent),0.12)",
                              border: "1px solid rgba(var(--accent),0.25)",
                              color: "rgb(var(--accent-2))",
                            }
                          : {
                              background: "transparent",
                              border: "1px solid var(--glass-border)",
                              color: "rgb(var(--text-muted))",
                            }
                      }
                    >
                      Raw Code
                    </button>
                    <button
                      onClick={() => setViewingAst(true)}
                      className="text-[10px] font-mono px-2.5 py-1 rounded-md"
                      style={
                        viewingAst
                          ? {
                              background: "rgba(var(--accent),0.12)",
                              border: "1px solid rgba(var(--accent),0.25)",
                              color: "rgb(var(--accent-2))",
                            }
                          : {
                              background: "transparent",
                              border: "1px solid var(--glass-border)",
                              color: "rgb(var(--text-muted))",
                            }
                      }
                    >
                      AST Meta
                    </button>
                  </div>
                </div>

                {/* Content area */}
                {viewingAst ? (
                  /* AST metadata — styled <pre> block */
                  <div
                    className="max-h-[300px] overflow-auto p-4 rounded-xl font-mono text-[11px] leading-relaxed"
                    style={{
                      background: "rgba(var(--border),0.04)",
                      border: "1px solid var(--glass-border)",
                    }}
                  >
                    <pre style={{ color: "rgb(var(--accent-2))" }}>
                      {JSON.stringify(selectedFile.parsedData, null, 2)}
                    </pre>
                  </div>
                ) : (
                  /* Raw code — Monaco editor integration */
                  <div
                    className="rounded-xl overflow-hidden"
                    style={{ border: "1px solid var(--glass-border)" }}
                  >
                    <Editor
                      value={selectedFile.content || ""}
                      filePath={selectedFile.relativePath}
                      readOnly={true}
                      minHeight={280}
                    />
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
