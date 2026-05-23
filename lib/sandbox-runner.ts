import { ValidationResult } from "./validator"

/**
 * Log line from the running sandbox container.
 */
export interface SandboxLog {
  timestamp: string
  stream: "stdout" | "stderr"
  message: string
}

/**
 * Result of executing the sandbox runner simulation.
 */
export interface SandboxExecutionResult {
  status: "success" | "failed" | "crashed" | "security_violation"
  logs: SandboxLog[]
  failedComponent?: string
  errorType?: string
  diagnostics?: string
}

/**
 * Mock container runtime executor running DevOps validations and logs simulation.
 */
export class SandboxRunner {
  /**
   * Runs an execution simulation on a set of generated DevOps files.
   * Parses contents and injects realistic, time-stamped container logs.
   * Will deliberately trigger failure states based on files syntax or configuration parameters to demo Self-Repair.
   */
  public static execute(files: Record<string, string>, validatorResult: ValidationResult): SandboxExecutionResult {
    const logs: SandboxLog[] = []
    const addLog = (message: string, stream: "stdout" | "stderr" = "stdout") => {
      logs.push({
        timestamp: new Date().toISOString(),
        stream,
        message
      })
    }

    addLog("=== InfraMind Execution Sandbox v1.2.0-Alpha ===")
    addLog("Sandbox Environment: OS=Alpine, DockerHost=v26.0, K8sVersion=v1.29.1")
    addLog("Sandbox workspace locked and verified. Mounting generated configurations...")

    // 1. Static validation check
    if (!validatorResult.isValid) {
      const critError = validatorResult.issues.find(i => i.severity === "error")
      addLog(`FATAL: Static validation check failed inside ${critError?.filePath || "workspace"}: ${critError?.message}`, "stderr")
      return {
        status: "security_violation",
        logs,
        failedComponent: critError?.filePath,
        errorType: critError?.code || "STATIC_ERROR",
        diagnostics: `Lint issue ${critError?.code}: ${critError?.message} at line ${critError?.line}`
      }
    }

    // 2. Scan contents for runtime simulations
    let hasDbConfig = false
    let hasPortConflict = false
    let hasDbAuthFailure = false
    let hasRootContainer = false
    let exposedPort = 8080
    let appName = "api-service"

    // Search inside the files to detect configurations
    for (const [path, content] of Object.entries(files)) {
      const lowerPath = path.toLowerCase()
      const lowerContent = content.toLowerCase()

      // Detect app name
      const nameMatch = content.match(/name:\s*([a-zA-Z0-9_-]+)/)
      if (nameMatch) {
        appName = nameMatch[1]
      }

      // Check for port conflicts (e.g. standard port 80 or 8080 in use by duplicate containers)
      if (lowerContent.includes("expose 8080") && lowerContent.includes("port: 8080")) {
        // If there's an explicit duplicate port indicator
        if (lowerContent.includes("conflict")) {
          hasPortConflict = true
        }
      }

      // Detect database dependencies
      if (lowerContent.includes("postgres") || lowerContent.includes("redis") || lowerContent.includes("db_host")) {
        hasDbConfig = true
      }

      // Check if password ENV is empty or set to dummy value
      if (lowerContent.includes("db_password") || lowerContent.includes("postgresql_password")) {
        if (lowerContent.includes("password: \"\"") || lowerContent.includes("password: ''") || lowerContent.includes("password: dummy") || lowerContent.includes("value: \"\"")) {
          hasDbAuthFailure = true
        }
      }

      // Detect if user runs container as root
      if (lowerPath.includes("dockerfile")) {
        const exposeMatch = content.match(/EXPOSE\s+(\d+)/)
        if (exposeMatch) exposedPort = parseInt(exposeMatch[1], 10)

        if (!content.includes("USER") || content.includes("USER root")) {
          hasRootContainer = true
        }
      }
    }

    // Begin boot process logs
    addLog(`Preparing deployment pod pod/${appName}-sandbox-pod`)
    addLog("Allocating 0.5 CPU and 512Mi Memory boundaries")
    addLog("Configuring loopback network interface adapters...")
    
    // Simulate init-container boot
    addLog("Starting init-containers verification sequences...")
    addLog("[init-dns] Probing DNS nameservers...")
    addLog("[init-dns] DNS lookup successful. kubernetes.default.svc.cluster.local -> 10.96.0.10")
    addLog("[init-wait-db] Waiting for database connection endpoints availability...")

    if (hasDbConfig) {
      addLog("[init-wait-db] DB target service recognized. Probing TCP handshake socket on port 5432...")
      addLog("[init-wait-db] TCP connection established with DB host endpoint successfully.")
    } else {
      addLog("[init-wait-db] No external databases configuration detected. Skipping db wait container.")
    }
    
    addLog("All init containers completed successfully. Launching application container...")

    // Injected port conflict failure simulation
    if (hasPortConflict) {
      addLog(`[container] Executing command: npm start or docker-entrypoint.sh on port ${exposedPort}...`)
      addLog(`[container] Binding network interface sockets to 0.0.0.0:${exposedPort}`)
      addLog(`[container] FATAL: Port ${exposedPort} already bound by duplicate active service. Address already in use.`, "stderr")
      addLog("[container] Process exited with exit code 1. Restarting container... (Retry 1 of 5)", "stderr")
      return {
        status: "crashed",
        logs,
        failedComponent: "k8s/deployment.yaml",
        errorType: "PORT_CONFLICT",
        diagnostics: `FATAL: Address already in use. Port ${exposedPort} is already bound by another container workload.`
      }
    }

    // Injected database authentication failure simulation
    if (hasDbConfig && hasDbAuthFailure) {
      addLog(`[container] Booting application service ${appName}...`)
      addLog("[container] Server initialised. Listening on HTTP port " + exposedPort)
      addLog("[container] Connecting to database client driver...")
      addLog("[container] Error: connection failed to database on host postgres-service:5432", "stderr")
      addLog("[container] Database response: FATAL: password authentication failed for user 'admin'", "stderr")
      addLog("[container] CRITICAL: database connection failure: AuthException. Shutting down service.", "stderr")
      addLog("[container] Process exited with status code 78. Pod entered status 'CrashLoopBackOff'", "stderr")
      return {
        status: "crashed",
        logs,
        failedComponent: "k8s/secrets.yaml",
        errorType: "DB_AUTH_FAILURE",
        diagnostics: "CRITICAL: database connection failure. FATAL: password authentication failed for user 'admin'."
      }
    }

    // Security policy container failure simulation (running as root)
    if (hasRootContainer) {
      addLog("[container] Spawning image namespace under default secure sandbox rules...")
      addLog("SECURITY POLICY SANITIZATION ALERT: Container attempted execution as user ID: 0 (root)", "stderr")
      addLog("Kubernetes AdmissionController rejected Pod: Banned container execution as USER 'root' or UID: 0. Pod killed.", "stderr")
      return {
        status: "security_violation",
        logs,
        failedComponent: "Dockerfile",
        errorType: "BANNED_ROOT_USER",
        diagnostics: "AdmissionController validation failed: Container must run as non-root user (securityContext.runAsNonRoot is required to be true)."
      }
    }

    // Standard Success logs simulation
    addLog(`[container] Booting microservice ${appName} application runtime environment...`)
    addLog("[container] Loaded environment configurations:")
    addLog(`[container]   - PORT: ${exposedPort}`)
    addLog(`[container]   - NODE_ENV: production`)
    addLog(`[container]   - LOG_LEVEL: info`)
    addLog("[container] Listening for HTTP requests on address http://0.0.0.0:" + exposedPort)
    addLog("[container] Starting internal worker background threads...")
    addLog("[container] Ready for connection streams. Running orchestrator readiness health checks...")
    addLog("[readiness-probe] GET http://localhost:" + exposedPort + "/health -> status: 200 OK (latency: 4ms)")
    addLog("[liveness-probe] GET http://localhost:" + exposedPort + "/health -> status: 200 OK (latency: 2ms)")
    addLog("WORKLOAD HEALTHY: Pod pod/" + appName + "-sandbox-pod entered state 'Running'")
    addLog("=== Deployment Simulation Completed Successfully ===")

    return {
      status: "success",
      logs
    }
  }
}
