import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import { CodeBlock } from "./CodeBlock";
import "./MarkdownRenderer.css";

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  const components: Components = {
    code({ className: cls, children, ...props }) {
      const match = /language-(\w+)/.exec(cls || "");
      const language = match ? match[1] : undefined;
      const code = String(children).replace(/\n$/, "");

      if (match && code.includes("\n")) {
        return <CodeBlock code={code} language={language} />;
      }

      return (
        <code className="md-inline-code" {...props}>
          {children}
        </code>
      );
    },
    h1: ({ children }) => <h1 className="md-h1">{children}</h1>,
    h2: ({ children }) => <h2 className="md-h2">{children}</h2>,
    h3: ({ children }) => <h3 className="md-h3">{children}</h3>,
    a: ({ href, children }) => (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="md-link"
      >
        {children}
      </a>
    ),
    ul: ({ children }) => <ul className="md-ul">{children}</ul>,
    ol: ({ children }) => <ol className="md-ol">{children}</ol>,
    li: ({ children }) => <li className="md-li">{children}</li>,
    table: ({ children }) => (
      <div className="md-table-wrap">
        <table className="md-table">{children}</table>
      </div>
    ),
    th: ({ children }) => <th className="md-th">{children}</th>,
    td: ({ children }) => <td className="md-td">{children}</td>,
    p: ({ children }) => <p className="md-p">{children}</p>,
    blockquote: ({ children }) => (
      <blockquote className="md-blockquote">{children}</blockquote>
    ),
    hr: () => <hr className="md-hr" />,
    strong: ({ children }) => (
      <strong className="md-strong">{children}</strong>
    ),
    em: ({ children }) => <em className="md-em">{children}</em>,
  };

  return (
    <div className={className}>
      <ReactMarkdown components={components} remarkPlugins={[remarkGfm]}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
