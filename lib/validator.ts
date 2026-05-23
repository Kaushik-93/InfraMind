/**
 * Severity level of a validation failure.
 */
export type ValidationSeverity = "error" | "warning" | "info"

/**
 * Single validation finding details.
 */
export interface ValidationIssue {
  id: string
  code: string
  message: string
  severity: ValidationSeverity
  filePath: string
  line?: number
  category: "security" | "schema" | "conventions" | "standards"
  suggestion?: string
}

/**
 * Complete validation results for a fileset.
 */
export interface ValidationResult {
  isValid: boolean
  issues: ValidationIssue[]
  summary: {
    errors: number
    warnings: number
    infos: number
  }
}

/**
 * Standard DevOps Configuration Validator enforcing enterprise policies.
 */
export class DevOpsValidator {
  /**
   * Validates a virtual file based on its file path and code content.
   */
  public static validateFile(filePath: string, content: string): ValidationResult {
    const issues: ValidationIssue[] = []
    const fileName = filePath.split("/").pop() || filePath
    const lowerName = fileName.toLowerCase()

    if (lowerName === "dockerfile" || lowerName.startsWith("dockerfile.") || lowerName.endsWith(".dockerfile")) {
      this.validateDockerfile(content, filePath, issues)
    } else if (lowerName.endsWith(".tf")) {
      this.validateTerraform(content, filePath, issues)
    } else if (lowerName.endsWith(".yaml") || lowerName.endsWith(".yml")) {
      // In Kubernetes, manifests start with apiVersion. Let's inspect content.
      if (content.includes("apiVersion:") && content.includes("kind:")) {
        this.validateKubernetes(content, filePath, issues)
      } else {
        this.validateYamlSyntax(content, filePath, issues)
      }
    }

    const errors = issues.filter(i => i.severity === "error").length
    const warnings = issues.filter(i => i.severity === "warning").length
    const infos = issues.filter(i => i.severity === "info").length

    return {
      isValid: errors === 0,
      issues,
      summary: { errors, warnings, infos }
    }
  }

  /**
   * Checks YAML syntax.
   */
  private static validateYamlSyntax(content: string, filePath: string, issues: ValidationIssue[]) {
    // Standard indent checking
    const lines = content.split("\n")
    lines.forEach((line, index) => {
      if (line.includes("\t")) {
        issues.push({
          id: `yaml-tabs-${index}`,
          code: "YAML_TAB_CHARACTER",
          message: "YAML file contains tab characters. Use spaces for indentation.",
          severity: "error",
          filePath,
          line: index + 1,
          category: "schema",
          suggestion: "Replace tab characters with 2 spaces."
        })
      }
    })
  }

  /**
   * Enforces security standards and configurations in Kubernetes YAML manifests.
   */
  private static validateKubernetes(content: string, filePath: string, issues: ValidationIssue[]) {
    const docs = content.split(/^---$/m)
    const lines = content.split("\n")

    docs.forEach((doc, docIndex) => {
      const docTrimmed = doc.trim()
      if (!docTrimmed) return

      // Simple line mapping for finding line offsets
      const firstLineText = docTrimmed.split("\n")[0]
      const docStartLine = lines.findIndex(l => l.includes(firstLineText)) + 1

      const kindMatch = docTrimmed.match(/kind:\s*([^\s]+)/)
      const nameMatch = docTrimmed.match(/name:\s*([^\s]+)/)
      const kind = kindMatch ? kindMatch[1].replace(/['"]/g, "") : "Unknown"
      const name = nameMatch ? nameMatch[1].replace(/['"]/g, "") : "unnamed"

      // 1. Mandatory Schema elements
      if (!docTrimmed.includes("apiVersion:")) {
        issues.push({
          id: `k8s-api-${docIndex}`,
          code: "K8S_SCHEMA_APIVERSION",
          message: `Kubernetes resource ${kind} is missing 'apiVersion' field.`,
          severity: "error",
          filePath,
          line: Math.max(1, docStartLine),
          category: "schema",
          suggestion: "Add 'apiVersion: apps/v1' or 'apiVersion: v1' at the top."
        })
      }

      // 2. Container safety and limits checks
      if (["Deployment", "StatefulSet", "DaemonSet", "Job"].includes(kind)) {
        // Find line index for resources/securityContext
        const findLineIndex = (keyword: string) => {
          const idx = lines.findIndex((l, index) => index >= docStartLine - 1 && l.includes(keyword))
          return idx !== -1 ? idx + 1 : docStartLine
        }

        // CPU & Memory resources check
        if (!docTrimmed.includes("resources:") || !docTrimmed.includes("limits:") || !docTrimmed.includes("requests:")) {
          issues.push({
            id: `k8s-resources-${name}`,
            code: "K8S_LIMITS_MISSING",
            message: `Deployment container '${name}' has no CPU/Memory resource limits or requests configured.`,
            severity: "warning",
            filePath,
            line: findLineIndex("containers:"),
            category: "standards",
            suggestion: "Add resources: limits: cpu: 500m, memory: 512Mi / requests: cpu: 100m, memory: 256Mi."
          })
        }

        // Non-Root user context check
        if (!docTrimmed.includes("runAsNonRoot: true")) {
          issues.push({
            id: `k8s-nonroot-${name}`,
            code: "K8S_SECURITY_ROOT_RUNNER",
            message: `Container '${name}' does not enforce running as a non-root user (securityContext.runAsNonRoot is missing or false).`,
            severity: "error",
            filePath,
            line: findLineIndex("securityContext:") || findLineIndex("containers:"),
            category: "security",
            suggestion: "Configure securityContext: runAsNonRoot: true inside spec.template.spec."
          })
        }

        // ReadOnly filesystem check
        if (!docTrimmed.includes("readOnlyRootFilesystem: true")) {
          issues.push({
            id: `k8s-readonly-${name}`,
            code: "K8S_SECURITY_READONLY_FS",
            message: `Container '${name}' root filesystem is writeable. Risk of container compromise writing binary overrides.`,
            severity: "warning",
            filePath,
            line: findLineIndex("securityContext:") || findLineIndex("containers:"),
            category: "security",
            suggestion: "Set securityContext: readOnlyRootFilesystem: true within your container specification."
          })
        }

        // Tag checking on container images
        const imageMatches = docTrimmed.match(/image:\s*([^\s"']+)/g)
        if (imageMatches) {
          imageMatches.forEach(imgMatch => {
            const imageStr = imgMatch.replace("image:", "").trim()
            if (imageStr.endsWith(":latest") || !imageStr.includes(":")) {
              issues.push({
                id: `k8s-imagetag-${name}-${imageStr}`,
                code: "K8S_IMAGE_TAG_LATEST",
                message: `Container uses image '${imageStr}' with tag 'latest' or no tag, preventing deterministic immutable rollouts.`,
                severity: "error",
                filePath,
                line: findLineIndex("image:"),
                category: "standards",
                suggestion: `Replace tag with explicit version, e.g., ${imageStr.split(":")[0]}:1.24.0`
              })
            }
          })
        }

        // Ingress spec validations
        if (kind === "Ingress") {
          if (!docTrimmed.includes("tls:") || !docTrimmed.includes("secretName:")) {
            issues.push({
              id: `k8s-ingress-tls-${name}`,
              code: "K8S_INGRESS_NO_TLS",
              message: `Ingress resource '${name}' does not define TLS configurations. Traffic will be exposed in plain-text HTTP.`,
              severity: "error",
              filePath,
              line: docStartLine,
              category: "security",
              suggestion: "Add tls: - hosts: [example.com] secretName: example-tls-secret within Ingress spec."
            })
          }
        }
      }
    })
  }

  /**
   * Enforces rules and best practices for Dockerfiles.
   */
  private static validateDockerfile(content: string, filePath: string, issues: ValidationIssue[]) {
    const lines = content.split("\n")
    let hasExpose = false
    let lastUser: string | null = null
    let hasCmd = false
    let hasHealthCheck = false

    lines.forEach((line, index) => {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith("#")) return

      const tokens = trimmed.split(/\s+/)
      const command = tokens[0].toUpperCase()
      const args = tokens.slice(1).join(" ")

      // 1. Check FROM image tags
      if (command === "FROM") {
        const image = tokens[1]
        if (image && (image.endsWith(":latest") || !image.includes(":"))) {
          issues.push({
            id: `docker-base-${index}`,
            code: "DOCKER_BASE_TAG_LATEST",
            message: `Base image '${image}' specifies latest or unversioned tag. Builds will not be reproducible.`,
            severity: "error",
            filePath,
            line: index + 1,
            category: "standards",
            suggestion: "Pin image version, e.g., FROM node:20.12.0-alpine"
          })
        }
      }

      // 2. Track EXPOSE instruction
      if (command === "EXPOSE") {
        hasExpose = true
      }

      // 3. Track USER instruction
      if (command === "USER") {
        lastUser = args.trim().toLowerCase()
      }

      // 4. Track CMD instruction
      if (command === "CMD" || command === "ENTRYPOINT") {
        hasCmd = true
        // Check JSON form array syntax
        if (!args.startsWith("[") || !args.endsWith("]")) {
          issues.push({
            id: `docker-cmd-format-${index}`,
            code: "DOCKER_CMD_SHELL_FORM",
            message: `CMD or ENTRYPOINT uses shell form rather than exec JSON array form. Prevents forwarding SIGTERM signals to process.`,
            severity: "warning",
            filePath,
            line: index + 1,
            category: "standards",
            suggestion: `Convert command to array syntax, e.g., CMD ["node", "server.js"]`
          })
        }
      }

      // 5. Track HEALTHCHECK
      if (command === "HEALTHCHECK") {
        hasHealthCheck = true
      }

      // 6. Security check: Sensitive variables in raw ENV
      if (command === "ENV") {
        const lowerArgs = args.toLowerCase()
        if (lowerArgs.includes("key") || lowerArgs.includes("secret") || lowerArgs.includes("password") || lowerArgs.includes("token")) {
          issues.push({
            id: `docker-sec-env-${index}`,
            code: "DOCKER_SECRET_EXPOSURE",
            message: "Dockerfile sets sensitive values inside raw ENV instructions. Exposes credentials inside layers.",
            severity: "error",
            filePath,
            line: index + 1,
            category: "security",
            suggestion: "Remove secret assignment and mount them securely as environment variables or secrets at runtime."
          })
        }
      }
    })

    // Validate global Dockerfile indicators
    if (!hasExpose) {
      issues.push({
        id: "docker-no-expose",
        code: "DOCKER_EXPOSE_MISSING",
        message: "Dockerfile lacks an EXPOSE instruction. Hard to document which network ports this container listens to.",
        severity: "info",
        filePath,
        line: 1,
        category: "standards",
        suggestion: "Add EXPOSE 8080 or EXPOSE 3000 to specify server port."
      })
    }

    if (lastUser === null || lastUser === "root" || lastUser === "0") {
      issues.push({
        id: "docker-root-user",
        code: "DOCKER_USER_ROOT",
        message: "Dockerfile runs as default 'root' user. Fails container lease privilege standards.",
        severity: "error",
        filePath,
        line: lines.length,
        category: "security",
        suggestion: "Create an application user and switch using 'USER node' or 'USER 10001' before CMD."
      })
    }

    if (!hasHealthCheck) {
      issues.push({
        id: "docker-no-healthcheck",
        code: "DOCKER_HEALTHCHECK_MISSING",
        message: "Dockerfile lacks a HEALTHCHECK instruction. Kubernetes/orchestrator won't know if server has locked up internal loops.",
        severity: "warning",
        filePath,
        line: 1,
        category: "standards",
        suggestion: "Configure HEALTHCHECK CMD curl -f http://localhost:8080/health || exit 1"
      })
    }
  }

  /**
   * Enforces rules and checks for Terraform scripts.
   */
  private static validateTerraform(content: string, filePath: string, issues: ValidationIssue[]) {
    const lines = content.split("\n")

    // Check for hardcoded secrets
    lines.forEach((line, index) => {
      const trimmed = line.trim()
      if (trimmed.startsWith("#") || trimmed.startsWith("//")) return

      const lowerLine = trimmed.toLowerCase()
      if (lowerLine.includes("access_key") || lowerLine.includes("secret_key") || lowerLine.includes("password") || lowerLine.includes("token")) {
        const valMatch = trimmed.match(/=\s*"([^"]+)"/)
        if (valMatch && valMatch[1] && !valMatch[1].startsWith("var.") && !valMatch[1].startsWith("local.")) {
          issues.push({
            id: `tf-secret-${index}`,
            code: "TF_HARDCODED_CREDENTIAL",
            message: "Terraform file exposes hardcoded secret credentials directly in resource property assignment.",
            severity: "error",
            filePath,
            line: index + 1,
            category: "security",
            suggestion: "Declare a sensitive input variable or reference environment secrets instead."
          })
        }
      }
    })
  }
}
