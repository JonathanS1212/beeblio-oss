import { renderToString } from 'react-dom/server';
import { Streamdown } from 'streamdown';
import { code } from '@streamdown/code';
import { mermaid } from '@streamdown/mermaid';
import { createElement, Suspense } from 'react';
import React from 'react';

const html = renderToString(
  createElement(Streamdown, {
    plugins: { code, mermaid },
    children: "```mermaid\ngraph TD\nA-->B\n```"
  })
);
console.log(html);
