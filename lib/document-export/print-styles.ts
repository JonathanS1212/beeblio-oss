/**
 * Print stylesheet for markdown → PDF export. Targeted at Chromium's print
 * engine inside Gotenberg, so every font in the stack must exist in the
 * container (Liberation family) or degrade gracefully on other hosts.
 * KaTeX fonts and the highlight.js theme are injected alongside this sheet.
 */
export const printStyles = /* css */ `
@page {
  size: A4;
  margin: 20mm 18mm 20mm 18mm;
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

html {
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

body {
  margin: 0;
  font-family: "Liberation Serif", "Nimbus Roman", Georgia, "Times New Roman", serif;
  font-size: 11pt;
  line-height: 1.55;
  color: #1f2328;
}

main {
  display: block;
}

h1,
h2,
h3,
h4,
h5,
h6 {
  font-family: "Liberation Sans", Arial, Helvetica, sans-serif;
  line-height: 1.25;
  color: #111418;
  break-after: avoid;
  page-break-after: avoid;
  margin: 1.4em 0 0.5em;
}

h1 {
  font-size: 20pt;
  border-bottom: 1.5pt solid #d0d7de;
  padding-bottom: 0.2em;
  break-before: page;
  page-break-before: always;
}

h1:first-child {
  break-before: auto;
  page-break-before: auto;
  margin-top: 0;
}

h2 {
  font-size: 15pt;
  border-bottom: 0.75pt solid #d8dee4;
  padding-bottom: 0.2em;
}

h3 {
  font-size: 12.5pt;
}

h4,
h5,
h6 {
  font-size: 11pt;
}

p {
  margin: 0.6em 0;
  orphans: 3;
  widows: 3;
}

a {
  color: #0969da;
  text-decoration: none;
  word-break: break-word;
}

.beeblio-export-citation {
  color: #0969da;
}

strong {
  font-weight: 700;
}

img {
  max-width: 100%;
  height: auto;
}

figure {
  margin: 1em 0;
  text-align: center;
  break-inside: avoid;
  page-break-inside: avoid;
}

figcaption {
  font-size: 9.5pt;
  color: #57606a;
  margin-top: 0.4em;
}

figure.diagram svg {
  max-width: 100%;
  height: auto;
}

ul,
ol {
  margin: 0.6em 0;
  padding-left: 1.6em;
}

li {
  margin: 0.2em 0;
}

li > p {
  margin: 0.2em 0;
}

ul.contains-task-list {
  list-style: none;
  padding-left: 1em;
}

li.task-list-item {
  break-inside: avoid;
  page-break-inside: avoid;
}

li.task-list-item input[type="checkbox"] {
  margin-right: 0.45em;
}

code {
  font-family: "Liberation Mono", "DejaVu Sans Mono", Menlo, Consolas, monospace;
  font-size: 9.5pt;
  background: #f6f8fa;
  border: 0.5pt solid #d8dee4;
  border-radius: 3pt;
  padding: 0.1em 0.3em;
}

pre {
  background: #f6f8fa;
  border: 0.5pt solid #d8dee4;
  border-radius: 4pt;
  padding: 10pt 12pt;
  margin: 0.8em 0;
  overflow-wrap: break-word;
  white-space: pre-wrap;
  break-inside: avoid;
  page-break-inside: avoid;
}

pre code {
  background: none;
  border: 0;
  padding: 0;
  font-size: 9pt;
  line-height: 1.5;
}

blockquote {
  margin: 0.8em 0;
  padding: 0.1em 14pt;
  border-left: 3pt solid #d0d7de;
  color: #57606a;
  break-inside: avoid;
  page-break-inside: avoid;
}

blockquote p {
  margin: 0.4em 0;
}

blockquote.callout {
  border-left: 3pt solid #57606a;
  background: #f6f8fa;
  border-radius: 0 4pt 4pt 0;
  padding: 6pt 12pt;
}

blockquote.callout-note {
  border-left-color: #0969da;
  background: #ddf4ff;
}

blockquote.callout-tip {
  border-left-color: #1a7f37;
  background: #dafbe1;
}

blockquote.callout-important {
  border-left-color: #8250df;
  background: #fbefff;
}

blockquote.callout-warning {
  border-left-color: #9a6700;
  background: #fff8c5;
}

blockquote.callout-caution {
  border-left-color: #cf222e;
  background: #ffebe9;
}

p.callout-title {
  font-family: "Liberation Sans", Arial, Helvetica, sans-serif;
  font-weight: 700;
  font-size: 10pt;
  color: #1f2328;
}

table {
  border-collapse: collapse;
  width: 100%;
  margin: 1em 0;
  font-size: 10pt;
}

th,
td {
  border: 0.5pt solid #afb8c1;
  padding: 5pt 8pt;
  text-align: left;
  vertical-align: top;
}

th {
  background: #f6f8fa;
  font-family: "Liberation Sans", Arial, Helvetica, sans-serif;
  font-weight: 700;
}

thead {
  display: table-header-group;
}

tr {
  break-inside: avoid;
  page-break-inside: avoid;
}

hr {
  border: 0;
  border-top: 0.75pt solid #d0d7de;
  margin: 1.5em 0;
}

.katex-display {
  margin: 1em 0;
  overflow-x: auto;
  overflow-y: hidden;
}

.footnotes {
  font-size: 9.5pt;
  color: #57606a;
}
`;
