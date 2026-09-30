"use client";

import { useEffect, useRef } from "react";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { bracketMatching, defaultHighlightStyle, indentOnInput, type StreamParser, StreamLanguage, syntaxHighlighting } from "@codemirror/language";
import { css } from "@codemirror/legacy-modes/mode/css";
import { javascript, json, typescript } from "@codemirror/legacy-modes/mode/javascript";
import { properties } from "@codemirror/legacy-modes/mode/properties";
import { python } from "@codemirror/legacy-modes/mode/python";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { simpleMode } from "@codemirror/legacy-modes/mode/simple-mode";
import { standardSQL } from "@codemirror/legacy-modes/mode/sql";
import { toml } from "@codemirror/legacy-modes/mode/toml";
import { html, xml } from "@codemirror/legacy-modes/mode/xml";
import { yaml } from "@codemirror/legacy-modes/mode/yaml";
import { searchKeymap } from "@codemirror/search";
import { EditorState } from "@codemirror/state";
import { drawSelection, dropCursor, EditorView, highlightActiveLine, highlightActiveLineGutter, highlightSpecialChars, keymap, lineNumbers, rectangularSelection } from "@codemirror/view";

const bibtex = simpleMode({ start: [
  { regex: /@[A-Za-z]+/, token: "keyword" },
  { regex: /[A-Za-z][\w-]*(?=\s*=)/, token: "property" },
  { regex: /\b(?:and)\b/, token: "operator" },
  { regex: /[{}(),=]/, token: "punctuation" },
  { regex: /"(?:[^"\\]|\\.)*"/, token: "string" },
  { regex: /%.*$/, token: "comment" },
] });

const ris = simpleMode({ start: [
  { regex: /^[A-Z0-9]{2}(?=\s*-)/, token: "property" },
  { regex: /\s-\s/, token: "punctuation" },
] });

const modes: Record<string, StreamParser<unknown>> = {
  bash: shell,
  bib: bibtex,
  cjs: javascript,
  css,
  env: properties,
  htm: html,
  html,
  ini: properties,
  js: javascript,
  jsx: javascript,
  json,
  jsonl: json,
  mjs: javascript,
  ndjson: json,
  py: python,
  ris,
  sh: shell,
  sql: standardSQL,
  toml,
  ts: typescript,
  tsx: typescript,
  xml,
  yaml,
  yml: yaml,
};

export function SourceCodeEditor({ value, extension, onChange }: { value: string; extension: string; onChange: (value: string) => void }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!parentRef.current) return;
    const mode = modes[extension];
    const view = new EditorView({
      parent: parentRef.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(), highlightActiveLineGutter(), highlightSpecialChars(), history(),
          drawSelection(), dropCursor(), EditorState.allowMultipleSelections.of(true),
          indentOnInput(), bracketMatching(), closeBrackets(), rectangularSelection(),
          highlightActiveLine(), syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          ...(mode ? [StreamLanguage.define(mode)] : []),
          keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap, indentWithTab]),
          EditorView.lineWrapping,
          EditorView.theme({
            "&": { height: "100%", fontSize: "13px", backgroundColor: "var(--card)", color: "var(--foreground)" },
            ".cm-scroller": { fontFamily: "var(--font-mono), ui-monospace, monospace", lineHeight: "1.6" },
            ".cm-content": { padding: "16px 0" },
            ".cm-gutters": { backgroundColor: "var(--muted)", color: "var(--muted-foreground)", borderRight: "1px solid var(--border)" },
            ".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "color-mix(in oklab, var(--primary) 7%, transparent)" },
            ".cm-cursor": { borderLeftColor: "var(--foreground)" },
            ".cm-selectionBackground": { backgroundColor: "color-mix(in oklab, var(--primary) 22%, transparent) !important" },
          }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current(update.state.doc.toString());
          }),
        ],
      }),
    });
    viewRef.current = view;
    return () => {
      viewRef.current = null;
      view.destroy();
    };
  }, [extension]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || view.state.doc.toString() === value) return;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
  }, [value]);

  return <div ref={parentRef} className="h-full min-h-0 overflow-hidden" />;
}
