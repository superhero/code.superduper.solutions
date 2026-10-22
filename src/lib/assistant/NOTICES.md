# Browser Markdown adapters

`markdown/imports.ts` adapts the region, include and snippet syntax from
`@mdit/plugin-include` 1.1.4 and `@mdit/plugin-snippet` 1.1.3. Node filesystem
access is replaced with bounded reads of the browser repository.
`markdown/mathjax.ts` adapts the TeX-to-SVG renderer and user-defined macro cleanup from
`@mdit/plugin-mathjax` 1.2.3, with local static initialization. The browser adapter omits upstream Node/CDN
loaders and unused CHTML font code; it uses the shared mdit TeX parser and the
same MathJax engine.

Upstream: https://github.com/mdit-plugins/mdit-plugins

The MIT License (MIT)

Copyright (C) 2022 - PRESENT by MrHope

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
