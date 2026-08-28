/**
 * Tiny Markdown-to-JSX renderer for the blog. Zero dependencies.
 *
 * Supported:
 *   ## Heading 2 / ### Heading 3
 *   Paragraphs (blank-line separated)
 *   **bold** and *italic*
 *   `inline code`
 *   [link text](url)  — internal links (starting with /) use wouter Link
 *   - bullet lists / 1. ordered lists
 *   > blockquotes
 *   Tables (GFM-style with | separators)
 *
 * Safe by construction — we never use dangerouslySetInnerHTML. Every
 * output goes through React's normal escaping.
 */

import type { ReactNode } from "react";
import { Link } from "wouter";

type Node = ReactNode;

export function renderMarkdown(md: string): Node[] {
  const lines = md.split("\n");
  const out: Node[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Blank line → skip
    if (!line.trim()) { i++; continue; }

    // Headings
    if (line.startsWith("### ")) {
      out.push(<h3 key={i}>{renderInline(line.slice(4))}</h3>);
      i++;
      continue;
    }
    if (line.startsWith("## ")) {
      out.push(<h2 key={i}>{renderInline(line.slice(3))}</h2>);
      i++;
      continue;
    }
    if (line.startsWith("# ")) {
      out.push(<h1 key={i}>{renderInline(line.slice(2))}</h1>);
      i++;
      continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].startsWith("> ")) {
        buf.push(lines[i].slice(2));
        i++;
      }
      out.push(
        <blockquote key={i} className="border-l-4 border-blue-500 pl-4 italic text-muted-foreground my-4">
          {buf.map((b, idx) => <p key={idx}>{renderInline(b)}</p>)}
        </blockquote>
      );
      continue;
    }

    // Unordered list
    if (line.startsWith("- ")) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].startsWith("- ")) {
        buf.push(lines[i].slice(2));
        i++;
      }
      out.push(
        <ul key={i} className="list-disc pl-6 space-y-1 my-4">
          {buf.map((b, idx) => <li key={idx}>{renderInline(b)}</li>)}
        </ul>
      );
      continue;
    }

    // Ordered list (matches "1. ", "2. ", etc.)
    if (/^\d+\.\s/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        buf.push(lines[i].replace(/^\d+\.\s/, ""));
        i++;
      }
      out.push(
        <ol key={i} className="list-decimal pl-6 space-y-1 my-4">
          {buf.map((b, idx) => <li key={idx}>{renderInline(b)}</li>)}
        </ol>
      );
      continue;
    }

    // Table (GFM)
    if (line.includes("|") && i + 1 < lines.length && /^\s*\|?[-:\s|]+\|?\s*$/.test(lines[i + 1])) {
      const headerCells = splitPipe(line);
      i += 2; // skip header + separator
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|")) {
        rows.push(splitPipe(lines[i]));
        i++;
      }
      out.push(
        <div key={i} className="overflow-x-auto my-4 -mx-4 sm:mx-0">
          <table className="w-full border-collapse text-sm min-w-[500px]">
            <thead>
              <tr className="border-b bg-muted/30">
                {headerCells.map((h, idx) => (
                  <th key={idx} className="text-left p-2 font-semibold">{renderInline(h)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ridx) => (
                <tr key={ridx} className="border-b last:border-0">
                  {r.map((c, cidx) => (
                    <td key={cidx} className="p-2 align-top">{renderInline(c)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // Default: paragraph (consume until blank line)
    const buf: string[] = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) {
      buf.push(lines[i]);
      i++;
    }
    out.push(<p key={i} className="my-3 leading-relaxed">{renderInline(buf.join(" "))}</p>);
  }

  return out;
}

function isBlockStart(line: string): boolean {
  return (
    line.startsWith("#") ||
    line.startsWith("- ") ||
    line.startsWith("> ") ||
    /^\d+\.\s/.test(line) ||
    line.includes("|")
  );
}

function splitPipe(line: string): string[] {
  return line
    .replace(/^\s*\|/, "")
    .replace(/\|\s*$/, "")
    .split("|")
    .map((c) => c.trim());
}

// ─── Inline formatting: bold, italic, code, links ────────────────────────

function renderInline(text: string): Node {
  // Tokenise into segments. Order matters — links before bold before italic.
  const tokens: Node[] = [];
  let cursor = 0;

  // Combined regex for the four inline constructs we support
  const re = /(\[([^\]]+)\]\(([^)]+)\))|(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(`([^`]+)`)/g;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = re.exec(text)) !== null) {
    if (match.index > cursor) {
      tokens.push(text.slice(cursor, match.index));
    }

    if (match[1]) {
      // Link: [text](url)
      const label = match[2];
      const url   = match[3];
      if (url.startsWith("/")) {
        tokens.push(<Link key={key++} href={url}><span className="text-blue-600 hover:underline cursor-pointer">{label}</span></Link>);
      } else {
        tokens.push(
          <a key={key++} href={url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
            {label}
          </a>
        );
      }
    } else if (match[4]) {
      // Bold
      tokens.push(<strong key={key++}>{match[5]}</strong>);
    } else if (match[6]) {
      // Italic
      tokens.push(<em key={key++}>{match[7]}</em>);
    } else if (match[8]) {
      // Inline code
      tokens.push(<code key={key++} className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono">{match[9]}</code>);
    }

    cursor = match.index + match[0].length;
  }

  if (cursor < text.length) {
    tokens.push(text.slice(cursor));
  }

  return <>{tokens}</>;
}
