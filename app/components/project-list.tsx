"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface Project {
  id: string
  name: string
  description: string
  created_at: string
}

export default function ProjectList({ userId }: { userId: string }) {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const response = await fetch(`/api/projects`)
        const data = await response.json()
        console.log("Fetched projects:", data)
        setProjects(data)
      } catch (error) {
        console.error("Error fetching projects:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchProjects()
  }, [userId])

  const handleCreateProject = async () => {
    try {
      setLoading(true)
      
      // Generate a unique project name
      const now = new Date()
      const projectName = `Project ${now.toLocaleDateString()} ${now.toLocaleTimeString()}`
      
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: projectName,
          description: "A new project created automatically",
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to create project")
      }

      const newProject = await response.json()
      console.log("Created new project:", newProject)
      
      // Redirect to the new project
      router.push(`/${newProject.id}`)
    } catch (error) {
      console.error("Error creating project:", error)
      // Fallback to the original behavior if creation fails
      router.push("/projects/new")
    } finally {
      setLoading(false)
    }
  }

  const handleProjectClick = (projectId: string) => {
    router.push(`/${projectId}`)
  }

  if (loading) {
    return <div>Loading projects...</div>
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">My Projects</h1>
        <Button onClick={handleCreateProject} disabled={loading}>
          <Plus className="mr-2 h-4 w-4" />
          {loading ? "Creating..." : "New Project"}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {projects.map((project) => (
          <Card
            key={project.id}
            className="cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => handleProjectClick(project.id)}
          >
            <CardHeader>
              <CardTitle>{project.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">{project.description}</p>
              <p className="text-sm text-gray-500 mt-2">
                Created: {new Date(project.created_at).toLocaleDateString()}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
} 