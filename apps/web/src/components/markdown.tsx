import type { ComponentProps } from "react";
import ReactMarkdown from "react-markdown";

export function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      components={{
        p: (props) => (
          <p {...props} className="text-slate-200 leading-relaxed" />
        ),
        h1: (props) => <h1 {...props} className="text-3xl font-semibold text-white" />,
        h2: () => null,
        h3: (props) => <h3 {...props} className="text-xl font-semibold text-white mt-4" />,
        ul: (props) => (
          <ul {...props} className="list-disc space-y-1 pl-6 text-slate-200" />
        ),
        ol: (props) => (
          <ol {...props} className="list-decimal space-y-1 pl-6 text-slate-200" />
        ),
        pre: (props) => (
          <pre
            {...props}
            className="overflow-x-auto rounded-2xl border border-white/10 bg-black/60 p-4 text-sm"
          />
        ),
        code: ({ inline, ...props }: { inline?: boolean } & ComponentProps<"code">) =>
          inline ? (
            <code {...props} className="rounded bg-white/10 px-1 py-0.5 text-sm text-white" />
          ) : (
            <code {...props} className="block text-sm text-slate-100" />
          ),
      }}
    >
      {children}
    </ReactMarkdown>
  );
}
