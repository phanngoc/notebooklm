"use client"

import { useRouter, usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ArrowLeft, User, LogOut } from "lucide-react"
import { useAppStore } from "@/hooks/use-app-store"
import { useAuth } from "@/hooks/use-auth"

interface HeaderProps {
  showBackButton?: boolean
  title?: string
}

export default function Header({ showBackButton = true, title = "NotebookLLM" }: HeaderProps) {
  const { user, logout } = useAuth()
  const { projectName, userName, navigateBack } = useAppStore()
  const router = useRouter()
  const pathname = usePathname()

  // Don't show header on auth pages
  const isAuthPage = pathname === "/login" || pathname === "/register"
  
  // Don't show header if user is not authenticated or on auth pages
  if (!user || isAuthPage) {
    return null
  }

  const handleBack = () => {
    navigateBack(router)
  }

  const handleSignOut = async () => {
    await logout()
    router.push("/login")
  }

  return (
    <header className="bg-white border-b border-gray-200 py-2 px-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {showBackButton && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleBack}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
          )}
          <h1 className="text-xl font-bold">{title}</h1>
          {projectName && (
            <div className="text-gray-500">
              <span className="text-sm">•</span>
              <span className="text-sm ml-2">{projectName}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4" />
            <span className="text-sm" onClick={() => router.push('/profile')}>{userName || user.email}</span>
          </div>
          <Button variant="outline" size="sm" onClick={handleSignOut}>
            <LogOut className="w-4 h-4 mr-2" />
            Sign out
          </Button>
        </div>
      </div>
    </header>
  )
}
