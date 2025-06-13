import { NextRequest, NextResponse } from "next/server"
import { getSessionFromRequest } from "@/lib/session"
import { dbService } from "@/lib/database"

export async function GET(req: NextRequest) {
  try {
    const user = await getSessionFromRequest(req)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    
    console.log("[PROJECTS_GET] user:", user)
    const projects = await dbService.getProjects(user.id)
    console.log("[PROJECTS_GET] projects:", projects)
    return NextResponse.json(projects)
  } catch (error) {
    console.error("[PROJECTS_GET]", error)
    return new NextResponse("Internal Error", { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionFromRequest(req)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { name, description } = await req.json()
    
    if (!name) {
      return NextResponse.json({ error: "Project name is required" }, { status: 400 })
    }

    const project = await dbService.createProject(user.id, name, description)
    console.log("[PROJECTS_POST] created project:", project)
    
    return NextResponse.json(project)
  } catch (error) {
    console.error("[PROJECTS_POST]", error)
    return NextResponse.json({ error: "Failed to create project" }, { status: 500 })
  }
} 