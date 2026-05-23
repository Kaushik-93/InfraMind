import { NextResponse } from "next/server"
import { sessionStore } from "@/lib/store"
import { ProjectStoreManager } from "@/lib/project-store"
import { DevOpsParser } from "@/lib/parser"
import { GraphBuilder } from "@/lib/graph-builder"
import { runBackgroundEmbedding } from "@/lib/vector-store"
import fs from "fs"
import path from "path"
import { generateSampleRepoFiles } from "../scan/route"

/**
 * GET - List all projects metadata, or switch active project if query param is set.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const activeId = searchParams.get("activeId")
    
    // Check if the user is switching projects
    if (activeId !== null) {
      const project = ProjectStoreManager.getProject(activeId)
      if (!project) {
        return NextResponse.json({ error: "Project not found." }, { status: 404 })
      }
      
      sessionStore.setActiveProjectId(activeId)
      const state = sessionStore.getState()
      
      return NextResponse.json({
        success: true,
        activeProjectId: activeId,
        scannedRepoPath: state.scannedRepoPath,
        filesCount: state.scannedFiles.length,
        conventions: state.conventions,
        chatHistory: project.chatHistory,
        gitState: state.gitState,
        embeddingStatus: project.embeddingStatus || "idle",
        embeddingError: project.embeddingError || ""
      })
    }
    
    // Otherwise, return all projects
    const list = ProjectStoreManager.getProjectsList()
    return NextResponse.json({
      success: true,
      projects: list.map(p => ({
        id: p.id,
        name: p.name,
        repoLinks: p.repoLinks,
        conventionsCount: p.conventionsHistory.length,
        chatHistoryCount: p.chatHistory.length,
        embeddingStatus: p.embeddingStatus || "idle",
        embeddingError: p.embeddingError || ""
      })),
      activeProjectId: sessionStore.getActiveProjectId()
    })
  } catch (error: any) {
    console.error("[ProjectsAPI] GET failed:", error)
    return NextResponse.json({ error: error.message || error }, { status: 500 })
  }
}

/**
 * POST - Create a new project.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const name = body.name ? body.name.trim() : ""
    const repoLinks = body.repoLinks || []
    
    if (!name) {
      return NextResponse.json({ error: "Project name is required." }, { status: 400 })
    }
    
    const project = ProjectStoreManager.createProject(name, repoLinks)
    const projectId = project.id
    sessionStore.setActiveProjectId(projectId)

    // Automatically scan links on creation if any links are provided
    if (project.repoLinks.length > 0) {
      const allFilesMap: Record<string, any> = {}
      const workspaceRoot = "/Users/kaushiksathyanathsingh/Documents/Projects/Inframind"

      for (let linkPath of project.repoLinks) {
        // Resolve sample repo link path
        if (linkPath.toLowerCase() === "sample" || linkPath.endsWith("sample-repo")) {
          linkPath = path.join(workspaceRoot, "sample-repo")
          generateSampleRepoFiles(linkPath)
        }

        if (fs.existsSync(linkPath)) {
          const files = DevOpsParser.scanDirectory(linkPath)
          for (const file of files) {
            allFilesMap[file.relativePath] = file
            ProjectStoreManager.saveProjectFile(projectId, file.relativePath, file.content)
          }
        }
      }

      const mergedFiles = Object.values(allFilesMap)
      if (mergedFiles.length > 0) {
        const conventions = DevOpsParser.learnConventions(mergedFiles)
        const graph = GraphBuilder.buildGraph(mergedFiles)

        // Index in the active state's vector store (empty existing embeddings since new project)
        const state = sessionStore.getState()
        state.vectorStore.indexRepository(mergedFiles, [])

        // Update conventions history
        project.conventionsHistory.push({
          date: new Date().toLocaleString(),
          conventions
        })
        ProjectStoreManager.saveProjectMetadata(projectId, project)

        // Update the session state
        sessionStore.updateState({
          scannedRepoPath: project.repoLinks.map(l => l.toLowerCase() === "sample" ? path.join(workspaceRoot, "sample-repo") : l).join(", "),
          scannedFiles: mergedFiles,
          conventions,
          graph,
          activeGeneratedFiles: {},
          activeGeneratedExplanation: "",
          activeGeneratedAppliedConventions: []
        })

        // Fire the background embedding calculations (async promise, NOT awaited)
        runBackgroundEmbedding(projectId, state.vectorStore).catch(err => {
          console.error(`[ProjectsAPI] Background embedding failed:`, err)
        })
      }
    }
    
    return NextResponse.json({
      success: true,
      project: {
        id: project.id,
        name: project.name,
        repoLinks: project.repoLinks
      }
    })
  } catch (error: any) {
    console.error("[ProjectsAPI] POST failed:", error)
    return NextResponse.json({ error: error.message || error }, { status: 500 })
  }
}

/**
 * DELETE - Remove a project and all its encrypted workspace assets.
 */
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")
    
    if (!id) {
      return NextResponse.json({ error: "Project ID is required." }, { status: 400 })
    }
    
    const success = ProjectStoreManager.deleteProject(id)
    if (!success) {
      return NextResponse.json({ error: "Project not found or delete failed." }, { status: 404 })
    }
    
    sessionStore.unloadProject(id)
    
    // Switch to first remaining project if any exist
    const list = ProjectStoreManager.getProjectsList()
    if (list.length > 0) {
      sessionStore.setActiveProjectId(list[0].id)
    }
    
    return NextResponse.json({
      success: true,
      nextActiveProjectId: sessionStore.getActiveProjectId()
    })
  } catch (error: any) {
    console.error("[ProjectsAPI] DELETE failed:", error)
    return NextResponse.json({ error: error.message || error }, { status: 500 })
  }
}
