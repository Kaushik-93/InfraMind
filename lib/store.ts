import { ScannedFile, OrgConventions, DevOpsParser } from "./parser"
import { InfraGraph, GraphBuilder } from "./graph-builder"
import { SemanticVectorStore } from "./vector-store"
import { ValidationResult } from "./validator"
import { SandboxExecutionResult } from "./sandbox-runner"
import { ProjectStoreManager, ProjectMetadata } from "./project-store"

/**
 * Interface representing the current active session state of a specific project.
 */
export interface SessionState {
  scannedRepoPath: string
  scannedFiles: ScannedFile[]
  conventions: OrgConventions
  graph: InfraGraph
  vectorStore: SemanticVectorStore
  activeGeneratedFiles: Record<string, string>
  activeGeneratedExplanation: string
  activeGeneratedAppliedConventions: string[]
  validationResult: ValidationResult
  sandboxResult: SandboxExecutionResult | null
  gitState: {
    branch: string
    commits: { hash: string; message: string; date: string; files: string[] }[]
    prCreated: boolean
    prTitle: string
    prDescription: string
  }
}

/**
 * Multi-project cache manager and in-memory session store.
 * Coordinates dynamic synchronization with the secure encrypted project storage layer.
 */
class SessionStore {
  private static instance: SessionStore
  private activeProjectId: string = ""
  private states: Record<string, SessionState> = {}

  private constructor() {
    ProjectStoreManager.init()
    const list = ProjectStoreManager.getProjectsList()
    if (list.length > 0) {
      this.activeProjectId = list[0].id
      this.loadProjectFromDisk(this.activeProjectId)
    }
  }

  public static getInstance(): SessionStore {
    if (!SessionStore.instance) {
      SessionStore.instance = new SessionStore()
    }
    return SessionStore.instance
  }

  /**
   * Loads project configurations and decrypts files recursively from disk to populate the memory state.
   */
  public loadProjectFromDisk(id: string): void {
    const meta = ProjectStoreManager.getProject(id)
    if (!meta) return

    const filesRecord = ProjectStoreManager.loadProjectFiles(id)
    const scannedFiles: ScannedFile[] = Object.entries(filesRecord).map(([relPath, content]) => {
      const fileType = DevOpsParser.detectFileType(relPath.split('/').pop() || relPath, relPath)
      const parsedData = DevOpsParser.parseFile(content, fileType)
      return {
        relativePath: relPath,
        fileType,
        content,
        parsedData
      }
    })

    const conventions = DevOpsParser.learnConventions(scannedFiles)
    const graph = GraphBuilder.buildGraph(scannedFiles)
    const vectorStore = new SemanticVectorStore()
    const existingChunks = ProjectStoreManager.loadProjectEmbeddings(id)
    vectorStore.indexRepository(scannedFiles, existingChunks)

    // Separate active generated files from other files for generator workspace ease
    const activeGeneratedFiles: Record<string, string> = {}
    for (const [p, c] of Object.entries(filesRecord)) {
      if (p.startsWith("k8s/") || p.startsWith("terraform/") || p.startsWith(".github/") || p === "Dockerfile") {
        activeGeneratedFiles[p] = c
      }
    }

    this.states[id] = {
      scannedRepoPath: meta.repoLinks.join(", "),
      scannedFiles,
      conventions,
      graph,
      vectorStore,
      activeGeneratedFiles,
      activeGeneratedExplanation: "",
      activeGeneratedAppliedConventions: [],
      validationResult: { isValid: true, issues: [], summary: { errors: 0, warnings: 0, infos: 0 } },
      sandboxResult: null,
      gitState: {
        branch: meta.gitState?.branch || "main",
        commits: meta.gitState?.commits || [],
        prCreated: meta.gitState?.prCreated || false,
        prTitle: meta.gitState?.prTitle || "",
        prDescription: meta.gitState?.prDescription || ""
      }
    }
  }

  public getActiveProjectId(): string {
    return this.activeProjectId
  }

  public setActiveProjectId(id: string): void {
    this.activeProjectId = id
    if (id && !this.states[id]) {
      this.loadProjectFromDisk(id)
    }
  }

  private getInitialState(): SessionState {
    return {
      scannedRepoPath: "",
      scannedFiles: [],
      conventions: {
        namingStandards: { namespaces: [], services: [], registries: [] },
        cloudProviders: [],
        commonImages: [],
        portsExposed: [],
        ciCdTriggers: [],
        securityPolicies: { runAsNonRoot: false, readOnlyRootFilesystem: false, hasResourceLimits: false }
      },
      graph: { nodes: [], edges: [] },
      vectorStore: new SemanticVectorStore(),
      activeGeneratedFiles: {},
      activeGeneratedExplanation: "",
      activeGeneratedAppliedConventions: [],
      validationResult: { isValid: true, issues: [], summary: { errors: 0, warnings: 0, infos: 0 } },
      sandboxResult: null,
      gitState: {
        branch: "main",
        commits: [],
        prCreated: false,
        prTitle: "",
        prDescription: ""
      }
    }
  }

  /**
   * Retrieves the state for the current active project. Returns an empty default state if no project is active.
   */
  public getState(): SessionState {
    const id = this.activeProjectId
    if (!id) {
      return this.getInitialState()
    }
    
    if (!this.states[id]) {
      this.loadProjectFromDisk(id)
    }
    
    return this.states[id] || this.getInitialState()
  }

  /**
   * Update state variables for the current active project and trigger encrypted disk syncing when necessary.
   */
  public updateState(updates: Partial<SessionState>): void {
    const id = this.activeProjectId
    if (!id) return

    if (!this.states[id]) {
      this.states[id] = this.getInitialState()
    }

    this.states[id] = {
      ...this.states[id],
      ...updates
    }

    // Proactively persist critical fields back to local disk metadata
    const meta = ProjectStoreManager.getProject(id)
    if (meta) {
      if (updates.gitState) {
        meta.gitState = updates.gitState
      }
      ProjectStoreManager.saveProjectMetadata(id, meta)
    }
  }

  /**
   * Unload and clear a project state cache from memory.
   */
  public unloadProject(id: string): void {
    delete this.states[id]
    if (this.activeProjectId === id) {
      this.activeProjectId = ""
    }
  }
}

export const sessionStore = SessionStore.getInstance()
export { ProjectStoreManager }
