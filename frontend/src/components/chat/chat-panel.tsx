"use client";

import { useState, useRef, useEffect } from "react";
import {
  Send,
  Bot,
  User,
  Loader2,
  Sparkles,
  Terminal,
  Copy,
  Check,
  MessageSquare,
  Plus,
  Clock,
  PanelLeftClose,
  PanelLeftOpen,
  Paperclip,
  X,
  FileText,
  Upload,
  Trash2,
  Pencil,
  RotateCcw,
  Download,
  SmilePlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { MarkdownContent } from "@/components/ui/markdown-renderer";
import { useAppStore } from "@/stores/app-store";
import { ChatSkeleton } from "@/components/chat/chat-skeleton";
import { useVirtualList } from "@/hooks/use-virtual-list";
import { useTranslation } from "@/hooks/use-translation";
import type { Message } from "@/types";
import { cn } from "@/lib/utils";

const REACTIONS = ["👍", "👎", "❤️", "🎉", "🤔", "👀"];

function ChatMessage({
  message,
  onRetry,
  reactions,
  onReact,
}: {
  message: Message;
  onRetry?: (content: string) => void;
  reactions?: Record<string, number>;
  onReact?: (emoji: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isSystem) {
    return (
      <div className="flex justify-center my-2">
        <div className="bg-muted/50 rounded-full px-3 py-1 flex items-center gap-1.5">
          <Terminal className="h-3 w-3 text-muted-foreground" />
          <span className="text-[11px] text-muted-foreground">
            {message.content}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex gap-3 my-4 group/msg",
        isUser ? "flex-row-reverse" : "flex-row"
      )}
    >
      <div
        className={cn(
          "h-8 w-8 rounded-full flex items-center justify-center shrink-0",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-gradient-to-br from-violet-500 to-indigo-600 text-white"
        )}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>

      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-4 py-3 relative",
          isUser
            ? "bg-primary text-primary-foreground rounded-tr-sm"
            : "bg-muted rounded-tl-sm"
        )}
      >
        {/* Action buttons */}
        <div className="absolute top-2 right-2 flex items-center gap-0.5 opacity-0 group-hover/msg:opacity-100 transition-opacity">
          {isUser && onRetry && (
            <button
              onClick={() => onRetry(message.content)}
              className={cn(
                "h-6 w-6 rounded-md flex items-center justify-center",
                "hover:bg-primary-foreground/10 text-primary-foreground/60"
              )}
              title="Resend"
            >
              <RotateCcw className="h-3 w-3" />
            </button>
          )}
          <button
            onClick={handleCopy}
            className={cn(
              "h-6 w-6 rounded-md flex items-center justify-center",
              isUser
                ? "hover:bg-primary-foreground/10 text-primary-foreground/60"
                : "hover:bg-background/50 text-muted-foreground"
            )}
            title="Copy"
          >
            {copied ? (
              <Check className="h-3 w-3" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
          </button>
        </div>

        {isUser ? (
          <p className="text-sm whitespace-pre-wrap pr-6">{message.content}</p>
        ) : (
          <div className="pr-6">
            <MarkdownContent content={message.content} />
          </div>
        )}
        {message.phase && (
          <Badge
            variant="outline"
            className="text-[10px] mt-2 px-1.5 py-0"
          >
            {message.phase}
          </Badge>
        )}
        <div className="flex items-center justify-between mt-1.5">
          <p
            className={cn(
              "text-[10px]",
              isUser ? "text-primary-foreground/60" : "text-muted-foreground"
            )}
          >
            {new Date(message.created_at).toLocaleTimeString()}
          </p>
          {!isUser && onReact && (
            <div className="relative">
              <button
                onClick={() => setShowReactions(!showReactions)}
                className="h-5 w-5 rounded flex items-center justify-center hover:bg-background/30 text-muted-foreground/50 hover:text-muted-foreground transition-colors opacity-0 group-hover/msg:opacity-100"
              >
                <SmilePlus className="h-3 w-3" />
              </button>
              {showReactions && (
                <div className="absolute bottom-full right-0 mb-1 flex items-center gap-0.5 bg-card border border-border rounded-lg shadow-lg p-1 z-10">
                  {REACTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => { onReact(emoji); setShowReactions(false); }}
                      className="h-7 w-7 rounded hover:bg-accent transition-colors flex items-center justify-center text-sm"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Reactions display */}
        {reactions && Object.keys(reactions).length > 0 && (
          <div className="flex items-center gap-1 mt-1.5 flex-wrap">
            {Object.entries(reactions).map(([emoji, count]) => (
              <button
                key={emoji}
                onClick={() => onReact?.(emoji)}
                className={cn(
                  "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] border transition-colors",
                  isUser
                    ? "border-primary-foreground/20 hover:border-primary-foreground/40"
                    : "border-border hover:border-primary/50 hover:bg-primary/5"
                )}
              >
                <span>{emoji}</span>
                {count > 1 && (
                  <span className={cn("font-medium", isUser ? "text-primary-foreground/70" : "text-muted-foreground")}>
                    {count}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function VirtualizedChatMessages({
  messages,
  messageReactions,
  setInput,
  setMessageReactions,
}: {
  messages: Message[];
  messageReactions: Record<number, Record<string, number>>;
  setInput: (v: string) => void;
  setMessageReactions: React.Dispatch<React.SetStateAction<Record<number, Record<string, number>>>>;
}) {
  const useVirtual = messages.length > 50;
  const { parentRef, virtualItems, totalSize } = useVirtualList({
    count: messages.length,
    estimateSize: () => 120,
    overscan: 10,
    enabled: useVirtual,
  });

  const renderMsg = (msg: Message) => (
    <ChatMessage
      key={msg.id}
      message={msg}
      onRetry={(content) => setInput(content)}
      reactions={messageReactions[msg.id]}
      onReact={(emoji) => {
        setMessageReactions((prev) => {
          const msgReactions = { ...(prev[msg.id] || {}) };
          msgReactions[emoji] = (msgReactions[emoji] || 0) + 1;
          return { ...prev, [msg.id]: msgReactions };
        });
      }}
    />
  );

  if (!useVirtual) {
    return <>{messages.map((msg) => renderMsg(msg))}</>;
  }

  return (
    <div ref={parentRef} className="flex-1 overflow-auto">
      <div className="relative w-full" style={{ height: `${totalSize}px` }}>
        {virtualItems.map((virtualItem) => (
          <div
            key={messages[virtualItem.index].id}
            className="absolute top-0 left-0 w-full"
            style={{
              height: `${virtualItem.size}px`,
              transform: `translateY(${virtualItem.start}px)`,
            }}
          >
            {renderMsg(messages[virtualItem.index])}
          </div>
        ))}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex gap-3 my-4">
      <div className="h-8 w-8 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center animate-pulse">
        <Bot className="h-4 w-4 text-white" />
      </div>
      <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full bg-gradient-to-r from-violet-400 to-indigo-500 animate-bounce" style={{ animationDelay: "0ms", animationDuration: "0.8s" }} />
            <div className="h-2.5 w-2.5 rounded-full bg-gradient-to-r from-indigo-400 to-blue-500 animate-bounce" style={{ animationDelay: "200ms", animationDuration: "0.8s" }} />
            <div className="h-2.5 w-2.5 rounded-full bg-gradient-to-r from-blue-400 to-cyan-500 animate-bounce" style={{ animationDelay: "400ms", animationDuration: "0.8s" }} />
          </div>
          <span className="text-xs text-muted-foreground">
            <span className="bg-gradient-to-r from-violet-400 to-blue-400 bg-clip-text text-transparent font-medium">
              AI is thinking
            </span>
            <span className="animate-pulse">...</span>
          </span>
        </div>
      </div>
    </div>
  );
}

function ConversationList({
  conversations,
  activeId,
  onSelect,
  onCreate,
  onClose,
  onDelete,
  onRename,
}: {
  conversations: { id: number; title: string; created_at: string; status: string }[];
  activeId: number | null;
  onSelect: (id: number | null) => void;
  onCreate: () => void;
  onClose: () => void;
  onDelete: (id: number) => void;
  onRename: (id: number, title: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");

  const filtered = conversations.filter((c) =>
    !search || (c.title || `Chat #${c.id}`).toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="w-64 border-r border-border flex flex-col h-full bg-muted/20">
      <div className="p-3 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Conversations
            <span className="ml-1 text-muted-foreground/50">({conversations.length})</span>
          </h3>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onCreate}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
              <PanelLeftClose className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search conversations..."
          className="w-full px-2.5 py-1.5 rounded-md border border-border bg-background text-xs outline-none focus:ring-1 focus:ring-primary/50"
        />
      </div>

      <ScrollArea className="flex-1">
        <div className="p-1.5 space-y-0.5">
          {/* Quick Chat option */}
          <button
            onClick={() => onSelect(null)}
            className={cn(
              "w-full text-left px-3 py-2.5 rounded-lg text-xs transition-colors",
              activeId === null
                ? "bg-primary/10 text-primary font-medium"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            )}
          >
            <div className="flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">Quick Chat</span>
            </div>
          </button>

          {filtered.map((conv) => (
            <div
              key={conv.id}
              className={cn(
                "group/conv flex items-center rounded-lg text-xs transition-colors",
                activeId === conv.id
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-foreground hover:bg-accent"
              )}
            >
              <button
                onClick={() => onSelect(conv.id)}
                onDoubleClick={(e) => {
                  e.preventDefault();
                  setEditingId(conv.id);
                  setEditTitle(conv.title || `Chat #${conv.id}`);
                }}
                className="flex-1 text-left px-3 py-2.5 min-w-0"
              >
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  {editingId === conv.id ? (
                    <input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          onRename(conv.id, editTitle.trim() || `Chat #${conv.id}`);
                          setEditingId(null);
                        }
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      onBlur={() => {
                        if (editTitle.trim()) onRename(conv.id, editTitle.trim());
                        setEditingId(null);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="flex-1 bg-background border border-border rounded px-1.5 py-0.5 text-xs outline-none focus:ring-1 focus:ring-primary/50 min-w-0"
                      autoFocus
                    />
                  ) : (
                    <span className="truncate">{conv.title || `Chat #${conv.id}`}</span>
                  )}
                </div>
                {editingId !== conv.id && (
                  <div className="flex items-center gap-1 mt-1 ml-5.5">
                    <Clock className="h-2.5 w-2.5 text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(conv.created_at).toLocaleDateString()}
                    </span>
                  </div>
                )}
              </button>
              <div className="flex flex-col opacity-0 group-hover/conv:opacity-100 transition-opacity shrink-0">
                <button
                  onClick={(e) => { e.stopPropagation(); setEditingId(conv.id); setEditTitle(conv.title || `Chat #${conv.id}`); }}
                  className="px-1.5 py-0.5 text-muted-foreground hover:text-foreground"
                  title="Rename"
                >
                  <Pencil className="h-2.5 w-2.5" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(conv.id); }}
                  className="px-1.5 py-0.5 text-muted-foreground hover:text-red-500"
                  title="Delete"
                >
                  <Trash2 className="h-2.5 w-2.5" />
                </button>
              </div>
            </div>
          ))}

          {filtered.length === 0 && search && (
            <p className="text-[10px] text-muted-foreground text-center py-4">
              No conversations found
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

export function ChatPanel() {
  const {
    activeConversationId,
    conversationMessages,
    chatLoading,
    sendConversationMessage,
    quickChat,
    createConversation,
    deleteConversation,
    renameConversation,
    conversations,
    selectConversation,
    setActivePanel,
    addToast,
    loading,
  } = useAppStore();

  if (loading) return <ChatSkeleton />;

  const { t } = useTranslation();
  const [input, setInput] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [stagedFiles, setStagedFiles] = useState<{ name: string; size: number; content: string }[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [messageReactions, setMessageReactions] = useState<Record<number, Record<string, number>>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [conversationMessages]);

  const readFileAsText = (file: File): Promise<string> =>
    new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => resolve(`[Error reading ${file.name}]`);
      reader.readAsText(file);
    });

  const handleFilesAdded = async (files: FileList | File[]) => {
    const newFiles: { name: string; size: number; content: string }[] = [];
    for (const file of Array.from(files)) {
      if (file.size > 500_000) continue; // Skip files over 500KB
      const content = await readFileAsText(file);
      newFiles.push({ name: file.name, size: file.size, content });
    }
    setStagedFiles((prev) => [...prev, ...newFiles]);
  };

  const removeStagedFile = (index: number) => {
    setStagedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      handleFilesAdded(e.dataTransfer.files);
    }
  };

  const handleSend = async () => {
    let text = input.trim();
    // Append file contents to message
    if (stagedFiles.length > 0) {
      const fileContext = stagedFiles
        .map((f) => `--- ${f.name} ---\n${f.content}`)
        .join("\n\n");
      text = text
        ? `${text}\n\n[Attached Files]\n${fileContext}`
        : `[Attached Files]\n${fileContext}`;
      setStagedFiles([]);
    }
    if (!text || chatLoading) return;
    setInput("");

    if (activeConversationId) {
      await sendConversationMessage(activeConversationId, text);
    } else {
      await quickChat(text);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const activeConversation = conversations.find((c) => c.id === activeConversationId);

  return (
    <div className="flex h-full">
      {/* Conversation sidebar */}
      {sidebarOpen && (
        <ConversationList
          conversations={conversations}
          activeId={activeConversationId}
          onSelect={(id) => selectConversation(id)}
          onCreate={() => createConversation()}
          onClose={() => setSidebarOpen(false)}
          onDelete={(id) => {
            deleteConversation(id);
            addToast({ type: "info", title: "Conversation deleted" });
          }}
          onRename={(id, title) => {
            renameConversation(id, title);
          }}
        />
      )}

      {/* Main chat area */}
      <div
        className="flex flex-col flex-1 min-w-0 relative"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Drag overlay */}
        {dragOver && (
          <div className="absolute inset-0 z-50 bg-primary/10 border-2 border-dashed border-primary rounded-lg flex items-center justify-center backdrop-blur-sm">
            <div className="text-center">
              <Upload className="h-10 w-10 text-primary mx-auto mb-2" />
              <p className="text-sm font-medium text-primary">Drop files here</p>
              <p className="text-xs text-muted-foreground">Text files up to 500KB</p>
            </div>
          </div>
        )}
        {/* Chat header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            {!sidebarOpen && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => setSidebarOpen(true)}
              >
                <PanelLeftOpen className="h-4 w-4" />
              </Button>
            )}
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">
                {activeConversation?.title || "AI Assistant"}
              </h2>
              <p className="text-[10px] text-muted-foreground">
                {activeConversationId
                  ? `Conversation #${activeConversationId}`
                  : "Quick Chat - ask anything"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {conversationMessages.length > 0 && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title="Export conversation"
                onClick={() => {
                  const title = activeConversation?.title || "Quick Chat";
                  const md = conversationMessages
                    .map((m) => `### ${m.role === "user" ? "You" : m.role === "assistant" ? "AI" : "System"}\n\n${m.content}\n\n---`)
                    .join("\n\n");
                  const content = `# ${title}\n\nExported: ${new Date().toLocaleString()}\n\n---\n\n${md}`;
                  const blob = new Blob([content], { type: "text/markdown" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `${title.replace(/[^a-zA-Z0-9]/g, "-")}.md`;
                  a.click();
                  URL.revokeObjectURL(url);
                  addToast({ type: "success", title: "Conversation exported" });
                }}
              >
                <Download className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => createConversation()}
              className="text-xs gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              New Chat
            </Button>
          </div>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 p-4" ref={scrollRef}>
          {conversationMessages.length === 0 && !activeConversationId && (
            <div className="flex flex-col items-center justify-center h-full text-center py-20">
              <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-violet-500/20 to-indigo-600/20 flex items-center justify-center mb-4">
                <Bot className="h-8 w-8 text-violet-400" />
              </div>
              <h3 className="text-lg font-semibold mb-2">{t("chat.title")}</h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                Describe what you want to build. I&apos;ll analyze your request,
                create issues, generate code, and manage the entire development
                process.
              </p>
              <div className="grid grid-cols-2 gap-2 mt-6 max-w-sm">
                {[
                  "Build a REST API for a todo app",
                  "Fix the login bug in auth module",
                  "Add dark mode to the dashboard",
                  "Create unit tests for user service",
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => setInput(suggestion)}
                    className="text-left text-xs p-3 rounded-lg border border-border hover:bg-accent transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {conversationMessages.length === 0 && activeConversationId && (
            <div className="flex flex-col items-center justify-center h-full text-center py-20">
              <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center mb-4">
                <Sparkles className="h-7 w-7 text-white" />
              </div>
              <h3 className="text-lg font-semibold mb-1">{t("chat.howCanIHelp")}</h3>
              <p className="text-sm text-muted-foreground mb-6">
                Start a conversation or try one of these prompts.
              </p>
              <div className="grid grid-cols-2 gap-2 max-w-md">
                {[
                  { label: "Create a new feature", prompt: "Help me create a new feature for " },
                  { label: "Fix a bug", prompt: "Help me fix a bug in " },
                  { label: "Write unit tests", prompt: "Write comprehensive unit tests for " },
                  { label: "Review my code", prompt: "Review the following code and suggest improvements:\n\n" },
                  { label: "Explain a concept", prompt: "Explain how " },
                  { label: "Start a pipeline", prompt: "Create a new pipeline for: " },
                ].map((suggestion) => (
                  <button
                    key={suggestion.label}
                    onClick={() => setInput(suggestion.prompt)}
                    className="text-left px-3 py-2.5 rounded-lg border border-border hover:border-primary/50 hover:bg-primary/5 transition-all text-xs group"
                  >
                    <span className="font-medium group-hover:text-primary transition-colors">
                      {suggestion.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <VirtualizedChatMessages
            messages={conversationMessages}
            messageReactions={messageReactions}
            setInput={setInput}
            setMessageReactions={setMessageReactions}
          />

          {chatLoading && <TypingIndicator />}
        </ScrollArea>

        {/* Input */}
        <div className="p-4 border-t border-border">
          {/* Staged files */}
          {stagedFiles.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {stagedFiles.map((file, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted border border-border text-xs"
                >
                  <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="truncate max-w-32">{file.name}</span>
                  <span className="text-muted-foreground">
                    ({(file.size / 1024).toFixed(1)}KB)
                  </span>
                  <button
                    onClick={() => removeStagedFile(i)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              multiple
              accept=".txt,.md,.json,.csv,.js,.ts,.tsx,.jsx,.py,.html,.css,.yaml,.yml,.toml,.xml,.sql,.sh,.env,.conf,.cfg"
              onChange={(e) => {
                if (e.target.files) handleFilesAdded(e.target.files);
                e.target.value = "";
              }}
            />
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 h-11 w-11"
              onClick={() => fileInputRef.current?.click()}
              title="Attach files"
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <Textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t("chat.inputPlaceholder")}
              aria-label={t("chat.inputLabel")}
              className="min-h-[44px] max-h-32 resize-none"
              rows={1}
            />
            <Button
              onClick={handleSend}
              disabled={(!input.trim() && stagedFiles.length === 0) || chatLoading}
              size="icon"
              className="shrink-0 h-11 w-11"
              aria-label={t("chat.send")}
            >
              {chatLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
            Press Enter to send, Shift+Enter for new line &middot; Drop files to attach
          </p>
        </div>
      </div>
    </div>
  );
}
