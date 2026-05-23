import { NextResponse } from "next/server"
import { DevOpsValidator } from "@/lib/validator"
import { sessionStore } from "@/lib/store"

/**
 * Handles POST requests to validate the user's manual or updated code.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { files } = body

    if (!files || typeof files !== "object") {
      return NextResponse.json(
        { error: "Workplace files object is required." },
        { status: 400 }
      )
    }

    console.log("[ValidateAPI] Running linting rules on updated files...")
    
    const issues: any[] = []
    let isValid = true
    let errors = 0
    let warnings = 0
    let infos = 0

    for (const [filePath, content] of Object.entries(files)) {
      const fileVal = DevOpsValidator.validateFile(filePath, content as string)
      issues.push(...fileVal.issues)
      if (!fileVal.isValid) isValid = false
      errors += fileVal.summary.errors
      warnings += fileVal.summary.warnings
      infos += fileVal.summary.infos
    }

    const validationResult = {
      isValid,
      issues,
      summary: { errors, warnings, infos }
    }

    // Save current active files & validation state inside sessionStore
    sessionStore.updateState({
      activeGeneratedFiles: files,
      validationResult
    })

    return NextResponse.json({
      success: true,
      validationResult
    })
  } catch (error: any) {
    console.error("[ValidateAPI] Server error during manual code validation:", error)
    return NextResponse.json(
      { error: `Internal Server Error: ${error.message || error}` },
      { status: 500 }
    )
  }
}
