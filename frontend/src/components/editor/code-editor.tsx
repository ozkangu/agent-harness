"use client";

import { useState, useCallback } from "react";
import {
  X,
  Copy,
  Check,
  FileCode2,
  Maximize2,
  Minimize2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface FileTab {
  name: string;
  language: string;
  content: string;
}

interface CodeEditorProps {
  files?: FileTab[];
  initialContent?: string;
  language?: string;
  readOnly?: boolean;
  title?: string;
  onClose?: () => void;
  className?: string;
  maxHeight?: string;
}

function getLanguageFromFilename(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const langMap: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    py: "python",
    rs: "rust",
    go: "go",
    rb: "ruby",
    java: "java",
    kt: "kotlin",
    swift: "swift",
    cpp: "cpp",
    c: "c",
    h: "c",
    cs: "csharp",
    php: "php",
    html: "html",
    css: "css",
    scss: "scss",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    md: "markdown",
    sql: "sql",
    sh: "shell",
    bash: "shell",
    dockerfile: "dockerfile",
    toml: "toml",
    xml: "xml",
    graphql: "graphql",
  };
  return langMap[ext] || "plaintext";
}

function SyntaxHighlighter({ code, language }: { code: string; language: string }) {
  // Lightweight syntax highlighting for common patterns
  const lines = code.split("\n");

  const highlightLine = (line: string, lang: string): React.ReactNode => {
    // Comment detection
    if (
      lang === "python" && line.trimStart().startsWith("#") ||
      ["typescript", "javascript", "java", "go", "rust", "c", "cpp", "csharp"].includes(lang) && line.trimStart().startsWith("//")
    ) {
      return <span className="text-zinc-500">{line}</span>;
    }

    // String literals
    let result = line;
    const parts: React.ReactNode[] = [];
    let remaining = result;
    let idx = 0;

    // Keywords for common languages
    const keywords: Record<string, string[]> = {
      typescript: ["import", "export", "from", "const", "let", "var", "function", "return", "if", "else", "for", "while", "class", "interface", "type", "async", "await", "new", "this", "extends", "implements", "default", "switch", "case", "break", "try", "catch", "throw", "finally"],
      javascript: ["import", "export", "from", "const", "let", "var", "function", "return", "if", "else", "for", "while", "class", "async", "await", "new", "this", "extends", "default", "switch", "case", "break", "try", "catch", "throw", "finally"],
      python: ["def", "class", "import", "from", "return", "if", "elif", "else", "for", "while", "try", "except", "finally", "with", "as", "yield", "async", "await", "raise", "pass", "break", "continue", "lambda", "not", "and", "or", "in", "is", "None", "True", "False", "self"],
      go: ["func", "package", "import", "return", "if", "else", "for", "range", "switch", "case", "break", "var", "const", "type", "struct", "interface", "map", "chan", "go", "defer", "select", "nil", "true", "false"],
      rust: ["fn", "let", "mut", "const", "pub", "use", "mod", "struct", "enum", "impl", "trait", "for", "while", "if", "else", "match", "return", "self", "Self", "async", "await", "move", "where", "type", "true", "false"],
    };

    const kwList = keywords[lang] || keywords["typescript"] || [];
    const kwPattern = new RegExp(`\\b(${kwList.join("|")})\\b`, "g");

    // Simple tokenization: keywords, strings, numbers
    const tokens = remaining.split(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g);

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (i % 2 === 1) {
        // String literal
        parts.push(<span key={idx++} className="text-emerald-400">{token}</span>);
      } else {
        // Apply keyword highlighting
        const subParts = token.split(kwPattern);
        for (const sub of subParts) {
          if (kwList.includes(sub)) {
            parts.push(<span key={idx++} className="text-violet-400 font-medium">{sub}</span>);
          } else {
            // Highlight numbers
            const numParts = sub.split(/(\b\d+\.?\d*\b)/g);
            for (const np of numParts) {
              if (/^\d+\.?\d*$/.test(np)) {
                parts.push(<span key={idx++} className="text-amber-400">{np}</span>);
              } else {
                parts.push(<span key={idx++}>{np}</span>);
              }
            }
          }
        }
      }
    }

    return <>{parts}</>;
  };

  return (
    <div className="font-mono text-xs leading-5">
      {lines.map((line, i) => (
        <div key={i} className="flex">
          <span className="inline-block w-10 text-right pr-4 text-zinc-600 select-none shrink-0">
            {i + 1}
          </span>
          <span className="flex-1 whitespace-pre-wrap break-all">
            {highlightLine(line, language)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function CodeEditor({
  files = [],
  initialContent,
  language = "plaintext",
  readOnly = true,
  title,
  onClose,
  className,
  maxHeight = "600px",
}: CodeEditorProps) {
  const [activeFileIdx, setActiveFileIdx] = useState(0);
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // If no files provided but initialContent is given, create a single tab
  const allFiles: FileTab[] =
    files.length > 0
      ? files
      : initialContent
        ? [{ name: title || "file", language, content: initialContent }]
        : [];

  const activeFile = allFiles[activeFileIdx] || null;

  const handleCopy = useCallback(() => {
    if (!activeFile) return;
    navigator.clipboard.writeText(activeFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [activeFile]);

  if (allFiles.length === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        "border border-border rounded-lg overflow-hidden bg-zinc-950",
        expanded && "fixed inset-4 z-50",
        className
      )}
    >
      {/* Title bar */}
      <div className="flex items-center justify-between bg-zinc-900 border-b border-zinc-800 px-3 py-1.5">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="h-3 w-3 rounded-full bg-red-500/80" />
            <div className="h-3 w-3 rounded-full bg-amber-500/80" />
            <div className="h-3 w-3 rounded-full bg-emerald-500/80" />
          </div>
          {title && (
            <span className="text-[11px] text-zinc-400 ml-2">{title}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {readOnly && (
            <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-zinc-500 border-zinc-700">
              READ ONLY
            </Badge>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-zinc-500 hover:text-zinc-300"
            onClick={handleCopy}
          >
            {copied ? (
              <Check className="h-3 w-3 text-emerald-400" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-zinc-500 hover:text-zinc-300"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <Minimize2 className="h-3 w-3" />
            ) : (
              <Maximize2 className="h-3 w-3" />
            )}
          </Button>
          {onClose && (
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 text-zinc-500 hover:text-zinc-300"
              onClick={onClose}
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      {/* File tabs */}
      {allFiles.length > 1 && (
        <div className="flex items-center bg-zinc-900/50 border-b border-zinc-800 overflow-x-auto">
          {allFiles.map((file, idx) => (
            <button
              key={idx}
              onClick={() => setActiveFileIdx(idx)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono border-r border-zinc-800 transition-colors shrink-0",
                idx === activeFileIdx
                  ? "bg-zinc-950 text-zinc-200"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900"
              )}
            >
              <FileCode2 className="h-3 w-3" />
              {file.name}
            </button>
          ))}
        </div>
      )}

      {/* Editor content */}
      {activeFile && (
        <div
          className="overflow-auto p-3 text-zinc-300"
          style={{ maxHeight: expanded ? "calc(100vh - 120px)" : maxHeight }}
        >
          <SyntaxHighlighter
            code={activeFile.content}
            language={activeFile.language || getLanguageFromFilename(activeFile.name)}
          />
        </div>
      )}

      {/* Status bar */}
      <div className="flex items-center justify-between px-3 py-1 bg-zinc-900 border-t border-zinc-800 text-[10px] text-zinc-600">
        <span>
          {activeFile?.language || getLanguageFromFilename(activeFile?.name || "")}
        </span>
        <span>
          {activeFile?.content.split("\n").length || 0} lines
        </span>
      </div>
    </div>
  );
}

export function InlineCode({ code, language }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="relative group rounded-lg overflow-hidden bg-zinc-950 border border-zinc-800 my-2">
      <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-900 border-b border-zinc-800">
        <span className="text-[10px] text-zinc-500 font-mono">
          {language || "code"}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 text-zinc-500 hover:text-zinc-300"
          onClick={() => {
            navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? (
            <Check className="h-3 w-3 text-emerald-400" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
        </Button>
      </div>
      <div className="p-3 overflow-x-auto text-zinc-300">
        <SyntaxHighlighter code={code} language={language || "plaintext"} />
      </div>
    </div>
  );
}
