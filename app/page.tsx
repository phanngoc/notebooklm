"use client"

import { useAuth } from "@/hooks/use-auth"
import { useAppStore } from "@/hooks/use-app-store"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import ProjectList from "@/app/components/project-list"
import { Button } from "@/components/ui/button"
import { Loader2, ArrowLeft, User, LogOut } from "lucide-react"

export default function Home() {
  const { user, loading, logout } = useAuth()
  const { projectName, userName, navigateBack, setProjectName, setUserName } = useAppStore()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login")
    }
  }, [user, loading, router])

  const handleBack = () => {
    navigateBack(router)
  }

  const handleSignOut = async () => {
    await logout()
    router.push("/login")
  }

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-lg">Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  return (
    <ProjectList userId={user.id} />
  )
}
