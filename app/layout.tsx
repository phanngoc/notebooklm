import type React from "react"
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { Toaster } from "@/components/ui/toaster"
import { AuthProvider } from "@/hooks/use-auth"
import Header from "@/components/header"
import ClientLayout from "@/components/client-layout"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "NotebookLLM",
  description: "AI-powered document analysis and chat interface",
    generator: 'v0.dev'
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <AuthProvider>
          <ClientLayout>
            <div className="flex flex-col h-screen bg-gray-50">
              <Header />
              {children}
              <Toaster />
            </div>
          </ClientLayout>
        </AuthProvider>
      </body>
    </html>
  )
}
