import { ScannedFile } from "./parser"

/**
 * Node representation inside the Infrastructure Knowledge Graph.
 */
export interface GraphNode {
  id: string
  label: string
  type: "service" | "database" | "ingress" | "secret" | "pipeline" | "terraform" | "configmap" | "container"
  status: "active" | "error" | "warning" | "idle"
  details: Record<string, any>
}

/**
 * Edge representing a dependency/relationship inside the Knowledge Graph.
 */
export interface GraphEdge {
  id: string
  source: string
  target: string
  label: string
  type: "exposes" | "uses" | "mounts" | "deploys" | "binds" | "manages"
  animated?: boolean
}

/**
 * Output format of the constructed Infrastructure Knowledge Graph.
 */
export interface InfraGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

/**
 * Compiles parsed DevOps configuration files into a relational knowledge graph.
 */
export class GraphBuilder {
  /**
   * Translates a collection of scanned files into nodes and relational dependency edges.
   */
  public static buildGraph(files: ScannedFile[]): InfraGraph {
    const nodes: GraphNode[] = []
    const edges: GraphEdge[] = []
    const registeredNodeIds = new Set<string>()

    const registerNode = (node: GraphNode) => {
      if (!registeredNodeIds.has(node.id)) {
        nodes.push(node);
        registeredNodeIds.add(node.id);
      }
    };

    // Helper to format unique IDs
    const sanitizeId = (text: string) => text.toLowerCase().replace(/[^a-z0-9_-]/g, "-")

    // Phase 1: Create all Core Nodes from configurations
    for (const file of files) {
      const data = file.parsedData
      const baseName = file.relativePath.split("/").pop() || file.relativePath

      if (file.fileType === "dockerfile" && data) {
        const serviceName = sanitizeId(baseName.replace(/\..*$/, "") || "app-service")
        registerNode({
          id: `container-${serviceName}`,
          label: `Dockerfile: ${serviceName}`,
          type: "container",
          status: "active",
          details: {
            baseImages: data.baseImages,
            ports: data.ports,
            envs: data.envs,
            isMultiStage: data.isMultiStage
          }
        })
      }

      if (file.fileType === "kubernetes" && data) {
        const docs = Array.isArray(data) ? data : [data]

        for (const doc of docs) {
          if (!doc || !doc.kind) continue

          const nodeId = sanitizeId(`${doc.kind}-${doc.name}`)
          let nodeType: GraphNode["type"] = "service"
          let status: GraphNode["status"] = "active"

          if (doc.kind === "Deployment" || doc.kind === "Pod" || doc.kind === "StatefulSet") {
            nodeType = "service"
          } else if (doc.kind === "Service") {
            nodeType = "service"
          } else if (doc.kind === "Ingress") {
            nodeType = "ingress"
          } else if (doc.kind === "Secret") {
            nodeType = "secret"
            status = "idle"
          } else if (doc.kind === "ConfigMap") {
            nodeType = "configmap"
            status = "idle"
          }

          // Detect typical databases from service naming conventions
          const labelLower = doc.name.toLowerCase()
          if (labelLower.includes("postgres") || labelLower.includes("redis") || labelLower.includes("db") || labelLower.includes("mongo") || labelLower.includes("sql")) {
            if (doc.kind === "StatefulSet" || doc.kind === "Service" || doc.kind === "Deployment") {
              nodeType = "database"
            }
          }

          registerNode({
            id: nodeId,
            label: `${doc.kind}: ${doc.name}`,
            type: nodeType,
            status,
            details: {
              namespace: doc.namespace,
              apiVersion: doc.apiVersion,
              containers: doc.containers,
              dependencies: doc.dependencies
            }
          })
        }
      }

      if (file.fileType === "terraform" && data) {
        registerNode({
          id: `tf-${sanitizeId(baseName)}`,
          label: `Terraform: ${baseName}`,
          type: "terraform",
          status: "active",
          details: {
            providers: data.providers,
            modules: data.modules,
            resources: data.resources,
            variables: data.variables
          }
        })
      }

      if (file.fileType === "pipeline" && data) {
        registerNode({
          id: `pipe-${sanitizeId(baseName)}`,
          label: `Pipeline: ${baseName}`,
          type: "pipeline",
          status: "active",
          details: {
            triggers: data.triggers,
            steps: data.steps,
            imagesUsed: data.imagesUsed
          }
        })
      }
    }

    // Phase 2: Create Edges establishing relationships between nodes
    for (const node of nodes) {
      // Kubernetes relationships
      if (node.details.dependencies) {
        const deps = node.details.dependencies

        // Secrets relationships
        if (deps.secrets) {
          for (const secret of deps.secrets) {
            const secretId = sanitizeId(`Secret-${secret}`)
            
            // Register an implicit secret node if not present
            registerNode({
              id: secretId,
              label: `Secret: ${secret}`,
              type: "secret",
              status: "idle",
              details: {}
            })

            edges.push({
              id: `${node.id}-binds-${secretId}`,
              source: node.id,
              target: secretId,
              label: "mounts secret",
              type: "binds"
            })
          }
        }

        // ConfigMaps relationships
        if (deps.configMaps) {
          for (const cm of deps.configMaps) {
            const cmId = sanitizeId(`ConfigMap-${cm}`)

            registerNode({
              id: cmId,
              label: `ConfigMap: ${cm}`,
              type: "configmap",
              status: "idle",
              details: {}
            })

            edges.push({
              id: `${node.id}-binds-${cmId}`,
              source: node.id,
              target: cmId,
              label: "uses config",
              type: "binds"
            })
          }
        }
      }

      // K8s service mapping to deployment
      if (node.type === "service" && node.label.startsWith("Service:")) {
        const svcName = node.label.replace("Service: ", "")
        // Find matching Deployment node
        const matchingDeployment = nodes.find(
          n => (n.type === "service" || n.type === "database") && 
               n.label.startsWith("Deployment:") && 
               n.label.toLowerCase().includes(svcName.toLowerCase())
        )

        if (matchingDeployment) {
          edges.push({
            id: `${node.id}-exposes-${matchingDeployment.id}`,
            source: node.id,
            target: matchingDeployment.id,
            label: "exposes spec",
            type: "exposes",
            animated: true
          })
        }
      }

      // Ingress mapping to service
      if (node.type === "ingress") {
        // Simple heuristic: match matching service nodes
        for (const targetNode of nodes) {
          if (targetNode.type === "service" && targetNode.label.startsWith("Service:")) {
            const svcName = targetNode.label.replace("Service: ", "")
            if (node.label.toLowerCase().includes(svcName.toLowerCase()) || node.details.dependencies?.services?.includes(svcName)) {
              edges.push({
                id: `${node.id}-uses-${targetNode.id}`,
                source: node.id,
                target: targetNode.id,
                label: "routes to",
                type: "exposes",
                animated: true
              })
            }
          }
        }
      }

      // Pipeline mapping to services
      if (node.type === "pipeline") {
        for (const targetNode of nodes) {
          if (targetNode.type === "service" && targetNode.label.startsWith("Deployment:")) {
            edges.push({
              id: `${node.id}-deploys-${targetNode.id}`,
              source: node.id,
              target: targetNode.id,
              label: "deploys app",
              type: "deploys",
              animated: true
            })
          }
        }
      }

      // Terraform mapping to databases or clusters
      if (node.type === "terraform" && node.details.resources) {
        for (const res of node.details.resources) {
          if (res.type.includes("db") || res.type.includes("rds") || res.type.includes("elasticache")) {
            const dbNodeId = sanitizeId(`db-${res.name}`)
            registerNode({
              id: dbNodeId,
              label: `RDS: ${res.name}`,
              type: "database",
              status: "active",
              details: { resourceType: res.type }
            })

            edges.push({
              id: `${node.id}-manages-${dbNodeId}`,
              source: node.id,
              target: dbNodeId,
              label: "provisions",
              type: "manages"
            })
          }
        }
      }
    }

    // Phase 3: Connect Dockerfiles to corresponding deployments
    for (const node of nodes) {
      if (node.type === "container") {
        const containerName = node.id.replace("container-", "")
        const matchingDeployment = nodes.find(
          n => n.label.startsWith("Deployment:") && n.label.toLowerCase().includes(containerName)
        )

        if (matchingDeployment) {
          edges.push({
            id: `${matchingDeployment.id}-uses-${node.id}`,
            source: matchingDeployment.id,
            target: node.id,
            label: "build context",
            type: "uses"
          })
        }
      }
    }

    return { nodes, edges }
  }
}
