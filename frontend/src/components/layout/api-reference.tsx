"use client";

import { useState } from "react";
import {
  Globe,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface Endpoint {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  description: string;
}

interface EndpointGroup {
  name: string;
  endpoints: Endpoint[];
}

const API_GROUPS: EndpointGroup[] = [
  {
    name: "Issues",
    endpoints: [
      { method: "GET", path: "/api/issues", description: "List all issues" },
      { method: "GET", path: "/api/issues/:key", description: "Get issue by key" },
      { method: "POST", path: "/api/issues", description: "Create a new issue" },
      { method: "PATCH", path: "/api/issues/:key", description: "Update an issue" },
      { method: "DELETE", path: "/api/issues/:key", description: "Delete an issue" },
      { method: "GET", path: "/api/issues/:key/activity", description: "Get issue activity log" },
    ],
  },
  {
    name: "Pipelines",
    endpoints: [
      { method: "GET", path: "/api/pipelines", description: "List all pipelines" },
      { method: "GET", path: "/api/pipelines/:id", description: "Get pipeline by ID" },
      { method: "POST", path: "/api/pipelines", description: "Create a new pipeline" },
      { method: "GET", path: "/api/pipelines/:id/messages", description: "Get pipeline messages" },
      { method: "POST", path: "/api/pipelines/:id/messages", description: "Send message to pipeline" },
      { method: "POST", path: "/api/pipelines/:id/approve", description: "Approve pipeline phase" },
      { method: "POST", path: "/api/pipelines/:id/reject", description: "Reject pipeline phase" },
      { method: "GET", path: "/api/pipelines/:id/artifacts", description: "Get pipeline artifacts" },
      { method: "GET", path: "/api/pipelines/:id/stories", description: "Get pipeline stories" },
    ],
  },
  {
    name: "Conversations",
    endpoints: [
      { method: "GET", path: "/api/conversations", description: "List conversations" },
      { method: "POST", path: "/api/conversations", description: "Create conversation" },
      { method: "GET", path: "/api/conversations/:id/messages", description: "Get messages" },
      { method: "POST", path: "/api/conversations/:id/messages", description: "Send message" },
      { method: "POST", path: "/api/chat", description: "Quick chat (no conversation)" },
    ],
  },
  {
    name: "Configuration",
    endpoints: [
      { method: "GET", path: "/api/config/backend", description: "Get backend config" },
      { method: "POST", path: "/api/config/backend", description: "Set backend engine" },
      { method: "GET", path: "/api/config/auto-approve", description: "Get auto-approve status" },
      { method: "POST", path: "/api/config/auto-approve", description: "Set auto-approve" },
    ],
  },
  {
    name: "Quality & Context",
    endpoints: [
      { method: "GET", path: "/api/quality/runs", description: "Get quality gate runs" },
      { method: "GET", path: "/api/quality/status", description: "Get quality gate status" },
      { method: "GET", path: "/api/context/agents-md", description: "Get AGENTS.md files" },
      { method: "GET", path: "/api/context/repo-map", description: "Get repo map" },
      { method: "POST", path: "/api/context/refresh", description: "Refresh context cache" },
    ],
  },
  {
    name: "System",
    endpoints: [
      { method: "GET", path: "/api/health", description: "Health check" },
      { method: "GET", path: "/api/stats", description: "Dashboard statistics" },
      { method: "POST", path: "/api/entropy/scan", description: "Run entropy scan" },
      { method: "GET", path: "/api/entropy/tasks", description: "Get entropy tasks" },
      { method: "GET", path: "/api/entropy/findings", description: "Get entropy findings" },
    ],
  },
];

const METHOD_COLORS: Record<string, string> = {
  GET: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  POST: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  PATCH: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  DELETE: "bg-red-500/10 text-red-500 border-red-500/20",
};

function EndpointRow({ endpoint }: { endpoint: Endpoint }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(endpoint.path);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-muted/50 group text-xs">
      <Badge
        variant="outline"
        className={cn("text-[10px] px-1.5 py-0 font-mono w-14 justify-center", METHOD_COLORS[endpoint.method])}
      >
        {endpoint.method}
      </Badge>
      <code className="font-mono text-muted-foreground flex-1">{endpoint.path}</code>
      <span className="text-muted-foreground hidden sm:inline">{endpoint.description}</span>
      <button
        onClick={handleCopy}
        className="h-5 w-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      </button>
    </div>
  );
}

export function ApiReference() {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(["Issues"]));

  const toggleGroup = (name: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const totalEndpoints = API_GROUPS.reduce((sum, g) => sum + g.endpoints.length, 0);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-muted-foreground">
          {totalEndpoints} endpoints across {API_GROUPS.length} categories
        </p>
        <Badge variant="outline" className="text-[10px]">
          REST API
        </Badge>
      </div>

      {API_GROUPS.map((group) => (
        <div key={group.name} className="border border-border rounded-lg overflow-hidden">
          <button
            onClick={() => toggleGroup(group.name)}
            className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted/30 transition-colors"
          >
            <div className="flex items-center gap-2">
              {expandedGroups.has(group.name) ? (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              <span className="text-sm font-medium">{group.name}</span>
            </div>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {group.endpoints.length}
            </Badge>
          </button>
          {expandedGroups.has(group.name) && (
            <div className="border-t border-border px-1 py-1">
              {group.endpoints.map((endpoint) => (
                <EndpointRow key={`${endpoint.method}-${endpoint.path}`} endpoint={endpoint} />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
