"use client"

/**
 * Dashboard — 3-Column IDE Split-Pane Workspace Dashboard.
 *
 * 3-Column Layout:
 *  - Column 1 (Left Sidebar - Narrow):
 *    - Project Switcher & "+ New Project" Dialog Trigger
 *    - Linked Repository Path configurations
 *    - Workspace Directory Folder Tree Explorer
 *    - Conventions History tracker
 *  - Column 2 (Center Chat Column - Medium):
 *    - An Antigravity-style dedicated Chat Refiner panel
 *    - Full-height scrolling messaging feed and input form
 *  - Column 3 (Right Workbench - Wide):
 *    - Master Tabs above content:
 *      - "📊 Infrastructure Graph" (Interactive S-curve node map)
 *      - "📝 Editor" (Dynamic Monaco code viewer & editor with open tabs)
 *
 * Theme: Complies with light/dark theme CSS variables (--bg, --accent, etc.).
 */

import React, { useState, useEffect, useRef } from "react"
import {
  Network,
  Cpu,
  Sun,
  Moon,
  FolderPlus,
  Trash2,
  Plus,
  Send,
  RefreshCw,
  FolderOpen,
  FileCode,
  Sparkles,
  Layers,
  X,
  MessageSquare,
} from "lucide-react"
import { useTheme } from "@/lib/theme-context"
import Editor from "./editor"
import KnowledgeGraph from "./knowledge-graph"

/* ── Types ──────────────────────────────────────────────────────────────── */
type WorkbenchTab = "graph" | "editor"

interface ProjectInfo {
  id: string
  name: string
  repoLinks: string[]
  conventionsCount: number
  chatHistoryCount: number
}

interface ChatMessage {
  sender: "user" | "ai"
  text: string
}

/* ── Component ──────────────────────────────────────────────────────────── */
export default function Dashboard() {
  const { theme, toggleTheme } = useTheme()
  const [activeTab, setActiveTab] = useState<WorkbenchTab>("editor")
  
  /* ── Multi-Project states ─────────────────────────────────────────────── */
  const [projects, setProjects] = useState<ProjectInfo[]>([])
  const [activeProjectId, setActiveProjectId] = useState<string>("")
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newProjName, setNewProjName] = useState("")
  const [newProjLinks, setNewProjLinks] = useState<string[]>([""])

  /* ── Active project files & conventions states ────────────────────────── */
  const [activeRepoPath, setActiveRepoPath] = useState("")
  const [scannedFiles, setScannedFiles] = useState<any[]>([])
  const [conventions, setConventions] = useState<any>(null)
  const [conventionsHistory, setConventionsHistory] = useState<any[]>([])
  const [graph, setGraph] = useState<any>({ nodes: [], edges: [] })

  /* ── Editor Workspace states ──────────────────────────────────────────── */
  const [activeGeneratedFiles, setActiveGeneratedFiles] = useState<Record<string, string>>({})
  const [openFileTabs, setOpenFileTabs] = useState<string[]>([])
  const [activeOpenFile, setActiveOpenFile] = useState<string>("")
  const [editorContent, setEditorContent] = useState("")
  const [savingStatus, setSavingStatus] = useState<"saved" | "saving" | "dirty">("saved")
  const [validationResult, setValidationResult] = useState<any>({
    isValid: true,
    issues: [],
    summary: { errors: 0, warnings: 0, infos: 0 }
  })

  /* ── Center Chat states ───────────────────────────────────────────────── */
  const [chatInput, setChatInput] = useState("")
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [embeddingStatus, setEmbeddingStatus] = useState<"idle" | "processing" | "completed" | "error">("idle")
  const [embeddingError, setEmbeddingError] = useState("")
  const [notifications, setNotifications] = useState<{ msg: string; ts: string }[]>([
    { msg: "InfraMind Engine online. Awaiting project scan…", ts: "" }
  ])

  const chatEndRef = useRef<HTMLDivElement>(null)

  /* ── Poll Embedding Status when processing ────────────────────────────── */
  useEffect(() => {
    if (embeddingStatus !== "processing" || !activeProjectId) return

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/projects?activeId=${activeProjectId}`)
        const data = await res.json()
        if (res.ok) {
          setEmbeddingStatus(data.embeddingStatus || "idle")
          setEmbeddingError(data.embeddingError || "")
          
          if (data.embeddingStatus === "completed") {
            addNote("Vector embeddings created successfully!")
            fetchProjects(activeProjectId)
          } else if (data.embeddingStatus === "error") {
            addNote(`Embedding Error: ${data.embeddingError}`)
          }
        }
      } catch (err) {
        console.error("Failed to poll embedding status:", err)
      }
    }, 4000)

    return () => clearInterval(interval)
  }, [embeddingStatus, activeProjectId])

  /* ── Fetch projects on mount ──────────────────────────────────────────── */
  useEffect(() => {
    fetchProjects()
    setNotifications([
      { msg: "InfraMind Engine online. Awaiting project scan…", ts: new Date().toLocaleTimeString() }
    ])
  }, [])

  /* ── Auto-scroll chat to bottom ────────────────────────────────────────── */
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [chatMessages])

  /* ── Load active file into Monaco ──────────────────────────────────────── */
  useEffect(() => {
    if (activeOpenFile && activeGeneratedFiles[activeOpenFile] !== undefined) {
      setEditorContent(activeGeneratedFiles[activeOpenFile])
      setSavingStatus("saved")
    } else {
      setEditorContent("")
    }
  }, [activeOpenFile, activeGeneratedFiles])

  /* ── Debounced code auto-save & lint validation ────────────────────────── */
  useEffect(() => {
    if (savingStatus !== "dirty" || !activeOpenFile) return

    const delayDebounceFn = setTimeout(async () => {
      setSavingStatus("saving")
      try {
        const updatedFiles = {
          ...activeGeneratedFiles,
          [activeOpenFile]: editorContent,
        }

        const response = await fetch("/api/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ files: updatedFiles }),
        })

        const data = await response.json()
        if (response.ok) {
          setActiveGeneratedFiles(updatedFiles)
          setValidationResult(data.validationResult)
          setSavingStatus("saved")
          if (data.validationResult.summary.errors > 0) {
            addNote(`Lint alert: ${data.validationResult.summary.errors} error(s) in active workspace.`)
          }
        }
      } catch (err) {
        console.error("Auto-save validation failed:", err)
        setSavingStatus("dirty")
      }
    }, 1200)

    return () => clearTimeout(delayDebounceFn)
  }, [editorContent, activeOpenFile, savingStatus])

  /* ── Helper log function ──────────────────────────────────────────────── */
  const addNote = (msg: string) => {
    setNotifications(p => [{ msg, ts: new Date().toLocaleTimeString() }, ...p].slice(0, 6))
  }

  /* ── Load projects list ───────────────────────────────────────────────── */
  const fetchProjects = async (selectId?: string) => {
    try {
      const res = await fetch("/api/projects")
      const data = await res.json()
      if (res.ok && data.projects) {
        setProjects(data.projects)
        const targetId = selectId || data.activeProjectId || (data.projects.length > 0 ? data.projects[0].id : "")
        if (targetId) {
          handleSelectProject(targetId)
        }
      }
    } catch (err) {
      console.error("Failed to fetch projects:", err)
    }
  }

  /* ── Switch active project workspace ──────────────────────────────────── */
  const handleSelectProject = async (id: string) => {
    try {
      setActiveProjectId(id)
      const res = await fetch(`/api/projects?activeId=${id}`)
      const data = await res.json()
      
      if (res.ok) {
        setActiveRepoPath(data.scannedRepoPath || "")
        setConventions(data.conventions || null)
        setChatMessages(data.chatHistory || [])
        setConventionsHistory(data.conventionsHistory || [])
        setEmbeddingStatus(data.embeddingStatus || "idle")
        setEmbeddingError(data.embeddingError || "")
        
        // Fetch project files & graph
        fetchGraph(id)
        loadProjectFilesFromMemory(id)
        addNote(`Loaded project workspace.`)
      }
    } catch (err) {
      console.error("Failed to load project details:", err)
    }
  }

  /* ── Load project files cached in state ───────────────────────────────── */
  const loadProjectFilesFromMemory = async (projId: string) => {
    try {
      const res = await fetch("/api/projects")
      const data = await res.json()
      
      if (res.ok) {
        const activeProj = data.projects.find((p: any) => p.id === projId)
        if (activeProj && activeProj.repoLinks?.length > 0) {
          const checkRes = await fetch(`/api/projects?activeId=${activeProj.id}`)
          const checkData = await checkRes.json()
          if (checkData.filesCount === 0) {
            handleScanWorkspace(activeProj.repoLinks[0])
          } else {
            reloadFilesState()
          }
        }
      }
    } catch {}
  }

  const reloadFilesState = async () => {
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoPath: "" })
      })
      const data = await res.json()
      if (res.ok && data.files) {
        setScannedFiles(data.files)
        const fileMap: Record<string, string> = {}
        data.files.forEach((f: any) => {
          fileMap[f.relativePath] = f.content
        })
        setActiveGeneratedFiles(fileMap)
        if (data.files.length > 0 && openFileTabs.length === 0) {
          setOpenFileTabs([data.files[0].relativePath])
          setActiveOpenFile(data.files[0].relativePath)
        }
      }
    } catch {}
  }

  /* ── Fetch Graph Nodes ───────────────────────────────────────────────── */
  const fetchGraph = async (projId: string) => {
    try {
      const res = await fetch(`/api/graph?projectId=${projId}`)
      const data = await res.json()
      if (res.ok && data.graph) {
        setGraph(data.graph)
      }
    } catch {}
  }

  /* ── Create project workspace ─────────────────────────────────────────── */
  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newProjName.trim()) return

    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newProjName,
          repoLinks: newProjLinks.filter(Boolean),
        }),
      })

      const data = await res.json()
      if (res.ok && data.project) {
        setShowCreateModal(false)
        setNewProjName("")
        setNewProjLinks([""])
        addNote(`Created project "${data.project.name}".`)
        fetchProjects(data.project.id)
      }
    } catch (err) {
      console.error("Create project failed:", err)
    }
  }

  /* ── Delete project workspace ─────────────────────────────────────────── */
  const handleDeleteProject = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm("Are you sure you want to delete this project and all its encrypted configurations?")) return

    try {
      const res = await fetch(`/api/projects?id=${id}`, { method: "DELETE" })
      const data = await res.json()
      if (res.ok) {
        addNote(`Deleted project workspace.`)
        setOpenFileTabs([])
        setActiveOpenFile("")
        setActiveGeneratedFiles({})
        setScannedFiles([])
        setConventions(null)
        setGraph({ nodes: [], edges: [] })
        fetchProjects(data.nextActiveProjectId)
      }
    } catch (err) {
      console.error("Delete project failed:", err)
    }
  }

  /* ── Scan project paths ──────────────────────────────────────────────── */
  const handleScanWorkspace = async (pathStr?: string) => {
    setLoading(true)
    addNote(`Scanning repository paths...`)
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoPath: pathStr || "" })
      })

      const data = await res.json()
      if (res.ok) {
        setScannedFiles(data.files || [])
        setConventions(data.conventions)
        if (data.conventionsHistory) {
          setConventionsHistory(data.conventionsHistory)
        }
        
        const fileMap: Record<string, string> = {}
        data.files.forEach((f: any) => {
          fileMap[f.relativePath] = f.content
        })
        setActiveGeneratedFiles(fileMap)
        setActiveRepoPath(data.repoPath)
        
        if (data.files.length > 0) {
          const firstFile = data.files[0].relativePath
          setOpenFileTabs([firstFile])
          setActiveOpenFile(firstFile)
        }

        fetchGraph(activeProjectId)
        addNote(`Scan completed: ${data.filesCount} assets indexed securely.`)
        setEmbeddingStatus("processing")
      } else {
        addNote(`Scan failed: ${data.error}`)
      }
    } catch (err) {
      addNote(`Scan error. Check server logs.`)
    } finally {
      setLoading(false)
    }
  }

  /* ── AI Chat refiner console ─────────────────────────────────────────── */
  const submitInstruction = async (instruction: string) => {
    if (!instruction.trim() || !activeProjectId || loading) return

    setChatMessages(prev => [...prev, { sender: "user", text: instruction }])
    setLoading(true)

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instruction: instruction,
          refine: true,
          files: activeGeneratedFiles,
        }),
      })

      const data = await res.json()
      if (res.ok && data.files) {
        setActiveGeneratedFiles(data.files)
        setValidationResult(data.validationResult)
        
        setChatMessages(prev => [
          ...prev,
          { sender: "ai", text: data.explanation || `Successfully refined assets according to standard guidelines.` }
        ])
        
        fetchGraph(activeProjectId)
        addNote(`AI refiner: updated code assets.`)
        setEmbeddingStatus("processing")
      } else {
        setChatMessages(prev => [
          ...prev,
          { sender: "ai", text: `Error occurred during refinement: ${data.error}` }
        ])
      }
    } catch (err) {
      setChatMessages(prev => [
        ...prev,
        { sender: "ai", text: `System offline. Could not connect to generator engine.` }
      ])
    } finally {
      setLoading(false)
    }
  }

  const handleChatSend = (e: React.FormEvent) => {
    e.preventDefault()
    if (!chatInput.trim()) return
    submitInstruction(chatInput.trim())
    setChatInput("")
  }

  const handleSuggestionClick = (suggestion: string) => {
    submitInstruction(suggestion)
  }

  const chatSuggestions = [
    "Generate Kubernetes deployment.yaml",
    "Expose web port 8080",
    "Add node Dockerfile template",
    "Verify compliance standards"
  ]

  const renderChatMessageText = (text: string) => {
    if (!text) return null
    const parts = text.split(/(```[\s\S]*?```)/g)
    
    return parts.map((part, idx) => {
      if (part.startsWith("```") && part.endsWith("```")) {
        const rawContent = part.slice(3, -3).trim()
        const newlineIndex = rawContent.indexOf("\n")
        let language = "code"
        let code = rawContent
        if (newlineIndex !== -1) {
          const possibleLang = rawContent.substring(0, newlineIndex).trim()
          if (possibleLang.length < 12) {
            language = possibleLang
            code = rawContent.substring(newlineIndex + 1)
          }
        }
        
        return (
          <div key={idx} className="my-2 rounded-lg overflow-hidden border border-teal-500/20 bg-zinc-950/70 font-mono text-[10.5px] leading-relaxed shadow-md w-full">
            <div className="flex items-center justify-between px-3 py-1 bg-zinc-900 border-b border-white/5 text-[9px] tracking-wider uppercase text-slate-400 select-none">
              <span>{language}</span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(code)
                  addNote("Copied code to clipboard!")
                }}
                className="px-1.5 py-0.5 rounded hover:bg-white/10 transition-colors text-teal-400 hover:text-teal-300 font-bold"
              >
                Copy
              </button>
            </div>
            <pre className="p-3 overflow-x-auto text-[#cbd5e1] max-h-64 font-mono">{code}</pre>
          </div>
        )
      }
      
      const subparts = part.split(/(\`[^\`]+\`|\*\*[^*]+\*\*)/g)
      return (
        <span key={idx}>
          {subparts.map((sub, sIdx) => {
            if (sub.startsWith("`") && sub.endsWith("`")) {
              return (
                <code key={sIdx} className="bg-teal-500/10 border border-teal-500/20 px-1 py-0.5 rounded text-teal-300 font-mono text-[10px]">
                  {sub.slice(1, -1)}
                </code>
              )
            }
            if (sub.startsWith("**") && sub.endsWith("**")) {
              return (
                <strong key={sIdx} className="font-bold text-teal-400">
                  {sub.slice(2, -2)}
                </strong>
              )
            }
            if (sub.startsWith("- ")) {
              return (
                <span key={sIdx} className="block pl-3 my-0.5 text-slate-300">
                  • {sub.substring(2)}
                </span>
              )
            }
            return sub
          })}
        </span>
      )
    })
  }

  /* ── Monaco tabs management ───────────────────────────────────────────── */
  const handleOpenFile = (path: string) => {
    if (!openFileTabs.includes(path)) {
      setOpenFileTabs(p => [...p, path])
    }
    setActiveOpenFile(path)
  }

  const handleCloseFileTab = (path: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const index = openFileTabs.indexOf(path)
    const nextTabs = openFileTabs.filter(t => t !== path)
    setOpenFileTabs(nextTabs)
    
    if (activeOpenFile === path) {
      if (nextTabs.length > 0) {
        setActiveOpenFile(nextTabs[Math.max(0, index - 1)])
      } else {
        setActiveOpenFile("")
      }
    }
  }

  const handleLinkChange = (index: number, val: string) => {
    const list = [...newProjLinks]
    list[index] = val
    setNewProjLinks(list)
  }

  const addLinkInput = () => {
    setNewProjLinks(p => [...p, ""])
  }

  const activeProject = projects.find(p => p.id === activeProjectId)

  return (
    <div className="flex-1 flex flex-col min-h-screen" style={{ background: "rgb(var(--bg))" }}>
      
      {/* ── Top Header ────────────────────────────────────────────────── */}
      <header
        className="glass sticky top-0 z-40 px-5 py-3 flex items-center justify-between border-b"
        style={{ borderColor: "var(--glass-border)" }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div
            className="h-8 w-8 rounded-lg flex items-center justify-center text-white shadow"
            style={{ background: "linear-gradient(135deg, rgb(var(--accent)), rgb(var(--accent-2)))" }}
          >
            <Cpu size={16} />
          </div>
          <div className="leading-tight">
            <h1 className="text-sm font-black tracking-widest uppercase" style={{ color: "rgb(var(--text-primary))" }}>InfraMind</h1>
            <span className="text-[9px] tracking-widest uppercase" style={{ color: "rgb(var(--text-muted))" }}>
              Enterprise Project Workspaces
            </span>
          </div>
        </div>

        {/* Global actions */}
        <div className="flex items-center gap-4">
          {activeProject && (
            <div
              className="px-3.5 py-1 rounded-full text-[10px] font-mono border"
              style={{
                background: "rgba(var(--accent),0.06)",
                borderColor: "rgba(var(--accent),0.2)",
                color: "rgb(var(--accent))",
              }}
            >
              <span className="opacity-65">PROJECT: </span>
              <span className="font-bold">{activeProject.name}</span>
            </div>
          )}

          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg border transition-all hover:scale-105 active:scale-95"
            style={{
              background: "rgba(var(--accent),0.05)",
              borderColor: "rgba(var(--accent),0.15)",
              color: "rgb(var(--accent))",
            }}
            aria-label="Toggle theme"
          >
            {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
          </button>
        </div>
      </header>

      {/* ── 3-Column Split Layout Workspace ───────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">

        {/* ─── COLUMN 1: LEFT SIDEBAR (Narrow - 64px/256px width) ──────── */}
        <aside
          className="glass w-64 border-r flex flex-col shrink-0 overflow-y-auto z-30"
          style={{ borderColor: "var(--glass-border)", background: "rgba(0,0,0,0.15)" }}
        >
          {/* Project Switcher section */}
          <div className="p-4 border-b flex flex-col gap-3" style={{ borderColor: "var(--glass-border)" }}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: "rgb(var(--text-muted))" }}>
                Projects
              </span>
              <button
                onClick={() => setShowCreateModal(true)}
                className="text-[10px] font-mono flex items-center gap-1 hover:brightness-110"
                style={{ color: "rgb(var(--accent))" }}
              >
                <Plus size={12} /> Add
              </button>
            </div>

            <div className="flex gap-1.5">
              <select
                value={activeProjectId}
                onChange={e => handleSelectProject(e.target.value)}
                className="glass-input flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold focus:outline-none"
                style={{ color: "rgb(var(--text-primary))", background: "rgba(var(--bg),0.65)" }}
              >
                {projects.length === 0 ? (
                  <option value="">No Projects</option>
                ) : (
                  projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))
                )}
              </select>
              {activeProjectId && (
                <button
                  onClick={() => handleDeleteProject(activeProjectId, {} as any)}
                  className="p-2 rounded-lg hover:bg-rose-500/10 text-rose-400 border border-transparent hover:border-rose-500/20"
                  title="Delete project"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          </div>

          {/* Directory File Explorer Tree */}
          {activeProjectId && (
            <div className="p-4 border-b flex flex-col gap-2.5" style={{ borderColor: "var(--glass-border)" }}>
              <div className="text-[10px] font-mono font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: "rgb(var(--text-muted))" }}>
                <FolderOpen size={12} style={{ color: "rgb(var(--accent))" }} />
                <span>Workspace Files</span>
              </div>
              <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
                {scannedFiles.length === 0 ? (
                  <span className="text-[10px] font-mono opacity-50 px-2">No files scanned yet.</span>
                ) : (
                  scannedFiles.map(file => {
                    const isOpen = activeOpenFile === file.relativePath
                    return (
                      <button
                        key={file.relativePath}
                        onClick={() => handleOpenFile(file.relativePath)}
                        className="text-left text-[11px] font-mono p-1.5 rounded truncate flex items-center gap-1.5 hover:bg-white/5"
                        style={
                          isOpen
                            ? {
                                background: "rgba(var(--accent),0.08)",
                                color: "rgb(var(--accent))",
                                fontWeight: 600,
                              }
                            : {
                                color: "rgb(var(--text-secondary))"
                              }
                        }
                      >
                        <FileCode size={11} className="opacity-70 shrink-0" />
                        <span className="truncate">{file.relativePath}</span>
                      </button>
                    )
                  })
                )}
              </div>
            </div>
          )}

          {/* Repo Link Configurations */}
          {activeProject && (
            <div className="p-4 border-b flex flex-col gap-3" style={{ borderColor: "var(--glass-border)" }}>
              <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase text-slate-400">
                <FolderOpen size={12} style={{ color: "rgb(var(--accent))" }} />
                <span>Repo Path Folders</span>
              </div>
              <div className="flex flex-col gap-1 max-h-20 overflow-y-auto">
                {activeProject.repoLinks.map((link, idx) => (
                  <div key={idx} className="text-[10px] font-mono p-1 rounded truncate" style={{ background: "rgba(var(--accent),0.04)", color: "rgb(var(--text-secondary))" }} title={link}>
                    {link.split("/").pop()}
                  </div>
                ))}
              </div>
              <button
                onClick={() => handleScanWorkspace()}
                disabled={loading || activeProject.repoLinks.length === 0}
                className="w-full text-white font-bold text-xs py-1.5 rounded-lg transition-colors flex items-center justify-center gap-1 hover:brightness-110 disabled:opacity-50"
                style={{ background: "rgb(var(--accent))" }}
              >
                {loading ? <RefreshCw size={11} className="animate-spin" /> : <Plus size={11} />}
                Scan Project paths
              </button>
            </div>
          )}

          {/* Conventions History */}
          {activeProject && conventionsHistory.length > 0 && (
            <div className="p-4 flex flex-col gap-2 flex-1 overflow-hidden">
              <div className="text-[10px] font-mono uppercase text-slate-400 flex items-center gap-1.5">
                <Layers size={12} style={{ color: "rgb(var(--accent))" }} />
                <span>Conventions</span>
              </div>
              <div className="flex-1 overflow-y-auto flex flex-col gap-1.5 pr-1">
                {conventionsHistory.map((hist, idx) => (
                  <div
                    key={idx}
                    className="p-2 rounded border text-[10px] leading-relaxed"
                    style={{
                      background: "rgba(var(--accent),0.03)",
                      borderColor: "rgba(var(--accent),0.1)",
                      color: "rgb(var(--text-secondary))"
                    }}
                  >
                    <div className="font-bold border-b pb-0.5 mb-1 flex justify-between" style={{ borderColor: "rgba(var(--accent),0.06)" }}>
                      <span>Version {idx + 1}</span>
                      <span className="opacity-60">{hist.date.split(" ")[0]}</span>
                    </div>
                    <div className="flex flex-wrap gap-1 font-mono text-[9px]">
                      {hist.conventions.portsExposed?.map((p: any) => (
                        <span key={p} className="bg-emerald-500/10 text-emerald-400 px-1 rounded">port:{p}</span>
                      ))}
                      {hist.conventions.cloudProviders?.map((cp: any) => (
                        <span key={cp} className="bg-sky-500/10 text-sky-400 px-1 rounded">{cp}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>

        {/* ─── COLUMN 2: CENTER CHAT PANEL (Persistent - Medium width - 420px) ── */}
        <section
          className="glass w-[420px] border-r flex flex-col shrink-0 overflow-hidden z-20 animate-fade-in"
          style={{ borderColor: "var(--glass-border)", background: "rgba(0,0,0,0.12)" }}
        >
          {/* Header resembling Antigravity Assistant */}
          <div className="p-4 border-b flex items-center justify-between shrink-0" style={{ borderColor: "var(--glass-border)" }}>
            <div className="flex items-center gap-2.5">
              <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <div>
                <h3 className="font-black text-xs uppercase tracking-wider font-mono" style={{ color: "rgb(var(--text-primary))" }}>
                  Antigravity Assistant
                </h3>
                <div className="text-[9px] tracking-wide font-mono flex items-center gap-1.5 mt-0.5" style={{ color: "rgb(var(--text-secondary))" }}>
                  <span className="opacity-75">Session • AES-256</span>
                  <span className="opacity-30">|</span>
                  {embeddingStatus === "processing" ? (
                    <span className="text-amber-400 animate-pulse font-bold flex items-center gap-1">
                      <RefreshCw size={8} className="animate-spin" /> Vectorizing...
                    </span>
                  ) : embeddingStatus === "completed" ? (
                    <span className="text-emerald-400 font-bold" title="Vector embeddings created successfully!">✓ Vector Ready</span>
                  ) : embeddingStatus === "error" ? (
                    <span className="text-rose-400 font-bold hover:underline cursor-help" title={embeddingError || "Embedding failed"}>
                      ⚠️ Vector Error
                    </span>
                  ) : (
                    <span className="opacity-50">● Idle</span>
                  )}
                </div>
              </div>
            </div>
            
            {chatMessages.length > 0 && (
              <button
                onClick={() => setChatMessages([])}
                className="p-1.5 rounded hover:bg-rose-500/10 text-rose-400 hover:text-rose-300 transition-colors"
                title="Clear chat history"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>

          {/* Scrolling Chat log */}
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
            {chatMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center h-full text-[11px] leading-relaxed opacity-55 p-4" style={{ color: "rgb(var(--text-muted))" }}>
                <Sparkles size={24} className="mb-3 text-teal-400 animate-pulse" />
                <span className="font-bold text-slate-200 mb-1">Welcome to Antigravity Workspace</span>
                <span>Ask the assistant to generate deploy configurations, update replica values, expose service ports, or check standards. The updates will apply directly to the active editor.</span>
              </div>
            ) : (
              chatMessages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex flex-col max-w-[90%] rounded-xl p-3 text-xs leading-relaxed shadow-sm ${
                    msg.sender === "user" ? "self-end animate-fade-in-left" : "self-start animate-fade-in-right"
                  }`}
                  style={
                    msg.sender === "user"
                      ? {
                          background: "rgba(var(--accent),0.12)",
                          border: "1px solid rgba(var(--accent),0.2)",
                          color: "rgb(var(--text-primary))",
                        }
                      : {
                          background: "var(--glass-bg)",
                          border: "1px solid var(--glass-border)",
                          color: "rgb(var(--text-secondary))",
                        }
                  }
                >
                  <div className="flex items-center gap-1.5 mb-1.5 opacity-60 select-none">
                    {msg.sender === "user" ? (
                      <div className="h-4 w-4 rounded-full bg-slate-700/50 flex items-center justify-center text-[7px] font-mono text-slate-300">
                        DEV
                      </div>
                    ) : (
                      <div className="h-4 w-4 rounded-full bg-teal-500/20 flex items-center justify-center text-[7px] font-mono text-teal-400">
                        AI
                      </div>
                    )}
                    <span className="text-[8px] uppercase font-bold tracking-wider">
                      {msg.sender === "user" ? "Developer" : "Antigravity Assistant"}
                    </span>
                  </div>
                  <div className="whitespace-pre-wrap">{renderChatMessageText(msg.text)}</div>
                </div>
              ))
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Suggester Pills Row */}
          {activeProjectId && (
            <div className="px-4 py-2.5 flex flex-wrap gap-1.5 shrink-0 border-t" style={{ borderColor: "var(--glass-border)", background: "rgba(0,0,0,0.06)" }}>
              {chatSuggestions.map((sug, sIdx) => (
                <button
                  key={sIdx}
                  type="button"
                  onClick={() => handleSuggestionClick(sug)}
                  disabled={loading}
                  className="text-[9px] font-mono px-2.5 py-1 rounded-full border border-teal-500/15 bg-teal-500/5 hover:bg-teal-500/15 hover:border-teal-500/35 text-teal-300 transition-all text-left truncate max-w-full disabled:opacity-50"
                >
                  + {sug}
                </button>
              ))}
            </div>
          )}

          {/* Chat input box */}
          <form onSubmit={handleChatSend} className="p-4 border-t flex gap-2 shrink-0 mt-auto" style={{ borderColor: "var(--glass-border)" }}>
            <input
              type="text"
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              disabled={loading || !activeProjectId}
              placeholder={activeProjectId ? "Type instructions to build/refine code..." : "Select a project to start chat..."}
              className="glass-input flex-1 px-3 py-2 rounded-lg text-xs font-mono focus:ring-1 focus:ring-teal-500/50"
              style={{ color: "rgb(var(--text-secondary))" }}
            />
            <button
              type="submit"
              disabled={loading || !activeProjectId || !chatInput.trim()}
              className="p-2.5 rounded-lg bg-teal-600 hover:brightness-110 text-white disabled:opacity-40 transition-all flex items-center justify-center shrink-0"
              style={{ background: "rgb(var(--accent))" }}
            >
              {loading ? <RefreshCw size={13} className="animate-spin" /> : <Send size={13} />}
            </button>
          </form>
        </section>

        {/* ─── COLUMN 3: RIGHT WORKSPACE PANEL (Editor & Graph Tabs) ──── */}
        {activeProjectId ? (
          <main
            className="flex-1 overflow-hidden flex flex-col items-stretch z-10"
            style={{ background: "rgb(var(--bg))" }}
          >
            {/* Master Tab list bar */}
            <div
              className="px-5 pt-2 flex items-center justify-between border-b shrink-0"
              style={{
                background: "rgba(var(--accent),0.03)",
                borderColor: "var(--glass-border)",
              }}
            >
              <div className="flex gap-2">
                <button
                  onClick={() => setActiveTab("editor")}
                  className="text-xs font-bold px-4 py-2.5 rounded-t-lg transition-all border-b-2"
                  style={
                    activeTab === "editor"
                      ? {
                          borderBottomColor: "rgb(var(--accent))",
                          color: "rgb(var(--accent))",
                        }
                      : {
                          borderBottomColor: "transparent",
                          color: "rgb(var(--text-muted))",
                        }
                  }
                >
                  📝 Editor
                </button>
                <button
                  onClick={() => setActiveTab("graph")}
                  className="text-xs font-bold px-4 py-2.5 rounded-t-lg transition-all border-b-2"
                  style={
                    activeTab === "graph"
                      ? {
                          borderBottomColor: "rgb(var(--accent))",
                          color: "rgb(var(--accent))",
                        }
                      : {
                          borderBottomColor: "transparent",
                          color: "rgb(var(--text-muted))",
                        }
                  }
                >
                  📊 Infrastructure Graph
                </button>
              </div>
            </div>

            {/* Display contents */}
            <div className="flex-1 flex flex-col overflow-hidden relative">
              
              {/* TAB A: Infrastructure Graph */}
              {activeTab === "graph" && (
                <div className="flex-1 flex flex-col overflow-hidden">
                  {graph.nodes?.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center opacity-60">
                      <Network size={48} className="text-slate-600 animate-pulse mb-3" />
                      <h3 className="text-sm font-bold" style={{ color: "rgb(var(--text-primary))" }}>No Graph Nodes Resolved</h3>
                      <p className="text-xs max-w-xs mt-1" style={{ color: "rgb(var(--text-secondary))" }}>
                        Click &quot;Scan Project paths&quot; on the left sidebar to index and display your workspace nodes.
                      </p>
                    </div>
                  ) : (
                    <KnowledgeGraph nodes={graph.nodes} edges={graph.edges} />
                  )}
                </div>
              )}

              {/* TAB B: Editor Workspace */}
              {activeTab === "editor" && (
                <div className="flex-1 flex flex-col overflow-hidden relative">
                  
                  {/* File tabs horizontal bar */}
                  {openFileTabs.length > 0 ? (
                    <div
                      className="px-3 border-b flex items-center justify-between shrink-0"
                      style={{ background: "rgba(var(--accent),0.02)", borderColor: "var(--glass-border)" }}
                    >
                      <div className="flex gap-1 overflow-x-auto pt-2">
                        {openFileTabs.map(tab => {
                          const isSelected = activeOpenFile === tab
                          return (
                            <div
                              key={tab}
                              onClick={() => setActiveOpenFile(tab)}
                              className="text-[11px] font-mono px-3.5 py-1.5 rounded-t-md transition-all shrink-0 flex items-center gap-2 cursor-pointer select-none"
                              style={
                                isSelected
                                  ? {
                                      background: "var(--glass-bg)",
                                      borderTop: "2px solid rgb(var(--accent))",
                                      borderLeft: "1px solid var(--glass-border)",
                                      borderRight: "1px solid var(--glass-border)",
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
                              <span>{tab.split("/").pop()}</span>
                              <button
                                onClick={e => handleCloseFileTab(tab, e)}
                                className="p-0.5 rounded-full hover:bg-white/10 opacity-70 hover:opacity-100"
                              >
                                <X size={9} />
                              </button>
                            </div>
                          )
                        })}
                      </div>

                      {/* Sync saving status */}
                      <div className="flex items-center mb-1 shrink-0">
                        <span
                          className={`text-[9px] font-mono font-semibold uppercase px-2 py-0.5 rounded border ${
                            savingStatus === "saved"
                              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                              : savingStatus === "saving"
                                ? "bg-amber-500/10 border-amber-500/20 text-amber-400 animate-pulse"
                                : "bg-rose-500/10 border-rose-500/20 text-rose-400"
                          }`}
                        >
                          {savingStatus === "saved" ? "✓ Sync" : savingStatus === "saving" ? "Validating..." : "● Unsaved"}
                        </span>
                      </div>
                    </div>
                  ) : null}

                  {/* Editor frame */}
                  {activeOpenFile ? (
                    <div className="flex-1 flex flex-col relative overflow-hidden">
                      <div className="flex-1 min-h-0 relative">
                        <Editor
                          value={editorContent}
                          filePath={activeOpenFile}
                          onChange={val => {
                            setEditorContent(val)
                            setSavingStatus("dirty")
                          }}
                          minHeight={450}
                        />
                      </div>

                      {/* Validator Footer Status Bar */}
                      <div
                        className="px-5 py-2 flex items-center justify-between text-xs font-mono shrink-0"
                        style={{
                          background: "var(--glass-bg)",
                          borderTop: "1px solid var(--glass-border)",
                          color: "rgb(var(--text-secondary))",
                        }}
                      >
                        <div className="flex items-center gap-1.5 truncate max-w-md">
                          <span>Active file:</span>
                          <span className="font-bold" style={{ color: "rgb(var(--accent))" }}>
                            {activeOpenFile}
                          </span>
                        </div>
                        
                        <div className="flex gap-4 shrink-0">
                          <div className="flex items-center gap-1.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                            <span>{validationResult.summary?.errors || 0} errors</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                            <span>{validationResult.summary?.warnings || 0} warnings</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-center opacity-65 p-6">
                      <FileCode size={44} className="animate-pulse mb-3" style={{ color: "rgb(var(--text-muted))" }} />
                      <h3 className="text-sm font-bold" style={{ color: "rgb(var(--text-primary))" }}>No Files Active</h3>
                      <p className="text-xs max-w-xs mt-1" style={{ color: "rgb(var(--text-secondary))" }}>
                        Click a file in the workspace directory tree inside Column 1 to load code in the editor pane.
                      </p>
                    </div>
                  )}

                </div>
              )}

            </div>
          </main>
        ) : (
          /* Empty Workspace state */
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-zinc-950/20">
            <FolderOpen size={56} className="mb-4 animate-bounce" style={{ color: "rgb(var(--accent))" }} />
            <h2 className="text-lg font-bold" style={{ color: "rgb(var(--text-primary))" }}>Awaiting Project Selection</h2>
            <p className="text-xs max-w-md mt-2 leading-relaxed" style={{ color: "rgb(var(--text-secondary))" }}>
              Select an existing project workspace from the dropdown list on the left, or configure a new project path to start scanning and code generation.
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="mt-5 text-white font-bold text-xs px-5 py-2.5 rounded-lg shadow hover:brightness-110 transition-all font-mono"
              style={{ background: "rgb(var(--accent))" }}
            >
              Create New Project
            </button>
          </div>
        )}

      </div>

      {/* ─── Shadcn-Style Glass Modal: Create Project ───────────────── */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm p-4 animate-fade-in">
          <div
            className="glass w-full max-w-md rounded-2xl p-6 border shadow-2xl flex flex-col gap-4 animate-scale-up"
            style={{ borderColor: "var(--glass-border)", background: "var(--glass-bg)" }}
          >
            <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: "var(--glass-border)" }}>
              <div className="flex items-center gap-2">
                <FolderPlus size={18} style={{ color: "rgb(var(--accent))" }} />
                <h3 className="font-bold text-sm uppercase tracking-wider" style={{ color: "rgb(var(--text-primary))" }}>
                  Create Project
                </h3>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1 rounded-full hover:bg-white/5"
                style={{ color: "rgb(var(--text-muted))" }}
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateProject} className="flex flex-col gap-4">
              
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-mono uppercase" style={{ color: "rgb(var(--text-muted))" }}>
                  Project Name
                </label>
                <input
                  type="text"
                  required
                  value={newProjName}
                  onChange={e => setNewProjName(e.target.value)}
                  placeholder="e.g. E-Commerce Pipeline"
                  className="glass-input px-3.5 py-2 rounded-lg text-xs font-mono focus:outline-none"
                  style={{ color: "rgb(var(--text-primary))" }}
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-mono uppercase flex justify-between" style={{ color: "rgb(var(--text-muted))" }}>
                  <span>Repository Link Paths</span>
                  <button
                    type="button"
                    onClick={addLinkInput}
                    className="flex items-center gap-0.5 hover:brightness-110 font-bold"
                    style={{ color: "rgb(var(--accent))" }}
                  >
                    <Plus size={10} /> Add Path
                  </button>
                </label>
                <div className="flex flex-col gap-2 max-h-32 overflow-y-auto pr-1">
                  {newProjLinks.map((link, idx) => (
                    <input
                      key={idx}
                      type="text"
                      required
                      value={link}
                      onChange={e => handleLinkChange(idx, e.target.value)}
                      placeholder="e.g. /Users/name/projects/my-repo"
                      className="glass-input px-3 py-2 rounded-lg text-xs font-mono focus:outline-none"
                      style={{ color: "rgb(var(--text-primary))" }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex gap-3 justify-end border-t pt-4 mt-2" style={{ borderColor: "var(--glass-border)" }}>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold hover:bg-white/5 border"
                  style={{ borderColor: "var(--glass-border)", color: "rgb(var(--text-secondary))" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="text-white font-bold text-xs px-5 py-2 rounded-lg hover:brightness-110 shadow-md font-mono"
                  style={{ background: "rgb(var(--accent))" }}
                >
                  Create Project
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  )
}
