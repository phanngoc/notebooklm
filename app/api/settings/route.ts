import { NextRequest, NextResponse } from "next/server"
import { getSessionFromRequest } from "@/lib/session"
import { dbService } from "@/lib/database"

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionFromRequest(request)
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const settings = await dbService.getUserSettings(user.id)

    return NextResponse.json({
      success: true,
      settings
    })

  } catch (error) {
    console.error("Error fetching settings:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch settings" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionFromRequest(request)
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { key, value, description, isEncrypted } = await request.json()

    if (!key) {
      return NextResponse.json({ error: "Setting key is required" }, { status: 400 })
    }

    const setting = await dbService.upsertUserSetting(
      user.id, 
      key, 
      value || "", 
      description,
      isEncrypted || false
    )

    return NextResponse.json({
      success: true,
      setting
    })

  } catch (error) {
    console.error("Error saving setting:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save setting" },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getSessionFromRequest(request)
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const key = searchParams.get('key')

    if (!key) {
      return NextResponse.json({ error: "Setting key is required" }, { status: 400 })
    }

    await dbService.deleteUserSetting(user.id, key)

    return NextResponse.json({
      success: true,
      message: "Setting deleted successfully"
    })

  } catch (error) {
    console.error("Error deleting setting:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete setting" },
      { status: 500 }
    )
  }
}
