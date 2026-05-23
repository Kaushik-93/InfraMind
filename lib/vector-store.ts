import { ScannedFile } from "./parser"
import { ProjectStoreManager } from "./project-store"

/**
 * An indexed chunk of code prepared for vector-style search.
 */
export interface DocumentChunk {
  id: string
  fileName: string
  fileType: string
  content: string
  summary: string
  tags: string[]
  embedding?: number[]
  score?: number
}

/**
 * A lightweight, in-memory semantic vector store simulator.
 * Employs keyword weightings, metadata tagging, and Jaccard / Cosine-like string token similarity
 * to rank and return appropriate matching templates or code segments.
 */
export class SemanticVectorStore {
  private chunks: DocumentChunk[] = []

  public getChunks(): DocumentChunk[] {
    return this.chunks
  }

  public loadChunks(chunks: DocumentChunk[]): void {
    this.chunks = chunks
  }

  /**
   * Builds an index of functional chunks, reusing existing embeddings for unchanged files.
   */
  public indexRepository(files: ScannedFile[], existingChunks: DocumentChunk[] = []): void {
    const existingMap = new Map<string, DocumentChunk>()
    existingChunks.forEach(c => existingMap.set(c.id, c))

    this.chunks = []

    for (const file of files) {
      const baseName = file.relativePath.split("/").pop() || file.relativePath
      const content = file.content

      const blocks = this.splitIntoLogicalBlocks(file.fileType, content)

      blocks.forEach((block, index) => {
        const id = `${file.relativePath}#chunk-${index}`
        const tags = this.extractSemanticTags(file.fileType, block, baseName)
        const summary = this.generateBlockSummary(file.fileType, block, baseName)

        // Preserve embedding if chunk exists and has not changed
        const existing = existingMap.get(id)
        const embedding = (existing && existing.content === block) ? existing.embedding : undefined

        this.chunks.push({
          id,
          fileName: file.relativePath,
          fileType: file.fileType,
          content: block,
          summary,
          tags,
          embedding
        })
      })
    }
  }

  /**
   * Splits raw file content into separate logical DevOps resources.
   */
  private splitIntoLogicalBlocks(fileType: string, content: string): string[] {
    if (fileType === "kubernetes" || fileType === "helm") {
      return content.split(/^---$/m).map(b => b.trim()).filter(b => b.length > 5)
    }

    if (fileType === "terraform") {
      // Split by root level block declarations
      const blocks: string[] = []
      const regex = /((?:resource|module|variable|output|provider)\s+"[^"]+"(?:\s+"[^"]+")?\s*\{[^]*?\n\})/g
      let match
      while ((match = regex.exec(content)) !== null) {
        blocks.push(match[1].trim())
      }
      return blocks.length > 0 ? blocks : [content]
    }

    // Default: split by 25-line chunks or single file
    return [content]
  }

  /**
   * Extracts searchable semantic tags from content text.
   */
  private extractSemanticTags(fileType: string, content: string, fileName: string): string[] {
    const tags = new Set<string>()
    const lowerContent = content.toLowerCase()

    tags.add(fileType)

    // Add extension tags
    const ext = fileName.split(".").pop()
    if (ext) tags.add(ext.toLowerCase())

    // Keyword lookup
    const searchWords = [
      "postgres", "redis", "mysql", "database", "cache", "secret", "ingress", "service",
      "autoscaling", "hpa", "deployment", "statefulset", "dockerfile", "alpine", "ubuntu",
      "npm", "python", "pip", "golang", "nginx", "loadbalancer", "pipeline", "actions", "azure",
      "terraform", "aws", "gcp", "s3", "rds", "lambda", "kubernetes", "replica", "helm", "values"
    ]

    for (const word of searchWords) {
      if (lowerContent.includes(word)) {
        tags.add(word)
      }
    }

    // Extract names if possible
    const nameMatch = content.match(/name:\s*([a-zA-Z0-9_-]+)/)
    if (nameMatch) {
      tags.add(nameMatch[1].toLowerCase())
    }

    const containerNameMatch = content.match(/container_name:\s*([a-zA-Z0-9_-]+)/)
    if (containerNameMatch) {
      tags.add(containerNameMatch[1].toLowerCase())
    }

    return Array.from(tags)
  }

  /**
   * Auto-generates a human-friendly technical summary of a block of DevOps code.
   */
  private generateBlockSummary(fileType: string, content: string, fileName: string): string {
    const lines = content.split("\n")
    const header = lines.slice(0, 3).join(" ").replace(/\s+/g, " ")

    if (fileType === "dockerfile") {
      const fromMatch = content.match(/FROM\s+([^\s]+)/i)
      const exposeMatch = content.match(/EXPOSE\s+([^\s]+)/i)
      return `Dockerfile building from image '${fromMatch ? fromMatch[1] : "unknown"}'${exposeMatch ? `, exposing port ${exposeMatch[1]}` : ""}.`
    }

    if (fileType === "kubernetes") {
      const kindMatch = content.match(/kind:\s*([a-zA-Z]+)/i)
      const nameMatch = content.match(/name:\s*([a-zA-Z0-9_-]+)/i)
      if (kindMatch && nameMatch) {
        return `Kubernetes ${kindMatch[1]} named '${nameMatch[1]}' loaded from manifest.`
      }
    }

    if (fileType === "terraform") {
      const typeMatch = content.match(/(resource|module|variable)\s+"([^"]+)"(?:\s+"([^"]+)")?/i)
      if (typeMatch) {
        const type = typeMatch[1]
        const sub = typeMatch[3] ? `${typeMatch[2]} (${typeMatch[3]})` : typeMatch[2]
        return `Terraform ${type} defining '${sub}'.`
      }
    }

    if (fileType === "pipeline") {
      const triggerMatch = content.match(/(on|trigger):\s*(.*)/i)
      return `CI/CD Pipeline workflow triggered on '${triggerMatch ? triggerMatch[2] : "events"}' inside ${fileName}.`
    }

    return `DevOps block loaded from ${fileName} starting with: "${header.substring(0, 60)}..."`
  }

  /**
   * Executes a semantic similarity search across all indexed chunks.
   * Uses token matching, TF-IDF representations, and tag match weights to rank documents.
   */
  public search(query: string, limit: number = 5): DocumentChunk[] {
    if (!query || query.trim() === "") {
      return this.chunks.slice(0, limit)
    }

    const queryTokens = query.toLowerCase().split(/[\s,._/#-]+/).filter(t => t.length > 1)
    const results: DocumentChunk[] = []

    for (const chunk of this.chunks) {
      let score = 0
      const contentLower = chunk.content.toLowerCase()
      const chunkTags = chunk.tags.map(t => t.toLowerCase())

      for (const token of queryTokens) {
        // Tag hit yields highest weight
        if (chunkTags.includes(token)) {
          score += 5.0
        }

        // Exact match in filename
        if (chunk.fileName.toLowerCase().includes(token)) {
          score += 3.0
        }

        // Search in content
        const indexOccurrences = contentLower.split(token).length - 1
        if (indexOccurrences > 0) {
          score += Math.min(indexOccurrences * 0.25, 2.5) // capped frequency weighting
        }
      }

      if (score > 0) {
        results.push({
          ...chunk,
          score: Math.round(score * 10) / 10
        })
      }
    }

    // Sort by descending scores
    return results.sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, limit)
  }

  /**
   * Retrieves all chunks belonging to a specific file.
   */
  public getFileChunks(filePath: string): DocumentChunk[] {
    return this.chunks.filter(c => c.fileName === filePath)
  }
}

/**
 * Standalone helper to request embeddings from Google Gemini API.
 * Throws an error if no API key is configured.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error("Google Gemini API Key (GEMINI_API_KEY) is not configured. Please define it in your shell environment.")
  }

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent?key=${apiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "models/gemini-embedding-2",
      content: {
        parts: [{ text }]
      }
    })
  })
  const data = await res.json()
  if (data.embedding && data.embedding.values) {
    return data.embedding.values
  }

  if (data.error) {
    throw new Error(data.error.message || JSON.stringify(data.error))
  }

  throw new Error("Failed to retrieve embeddings from Gemini API response.")
}

/**
 * Background runner that calculates pending embeddings sequentially and updates the project's disk configurations.
 */
export async function runBackgroundEmbedding(projectId: string, vectorStore: SemanticVectorStore): Promise<void> {
  console.log(`[VectorStore] [BG Worker] Starting embedding task for project: ${projectId}`)

  // Set status to processing
  const project = ProjectStoreManager.getProject(projectId)
  if (project) {
    project.embeddingStatus = "processing"
    project.embeddingError = ""
    ProjectStoreManager.saveProjectMetadata(projectId, project)
  }

  const chunks = vectorStore.getChunks()
  const pending = chunks.filter(c => !c.embedding)

  if (pending.length === 0) {
    console.log(`[VectorStore] [BG Worker] No pending embeddings for project: ${projectId}`)
    if (project) {
      project.embeddingStatus = "completed"
      ProjectStoreManager.saveProjectMetadata(projectId, project)
    }
    return
  }

  console.log(`[VectorStore] [BG Worker] Found ${pending.length} chunks pending embeddings.`)

  try {
    for (const chunk of pending) {
      // Mild debounce to prevent API rate limiting
      await new Promise(resolve => setTimeout(resolve, 150))
      const embedding = await generateEmbedding(chunk.content)
      chunk.embedding = embedding
    }

    // Save the updated chunks back to the filesystem under embeddings.json
    ProjectStoreManager.saveProjectEmbeddings(projectId, chunks)

    // Set status to completed
    const finalProj = ProjectStoreManager.getProject(projectId)
    if (finalProj) {
      finalProj.embeddingStatus = "completed"
      finalProj.embeddingError = ""
      ProjectStoreManager.saveProjectMetadata(projectId, finalProj)
    }
    console.log(`[VectorStore] [BG Worker] Embedding task completed and saved for project: ${projectId}`)
  } catch (err: any) {
    console.error(`[VectorStore] [BG Worker] Embedding calculation crashed:`, err)

    // Set status to error
    const finalProj = ProjectStoreManager.getProject(projectId)
    if (finalProj) {
      finalProj.embeddingStatus = "error"
      finalProj.embeddingError = err.message || String(err)
      ProjectStoreManager.saveProjectMetadata(projectId, finalProj)
    }
  }
}
