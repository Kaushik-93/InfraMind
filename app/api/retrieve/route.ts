import { NextResponse } from "next/server"
import { sessionStore } from "@/lib/store"

/**
 * Handles POST requests to execute a semantic lookup query.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const query = body.query ? body.query.trim() : ""

    const state = sessionStore.getState()

    if (!state.scannedRepoPath) {
      return NextResponse.json(
        { error: "No repository has been scanned yet. Please perform a scan first." },
        { status: 400 }
      )
    }

    if (!query) {
      return NextResponse.json(
        { error: "Query parameter is required." },
        { status: 400 }
      )
    }

    console.log(`[RetrieveAPI] Executing vector lookup query: "${query}"`)
    const results = state.vectorStore.search(query, 5)

    return NextResponse.json({
      success: true,
      query,
      results
    })
  } catch (error: any) {
    console.error("[RetrieveAPI] Server error during semantic lookup:", error)
    return NextResponse.json(
      { error: `Internal Server Error: ${error.message || error}` },
      { status: 500 }
    )
  }
}
