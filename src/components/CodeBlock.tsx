import { useState } from "react";
import { Check, Copy } from "lucide-react";
import "./CodeBlock.css";

interface CodeBlockProps {
  code: string;
  language?: string;
  filename?: string;
}

export function CodeBlock({ code, language = "text", filename }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard not available
    }
  };

  const langLabel = filename
    ? `${language} \u00b7 ${filename}`
    : language;

  return (
    <div className="code-block">
      <div className="code-header">
        <span className="code-lang">{langLabel}</span>
        <button className="code-copy-btn" onClick={handleCopy} type="button">
          {copied ? (
            <>
              <Check size={12} strokeWidth={2} />
              Copied
            </>
          ) : (
            <>
              <Copy size={12} strokeWidth={1.5} />
              Copy
            </>
          )}
        </button>
      </div>
      <pre className="code-body"><code>{code}</code></pre>
    </div>
  );
}
