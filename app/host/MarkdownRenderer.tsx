import { memo } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownRendererProps {
  content: string;
  isStreaming?: boolean;
  afterContent?: React.ReactNode;
  showStreamingCursor?: boolean;
  sourcePath?: string;
}

export const MarkdownRenderer = memo(function MarkdownRenderer({
  content,
  isStreaming,
  afterContent,
  showStreamingCursor,
}: MarkdownRendererProps) {
  return (
    <div className="markdown-body text-sm leading-relaxed text-foreground">
      <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>
      {afterContent}
      {(showStreamingCursor ?? isStreaming) && (
        <span className="ml-0.5 inline-block h-4 w-2 animate-pulse rounded-sm bg-primary align-text-bottom" />
      )}
    </div>
  );
});
