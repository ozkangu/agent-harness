"use client";

import React, { Component } from "react";
import { AlertTriangle, RefreshCw, Bug, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  panelName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  retryCount: number;
  copied: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null, retryCount: 0, copied: false };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo });

    const logEntry = {
      timestamp: new Date().toISOString(),
      panel: this.props.panelName || "unknown",
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      componentStack: errorInfo.componentStack,
      retryCount: this.state.retryCount,
    };

    console.error(`[ErrorBoundary:${this.props.panelName || "app"}]`, logEntry);
  }

  handleRetry = () => {
    this.setState((s) => ({
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: s.retryCount + 1,
    }));
  };

  handleCopyError = async () => {
    const { error, errorInfo } = this.state;
    const text = [
      `Panel: ${this.props.panelName || "unknown"}`,
      `Error: ${error?.name}: ${error?.message}`,
      `Stack: ${error?.stack || "N/A"}`,
      `Component Stack: ${errorInfo?.componentStack || "N/A"}`,
    ].join("\n\n");

    await navigator.clipboard.writeText(text);
    this.setState({ copied: true });
    setTimeout(() => this.setState({ copied: false }), 2000);
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const { error, retryCount } = this.state;
      const panelLabel = this.props.panelName || "This section";

      return (
        <div className="flex items-center justify-center min-h-[300px] p-8">
          <div className="text-center max-w-md">
            <div className="h-16 w-16 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="h-8 w-8 text-red-500" />
            </div>
            <h3 className="text-lg font-semibold mb-1">
              {panelLabel} encountered an error
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              {error?.message || "An unexpected error occurred"}
            </p>

            {retryCount > 0 && (
              <p className="text-xs text-muted-foreground mb-3">
                Retry attempt {retryCount} {retryCount >= 3 ? "- This error may require a page refresh" : ""}
              </p>
            )}

            <div className="flex items-center justify-center gap-2">
              <Button
                onClick={this.handleRetry}
                className="gap-1.5"
                variant={retryCount >= 3 ? "outline" : "default"}
              >
                <RefreshCw className="h-4 w-4" />
                {retryCount >= 3 ? "Try Again" : "Retry"}
              </Button>

              <Button
                variant="outline"
                onClick={this.handleCopyError}
                className="gap-1.5"
              >
                {this.state.copied ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                {this.state.copied ? "Copied" : "Copy Error"}
              </Button>

              {retryCount >= 3 && (
                <Button
                  variant="outline"
                  onClick={() => window.location.reload()}
                  className="gap-1.5"
                >
                  <Bug className="h-4 w-4" />
                  Reload Page
                </Button>
              )}
            </div>

            {error?.stack && (
              <details className="mt-4 text-left">
                <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                  Technical Details
                </summary>
                <pre className="mt-2 text-[10px] text-muted-foreground bg-muted/50 rounded-lg p-3 overflow-x-auto max-h-32 overflow-y-auto font-mono">
                  {error.stack}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
