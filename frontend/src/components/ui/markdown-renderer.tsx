"use client";

import { InlineCode } from "@/components/editor/code-editor";

function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let idx = 0;

  while (remaining.length > 0) {
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    const italicMatch = remaining.match(/\*(.+?)\*/);
    const codeMatch = remaining.match(/`([^`]+)`/);
    const linkMatch = remaining.match(/\[([^\]]+)\]\(([^)]+)\)/);

    const matches = [
      boldMatch ? { type: "bold", match: boldMatch } : null,
      italicMatch && (!boldMatch || (italicMatch.index ?? 0) < (boldMatch.index ?? 0))
        ? { type: "italic", match: italicMatch }
        : null,
      codeMatch ? { type: "code", match: codeMatch } : null,
      linkMatch ? { type: "link", match: linkMatch } : null,
    ].filter(Boolean) as { type: string; match: RegExpMatchArray }[];

    if (matches.length === 0) {
      parts.push(<span key={idx++}>{remaining}</span>);
      break;
    }

    matches.sort((a, b) => (a.match.index ?? 0) - (b.match.index ?? 0));
    const earliest = matches[0];
    const matchIndex = earliest.match.index ?? 0;

    if (matchIndex > 0) {
      parts.push(<span key={idx++}>{remaining.slice(0, matchIndex)}</span>);
    }

    switch (earliest.type) {
      case "bold":
        parts.push(
          <strong key={idx++} className="font-semibold">
            {earliest.match[1]}
          </strong>
        );
        remaining = remaining.slice(matchIndex + earliest.match[0].length);
        break;
      case "italic":
        parts.push(
          <em key={idx++} className="italic">
            {earliest.match[1]}
          </em>
        );
        remaining = remaining.slice(matchIndex + earliest.match[0].length);
        break;
      case "code":
        parts.push(
          <code
            key={idx++}
            className="px-1.5 py-0.5 rounded bg-zinc-800 text-emerald-400 text-xs font-mono"
          >
            {earliest.match[1]}
          </code>
        );
        remaining = remaining.slice(matchIndex + earliest.match[0].length);
        break;
      case "link":
        parts.push(
          <a
            key={idx++}
            href={earliest.match[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:underline"
          >
            {earliest.match[1]}
          </a>
        );
        remaining = remaining.slice(matchIndex + earliest.match[0].length);
        break;
      default:
        parts.push(<span key={idx++}>{remaining}</span>);
        remaining = "";
    }
  }

  return <>{parts}</>;
}

function InlineMarkdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];

  let inList = false;
  let listItems: React.ReactNode[] = [];

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`list-${elements.length}`} className="list-disc pl-4 my-2 space-y-0.5">
          {listItems.map((item, i) => (
            <li key={i} className="text-sm">{item}</li>
          ))}
        </ul>
      );
      listItems = [];
      inList = false;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("### ")) {
      flushList();
      elements.push(
        <h4 key={i} className="text-sm font-bold mt-3 mb-1">
          {renderInline(line.slice(4))}
        </h4>
      );
      continue;
    }
    if (line.startsWith("## ")) {
      flushList();
      elements.push(
        <h3 key={i} className="text-base font-bold mt-3 mb-1">
          {renderInline(line.slice(3))}
        </h3>
      );
      continue;
    }
    if (line.startsWith("# ")) {
      flushList();
      elements.push(
        <h2 key={i} className="text-lg font-bold mt-3 mb-1">
          {renderInline(line.slice(2))}
        </h2>
      );
      continue;
    }

    if (/^[\s]*[-*] /.test(line)) {
      inList = true;
      listItems.push(renderInline(line.replace(/^[\s]*[-*] /, "")));
      continue;
    }

    if (/^[\s]*\d+\. /.test(line)) {
      if (!inList) {
        inList = true;
      }
      listItems.push(renderInline(line.replace(/^[\s]*\d+\. /, "")));
      continue;
    }

    if (/^---+$/.test(line.trim())) {
      flushList();
      elements.push(<hr key={i} className="border-border my-3" />);
      continue;
    }

    if (line.trim() === "") {
      flushList();
      continue;
    }

    flushList();
    elements.push(
      <p key={i} className="my-0.5 whitespace-pre-wrap">
        {renderInline(line)}
      </p>
    );
  }

  flushList();

  return <>{elements}</>;
}

export function MarkdownContent({ content }: { content: string }) {
  const blocks = content.split(/(```[\s\S]*?```)/g);

  return (
    <div className="text-sm leading-relaxed">
      {blocks.map((block, i) => {
        if (block.startsWith("```")) {
          const match = block.match(/^```(\w*)\n?([\s\S]*?)```$/);
          if (match) {
            return (
              <InlineCode key={i} language={match[1]} code={match[2].trim()} />
            );
          }
        }

        return <InlineMarkdown key={i} text={block} />;
      })}
    </div>
  );
}
