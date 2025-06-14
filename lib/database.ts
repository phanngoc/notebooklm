import type { Document, ChatMessage, Note } from "@/types"
import { createServerClient } from "./supabase"

export class DatabaseService {
  private supabase = createServerClient()
  
  async getUserProfile(userId: string) {
    try {
      return await this.supabase.from("profiles").select("id, email, full_name").eq("id", userId).single()
    } catch (error) {
      console.error("Error fetching user profile:", error)
      throw error
    }
  }

  // Projects list
  async getProjects(userId: string) {
    try {
      const { data, error } = await this.supabase
        .from("projects")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
      if (error) {
        console.error("Error fetching projects:", error)
        throw error
      }
      return data || []
    } catch (error) {
      console.error("Error fetching projects:", error)
      throw error
    }
  }

  // create project
  async createProject(userId: string, name: string, description?: string) {
    try {
      const { data, error } = await this.supabase
        .from("projects")
        .insert({
          user_id: userId,
          name: name || "New Project",
          description: description || "A new project",
        })
        .select()
        .single()

      if (error) {
        console.error("Error creating project:", error)
        throw error
      }
      return data
    } catch (error) {
      console.error("Error creating project:", error)
      throw error
    }
  }

  // Projects operations
  async getProject(projectId: string, userId: string) {
    try {
      const { data, error } = await this.supabase
        .from("projects")
        .select("*")
        .eq("id", projectId)
        .eq("user_id", userId)
        .single()

      if (error) {
        console.error("Error fetching project:", error)
        throw error
      }

      return data
    } catch (error) {
      console.error("Error fetching project:", error)
      throw error
    }
  }

  // Sources operations
  async getSources(userId: string, projectId?: string): Promise<Document[]> {
    try {
      let query = this.supabase
        .from("sources")
        .select("*")
        .eq("user_id", userId)

      if (projectId) {
        query = query.eq("project_id", projectId)
      }

      const { data, error } = await query.order("created_at", { ascending: false })

      if (error) {
        console.error("Error fetching sources:", error)
        throw error
      }

      return (data || []).map((source) => ({
        id: source.id,
        title: source.title,
        type: source.type,
        content: source.content,
        url: source.url || undefined,
        selected: false,
        createdAt: new Date(source.created_at),
      }))
    } catch (error) {
      console.error("Error fetching sources:", error)
      throw error
    }
  }

  async addSource(userId: string, source: Omit<Document, "id" | "selected" | "createdAt">, projectId?: string) {
    try {
      const { data, error } = await this.supabase
        .from("sources")
        .insert({
          user_id: userId,
          title: source.title,
          type: source.type,
          content: source.content,
          url: source.url,
          project_id: projectId,
        })
        .select()
        .single()

      if (error) {
        console.error("Error adding source:", error)
        throw error
      }
      return data
    } catch (error) {
      console.error("Error adding source:", error)
      throw error
    }
  }

  async deleteSource(sourceId: string) {
    try {
      const { error } = await this.supabase.from("sources").delete().eq("id", sourceId)
      if (error) {
        console.error("Error deleting source:", error)
        throw error
      }
      return { success: true }
    } catch (error) {
      console.error("Error deleting source:", error)
      throw error
    }
  }

  // Chat operations
  async getChatSessions(userId: string, projectId?: string) {
    try {
      let query = this.supabase
        .from("chat_sessions")
        .select("*")
        .eq("user_id", userId)

      if (projectId) {
        query = query.eq("project_id", projectId)
      }

      const { data, error } = await query.order("updated_at", { ascending: false })

      if (error) {
        console.error("Error fetching chat sessions:", error)
        throw error
      }
      return data || []
    } catch (error) {
      console.error("Error fetching chat sessions:", error)
      throw error
    }
  }

  async createChatSession(userId: string, title?: string, projectId?: string) {
    try {
      const { data, error } = await this.supabase
        .from("chat_sessions")
        .insert({
          user_id: userId,
          title: title || "New Chat",
          project_id: projectId,
        })
        .select()
        .single()

      if (error) {
        console.error("Error creating chat session:", error)
        throw error
      }
      return data
    } catch (error) {
      console.error("Error creating chat session:", error)
      throw error
    }
  }

  async updateChatSession(sessionId: string, updates: { title?: string }) {
    try {
      const { data, error } = await this.supabase
        .from("chat_sessions")
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq("id", sessionId)
        .select()
        .single()

      if (error) {
        console.error("Error updating chat session:", error)
        throw error
      }
      return data
    } catch (error) {
      console.error("Error updating chat session:", error)
      throw error
    }
  }

  async getChatMessages(sessionId: string): Promise<ChatMessage[]> {
    try {
      const { data, error } = await this.supabase
        .from("chat_messages")
        .select("*")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true })

      if (error) {
        console.error("Error fetching chat messages:", error)
        throw error
      }

      return (data || []).map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        timestamp: new Date(message.created_at),
        sources: message.sources || [],
      }))
    } catch (error) {
      console.error("Error fetching chat messages:", error)
      throw error
    }
  }

  async addChatMessage(sessionId: string, message: Omit<ChatMessage, "id" | "timestamp">) {
    try {
      const { data, error } = await this.supabase
        .from("chat_messages")
        .insert({
          session_id: sessionId,
          role: message.role,
          content: message.content,
          sources: message.sources || [],
        })
        .select()
        .single()

      if (error) {
        console.error("Error adding chat message:", error)
        throw error
      }

      // Update the session's updated_at timestamp
      await this.updateChatSession(sessionId, {})

      return data
    } catch (error) {
      console.error("Error adding chat message:", error)
      throw error
    }
  }

  // Notes operations
  async getNotes(userId: string, projectId?: string): Promise<Note[]> {
    try {
      let query = this.supabase
        .from("notes")
        .select("*")
        .eq("user_id", userId)

      if (projectId) {
        query = query.eq("project_id", projectId)
      }

      const { data, error } = await query.order("created_at", { ascending: false })

      if (error) {
        console.error("Error fetching notes:", error)
        throw error
      }

      return (data || []).map((note) => ({
        id: note.id,
        title: note.title,
        content: note.content,
        createdAt: new Date(note.created_at),
      }))
    } catch (error) {
      console.error("Error fetching notes:", error)
      throw error
    }
  }

  async getNote(noteId: string): Promise<Note | null> {
    try {
      const { data, error } = await this.supabase
        .from("notes")
        .select("*")
        .eq("id", noteId)
        .single()

      if (error) {
        if (error.code === 'PGRST116') {
          // No rows returned
          return null
        }
        console.error("Error fetching note:", error)
        throw error
      }

      return {
        id: data.id,
        title: data.title,
        content: data.content,
        createdAt: new Date(data.created_at),
      }
    } catch (error) {
      console.error("Error fetching note:", error)
      throw error
    }
  }

  async addNote(userId: string, note: Omit<Note, "id" | "createdAt">, sourceIds: string[] = [], projectId?: string) {
    try {
      const { data, error } = await this.supabase
        .from("notes")
        .insert({
          user_id: userId,
          title: note.title,
          content: note.content,
          source_ids: sourceIds,
          project_id: projectId,
        })
        .select()
        .single()

      if (error) {
        console.error("Error adding note:", error)
        throw error
      }
      return data
    } catch (error) {
      console.error("Error adding note:", error)
      throw error
    }
  }

  async updateNote(noteId: string, updates: { title?: string; content?: string; sourceIds?: string[] }) {
    try {
      const updateData: any = { ...updates }

      if (updates.sourceIds) {
        updateData.source_ids = updates.sourceIds
        delete updateData.sourceIds
      }

      const { data, error } = await this.supabase
        .from("notes")
        .update({
          ...updateData,
          updated_at: new Date().toISOString(),
        })
        .eq("id", noteId)
        .select()
        .single()

      if (error) {
        console.error("Error updating note:", error)
        throw error
      }
      return data
    } catch (error) {
      console.error("Error updating note:", error)
      throw error
    }
  }

  async deleteNote(noteId: string) {
    try {
      const { error } = await this.supabase.from("notes").delete().eq("id", noteId)
      if (error) {
        console.error("Error deleting note:", error)
        throw error
      }
      return { success: true }
    } catch (error) {
      console.error("Error deleting note:", error)
      throw error
    }
  }
}

export const dbService = new DatabaseService()
