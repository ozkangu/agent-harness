"use client";

import { useState, useEffect } from "react";
import {
  Sparkles,
  ArrowRight,
  X,
  LayoutDashboard,
  BarChart3,
  MessageSquare,
  GitBranch,
  Settings,
  Bot,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/hooks/use-translation";

interface TourStep {
  title: string;
  description: string;
  icon: React.ReactNode;
  position: "center" | "top-left" | "top-right" | "bottom-center";
}

const TOUR_STEPS: TourStep[] = [
  {
    title: "Welcome to Cortex",
    description:
      "Cortex is an AI-powered SDLC orchestrator that automates your entire development workflow. Let's take a quick tour of the key features.",
    icon: <Bot className="h-8 w-8 text-violet-400" />,
    position: "center",
  },
  {
    title: "Dashboard",
    description:
      "Your home base. View stats, active pipelines, recent issues, and activity feed at a glance. Quick actions let you jump into any workflow.",
    icon: <LayoutDashboard className="h-6 w-6 text-blue-400" />,
    position: "top-left",
  },
  {
    title: "Kanban Board",
    description:
      "Manage your issues with a drag-and-drop board. Filter by priority, bulk select, export/import, and switch between kanban and timeline views.",
    icon: <BarChart3 className="h-6 w-6 text-emerald-400" />,
    position: "top-left",
  },
  {
    title: "AI Chat",
    description:
      "Have natural conversations with Cortex AI. Describe what you want to build, attach files, and the AI will create issues and generate code.",
    icon: <MessageSquare className="h-6 w-6 text-cyan-400" />,
    position: "top-left",
  },
  {
    title: "Pipelines",
    description:
      "The heart of Cortex. Create a pipeline with a requirement, and AI will analyze your codebase, plan stories, write code, review, and test - all with your approval.",
    icon: <GitBranch className="h-6 w-6 text-violet-400" />,
    position: "top-left",
  },
  {
    title: "Pro Tips",
    description:
      "Use Cmd+K to open the command palette for quick navigation. Press 1-5 to switch panels. Drag issues between columns to change status. You're all set!",
    icon: <Sparkles className="h-6 w-6 text-amber-400" />,
    position: "center",
  },
];

const STORAGE_KEY = "cortex-onboarding-seen";

export function OnboardingTour() {
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);
  const { t } = useTranslation();
  const translatedSteps = [
    { title: t("onboarding.welcomeTitle"), description: t("onboarding.welcomeDesc") },
    { title: t("onboarding.dashboardTitle"), description: t("onboarding.dashboardDesc") },
    { title: t("onboarding.kanbanTitle"), description: t("onboarding.kanbanDesc") },
    { title: t("onboarding.chatTitle"), description: t("onboarding.chatDesc") },
    { title: t("onboarding.pipelineTitle"), description: t("onboarding.pipelineDesc") },
    { title: t("onboarding.tipsTitle"), description: t("onboarding.tipsDesc") },
  ];

  useEffect(() => {
    const seen = localStorage.getItem(STORAGE_KEY);
    if (!seen) {
      // Small delay so the app renders first
      const timer = setTimeout(() => setVisible(true), 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleNext = () => {
    if (step < TOUR_STEPS.length - 1) {
      setStep(step + 1);
    } else {
      handleDismiss();
    }
  };

  const handleDismiss = () => {
    setVisible(false);
    localStorage.setItem(STORAGE_KEY, "true");
  };

  if (!visible) return null;

  const currentStep = TOUR_STEPS[step];
  const isLast = step === TOUR_STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-[300]">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      {/* Step card */}
      <div
        className={cn(
          "absolute z-10",
          currentStep.position === "center" && "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
          currentStep.position === "top-left" && "top-20 left-1/2 -translate-x-1/2 md:left-72 md:translate-x-0",
          currentStep.position === "top-right" && "top-20 right-8",
          currentStep.position === "bottom-center" && "bottom-20 left-1/2 -translate-x-1/2"
        )}
      >
        <div className="w-96 max-w-[90vw] bg-card border border-border rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border bg-muted/30">
            <div className="flex items-center gap-3">
              {currentStep.icon}
              <div>
                <h3 className="font-semibold text-sm">{translatedSteps[step]?.title || currentStep.title}</h3>
                <p className="text-[10px] text-muted-foreground">
                  {t("onboarding.step", { current: String(step + 1), total: String(TOUR_STEPS.length) })}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleDismiss}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Body */}
          <div className="p-4">
            <p className="text-sm text-muted-foreground leading-relaxed">
              {translatedSteps[step]?.description || currentStep.description}
            </p>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/20">
            {/* Step indicators */}
            <div className="flex gap-1">
              {TOUR_STEPS.map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    "h-1.5 rounded-full transition-all",
                    i === step
                      ? "w-4 bg-primary"
                      : i < step
                        ? "w-1.5 bg-primary/50"
                        : "w-1.5 bg-muted-foreground/30"
                  )}
                />
              ))}
            </div>

            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={handleDismiss}
              >
                {t("onboarding.skipTour")}
              </Button>
              <Button
                size="sm"
                className="text-xs gap-1"
                onClick={handleNext}
              >
                {isLast ? t("onboarding.getStarted") : t("onboarding.next")}
                {!isLast && <ArrowRight className="h-3 w-3" />}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
