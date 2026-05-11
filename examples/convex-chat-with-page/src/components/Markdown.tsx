// ABOUTME: Renders an assistant message's markdown into the dark chat theme,
// ABOUTME: with tight spacing and yellow links matching the Steel accent.

import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function MarkdownImpl({ children }: { children: string }) {
  return (
    <div className="text-sm leading-relaxed [&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_ul]:my-2 [&_ul]:pl-5 [&_ul]:list-disc [&_ol]:my-2 [&_ol]:pl-5 [&_ol]:list-decimal [&_li]:my-1 [&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:mt-3 [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1 [&_h3]:font-semibold [&_code]:rounded [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-xs [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_blockquote]:border-l-2 [&_blockquote]:border-primary [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-muted-foreground [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_a:hover]:text-primary/80 [&_hr]:my-3 [&_hr]:border-border">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}

// Memoized so parent re-renders (e.g. streaming deltas) don't re-run the
// ~100k-char markdown pipeline on every token.
export const Markdown = memo(MarkdownImpl, (prev, next) => prev.children === next.children);
