import { cookies } from "next/headers"
import type { NextRequest } from "next/server"
import { createHash, randomBytes } from "crypto"

const SESSION_SECRET = process.env.NEXTAUTH_SECRET || "your-secret-key"

export interface SessionUser {
  id: string
  email: string
  name: string
}

interface SessionData {
  user: SessionUser
  expires: number
  signature: string
}

function createSignature(data: string): string {
  return createHash("sha256")
    .update(data + SESSION_SECRET)
    .digest("hex")
}

function verifySignature(data: string, signature: string): boolean {
  const expectedSignature = createSignature(data)
  return expectedSignature === signature
}

export async function createSession(user: SessionUser) {
  const expires = Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 days
  const sessionId = randomBytes(32).toString("hex")

  const sessionData = {
    user,
    expires,
    sessionId,
  }

  const dataString = JSON.stringify(sessionData)
  const signature = createSignature(dataString)

  const token = Buffer.from(JSON.stringify({ data: dataString, signature })).toString("base64")

  const cookieStore = await cookies()
  cookieStore.set("session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  })

  return token
}

export async function getSession(): Promise<SessionUser | null> {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get("session")?.value

    if (!token) return null

    const decoded = JSON.parse(Buffer.from(token, "base64").toString())
    const { data, signature } = decoded

    if (!verifySignature(data, signature)) {
      return null
    }

    const sessionData: SessionData = JSON.parse(data)

    if (Date.now() > sessionData.expires) {
      return null
    }

    return sessionData.user
  } catch (error) {
    console.error("Session verification error:", error)
    return null
  }
}

export async function getSessionFromRequest(request: NextRequest): Promise<SessionUser | null> {
  try {
    const token = request.cookies.get("session")?.value

    if (!token) return null

    const decoded = JSON.parse(Buffer.from(token, "base64").toString())
    const { data, signature } = decoded

    if (!verifySignature(data, signature)) {
      return null
    }

    const sessionData: SessionData = JSON.parse(data)

    if (Date.now() > sessionData.expires) {
      return null
    }

    return sessionData.user
  } catch (error) {
    console.error("Session verification error:", error)
    return null
  }
}

export async function destroySession() {
  const cookieStore = await cookies()
  cookieStore.delete("session")
}
