import { NextResponse } from "next/server"
import { AIOrchestrator } from "@/lib/llm"
import { DevOpsValidator } from "@/lib/validator"
import { sessionStore, ProjectStoreManager } from "@/lib/store"
import { DevOpsParser } from "@/lib/parser"
import { GraphBuilder } from "@/lib/graph-builder"
import { runBackgroundEmbedding } from "@/lib/vector-store"

/**
 * Handles POST requests to generate or conversationally refine DevOps configurations.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { prompt, instruction, refine, files: clientFiles } = body

    const state = sessionStore.getState()
    const conventions = state.conventions

    let result
    if (refine && instruction) {
      console.log(`[GenerateAPI] Refining active generated files via chat. Command: "${instruction}"`)
      const filesToRefine = clientFiles || state.activeGeneratedFiles
      result = await AIOrchestrator.refineWithChat(instruction, filesToRefine, conventions)
    } else {
      console.log(`[GenerateAPI] Generating brand new DevOps structure for prompt: "${prompt}"`)
      result = await AIOrchestrator.generate(prompt || "Deploy a standard FastAPI application", conventions)
    }

    // 1. Perform static lint validation checks on the resulting files
    const validationIssues: any[] = []
    let isValid = true
    let errors = 0
    let warnings = 0
    let infos = 0

    for (const [filePath, content] of Object.entries(result.files)) {
      const fileVal = DevOpsValidator.validateFile(filePath, content as string)
      validationIssues.push(...fileVal.issues)
      if (!fileVal.isValid) isValid = false
      errors += fileVal.summary.errors
      warnings += fileVal.summary.warnings
      infos += fileVal.summary.infos
    }

    const validationResult = {
      isValid,
      issues: validationIssues,
      summary: { errors, warnings, infos }
    }

    // 2. Persist files and update chat history on-disk encrypted
    const projectId = sessionStore.getActiveProjectId()
    if (projectId) {
      // Encrypt and save generated files
      for (const [filePath, content] of Object.entries(result.files)) {
        ProjectStoreManager.saveProjectFile(projectId, filePath, content as string)
      }
      
      // Reload files from disk to get a consistent scanned files list with updated contents
      const filesRecord = ProjectStoreManager.loadProjectFiles(projectId)
      const scannedFiles = Object.entries(filesRecord).map(([relPath, content]) => {
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
      
      const existingChunks = ProjectStoreManager.loadProjectEmbeddings(projectId)
      state.vectorStore.indexRepository(scannedFiles, existingChunks)

      // Update persistent chat history logs and save metadata
      const project = ProjectStoreManager.getProject(projectId)
      if (project) {
        if (refine && instruction) {
          project.chatHistory.push({ sender: "user", text: instruction })
          project.chatHistory.push({ sender: "ai", text: `Refined files successfully. Applied: "${instruction}".` })
        } else {
          project.chatHistory.push({ sender: "user", text: prompt || "Generate DevOps Assets" })
          project.chatHistory.push({ sender: "ai", text: result.explanation })
        }
        // Save conventions history
        project.conventionsHistory.push({
          date: new Date().toLocaleString(),
          conventions
        })
        ProjectStoreManager.saveProjectMetadata(projectId, project)
      }

      // Update state in memory
      sessionStore.updateState({
        scannedFiles,
        conventions,
        graph,
        activeGeneratedFiles: result.files as Record<string, string>,
        activeGeneratedExplanation: result.explanation,
        activeGeneratedAppliedConventions: result.learnedConventionsApplied,
        validationResult,
        sandboxResult: null
      })

      // Fire background embedding calculation
      runBackgroundEmbedding(projectId, state.vectorStore).catch(err => {
        console.error(`[GenerateAPI] Background embedding calculation failed:`, err)
      })
    }

    return NextResponse.json({
      success: true,
      files: result.files,
      explanation: result.explanation,
      conventionsApplied: result.learnedConventionsApplied,
      validationResult
    })
  } catch (error: any) {
    console.error("[GenerateAPI] Server error during DevOps generation:", error)
    return NextResponse.json(
      { error: `Internal Server Error: ${error.message || error}` },
      { status: 500 }
    )
  }
}
