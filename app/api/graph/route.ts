import { NextResponse } from "next/server"
import { sessionStore } from "@/lib/store"

/**
 * Handles GET requests to retrieve the current active infrastructure dependency graph.
 */
export async function GET() {
  try {
    const state = sessionStore.getState()

    if (!state.scannedRepoPath) {
      return NextResponse.json(
        { error: "No repository has been scanned yet. Please perform a scan first." },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      repoPath: state.scannedRepoPath,
      graph: state.graph
    })
  } catch (error: any) {
    console.error("[GraphAPI] Server error during graph retrieval:", error)
    return NextResponse.json(
      { error: `Internal Server Error: ${error.message || error}` },
      { status: 500 }
    )
  }
}
