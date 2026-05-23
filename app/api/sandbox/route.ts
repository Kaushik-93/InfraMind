import { NextResponse } from "next/server"
import { SandboxRunner } from "@/lib/sandbox-runner"
import { DevOpsValidator } from "@/lib/validator"
import { AIOrchestrator } from "@/lib/llm"
import { sessionStore } from "@/lib/store"

/**
 * Handles POST requests to spin up the generated DevOps structures inside the simulation sandbox.
 * Supports self-repair triggers.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { files, repair } = body

    const state = sessionStore.getState()
    const activeFiles = files || state.activeGeneratedFiles

    if (!activeFiles || Object.keys(activeFiles).length === 0) {
      return NextResponse.json(
        { error: "No active files generated to deploy in the sandbox." },
        { status: 400 }
      )
    }

    console.log("[SandboxAPI] Mounting files and starting container simulation...")
    
    // 1. Initial Validation
    const validationIssues: any[] = []
    let isValid = true
    let errors = 0
    let warnings = 0
    let infos = 0

    for (const [filePath, content] of Object.entries(activeFiles)) {
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

    // 2. Initial Run
    const initialRun = SandboxRunner.execute(activeFiles, validationResult)
    sessionStore.updateState({ sandboxResult: initialRun })

    // 3. If container crashed and user requested 'repair', execute the AI Self-Repair Loop!
    if (initialRun.status !== "success" && repair) {
      console.log(`[SandboxAPI] Triggering AI Self-Repair loop on failure: "${initialRun.errorType}"`)
      
      const repairResult = await AIOrchestrator.repair(activeFiles, initialRun, state.conventions)
      
      // Re-run validation on repaired files
      const repairedIssues: any[] = []
      let repairedValid = true
      let rErrors = 0, rWarnings = 0, rInfos = 0

      for (const [filePath, content] of Object.entries(repairResult.files)) {
        const fileVal = DevOpsValidator.validateFile(filePath, content)
        repairedIssues.push(...fileVal.issues)
        if (!fileVal.isValid) repairedValid = false
        rErrors += fileVal.summary.errors
        rWarnings += fileVal.summary.warnings
        rInfos += fileVal.summary.infos
      }

      const repairedValidation = {
        isValid: repairedValid,
        issues: repairedIssues,
        summary: { errors: rErrors, warnings: rWarnings, infos: rInfos }
      }

      // Re-run sandbox with updated configurations
      const secondRun = SandboxRunner.execute(repairResult.files, repairedValidation)

      // Cache updated results in store
      sessionStore.updateState({
        activeGeneratedFiles: repairResult.files,
        activeGeneratedExplanation: repairResult.explanation,
        validationResult: repairedValidation,
        sandboxResult: secondRun
      })

      return NextResponse.json({
        success: true,
        repaired: true,
        originalResult: initialRun,
        repairedResult: secondRun,
        files: repairResult.files,
        explanation: repairResult.explanation,
        validationResult: repairedValidation
      })
    }

    return NextResponse.json({
      success: true,
      repaired: false,
      originalResult: initialRun,
      validationResult
    })
  } catch (error: any) {
    console.error("[SandboxAPI] Server error during sandbox run:", error)
    return NextResponse.json(
      { error: `Internal Server Error: ${error.message || error}` },
      { status: 500 }
    )
  }
}
