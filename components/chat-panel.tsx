"use client"

import type React from "react"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import type { Document, ChatMessage } from "@/types"
import { Send, User, Bot, Plus } from "lucide-react"

interface ChatPanelProps {
  messages: ChatMessage[]
  documents: Document[]
  onSendMessage: (content: string) => void
  isLoading: boolean
  onNewChat: () => void
  sessionId: string | null
}

export function ChatPanel({ messages, documents, onSendMessage, isLoading, onNewChat, sessionId }: ChatPanelProps) {
  const [input, setInput] = useState("")
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSend = async () => {
    if (!input.trim() || documents.length === 0 || isLoading) return

    const userMessage = input.trim()
    setInput("")

    await onSendMessage(userMessage)
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex-1 flex flex-col bg-white">
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Chat</h2>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={onNewChat} disabled={isLoading}>
              <Plus className="w-4 h-4 mr-2" />
              New Chat
            </Button>
            <span className="text-sm text-gray-500">{documents.length} sources selected</span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-gray-500">
              <Bot className="w-12 h-12 mx-auto mb-4 text-gray-400" />
              <h3 className="text-lg font-medium mb-2">Start a conversation</h3>
              <p className="text-sm">Ask questions about your selected documents and I'll help you find answers.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <Card
                  className={`max-w-[80%] p-4 ${message.role === "user" ? "bg-blue-600 text-white" : "bg-gray-50"}`}
                >
                  <div className="flex items-start gap-3">
                    {message.role === "assistant" && <Bot className="w-5 h-5 text-gray-600 mt-0.5 flex-shrink-0" />}
                    {message.role === "user" && <User className="w-5 h-5 text-white mt-0.5 flex-shrink-0" />}
                    <div className="flex-1">
                      <div className="whitespace-pre-wrap text-sm">{message.content}</div>
                      <div className="text-xs opacity-70 mt-2">{message.timestamp.toLocaleTimeString()}</div>
                      {message.sources && message.sources.length > 0 && (
                        <div className="text-xs mt-2 text-gray-500">
                          Sources: {message.sources.length} document{message.sources.length > 1 ? "s" : ""}
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <Card className="bg-gray-50 p-4">
                  <div className="flex items-center gap-3">
                    <Bot className="w-5 h-5 text-gray-600" />
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                      <div
                        className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                        style={{ animationDelay: "0.1s" }}
                      ></div>
                      <div
                        className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                        style={{ animationDelay: "0.2s" }}
                      ></div>
                    </div>
                  </div>
                </Card>
              </div>
            )}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 border-t border-gray-200">
        <div className="flex gap-2">
          <Input
            placeholder={
              documents.length === 0
                ? "Select documents first to start chatting..."
                : "Ask a question about your documents..."
            }
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={documents.length === 0 || isLoading}
            className="flex-1"
          />
          <Button onClick={handleSend} disabled={!input.trim() || documents.length === 0 || isLoading}>
            <Send className="w-4 h-4" />
          </Button>
        </div>
        {documents.length === 0 && (
          <p className="text-xs text-gray-500 mt-2">
            Please select at least one document from the Sources panel to start chatting.
          </p>
        )}
      </div>
    </div>
  )
}
