import { definePlugin, registerPlugin } from "@haloforge/plugin-sdk";
import {
  Component,
  lazy,
  Suspense,
  type ErrorInfo,
  type ReactNode,
} from "react";
import "./tailwind.css";
import "./markdown.css";

const LazyMarkdownPanel = lazy(() =>
  import("./MarkdownPanel").then((module) => ({ default: module.MarkdownPanel })),
);

interface MarkdownPluginErrorBoundaryState {
  error: Error | null;
}

class MarkdownPluginErrorBoundary extends Component<
  { children: ReactNode },
  MarkdownPluginErrorBoundaryState
> {
  state: MarkdownPluginErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): MarkdownPluginErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[Markdown plugin] Panel failed to render", error, errorInfo);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full items-center justify-center bg-background px-6 text-sm text-foreground-secondary">
          <div className="max-w-xl rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-left">
            <div className="font-medium text-red-400">Markdown plugin failed to render</div>
            <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap rounded-lg bg-black/10 p-3 text-xs text-foreground">
              {this.state.error.stack ?? this.state.error.message}
            </pre>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

function MarkdownPluginPanel() {
  return (
    <MarkdownPluginErrorBoundary>
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center bg-background text-sm text-foreground-secondary">
            Loading Markdown workspace...
          </div>
        }
      >
        <LazyMarkdownPanel />
      </Suspense>
    </MarkdownPluginErrorBoundary>
  );
}

registerPlugin("dev.haloforge.markdown", definePlugin({ panel: MarkdownPluginPanel }));
