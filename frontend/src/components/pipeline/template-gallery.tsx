"use client";

import { useState } from "react";
import {
  Server,
  Shield,
  MessageSquare,
  Upload,
  BarChart3,
  ShoppingCart,
  FileText,
  Smartphone,
  GitBranch,
  Database,
  Search,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  PIPELINE_TEMPLATES,
  TEMPLATE_CATEGORIES,
  type PipelineTemplate,
} from "@/lib/pipeline-templates";
import { cn } from "@/lib/utils";

const ICON_MAP: Record<string, React.ElementType> = {
  Server,
  Shield,
  MessageSquare,
  Upload,
  BarChart3,
  ShoppingCart,
  FileText,
  Smartphone,
  GitBranch,
  Database,
};

const DIFFICULTY_COLORS: Record<string, string> = {
  beginner: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  intermediate: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  advanced: "bg-red-500/10 text-red-500 border-red-500/20",
};

export function TemplateGallery({
  onSelect,
}: {
  onSelect: (requirement: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");

  const filtered = PIPELINE_TEMPLATES.filter((t) => {
    if (category !== "all" && t.category !== category) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.tags.some((tag) => tag.includes(q))
      );
    }
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Search & Category Tabs */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search templates..."
            aria-label="Search pipeline templates"
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-border bg-background text-sm outline-none focus:ring-1 focus:ring-primary/50"
          />
        </div>

        <div className="flex items-center gap-1 flex-wrap">
          {TEMPLATE_CATEGORIES.map((cat) => (
            <button
              key={cat.key}
              onClick={() => setCategory(cat.key)}
              className={cn(
                "text-xs px-3 py-1.5 rounded-md border transition-colors",
                category === cat.key
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Template Grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-8">
          <Search className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No templates match your search</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filtered.map((template) => {
            const Icon = ICON_MAP[template.icon] || Sparkles;
            return (
              <Card
                key={template.id}
                className="p-4 hover:shadow-md transition-all group cursor-pointer border-border/50 hover:border-primary/30"
                onClick={() => onSelect(template.requirement)}
              >
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-violet-500/20 to-indigo-600/20 flex items-center justify-center shrink-0">
                    <Icon className="h-5 w-5 text-violet-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-sm font-semibold">{template.name}</h4>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[9px] px-1.5 py-0",
                          DIFFICULTY_COLORS[template.difficulty]
                        )}
                      >
                        {template.difficulty}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {template.description}
                    </p>
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      {template.tags.map((tag) => (
                        <Badge
                          key={tag}
                          variant="secondary"
                          className="text-[9px] px-1.5 py-0"
                        >
                          {tag}
                        </Badge>
                      ))}
                      <ArrowRight className="h-3 w-3 text-muted-foreground ml-auto opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
