"use client";

import { useEffect, useRef } from "react";
import { autocompletion, closeBrackets, closeBracketsKeymap, type CompletionContext } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { bracketMatching, defaultHighlightStyle, indentOnInput, StreamLanguage, syntaxHighlighting } from "@codemirror/language";
import { stex } from "@codemirror/legacy-modes/mode/stex";
import { searchKeymap } from "@codemirror/search";
import { EditorState } from "@codemirror/state";
import { crosshairCursor, drawSelection, dropCursor, EditorView, highlightActiveLine, highlightActiveLineGutter, highlightSpecialChars, keymap, lineNumbers, rectangularSelection } from "@codemirror/view";

const commands = [
  "documentclass", "usepackage", "begin", "end", "section", "subsection", "subsubsection",
  "textbf", "textit", "emph", "href", "url", "label", "ref", "pageref", "cite", "footnote",
  "includegraphics", "caption", "item", "frac", "sqrt", "sum", "int", "alpha", "beta", "gamma",
];

function latexCompletions(context: CompletionContext) {
  const word = context.matchBefore(/\\[A-Za-z]*/);
  if (!word || (word.from === word.to && !context.explicit)) return null;
  return {
    from: word.from,
    options: commands.map((command) => ({ label: `\\${command}`, type: "keyword", apply: `\\${command}` })),
  };
}

export function LatexSourceEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!parentRef.current) return;
    const view = new EditorView({
      parent: parentRef.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(), highlightActiveLineGutter(), highlightSpecialChars(), history(),
          drawSelection(), dropCursor(), EditorState.allowMultipleSelections.of(true),
          indentOnInput(), bracketMatching(), closeBrackets(), rectangularSelection(), crosshairCursor(),
          highlightActiveLine(), syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          StreamLanguage.define(stex),
          autocompletion({ override: [latexCompletions] }),
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
    return () => view.destroy();
  }, []);

  return <div ref={parentRef} className="min-h-0 flex-1 overflow-hidden" />;
}
