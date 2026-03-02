import React, { useState, useEffect, useRef } from "react";
import type { HighlighterCore } from "shiki/core";

const LINE_NUMBER_CSS = `
.shiki code { counter-reset: line; }
.shiki code .line::before {
  counter-increment: line;
  content: counter(line);
  display: inline-block;
  width: 2rem;
  text-align: right;
  margin-right: 1.5rem;
  color: rgb(113 113 122 / 0.35);
  font-size: 0.72rem;
  user-select: none;
  font-variant-numeric: tabular-nums;
}`;

let lineNumStyleInjected = false;
function injectLineNumberCss() {
  if (lineNumStyleInjected) return;
  lineNumStyleInjected = true;
  const style = document.createElement("style");
  style.textContent = LINE_NUMBER_CSS;
  document.head.appendChild(style);
}

type SourceFile = {
  name: string;
  content: string;
};

type CodeExplorerProps = {
  files: SourceFile[];
  title: string;
  description: string;
  children: React.ReactNode;
};

let highlighterPromise: Promise<HighlighterCore> | null = null;

function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = Promise.all([
      import("shiki/core"),
      import("shiki/engine/javascript"),
      import("shiki/themes/catppuccin-mocha.mjs"),
      import("shiki/langs/typescript.mjs"),
      import("shiki/langs/tsx.mjs"),
    ]).then(([core, engine, mocha, ts, tsx]) =>
      core.createHighlighterCore({
        themes: [mocha.default],
        langs: [ts.default, tsx.default],
        engine: engine.createJavaScriptRegexEngine(),
      }),
    );
  }
  return highlighterPromise;
}

function useHighlighter() {
  const [hl, setHl] = useState<HighlighterCore | null>(null);
  useEffect(() => {
    getHighlighter().then(setHl);
  }, []);
  return hl;
}

function getLang(name: string): "typescript" | "tsx" {
  return name.endsWith(".tsx") ? "tsx" : "typescript";
}

function FileIcon({ name }: { name: string }) {
  return (
    <svg
      className="w-4 h-4 shrink-0 text-zinc-500"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
      />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg
      className="w-4 h-4 shrink-0 text-zinc-500"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z"
      />
    </svg>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`w-3 h-3 shrink-0 text-zinc-400 transition-transform ${expanded ? "rotate-90" : ""}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

function FileTree({
  files,
  activeIndex,
  onSelect,
  folderName,
}: {
  files: SourceFile[];
  activeIndex: number;
  onSelect: (index: number) => void;
  folderName: string;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="select-none">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 w-full px-2 py-1.5 text-xs font-medium text-zinc-400 hover:bg-zinc-800 rounded transition-colors"
      >
        <ChevronIcon expanded={expanded} />
        <FolderIcon />
        <span className="truncate font-mono">{folderName}</span>
      </button>

      {expanded && (
        <div className="ml-3">
          {files.map((file, idx) => {
            const ext = file.name.endsWith(".tsx") ? "tsx" : "ts";
            return (
              <button
                key={file.name}
                onClick={() => onSelect(idx)}
                className={`flex items-center gap-1.5 w-full pl-3 pr-2 py-1.5 text-xs transition-colors rounded ${
                  idx === activeIndex
                    ? "bg-indigo-500/15 text-indigo-300"
                    : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200"
                }`}
              >
                <FileIcon name={file.name} />
                <span className="flex-1 min-w-0 truncate font-mono text-left">
                  {file.name}
                </span>
                <span
                  className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded font-mono leading-none ${
                    idx === activeIndex
                      ? "bg-indigo-500/20 text-indigo-400"
                      : "bg-zinc-700/60 text-zinc-500"
                  }`}
                >
                  {ext}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1 text-[11px] px-2 py-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700 transition-colors"
      title="Copy to clipboard"
    >
      {copied ? (
        <>
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 13l4 4L19 7"
            />
          </svg>
          Copied!
        </>
      ) : (
        <>
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
          </svg>
          Copy
        </>
      )}
    </button>
  );
}

function CodePane({
  file,
  highlighter,
}: {
  file: SourceFile;
  highlighter: HighlighterCore | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!highlighter || !containerRef.current) return;
    injectLineNumberCss();
    const html = highlighter.codeToHtml(file.content.trimEnd(), {
      lang: getLang(file.name),
      theme: "catppuccin-mocha",
    });
    containerRef.current.innerHTML = html;
  }, [file, highlighter]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0">
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-700/50 bg-zinc-900 shrink-0">
        <div className="flex items-center gap-2">
          <FileIcon name={file.name} />
          <span className="text-xs font-medium font-mono text-zinc-200">
            {file.name}
          </span>
        </div>
        <CopyButton code={file.content} />
      </div>

      <div
        ref={containerRef}
        className="bg-[#1e1e2e] flex-1 overflow-auto text-[13px] leading-relaxed [&_pre]:!m-0 [&_pre]:!p-4 [&_pre]:!rounded-none"
      >
        {!highlighter && (
          <div className="p-4">
            <pre className="text-xs text-zinc-400 font-mono whitespace-pre-wrap">
              {file.content.trimEnd()}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

export function CodeExplorer({
  files,
  title,
  description,
  children,
}: CodeExplorerProps) {
  const [viewMode, setViewMode] = useState<"preview" | "code">("preview");
  const [activeIndex, setActiveIndex] = useState(0);
  const highlighter = useHighlighter();

  if (files.length === 0) return <>{children}</>;

  const activeFile = files[activeIndex];

  return (
    <>
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold tracking-tight font-mono">{title}</h1>
        <div className="flex items-center rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 p-0.5">
          <button
            onClick={() => setViewMode("preview")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
              viewMode === "preview"
                ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
                : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
            }`}
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18M9 21V9" />
            </svg>
            Preview
          </button>
          <button
            onClick={() => setViewMode("code")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
              viewMode === "code"
                ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
                : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
            }`}
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5"
              />
            </svg>
            Code
          </button>
        </div>
      </div>

      <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400 max-w-2xl">
        {description}
      </p>

      {viewMode === "preview" && children}

      {viewMode === "code" && (
        <div
          className="flex rounded-xl border border-zinc-800 bg-zinc-950 shadow-sm overflow-hidden"
          style={{ height: "calc(100vh - 180px)" }}
        >
          <div className="w-52 shrink-0 border-r border-zinc-700/50 bg-zinc-900/60 overflow-y-auto py-2 px-1">
            <div className="px-2 pb-2 mb-1 border-b border-zinc-700/50">
              <span className="text-[11px] font-semibold font-mono uppercase tracking-wider leading-0 text-zinc-500">
                Explorer
              </span>
            </div>
            <FileTree
              files={files}
              activeIndex={activeIndex}
              onSelect={setActiveIndex}
              folderName={title.toLowerCase().replace(/\s+/g, "-")}
            />
          </div>

          <div className="flex-1 flex flex-col min-w-0">
            <CodePane file={activeFile} highlighter={highlighter} />
          </div>
        </div>
      )}
    </>
  );
}
