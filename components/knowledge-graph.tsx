"use client"

/**
 * KnowledgeGraph — high-fidelity interactive dependency graph of scanned infrastructure assets.
 * 
 * Features:
 *  - Full-height flex viewport scaling matching IDE workspaces.
 *  - Horizontal card nodes with semantic category iconography, status badges, and details.
 *  - Cubic Bézier connection curves (S-curves) routed from source right-border to target left-border.
 *  - Subgraph highlighting: hovering or selecting a node glows its neighbors and edges, while fading others.
 *  - Floating viewport canvas controls: zoom, fit-to-screen, reset.
 *  - Pan & zoom canvas navigation.
 *  - Component inspector details drawer.
 */

import React, { useState, useEffect, useRef } from "react"
import { 
  Network, 
  Database, 
  Key, 
  Globe, 
  Settings, 
  Layers, 
  FileCode, 
  RefreshCw,
  Search,
  ZoomIn,
  ZoomOut,
  Maximize,
  Info
} from "lucide-react"

/* ── Type Definitions ───────────────────────────────────────────────────── */
interface Node {
  id: string
  label: string
  type: string
  status: string
  details?: Record<string, any>
  x?: number
  y?: number
}

interface Edge {
  id: string
  source: string
  target: string
  label: string
  type: string
  animated?: boolean
}

interface KnowledgeGraphProps {
  nodes: Node[]
  edges: Edge[]
  loading?: boolean
}

export default function KnowledgeGraph({ nodes: initialNodes, edges: initialEdges, loading }: KnowledgeGraphProps) {
  /* ── State ────────────────────────────────────────────────────────────── */
  const [nodes, setNodes] = useState<Node[]>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const [selectedNode, setSelectedNode] = useState<Node | null>(null)
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  
  // Viewport states
  const [pan, setPan] = useState({ x: 50, y: 40 })
  const [zoom, setZoom] = useState(0.8)
  const [isDragging, setIsDragging] = useState(false)
  const dragStart = useRef({ x: 0, y: 0 })
  const containerRef = useRef<HTMLDivElement>(null)

  // Node Dragging states
  const [dragNodeId, setDragNodeId] = useState<string | null>(null)
  const dragNodeStart = useRef({ mouseX: 0, mouseY: 0, nodeX: 0, nodeY: 0 })

  /* ── Auto-Arrange Nodes in Layered Columns ────────────────────────────── */
  useEffect(() => {
    if (!initialNodes || initialNodes.length === 0) return

    const arrangedNodes = [...initialNodes]
    
    // Assign horizontal layers based on node type
    const typeLayers: Record<string, number> = {
      ingress: 0,
      pipeline: 0,
      service: 1,
      terraform: 1,
      container: 2,
      configmap: 3,
      secret: 3,
      database: 4
    }

    // Count nodes in each layer to distribute vertically
    const layerCounts: Record<number, number> = {}
    const layerIndices: Record<number, number> = {}

    arrangedNodes.forEach(node => {
      const layer = typeLayers[node.type] !== undefined ? typeLayers[node.type] : 1
      layerCounts[layer] = (layerCounts[layer] || 0) + 1
    })

    arrangedNodes.forEach(node => {
      const layer = typeLayers[node.type] !== undefined ? typeLayers[node.type] : 1
      const totalInLayer = layerCounts[layer]
      const currentIndex = layerIndices[layer] || 0
      layerIndices[layer] = currentIndex + 1

      // Compute horizontal layering: 300px separation (spacious layout for 180px cards)
      node.x = 100 + layer * 300
      
      // Compute vertical separation: spread out over a 480px column height
      const colHeight = 480
      const step = totalInLayer > 1 ? colHeight / (totalInLayer - 1) : colHeight / 2
      node.y = totalInLayer > 1 
        ? 60 + currentIndex * step 
        : 60 + colHeight / 2
    })

    setNodes(arrangedNodes)
    setEdges(initialEdges || [])
  }, [initialNodes, initialEdges])

  /* ── Mouse Pan and Drag events ────────────────────────────────────────── */
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return // Left click only
    setIsDragging(true)
    dragStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y }
  }

  const handleNodeDragStart = (e: React.MouseEvent, node: Node) => {
    e.stopPropagation() // Block canvas panning
    setDragNodeId(node.id)
    dragNodeStart.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      nodeX: node.x || 0,
      nodeY: node.y || 0
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (dragNodeId) {
      // Direct drag offset accounting for active zoom level
      const dx = (e.clientX - dragNodeStart.current.mouseX) / zoom
      const dy = (e.clientY - dragNodeStart.current.mouseY) / zoom
      
      setNodes(prev => prev.map(n => {
        if (n.id === dragNodeId) {
          return {
            ...n,
            x: dragNodeStart.current.nodeX + dx,
            y: dragNodeStart.current.nodeY + dy
          }
        }
        return n
      }))
    } else if (isDragging) {
      setPan({
        x: e.clientX - dragStart.current.x,
        y: e.clientY - dragStart.current.y
      })
    }
  }

  const handleMouseUp = () => {
    setIsDragging(false)
    setDragNodeId(null)
  }

  const handleWheel = (e: React.WheelEvent) => {
    const zoomFactor = 0.05
    const direction = e.deltaY < 0 ? 1 : -1
    const newZoom = Math.min(Math.max(zoom + direction * zoomFactor, 0.35), 2.0)
    setZoom(parseFloat(newZoom.toFixed(2)))
  }

  const resetViewport = () => {
    setPan({ x: 50, y: 40 })
    setZoom(0.8)
    setSelectedNode(null)
  }

  const fitToScreen = () => {
    if (nodes.length === 0) return
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    nodes.forEach(n => {
      if (n.x !== undefined && n.y !== undefined) {
        if (n.x < minX) minX = n.x
        if (n.x > maxX) maxX = n.x
        if (n.y < minY) minY = n.y
        if (n.y > maxY) maxY = n.y
      }
    })
    
    const graphWidth = maxX - minX + 240
    const graphHeight = maxY - minY + 100
    const containerWidth = containerRef.current?.clientWidth || 800
    const containerHeight = containerRef.current?.clientHeight || 600
    
    const scaleX = containerWidth / graphWidth
    const scaleY = containerHeight / graphHeight
    const newZoom = Math.min(Math.max(Math.min(scaleX, scaleY), 0.4), 1.2)
    
    setZoom(parseFloat(newZoom.toFixed(2)))
    setPan({
      x: (containerWidth - (maxX + minX) * newZoom) / 2,
      y: (containerHeight - (maxY + minY) * newZoom) / 2
    })
  }

  /* ── Node category mapping (semantic design details) ────────────────── */
  const getNodeConfig = (type: string) => {
    switch (type) {
      case "ingress": 
        return { stroke: "rgba(59, 130, 246, 0.85)", fill: "rgba(59, 130, 246, 0.08)", text: "#93c5fd", icon: Globe, label: "Gateway" }
      case "service": 
        return { stroke: "rgba(16, 185, 129, 0.85)", fill: "rgba(16, 185, 129, 0.08)", text: "#6ee7b7", icon: Layers, label: "Service" }
      case "database": 
        return { stroke: "rgba(245, 158, 11, 0.85)", fill: "rgba(245, 158, 11, 0.08)", text: "#fde047", icon: Database, label: "Database" }
      case "secret": 
        return { stroke: "rgba(244, 63, 94, 0.85)", fill: "rgba(244, 63, 94, 0.08)", text: "#fca5a5", icon: Key, label: "Secret" }
      case "configmap": 
        return { stroke: "rgba(6, 182, 212, 0.85)", fill: "rgba(6, 182, 212, 0.08)", text: "#67e8f9", icon: Settings, label: "ConfigMap" }
      case "container": 
        return { stroke: "rgba(168, 85, 247, 0.85)", fill: "rgba(168, 85, 247, 0.08)", text: "#d8b4fe", icon: FileCode, label: "Container" }
      case "pipeline": 
        return { stroke: "rgba(236, 72, 153, 0.85)", fill: "rgba(236, 72, 153, 0.08)", text: "#fbcfe8", icon: Network, label: "Pipeline" }
      default: 
        return { stroke: "rgba(100, 116, 139, 0.85)", fill: "rgba(100, 116, 139, 0.08)", text: "#cbd5e1", icon: Layers, label: "Resource" }
    }
  }

  /* ── Filter & connections highlighting ────────────────────────────── */
  const filteredNodes = nodes.filter(node => 
    node.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
    node.type.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const activeNodeConnections = new Set<string>()
  const highlightedNodeId = hoveredNode || selectedNode?.id
  
  if (highlightedNodeId) {
    activeNodeConnections.add(highlightedNodeId)
    edges.forEach(edge => {
      if (edge.source === highlightedNodeId) activeNodeConnections.add(edge.target)
      if (edge.target === highlightedNodeId) activeNodeConnections.add(edge.source)
    })
  }

  const isAnyHighlightActive = highlightedNodeId !== undefined && highlightedNodeId !== null
  const ACCENT_TEAL = "rgb(20,184,166)"

  /* ── Compute Bézier Curved Paths for S-Curve links ──────────────────── */
  const getCurvePath = (x1: number, y1: number, x2: number, y2: number) => {
    // S-curve horizontally between columns
    const dx = Math.abs(x2 - x1) * 0.5
    return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 flex-1 overflow-hidden p-4 h-full min-h-[500px]">
      
      {/* Dynamic Keyframe style sheet injected directly inside component */}
      <style>{`
        @keyframes flow-dash {
          to {
            stroke-dashoffset: -40;
          }
        }
        .edge-flow-glow {
          stroke-dasharray: 8, 12;
          animation: flow-dash 1s linear infinite;
        }
        .edge-flow-idle {
          stroke-dasharray: 4, 18;
          animation: flow-dash 3.5s linear infinite;
        }
      `}</style>

      {/* Node Graph canvas (3 cols) */}
      <div className="xl:col-span-3 flex flex-col gap-4 overflow-hidden h-full">
        {/* Toolbar */}
        <div className="glass px-4 py-2.5 rounded-xl flex items-center justify-between gap-4 shrink-0">
          <div className="relative flex-1 max-w-xs">
            <Search
              className="absolute left-2.5 top-2.5"
              size={13}
              style={{ color: "rgb(var(--text-muted))" }}
            />
            <input
              type="text"
              placeholder="Filter graph nodes..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="glass-input w-full pl-8 pr-3 py-1.5 rounded-lg text-xs font-mono focus:ring-1 focus:ring-teal-500/30"
              style={{ color: "rgb(var(--text-primary))" }}
            />
          </div>
          
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-mono" style={{ color: "rgb(var(--text-muted))" }}>
              Scale: {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => setZoom(prev => Math.min(prev + 0.1, 2.0))}
              className="p-1.5 rounded bg-white/5 border border-white/5 hover:bg-white/10 text-slate-300 transition-colors"
              title="Zoom In"
            >
              <ZoomIn size={12} />
            </button>
            <button
              onClick={() => setZoom(prev => Math.max(prev - 0.1, 0.35))}
              className="p-1.5 rounded bg-white/5 border border-white/5 hover:bg-white/10 text-slate-300 transition-colors"
              title="Zoom Out"
            >
              <ZoomOut size={12} />
            </button>
            <button
              onClick={fitToScreen}
              className="p-1.5 rounded bg-white/5 border border-white/5 hover:bg-white/10 text-slate-300 transition-colors"
              title="Fit to Screen"
            >
              <Maximize size={12} />
            </button>
            <button
              onClick={resetViewport}
              className="text-[10px] font-mono px-2.5 py-1.5 rounded-lg flex items-center gap-1 hover:brightness-110 transition-all"
              style={{
                background: "rgba(var(--accent), 0.12)",
                border: "1px solid rgba(var(--accent), 0.25)",
                color: "rgb(var(--accent))",
              }}
            >
              <RefreshCw size={10} /> Reset View
            </button>
          </div>
        </div>

        {/* SVG Drawing Canvas Container */}
        <div 
          ref={containerRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          className={`glass rounded-2xl flex-1 overflow-hidden relative cursor-grab select-none ${
            isDragging || dragNodeId ? "cursor-grabbing" : ""
          }`}
          style={{ background: "rgba(0,0,0,0.2)" }}
        >
          {loading && (
            <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex flex-col items-center justify-center gap-2">
              <RefreshCw size={24} className="animate-spin text-teal-400" />
              <span className="text-xs font-mono" style={{ color: "rgb(var(--text-secondary))" }}>
                Rendering architecture graph...
              </span>
            </div>
          )}

          {nodes.length === 0 && !loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center gap-2">
              <Network size={36} className="animate-pulse opacity-40" style={{ color: "rgb(var(--accent))" }} />
              <span className="text-xs font-mono opacity-50" style={{ color: "rgb(var(--text-muted))" }}>
                No active nodes. Scan your workspace to begin.
              </span>
            </div>
          )}

          <svg className="w-full h-full absolute inset-0">
            {/* SVG Markers / Glow Filters definitions */}
            <defs>
              {/* Drop shadows filters for glowing nodes */}
              <filter id="neon-glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="6" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>

              {/* Muted connection arrow */}
              <marker id="arrow-muted" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 1 L 9 5 L 0 9 z" fill="#334155" />
              </marker>

              {/* Active neon arrow */}
              <marker id="arrow-neon" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 1 L 9 5 L 0 9 z" fill={ACCENT_TEAL} />
              </marker>
            </defs>

            {/* Transform viewport group */}
            <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
              
              {/* A. Draw Bézier connection curves */}
              {edges.map(edge => {
                const src = nodes.find(n => n.id === edge.source)
                const tgt = nodes.find(n => n.id === edge.target)

                if (!src || !tgt || src.x === undefined || src.y === undefined || tgt.x === undefined || tgt.y === undefined) {
                  return null
                }

                // Connecting anchors: Right border of source card to Left border of target card
                // Cards are 180px wide, so right boundary is +90px, left boundary is -90px
                const x1 = src.x + 90
                const y1 = src.y
                const x2 = tgt.x - 90
                const y2 = tgt.y

                const isActive = isAnyHighlightActive && 
                  activeNodeConnections.has(edge.source) && 
                  activeNodeConnections.has(edge.target)
                const isDimmed = isAnyHighlightActive && !isActive
                
                const pathStr = getCurvePath(x1, y1, x2, y2)

                return (
                  <g key={edge.id} className="transition-all duration-300">
                    {/* Shadow curve (glow highlight) */}
                    {isActive && (
                      <path
                        d={pathStr}
                        fill="none"
                        stroke={ACCENT_TEAL}
                        strokeWidth={4.5}
                        className="opacity-25"
                        style={{ filter: "url(#neon-glow)" }}
                      />
                    )}

                    {/* Main connector curve */}
                    <path
                      d={pathStr}
                      fill="none"
                      stroke={isActive ? ACCENT_TEAL : "rgba(71, 85, 105, 0.4)"}
                      strokeWidth={isActive ? 2 : 1.2}
                      markerEnd={isActive ? "url(#arrow-neon)" : "url(#arrow-muted)"}
                      className={`transition-all duration-200 ${isDimmed ? "opacity-15" : "opacity-100"}`}
                    />

                    {/* Moving neon flow dash particles */}
                    <path
                      d={pathStr}
                      fill="none"
                      stroke={isActive ? "rgb(153, 246, 228)" : "rgba(20, 184, 166, 0.15)"}
                      strokeWidth={isActive ? 1.5 : 1}
                      className={isActive ? "edge-flow-glow" : "edge-flow-idle"}
                      style={isDimmed ? { opacity: 0 } : {}}
                    />
                  </g>
                )
              })}

              {/* B. Draw Node Group Cards */}
              {filteredNodes.map(node => {
                if (node.x === undefined || node.y === undefined) return null

                const conf = getNodeConfig(node.type)
                const Icon = conf.icon
                const isSelected = selectedNode?.id === node.id
                const isConnection = !isAnyHighlightActive || activeNodeConnections.has(node.id)
                const isDimmed = isAnyHighlightActive && !isConnection
                const isHovered = hoveredNode === node.id

                return (
                  <g
                    key={node.id}
                    transform={`translate(${node.x}, ${node.y})`}
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelectedNode(node)
                    }}
                    onMouseEnter={() => setHoveredNode(node.id)}
                    onMouseLeave={() => setHoveredNode(null)}
                    onMouseDown={(e) => handleNodeDragStart(e, node)}
                    className={`cursor-grab select-none transition-all duration-150 ${
                      isDimmed ? "opacity-25" : "opacity-100"
                    }`}
                  >
                    {/* Sleek Horizontal Rectangle Card (width=180, height=52) */}
                    <rect
                      x={-90}
                      y={-26}
                      width={180}
                      height={52}
                      rx={10}
                      fill="rgba(24, 24, 27, 0.85)"
                      stroke={isSelected ? ACCENT_TEAL : isHovered ? "rgb(45, 212, 191)" : conf.stroke}
                      strokeWidth={isSelected ? 2.5 : isHovered ? 1.8 : 1.2}
                      style={{
                        backdropFilter: "blur(8px)",
                        filter: isSelected || isHovered ? "url(#neon-glow)" : "none",
                        transition: "all 0.15s ease"
                      }}
                    />

                    {/* Left category icon frame */}
                    <g transform="translate(-76, -10)" className="pointer-events-none">
                      <Icon
                        size={18}
                        color={isSelected || isHovered ? ACCENT_TEAL : conf.stroke}
                        style={{ transition: "all 0.2s ease" }}
                      />
                    </g>

                    {/* Vertical Divider line */}
                    <line 
                      x1={-48} 
                      y1={-16} 
                      x2={-48} 
                      y2={16} 
                      stroke="rgba(255, 255, 255, 0.1)" 
                      strokeWidth={1} 
                      className="pointer-events-none" 
                    />

                    {/* Node service name label */}
                    <text
                      x={-40}
                      y={-1}
                      textAnchor="start"
                      className="text-[10.5px] font-mono font-bold select-none pointer-events-none"
                      style={{
                        fill: isSelected ? "rgb(255, 255, 255)" : "rgb(var(--text-primary))",
                        transition: "all 0.15s ease"
                      }}
                    >
                      {node.label.split(": ").pop()}
                    </text>
                    
                    {/* Node type badge */}
                    <text
                      x={-40}
                      y={13}
                      textAnchor="start"
                      className="text-[8px] font-mono tracking-widest uppercase select-none pointer-events-none"
                      style={{ 
                        fill: isSelected || isHovered ? ACCENT_TEAL : "rgb(var(--text-muted))",
                        fontWeight: isSelected ? 700 : 500
                      }}
                    >
                      {conf.label}
                    </text>

                    {/* Pulse status indicator badge */}
                    <circle
                      cx={74}
                      cy={0}
                      r={3}
                      fill={node.status === "active" || node.status === "ready" ? "rgb(34, 197, 94)" : "rgb(20, 184, 166)"}
                      className="animate-pulse"
                    />
                  </g>
                )
              })}

            </g>
          </svg>
        </div>
      </div>

      {/* Inspector Details panel (1 col) */}
      <div className="xl:col-span-1 h-full overflow-hidden flex flex-col">
        {selectedNode ? (
          <div className="glass p-5 rounded-2xl flex flex-col gap-4 flex-1 overflow-y-auto animate-fade-in-up">
            
            <div className="flex items-center justify-between pb-3 border-b" style={{ borderColor: "var(--glass-border)" }}>
              <span className="text-[10px] font-mono uppercase tracking-widest flex items-center gap-1.5" style={{ color: "rgb(var(--text-muted))" }}>
                <Info size={11} className="text-teal-400" />
                <span>Inspector Info</span>
              </span>
              <span className="text-[8px] font-mono uppercase px-2 py-0.5 rounded bg-teal-500/10 border border-teal-500/20 text-teal-300">
                {selectedNode.type}
              </span>
            </div>

            <div className="flex flex-col gap-1">
              <h4 className="text-sm font-bold font-mono text-slate-100">
                {selectedNode.label.split(": ").pop()}
              </h4>
              <span className="text-[9px] font-mono opacity-65" style={{ color: "rgb(var(--text-muted))" }}>
                Type: {selectedNode.label.split(":")[0]} declaration
              </span>
            </div>

            {/* Spec metadata info box */}
            <div
              className="flex flex-col gap-2.5 p-4 rounded-xl text-xs font-mono"
              style={{ background: "var(--glass-bg)", border: "1px solid var(--glass-border)" }}
            >
              <span className="text-[9px] font-bold uppercase tracking-wider pb-1.5 border-b" style={{ borderColor: "var(--glass-border)", color: "rgb(var(--text-secondary))" }}>
                Properties
              </span>

              {selectedNode.details?.namespace && (
                <div className="flex justify-between">
                  <span style={{ color: "rgb(var(--text-muted))" }}>Namespace:</span>
                  <span className="text-emerald-400 font-semibold">{selectedNode.details.namespace}</span>
                </div>
              )}

              {selectedNode.details?.apiVersion && (
                <div className="flex justify-between">
                  <span style={{ color: "rgb(var(--text-muted))" }}>APIVersion:</span>
                  <span style={{ color: "rgb(var(--text-secondary))" }}>{selectedNode.details.apiVersion}</span>
                </div>
              )}

              {selectedNode.details?.baseImages && selectedNode.details.baseImages.length > 0 && (
                <div className="flex flex-col gap-0.5">
                  <span style={{ color: "rgb(var(--text-muted))" }}>Base Image:</span>
                  <span className="text-[10px] break-all text-teal-400">
                    {selectedNode.details.baseImages.join(", ")}
                  </span>
                </div>
              )}

              {selectedNode.details?.ports && selectedNode.details.ports.length > 0 && (
                <div className="flex justify-between">
                  <span style={{ color: "rgb(var(--text-muted))" }}>Exposed Port:</span>
                  <span className="text-amber-400 font-bold">{selectedNode.details.ports.join(", ")}</span>
                </div>
              )}
            </div>

            {/* Mapped Dependencies */}
            {selectedNode.details?.dependencies && (
              <div className="flex flex-col gap-2.5 mt-2">
                <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-slate-300">
                  Discovered Links
                </span>
                <div className="flex flex-col gap-2">
                  {selectedNode.details.dependencies.secrets?.map((s: string) => (
                    <div key={s} className="flex items-center justify-between bg-rose-500/5 border border-rose-500/10 p-2.5 rounded-lg text-xs text-rose-300 font-mono">
                      <div className="flex items-center gap-1.5 truncate">
                        <Key size={12} className="shrink-0" />
                        <span className="truncate max-w-[120px]">{s}</span>
                      </div>
                      <span className="text-[8px] uppercase px-1.5 py-0.5 rounded bg-rose-500/10 border border-rose-500/20 shrink-0">Secret</span>
                    </div>
                  ))}
                  {selectedNode.details.dependencies.configMaps?.map((cm: string) => (
                    <div key={cm} className="flex items-center justify-between bg-cyan-500/5 border border-cyan-500/10 p-2.5 rounded-lg text-xs text-cyan-300 font-mono">
                      <div className="flex items-center gap-1.5 truncate">
                        <Settings size={12} className="shrink-0" />
                        <span className="truncate max-w-[120px]">{cm}</span>
                      </div>
                      <span className="text-[8px] uppercase px-1.5 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/20 shrink-0">Config</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Deselect button */}
            <button
              onClick={() => setSelectedNode(null)}
              className="mt-auto w-full text-xs font-mono py-2 rounded-lg border text-center hover:bg-white/5 transition-colors"
              style={{ borderColor: "var(--glass-border)", color: "rgb(var(--text-secondary))" }}
            >
              Clear Selection
            </button>
          </div>
        ) : (
          <div className="glass p-5 rounded-2xl flex flex-col items-center justify-center text-center gap-3 flex-1 h-full">
            <Network size={24} className="opacity-45 animate-pulse text-teal-400" />
            <span className="text-xs font-mono opacity-50 max-w-[160px]" style={{ color: "rgb(var(--text-muted))" }}>
              Click any card on the canvas to inspect DevOps dependencies and mapped config specs.
            </span>
          </div>
        )}
      </div>

    </div>
  )
}
