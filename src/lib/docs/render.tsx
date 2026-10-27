import { Fragment, type ReactNode } from "react";

/**
 * Tiny markdown renderer for the in-app docs (no dependency).
 * Supports exactly the subset our docs use: h1-h3, paragraphs,
 * fenced code, inline code, bold, links, ul/ol, tables.
 */

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  // code, bold, links — processed left to right.
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) out.push(text.slice(last, match.index));
    const token = match[0];
    if (token.startsWith("`")) {
      out.push(
        <code key={`${keyPrefix}-${i}`} className="rounded bg-[#1c1917]/8 px-1.5 py-0.5 font-mono text-[0.85em]">
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("**")) {
      out.push(<strong key={`${keyPrefix}-${i}`}>{token.slice(2, -2)}</strong>);
    } else {
      const label = token.slice(1, token.indexOf("]"));
      const href = token.slice(token.indexOf("](") + 2, -1);
      const internal = href.startsWith("/docs") || href.startsWith("#");
      out.push(
        <a
          key={`${keyPrefix}-${i}`}
          href={href}
          {...(internal ? {} : { target: "_blank", rel: "noreferrer" })}
          className="text-[#1a7f37] underline underline-offset-4 hover:text-[#156b2f]"
        >
          {label}
        </a>,
      );
    }
    last = match.index + token.length;
    i += 1;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function isTableRow(line: string): boolean {
  return line.trim().startsWith("|");
}

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isDividerRow(line: string): boolean {
  const cells = splitRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-+:?$/.test(cell));
}

export function Markdown({ source }: { source: string }) {
  const lines = source.split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;
  const push = (node: ReactNode) => {
    blocks.push(<Fragment key={key}>{node}</Fragment>);
    key += 1;
  };

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") {
      i += 1;
      continue;
    }

    // Fenced code.
    if (line.trim().startsWith("```")) {
      const lang = line.trim().slice(3).trim();
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        code.push(lines[i]);
        i += 1;
      }
      i += 1; // closing fence
      push(
        <div className="my-5 overflow-hidden rounded-lg bg-[#1c1917]">
          {lang ? (
            <p className="border-b border-white/10 px-5 py-2 font-mono text-xs text-white/50">{lang}</p>
          ) : null}
          <pre className="overflow-x-auto p-5 font-mono text-[13px] leading-6 text-[#f7f2e7]">
            {code.join("\n")}
          </pre>
        </div>,
      );
      continue;
    }

    // Headings.
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const text = heading[2];
      if (level === 1) {
        push(
          <h1 className="mt-2 font-display text-4xl font-medium tracking-tight text-[#1c1917] sm:text-5xl">
            {renderInline(text, `h${key}`)}
          </h1>,
        );
      } else if (level === 2) {
        push(
          <h2 className="mt-12 font-display text-2xl font-medium text-[#1c1917] sm:text-3xl">
            {renderInline(text, `h${key}`)}
          </h2>,
        );
      } else {
        push(
          <h3 className="mt-8 text-lg font-semibold text-[#1c1917]">{renderInline(text, `h${key}`)}</h3>,
        );
      }
      i += 1;
      continue;
    }

    // Tables.
    if (isTableRow(line) && i + 1 < lines.length && isDividerRow(lines[i + 1])) {
      const header = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && isTableRow(lines[i])) {
        rows.push(splitRow(lines[i]));
        i += 1;
      }
      push(
        <div className="my-5 overflow-x-auto rounded-lg border border-[#1c1917]/15">
          <table className="w-full border-collapse text-left text-[15px]">
            <thead>
              <tr className="bg-[#1c1917]/5">
                {header.map((cell, c) => (
                  <th key={c} className="border-b border-[#1c1917]/15 px-4 py-3 font-semibold">
                    {renderInline(cell, `th${key}-${c}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, r) => (
                <tr key={r} className={r % 2 === 1 ? "bg-[#1c1917]/[0.03]" : undefined}>
                  {row.map((cell, c) => (
                    <td key={c} className="border-b border-[#1c1917]/10 px-4 py-3 align-top last:border-b-0">
                      {renderInline(cell, `td${key}-${r}-${c}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    // Lists. Consecutive markers group into one list; indented lines
    // continue the current item so wrapped source lines (and the inline
    // markup spanning them) render as a single item.
    const listMatch = /^(\s*)([-*]|\d+[.)])\s+(.*)$/.exec(line);
    if (listMatch) {
      const ordered = /^\d/.test(listMatch[2]);
      const items: string[] = [];
      while (i < lines.length) {
        const m = /^(\s*)([-*]|\d+[.)])\s+(.*)$/.exec(lines[i]);
        if (m && /^\d/.test(m[2]) === ordered) {
          items.push(m[3]);
          i += 1;
          continue;
        }
        const trimmed = lines[i].trim();
        const continuesItem =
          items.length > 0 &&
          !m &&
          trimmed !== "" &&
          /^[ \t]/.test(lines[i]) &&
          !trimmed.startsWith("```") &&
          !/^#{1,3}\s/.test(trimmed) &&
          !trimmed.startsWith("|");
        if (!continuesItem) break;
        items[items.length - 1] += ` ${trimmed}`;
        i += 1;
      }
      const Tag = ordered ? "ol" : "ul";
      push(
        <Tag className={`my-4 space-y-2 pl-6 ${ordered ? "list-decimal" : "list-disc"}`}>
          {items.map((item, n) => (
            <li key={n} className="leading-7 text-[#1c1917]/85">
              {renderInline(item, `li${key}-${n}`)}
            </li>
          ))}
        </Tag>,
      );
      continue;
    }

    // Paragraph (join wrapped lines).
    const para: string[] = [line];
    i += 1;
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].trim().startsWith("```") &&
      !/^#{1,3}\s/.test(lines[i]) &&
      !isTableRow(lines[i]) &&
      !/^(\s*)([-*]|\d+[.)])\s+/.test(lines[i])
    ) {
      para.push(lines[i]);
      i += 1;
    }
    push(<p className="my-4 leading-8 text-[#1c1917]/85">{renderInline(para.join(" "), `p${key}`)}</p>);
  }

  return <>{blocks}</>;
}
