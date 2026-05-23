import fs from "fs"
import path from "path"
import { encrypt, decrypt } from "./encryption"

/** Represents a single Project workspace configuration */
export interface ProjectMetadata {
  id: string
  name: string
  repoLinks: string[]
  conventionsHistory: { date: string; conventions: any }[]
  chatHistory: { sender: "user" | "ai"; text: string }[]
  gitState?: {
    branch: string
    commits: { hash: string; message: string; date: string; files: string[] }[]
    prCreated: boolean
    prTitle: string
    prDescription: string
  }
  embeddingStatus?: "idle" | "processing" | "completed" | "error"
  embeddingError?: string
}

const PROJECTS_DIR = path.join("/Users/kaushiksathyanathsingh/Documents/Projects/Inframind", "projects")

/**
 * Handles all project-level CRUD operations, folder mappings, and filesystem
 * encryption bounds for secure multi-tenant workspaces on the developer's machine.
 */
export class ProjectStoreManager {
  /**
   * Initializes the root projects directory if it does not already exist.
   */
  public static init() {
    if (!fs.existsSync(PROJECTS_DIR)) {
      fs.mkdirSync(PROJECTS_DIR, { recursive: true })
    }
  }

  /**
   * Retrieves and decrypts the metadata for all projects.
   */
  public static getProjectsList(): ProjectMetadata[] {
    this.init()
    const projects: ProjectMetadata[] = []
    
    if (!fs.existsSync(PROJECTS_DIR)) return projects
    
    const dirs = fs.readdirSync(PROJECTS_DIR)
    for (const dir of dirs) {
      const metadataPath = path.join(PROJECTS_DIR, dir, "metadata.json")
      if (fs.existsSync(metadataPath)) {
        try {
          const encryptedContent = fs.readFileSync(metadataPath, "utf8")
          const decryptedJson = decrypt(encryptedContent)
          const meta: ProjectMetadata = JSON.parse(decryptedJson)
          projects.push(meta)
        } catch (err) {
          console.error(`[ProjectStore] Failed to load metadata for project folder "${dir}":`, err)
        }
      }
    }
    
    return projects
  }

  /**
   * Loads a single project's metadata by ID.
   */
  public static getProject(id: string): ProjectMetadata | null {
    const metadataPath = path.join(PROJECTS_DIR, id, "metadata.json")
    if (!fs.existsSync(metadataPath)) return null
    
    try {
      const encryptedContent = fs.readFileSync(metadataPath, "utf8")
      const decryptedJson = decrypt(encryptedContent)
      return JSON.parse(decryptedJson)
    } catch (err) {
      console.error(`[ProjectStore] Failed to load project metadata for "${id}":`, err)
      return null
    }
  }

  /**
   * Creates a brand-new project and writes its secure encrypted initial configuration.
   */
  public static createProject(name: string, repoLinks: string[]): ProjectMetadata {
    this.init()
    const id = `proj_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
    const projectDir = path.join(PROJECTS_DIR, id)
    const filesDir = path.join(projectDir, "files")
    
    fs.mkdirSync(projectDir, { recursive: true })
    fs.mkdirSync(filesDir, { recursive: true })
    
    const newProject: ProjectMetadata = {
      id,
      name,
      repoLinks: repoLinks.map(l => l.trim()).filter(Boolean),
      conventionsHistory: [],
      chatHistory: [],
      gitState: {
        branch: "main",
        commits: [],
        prCreated: false,
        prTitle: "",
        prDescription: ""
      },
      embeddingStatus: "idle",
      embeddingError: ""
    }
    
    this.saveProjectMetadata(id, newProject)
    return newProject
  }

  /**
   * Encrypts and persists project metadata configuration to the disk.
   */
  public static saveProjectMetadata(id: string, metadata: ProjectMetadata): void {
    const projectDir = path.join(PROJECTS_DIR, id)
    if (!fs.existsSync(projectDir)) {
      fs.mkdirSync(projectDir, { recursive: true })
    }
    
    const metadataPath = path.join(projectDir, "metadata.json")
    const plainJson = JSON.stringify(metadata, null, 2)
    const encryptedContent = encrypt(plainJson)
    
    fs.writeFileSync(metadataPath, encryptedContent, "utf8")
  }

  /**
   * Deletes a project, its metadata, and all its encrypted files from disk recursively.
   */
  public static deleteProject(id: string): boolean {
    const projectDir = path.join(PROJECTS_DIR, id)
    if (!fs.existsSync(projectDir)) return false
    
    try {
      fs.rmSync(projectDir, { recursive: true, force: true })
      return true
    } catch (err) {
      console.error(`[ProjectStore] Failed to delete project folder "${id}":`, err)
      return false
    }
  }

  /**
   * Encrypts and writes a file in the project's secure isolated code directory.
   */
  public static saveProjectFile(id: string, relativePath: string, content: string): void {
    const filesDir = path.join(PROJECTS_DIR, id, "files")
    const filePath = path.join(filesDir, relativePath)
    
    const parentDir = path.dirname(filePath)
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true })
    }
    
    const encryptedContent = encrypt(content)
    fs.writeFileSync(filePath, encryptedContent, "utf8")
  }

  /**
   * Decrypts and retrieves a single file in the project workspace on-the-fly.
   */
  public static loadProjectFile(id: string, relativePath: string): string {
    const filePath = path.join(PROJECTS_DIR, id, "files", relativePath)
    if (!fs.existsSync(filePath)) return ""
    
    try {
      const encryptedContent = fs.readFileSync(filePath, "utf8")
      return decrypt(encryptedContent)
    } catch (err) {
      console.error(`[ProjectStore] Failed to load file "${relativePath}" for project "${id}":`, err)
      return ""
    }
  }

  /**
   * Decrypts and loads all secure code files stored under a project workspace.
   */
  public static loadProjectFiles(id: string): Record<string, string> {
    const filesDir = path.join(PROJECTS_DIR, id, "files")
    const result: Record<string, string> = {}
    
    if (!fs.existsSync(filesDir)) return result
    
    const traverse = (dir: string) => {
      const items = fs.readdirSync(dir)
      for (const item of items) {
        const fullPath = path.join(dir, item)
        const relPath = path.relative(filesDir, fullPath)
        
        if (fs.statSync(fullPath).isDirectory()) {
          traverse(fullPath)
        } else {
          try {
            const encryptedContent = fs.readFileSync(fullPath, "utf8")
            result[relPath] = decrypt(encryptedContent)
          } catch (err) {
            console.error(`[ProjectStore] Failed decrypting file "${relPath}" in project "${id}":`, err)
          }
        }
      }
    }
    
    traverse(filesDir)
    return result
  }

  /**
   * Encrypts and persists project document chunks with embeddings to disk.
   */
  public static saveProjectEmbeddings(id: string, chunks: any[]): void {
    const projectDir = path.join(PROJECTS_DIR, id)
    if (!fs.existsSync(projectDir)) {
      fs.mkdirSync(projectDir, { recursive: true })
    }
    const embeddingsPath = path.join(projectDir, "embeddings.json")
    const plainJson = JSON.stringify(chunks, null, 2)
    const encryptedContent = encrypt(plainJson)
    fs.writeFileSync(embeddingsPath, encryptedContent, "utf8")
  }

  /**
   * Decrypts and loads project document chunks with embeddings from disk.
   */
  public static loadProjectEmbeddings(id: string): any[] {
    const embeddingsPath = path.join(PROJECTS_DIR, id, "embeddings.json")
    if (!fs.existsSync(embeddingsPath)) return []
    try {
      const encryptedContent = fs.readFileSync(embeddingsPath, "utf8")
      const decryptedJson = decrypt(encryptedContent)
      return JSON.parse(decryptedJson)
    } catch (err) {
      console.error(`[ProjectStore] Failed to load embeddings for "${id}":`, err)
      return []
    }
  }
}
