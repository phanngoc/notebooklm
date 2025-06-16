import { NextRequest, NextResponse } from "next/server"
import { writeFile, mkdir } from "fs/promises"
import { join, extname } from "path"
import { randomUUID } from "crypto"

export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const { projectId } = params
    
    // Get the form data
    const data = await request.formData()
    const file: File | null = data.get("image") as unknown as File

    if (!file) {
      return NextResponse.json(
        { error: "No image file provided" },
        { status: 400 }
      )
    }

    // Validate file type
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"]
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Only images are allowed." },
        { status: 400 }
      )
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024 // 10MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 10MB." },
        { status: 400 }
      )
    }

    // Convert file to bytes
    const bytes = await file.arrayBuffer()
    const buffer = new Uint8Array(bytes)

    // Generate unique filename
    const fileExtension = extname(file.name) || '.jpg'
    const filename = `${randomUUID()}${fileExtension}`
    
    // Create upload directory path
    const uploadDir = join(process.cwd(), "public", "uploads", projectId)
    
    // Ensure upload directory exists
    try {
      await mkdir(uploadDir, { recursive: true })
    } catch (error) {
      console.error("Error creating upload directory:", error)
    }

    // Full file path
    const filePath = join(uploadDir, filename)

    // Write file to disk
    await writeFile(filePath, buffer)

    // Return the public URL
    const imageUrl = `/uploads/${projectId}/${filename}`

    return NextResponse.json({
      imageUrl,
      filename,
      size: file.size,
      type: file.type
    })

  } catch (error) {
    console.error("Error uploading image:", error)
    return NextResponse.json(
      { error: "Failed to upload image" },
      { status: 500 }
    )
  }
}

// Add CORS headers if needed
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}
