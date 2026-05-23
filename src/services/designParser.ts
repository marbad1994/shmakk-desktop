export interface DesignIteration {
  prompt: string;
  html: string;
  timestamp: number;
}

// Tags that don't have closing pairs
const VOID_TAGS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);

/**
 * Extract HTML from a streaming text buffer. Handles:
 * - Complete ```html blocks (returns last match)
 * - Partial ```html blocks during streaming (returns after 50+ chars)
 * - Unfenced HTML (entire response is HTML)
 * - Raw tag detection (counts <tag> occurrences)
 */
export function extractHtml(text: string): string | null {
  // Complete fenced blocks — return the last one
  const fenceRegex = /```html?\s*\n([\s\S]*?)```/gi;
  const completeMatches = [...text.matchAll(fenceRegex)];
  if (completeMatches.length > 0) {
    return completeMatches[completeMatches.length - 1][1].trim();
  }

  // Partial block during streaming: ```html\n<content>  (no closing ```)
  const partialMatch = /```html?\s*\n([\s\S]+)$/i.exec(text);
  if (partialMatch) {
    let content = partialMatch[1].trim();
    if (content.length >= 50) {
      content = closePartialHtml(content);
      return content;
    }
    return null;
  }

  // Unfenced: entire response starts with <!DOCTYPE or <html
  if (/^\s*<!DOCTYPE\s+html/i.test(text) || /^\s*<html[\s>]/i.test(text)) {
    return text.trim();
  }

  // Tag counting: if there are > 5 HTML tags, treat as bare HTML
  const tagCount = (text.match(/<\w+(\s[^>]*)?\/?>/g) || []).length;
  if (tagCount > 5) {
    return text.trim();
  }

  return null;
}

/**
 * Close unclosed HTML tags to produce validish partial HTML for iframe preview.
 */
function closePartialHtml(html: string): string {
  const tagStack: string[] = [];
  const tagRegex = /<\/?(\w+)(\s[^>]*)?\/?>/g;
  // Track position of last self-closing or void tag
  const voidRegex = /<(\w+)(\s[^>]*)?\/>/g;

  // Build stack of opened tags
  const openRegex = /<(\w+)(\s[^>]*)?(?<!\/)>/g;
  const closeRegex = /<\/(\w+)>/g;

  // Simple approach: find all open tags and close what's still open at the end
  let match;
  const opens: string[] = [];
  const closes: string[] = [];

  while ((match = openRegex.exec(html)) !== null) {
    const tag = match[1].toLowerCase();
    if (!VOID_TAGS.has(tag)) opens.push(tag);
  }
  while ((match = closeRegex.exec(html)) !== null) {
    closes.push(match[1].toLowerCase());
  }

  // Remove matches from the end
  for (const closeTag of closes.reverse()) {
    const idx = opens.lastIndexOf(closeTag);
    if (idx >= 0) opens.splice(idx, 1);
  }

  // Append closing tags for remaining opens (in reverse order)
  const closings = [...opens].reverse().map((t) => `</${t}>`).join("\n");
  if (closings) return html + "\n" + closings;
  return html;
}

/**
 * Generate a simple unified diff between two strings.
 */
export function diffLines(oldText: string, newText: string): Array<{ type: "+" | "-" | " "; text: string }> {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  const result: Array<{ type: "+" | "-" | " "; text: string }> = [];

  // Simple LCS-based diff
  const m = oldLines.length;
  const n = newLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack
  let i = m, j = n;
  const temp: Array<{ type: "+" | "-" | " "; text: string }> = [];
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      temp.push({ type: " ", text: oldLines[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      temp.push({ type: "+", text: newLines[j - 1] });
      j--;
    } else {
      temp.push({ type: "-", text: oldLines[i - 1] });
      i--;
    }
  }
  return temp.reverse();
}

/**
 * Scheduled debounce — returns a function that debounces calls.
 */
export function debounce(fn: () => void, ms: number): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };
}
