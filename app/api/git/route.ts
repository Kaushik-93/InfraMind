import { NextResponse } from "next/server"
import { sessionStore } from "@/lib/store"

/**
 * Handles POST requests to manage Git operations and PR flows.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { action, message, title, description, files } = body

    const state = sessionStore.getState()
    const gitState = state.gitState

    if (action === "commit") {
      if (!message) {
        return NextResponse.json(
          { error: "Commit message is required." },
          { status: 400 }
        )
      }

      console.log(`[GitAPI] Creating commit: "${message}"`)

      // Generate a mock SHA hash
      const randomHash = Math.random().toString(16).substring(2, 9)
      const filesCount = files ? Object.keys(files) : Object.keys(state.activeGeneratedFiles)

      const newCommit = {
        hash: randomHash,
        message,
        date: new Date().toLocaleString(),
        files: filesCount
      }

      const updatedCommits = [newCommit, ...gitState.commits]
      
      sessionStore.updateState({
        gitState: {
          ...gitState,
          commits: updatedCommits,
          branch: gitState.branch === "main" ? "feature/inframind-gen" : gitState.branch
        }
      })

      return NextResponse.json({
        success: true,
        commit: newCommit,
        branch: gitState.branch === "main" ? "feature/inframind-gen" : gitState.branch,
        commitsCount: updatedCommits.length
      })
    }

    if (action === "create_pr") {
      if (!title) {
        return NextResponse.json(
          { error: "Pull Request title is required." },
          { status: 400 }
        )
      }

      console.log(`[GitAPI] Initialising Pull Request: "${title}"`)

      sessionStore.updateState({
        gitState: {
          ...gitState,
          prCreated: true,
          prTitle: title,
          prDescription: description || "Coordinated infrastructure deployment changes generated automatically by InfraMind."
        }
      })

      return NextResponse.json({
        success: true,
        prCreated: true,
        prTitle: title,
        prDescription: description
      })
    }

    // Default action: get_state
    return NextResponse.json({
      success: true,
      gitState
    })
  } catch (error: any) {
    console.error("[GitAPI] Server error during Git tracking operation:", error)
    return NextResponse.json(
      { error: `Internal Server Error: ${error.message || error}` },
      { status: 500 }
    )
  }
}
