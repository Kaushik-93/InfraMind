import { NextResponse } from "next/server"
import { DevOpsParser } from "@/lib/parser"
import { GraphBuilder } from "@/lib/graph-builder"
import { sessionStore, ProjectStoreManager } from "@/lib/store"
import { runBackgroundEmbedding } from "@/lib/vector-store"
import fs from "fs"
import path from "path"

/**
 * Handles POST requests to scan a project's repository links, encrypting the code on disk.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    let repoPath = body.repoPath ? body.repoPath.trim() : ""

    let projectId = sessionStore.getActiveProjectId()
    
    // Auto-create a default project if none is active to keep things functional out-of-the-box
    if (!projectId) {
      const list = ProjectStoreManager.getProjectsList()
      if (list.length > 0) {
        projectId = list[0].id
        sessionStore.setActiveProjectId(projectId)
      } else {
        const defaultProj = ProjectStoreManager.createProject("Default Project", repoPath ? [repoPath] : [])
        projectId = defaultProj.id
        sessionStore.setActiveProjectId(projectId)
      }
    }

    const project = ProjectStoreManager.getProject(projectId)
    if (!project) {
      return NextResponse.json({ error: "Active project metadata could not be resolved." }, { status: 404 })
    }

    // Help users easily initialize a sample repo if requested
    const workspaceRoot = "/Users/kaushiksathyanathsingh/Documents/Projects/Inframind"
    if (repoPath.toLowerCase() === "sample" || repoPath.endsWith("sample-repo")) {
      repoPath = path.join(workspaceRoot, "sample-repo")
      generateSampleRepoFiles(repoPath)
    }

    // Add new repo path to project if not already present
    if (repoPath && !project.repoLinks.includes(repoPath)) {
      if (!fs.existsSync(repoPath)) {
        return NextResponse.json(
          { error: `The specified directory path does not exist on this machine: "${repoPath}"` },
          { status: 404 }
        )
      }
      project.repoLinks.push(repoPath)
      ProjectStoreManager.saveProjectMetadata(projectId, project)
    }

    if (project.repoLinks.length === 0) {
      return NextResponse.json(
        { error: "No repository paths have been configured for this project. Please add a path to scan." },
        { status: 400 }
      )
    }

    console.log(`[ScanAPI] Scanning project "${project.name}" paths:`, project.repoLinks)

    const allFilesMap: Record<string, any> = {}
    
    // Scan all configured paths recursively, merging contents
    for (const linkPath of project.repoLinks) {
      if (!fs.existsSync(linkPath)) {
        console.warn(`[ScanAPI] Skipping non-existent repository path: ${linkPath}`)
        continue
      }
      
      const files = DevOpsParser.scanDirectory(linkPath)
      for (const file of files) {
        // Merge files based on relative path; save encrypted file under projects folder
        allFilesMap[file.relativePath] = file
        ProjectStoreManager.saveProjectFile(projectId, file.relativePath, file.content)
      }
    }

    const mergedFiles = Object.values(allFilesMap)
    const conventions = DevOpsParser.learnConventions(mergedFiles)
    const graph = GraphBuilder.buildGraph(mergedFiles)

    // Re-index this project's isolated Semantic Vector Store
    const state = sessionStore.getState()
    const existingChunks = ProjectStoreManager.loadProjectEmbeddings(projectId)
    state.vectorStore.indexRepository(mergedFiles, existingChunks)

    // Update conventions history in project metadata
    project.conventionsHistory.push({
      date: new Date().toLocaleString(),
      conventions
    })
    ProjectStoreManager.saveProjectMetadata(projectId, project)

    // Fire background embedding calculation
    runBackgroundEmbedding(projectId, state.vectorStore).catch(err => {
      console.error(`[ScanAPI] Background embedding calculation failed:`, err)
    })

    // Update global session store cache
    sessionStore.updateState({
      scannedRepoPath: project.repoLinks.join(", "),
      scannedFiles: mergedFiles,
      conventions,
      graph,
      activeGeneratedFiles: {}, // Clear generated workspace editors for fresh state
      activeGeneratedExplanation: "",
      activeGeneratedAppliedConventions: []
    })

    return NextResponse.json({
      success: true,
      repoPath: project.repoLinks.join(", "),
      filesCount: mergedFiles.length,
      files: mergedFiles.map(f => ({
        relativePath: f.relativePath,
        fileType: f.fileType,
        sizeBytes: f.content.length,
        content: f.content,
        parsedData: f.parsedData
      })),
      conventions,
      conventionsHistory: project.conventionsHistory
    })
  } catch (error: any) {
    console.error("[ScanAPI] Server error during repository scan:", error)
    return NextResponse.json(
      { error: `Internal Server Error: ${error.message || error}` },
      { status: 500 }
    )
  }
}

/**
 * Bootstraps a comprehensive, professional multi-service sample repository for test runs.
 */
export function generateSampleRepoFiles(targetDir: string) {
  if (fs.existsSync(targetDir) && fs.readdirSync(targetDir).length > 0) {
    return 
  }

  console.log(`[ScanAPI] Bootstrapping premium Sample DevOps Repo inside: ${targetDir}`)
  fs.mkdirSync(targetDir, { recursive: true })

  // 1. Dockerfile
  fs.writeFileSync(
    path.join(targetDir, "Dockerfile"),
    `FROM node:20.11.0-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 8080

# Compliance: Switch to non-root user
USER node

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \\
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

CMD ["node", "dist/index.js"]`
  )

  // 2. K8s Deployments, Services, and Ingress
  const k8sDir = path.join(targetDir, "k8s")
  fs.mkdirSync(k8sDir, { recursive: true })

  fs.writeFileSync(
    path.join(k8sDir, "deployment.yaml"),
    `apiVersion: apps/v1
kind: Deployment
metadata:
  name: order-service
  namespace: org-ecommerce-prod
  labels:
    app: order-service
    tier: backend
spec:
  replicas: 3
  selector:
    matchLabels:
      app: order-service
  template:
    metadata:
      labels:
        app: order-service
    spec:
      containers:
      - name: order-api
        image: ghcr.io/acme-org/order-service:v2.4.1
        ports:
        - containerPort: 8080
          name: http
        securityContext:
          runAsNonRoot: true
          readOnlyRootFilesystem: true
          allowPrivilegeEscalation: false
        resources:
          limits:
            cpu: "1"
            memory: 1Gi
          requests:
            cpu: 200m
            memory: 512Mi
        envFrom:
        - secretRef:
            name: order-db-secret
        readinessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 10
          periodSeconds: 5
        livenessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 30
          periodSeconds: 15
`
  )

  fs.writeFileSync(
    path.join(k8sDir, "service.yaml"),
    `apiVersion: v1
kind: Service
metadata:
  name: order-service
  namespace: org-ecommerce-prod
spec:
  type: ClusterIP
  ports:
  - port: 80
    targetPort: 8080
    protocol: TCP
    name: http
  selector:
    app: order-service
`
  )

  fs.writeFileSync(
    path.join(k8sDir, "ingress.yaml"),
    `apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ecommerce-gateway
  namespace: org-ecommerce-prod
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
spec:
  ingressClassName: nginx
  tls:
  - hosts:
    - api.acme-ecommerce.com
    secretName: ecommerce-gateway-tls
  rules:
  - host: api.acme-ecommerce.com
    http:
      paths:
      - path: /orders
        pathType: Prefix
        backend:
          service:
            name: order-service
            port:
              number: 80
`
  )

  fs.writeFileSync(
    path.join(k8sDir, "secrets.yaml"),
    `apiVersion: v1
kind: Secret
metadata:
  name: order-db-secret
  namespace: org-ecommerce-prod
type: Opaque
stringData:
  DB_HOST: "postgres-db-service"
  DB_USER: "ecommerce_admin"
  DB_PASSWORD: "order-prod-super-secret-password-key"
`
  )

  // 3. Terraform Resource File
  const tfDir = path.join(targetDir, "terraform")
  fs.mkdirSync(tfDir, { recursive: true })

  fs.writeFileSync(
    path.join(tfDir, "database.tf"),
    `resource "aws_db_instance" "postgres_db" {
  identifier           = "ecommerce-prod-orders-db"
  allocated_storage    = 20
  max_allocated_storage = 100
  engine               = "postgres"
  engine_version       = "15.4"
  instance_class       = "db.t4g.medium"
  db_name              = "orders"
  username             = "ecommerce_admin"
  password             = "order-prod-super-secret-password-key"
  
  vpc_security_group_ids = [aws_security_group.db_sg.id]
  db_subnet_group_name   = aws_db_subnet_group.db_subnet.name
  skip_final_snapshot    = true
}

resource "aws_security_group" "db_sg" {
  name        = "ecommerce-prod-db-sg"
  description = "Allow inbound PostgreSQL access from EKS nodes"
  vpc_id      = "vpc-0985dfc1d8ad2"

  ingress {
    description = "PostgreSQL port"
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = ["10.0.0.0/16"]
  }
}
`
  )

  // 4. Github Actions workflow
  const githubDir = path.join(targetDir, ".github", "workflows")
  fs.mkdirSync(githubDir, { recursive: true })

  fs.writeFileSync(
    path.join(githubDir, "ci-cd.yaml"),
    `name: DevOps E-Commerce Pipeline

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  audit-and-build:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4

    - name: Run Lint checks
      run: npm run lint --if-present

    - name: Docker login
      uses: docker/login-action@v3
      with:
        registry: ghcr.io
        username: \${{ github.actor }}
        password: \${{ secrets.GITHUB_TOKEN }}

    - name: Build and push order-service
      uses: docker/build-push-action@v5
      with:
        context: .
        push: true
        tags: ghcr.io/acme-org/order-service:v2.4.1
`
  )
}
