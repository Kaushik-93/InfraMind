import fs from "fs"
import path from "path"

/**
 * Interface representing the structural details of a parsed DevOps file.
 */
export interface ScannedFile {
  relativePath: string
  absolutePath: string
  fileType: "kubernetes" | "dockerfile" | "helm" | "terraform" | "pipeline" | "unknown"
  content: string
  parsedData: any
}

/**
 * Interface representing the learned organizational conventions of the codebase.
 */
export interface OrgConventions {
  namingStandards: {
    namespaces: string[]
    services: string[]
    registries: string[]
  }
  cloudProviders: string[]
  commonImages: string[]
  portsExposed: number[]
  ciCdTriggers: string[]
  securityPolicies: {
    runAsNonRoot: boolean
    readOnlyRootFilesystem: boolean
    hasResourceLimits: boolean
  }
}

/**
 * Recursive filesystem scanner and structural parser for DevOps configurations.
 */
export class DevOpsParser {
  /**
   * Scans a directory recursively and extracts DevOps-related files.
   * @param dirPath Absolute path of the directory to scan.
   * @param rootPath Base directory path to compute relative paths.
   */
  public static scanDirectory(dirPath: string, rootPath: string = dirPath): ScannedFile[] {
    let results: ScannedFile[] = []

    if (!fs.existsSync(dirPath)) {
      return results
    }

    const items = fs.readdirSync(dirPath)

    for (const item of items) {
      // Exclude heavy dependency folders and metadata
      if (["node_modules", ".git", ".next", "dist", "build", "terraform.tfstate"].includes(item)) {
        continue
      }

      const fullPath = path.join(dirPath, item)
      const stat = fs.statSync(fullPath)

      if (stat.isDirectory()) {
        results = results.concat(this.scanDirectory(fullPath, rootPath))
      } else {
        const relativePath = path.relative(rootPath, fullPath)
        const fileType = this.detectFileType(item, fullPath)

        if (fileType !== "unknown") {
          try {
            const content = fs.readFileSync(fullPath, "utf-8")
            const parsedData = this.parseFileContent(fileType, content)
            
            results.push({
              relativePath,
              absolutePath: fullPath,
              fileType,
              content,
              parsedData
            })
          } catch (error) {
            console.error(`[DevOpsParser] Error reading/parsing ${relativePath}:`, error)
          }
        }
      }
    }

    return results
  }

  /**
   * Detects the type of DevOps file based on its name and extension.
   */
  public static detectFileType(filename: string, filePath: string): ScannedFile["fileType"] {
    const lowerName = filename.toLowerCase()

    if (lowerName === "dockerfile" || lowerName.startsWith("dockerfile.") || lowerName.endsWith(".dockerfile")) {
      return "dockerfile"
    }

    if (lowerName === "chart.yaml" || lowerName === "values.yaml" || filePath.includes("templates/")) {
      if (lowerName.endsWith(".yaml") || lowerName.endsWith(".yml")) {
        return "helm"
      }
    }

    if (lowerName.endsWith(".tf") || lowerName.endsWith(".tfvars")) {
      return "terraform"
    }

    if (filePath.includes(".github/workflows") || filePath.includes(".azure-pipelines") || lowerName === "gitlab-ci.yml") {
      if (lowerName.endsWith(".yaml") || lowerName.endsWith(".yml")) {
        return "pipeline"
      }
    }

    if (lowerName.endsWith(".yaml") || lowerName.endsWith(".yml")) {
      // K8s check: We check file contents inside parseFileContent, but default to kubernetes for general YAMLs
      return "kubernetes"
    }

    return "unknown"
  }

  /**
   * Parses file content with given type.
   */
  public static parseFile(content: string, type: ScannedFile["fileType"]): any {
    return this.parseFileContent(type, content)
  }

  /**
   * Parses file content structurally based on its detected type.
   */
  private static parseFileContent(type: ScannedFile["fileType"], content: string): any {
    switch (type) {
      case "dockerfile":
        return this.parseDockerfile(content)
      case "kubernetes":
        return this.parseKubernetesYaml(content)
      case "helm":
        return this.parseHelmYaml(content)
      case "terraform":
        return this.parseTerraformHcl(content)
      case "pipeline":
        return this.parsePipelineYaml(content)
      default:
        return {}
    }
  }

  /**
   * High-fidelity structural parsing of Dockerfiles using regex AST replication.
   */
  private static parseDockerfile(content: string): any {
    const lines = content.split("\n")
    const ast: {
      baseImages: string[]
      ports: number[]
      envs: Record<string, string>
      steps: { instruction: string; arguments: string }[]
      isMultiStage: boolean
    } = {
      baseImages: [],
      ports: [],
      envs: {},
      steps: [],
      isMultiStage: false
    }

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith("#")) continue

      const match = trimmed.match(/^([A-Z]+)\s+(.*)$/)
      if (match) {
        const instruction = match[1]
        const args = match[2]

        ast.steps.push({ instruction, arguments: args })

        if (instruction === "FROM") {
          ast.baseImages.push(args.split(" ")[0])
        } else if (instruction === "EXPOSE") {
          const port = parseInt(args.trim(), 10)
          if (!isNaN(port)) ast.ports.push(port)
        } else if (instruction === "ENV") {
          const envMatch = args.match(/^([a-zA-Z0-9_-]+)[=\s]+(.*)$/)
          if (envMatch) {
            ast.envs[envMatch[1]] = envMatch[2].replace(/(^"|"$)/g, "")
          }
        }
      }
    }

    ast.isMultiStage = ast.baseImages.length > 1
    return ast
  }

  /**
   * Structural parser for Kubernetes manifest files.
   * Leverages light YAML structure parsing to extract metadata, spec, and dependencies.
   */
  private static parseKubernetesYaml(content: string): any {
    const manifests: any[] = []
    
    // Split by multi-document YAML separator
    const docs = content.split(/^---$/m)

    for (const doc of docs) {
      const trimmed = doc.trim()
      if (!trimmed) continue

      // Extrapolate key K8s properties using AST regex scanner
      const apiVersionMatch = trimmed.match(/apiVersion:\s*([^\s]+)/)
      const kindMatch = trimmed.match(/kind:\s*([^\s]+)/)
      const nameMatch = trimmed.match(/name:\s*([^\s]+)/m)
      const namespaceMatch = trimmed.match(/namespace:\s*([^\s]+)/m)

      if (apiVersionMatch && kindMatch) {
        const manifest: any = {
          apiVersion: apiVersionMatch[1].replace(/['"]/g, ""),
          kind: kindMatch[1].replace(/['"]/g, ""),
          name: nameMatch ? nameMatch[1].replace(/['"]/g, "") : "unnamed",
          namespace: namespaceMatch ? namespaceMatch[1].replace(/['"]/g, "") : "default",
          containers: [],
          dependencies: {
            services: [],
            secrets: [],
            configMaps: []
          }
        }

        // Scan for Docker container images
        const imageRegex = /image:\s*([^\s"']+)/g
        let imgMatch
        while ((imgMatch = imageRegex.exec(trimmed)) !== null) {
          manifest.containers.push(imgMatch[1])
        }

        // Scan for Secret & ConfigMap references
        const secretRegex = /secretName:\s*([^\s"']+)/g
        let secMatch
        while ((secMatch = secretRegex.exec(trimmed)) !== null) {
          manifest.dependencies.secrets.push(secMatch[1])
        }

        const configMapRegex = /configMapKeyRef:\s*[^]*?name:\s*([^\s"']+)/g
        let cmMatch
        while ((cmMatch = configMapRegex.exec(trimmed)) !== null) {
          manifest.dependencies.configMaps.push(cmMatch[1])
        }

        manifests.push(manifest)
      }
    }

    return manifests.length === 1 ? manifests[0] : manifests
  }

  /**
   * Parses Helm chart value structures and configurations.
   */
  private static parseHelmYaml(content: string): any {
    const parsed: Record<string, any> = {}
    const lines = content.split("\n")

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith("#")) continue

      const match = trimmed.match(/^([a-zA-Z0-9_.-]+):\s*(.*)$/)
      if (match) {
        const key = match[1]
        const value = match[2].trim().replace(/['"]/g, "")
        parsed[key] = value
      }
    }

    return parsed
  }

  /**
   * Parses Terraform variables, modules, and providers.
   */
  private static parseTerraformHcl(content: string): any {
    const ast: {
      providers: string[]
      resources: { type: string; name: string }[]
      modules: string[]
      variables: string[]
    } = {
      providers: [],
      resources: [],
      modules: [],
      variables: []
    }

    // Extract providers
    const providerRegex = /provider\s+"([^"]+)"/g
    let pMatch
    while ((pMatch = providerRegex.exec(content)) !== null) {
      ast.providers.push(pMatch[1])
    }

    // Extract modules
    const moduleRegex = /module\s+"([^"]+)"/g
    let mMatch
    while ((mMatch = moduleRegex.exec(content)) !== null) {
      ast.modules.push(mMatch[1])
    }

    // Extract resources
    const resourceRegex = /resource\s+"([^"]+)"\s+"([^"]+)"/g
    let rMatch
    while ((rMatch = resourceRegex.exec(content)) !== null) {
      ast.resources.push({ type: rMatch[1], name: rMatch[2] })
    }

    // Extract variables
    const varRegex = /variable\s+"([^"]+)"/g
    let vMatch
    while ((vMatch = varRegex.exec(content)) !== null) {
      ast.variables.push(vMatch[1])
    }

    return ast
  }

  /**
   * Parses CI/CD pipeline triggers and environment jobs.
   */
  private static parsePipelineYaml(content: string): any {
    const ast: {
      triggers: string[]
      steps: string[]
      imagesUsed: string[]
    } = {
      triggers: [],
      steps: [],
      imagesUsed: []
    }

    // Extract pipeline triggers (e.g. push, pull_request)
    const triggerRegex = /(?:on|trigger):\s*\[?([a-zA-Z0-9_,\s"'-]+)\]?/
    const tMatch = content.match(triggerRegex)
    if (tMatch) {
      ast.triggers = tMatch[1].split(",").map(t => t.trim().replace(/['"\[\]]/g, ""))
    }

    // Extract runner steps/uses
    const usesRegex = /uses:\s*([^\s"']+)/g
    let uMatch
    while ((uMatch = usesRegex.exec(content)) !== null) {
      ast.steps.push(uMatch[1])
    }

    // Extract images used
    const containerImageRegex = /image:\s*([^\s"']+)/g
    let imgMatch
    while ((imgMatch = containerImageRegex.exec(content)) !== null) {
      ast.imagesUsed.push(imgMatch[1])
    }

    return ast
  }

  /**
   * Examines all scanned files to learn and compile organizational conventions.
   */
  public static learnConventions(files: ScannedFile[]): OrgConventions {
    const conventions: OrgConventions = {
      namingStandards: {
        namespaces: [],
        services: [],
        registries: []
      },
      cloudProviders: [],
      commonImages: [],
      portsExposed: [],
      ciCdTriggers: [],
      securityPolicies: {
        runAsNonRoot: false,
        readOnlyRootFilesystem: false,
        hasResourceLimits: false
      }
    }

    let nonRootCount = 0
    let readOnlyRootCount = 0
    let resourceLimitsCount = 0
    let k8sFileCount = 0

    for (const file of files) {
      const data = file.parsedData

      if (file.fileType === "kubernetes" && data) {
        k8sFileCount++
        const docs = Array.isArray(data) ? data : [data]

        for (const doc of docs) {
          if (doc.namespace && !conventions.namingStandards.namespaces.includes(doc.namespace)) {
            conventions.namingStandards.namespaces.push(doc.namespace)
          }

          if (doc.kind === "Service" && doc.name && !conventions.namingStandards.services.includes(doc.name)) {
            conventions.namingStandards.services.push(doc.name)
          }

          if (doc.containers) {
            for (const img of doc.containers) {
              if (!conventions.commonImages.includes(img)) {
                conventions.commonImages.push(img)
              }
              // Extract registry naming standards
              const parts = img.split("/")
              if (parts.length > 1 && !conventions.namingStandards.registries.includes(parts[0])) {
                conventions.namingStandards.registries.push(parts[0])
              }
            }
          }
        }

        // Security settings parsing from the raw content
        if (file.content.includes("runAsNonRoot: true")) nonRootCount++
        if (file.content.includes("readOnlyRootFilesystem: true")) readOnlyRootCount++
        if (file.content.includes("limits:") && file.content.includes("requests:")) resourceLimitsCount++
      }

      if (file.fileType === "dockerfile" && data) {
        if (data.ports) {
          for (const port of data.ports) {
            if (!conventions.portsExposed.includes(port)) {
              conventions.portsExposed.push(port)
            }
          }
        }
        if (data.baseImages) {
          for (const img of data.baseImages) {
            if (!conventions.commonImages.includes(img)) {
              conventions.commonImages.push(img)
            }
          }
        }
      }

      if (file.fileType === "terraform" && data) {
        if (data.providers) {
          for (const p of data.providers) {
            if (!conventions.cloudProviders.includes(p)) {
              conventions.cloudProviders.push(p)
            }
          }
        }
      }

      if (file.fileType === "pipeline" && data) {
        if (data.triggers) {
          for (const t of data.triggers) {
            if (!conventions.ciCdTriggers.includes(t)) {
              conventions.ciCdTriggers.push(t)
            }
          }
        }
      }
    }

    // Average security metrics to learn the standard compliance rate
    if (k8sFileCount > 0) {
      conventions.securityPolicies.runAsNonRoot = (nonRootCount / k8sFileCount) > 0.5
      conventions.securityPolicies.readOnlyRootFilesystem = (readOnlyRootCount / k8sFileCount) > 0.5
      conventions.securityPolicies.hasResourceLimits = (resourceLimitsCount / k8sFileCount) > 0.5
    }

    return conventions
  }
}
