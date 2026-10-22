// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
// Browser TeX/SVG bridge and macro cleanup adapt mdit MathJax; see ../NOTICES.md.
import MarkdownIt from 'markdown-it';
import { tex } from '@mdit/plugin-tex';
import { mathjax } from '@mathjax/src/js/mathjax.js';
import { MathJaxTexFont } from '@mathjax/mathjax-tex-font/js/svg.js';
import type { LiteElement } from '@mathjax/src/js/adaptors/lite/Element.js';
import { liteAdaptor } from '@mathjax/src/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from '@mathjax/src/js/handlers/html.js';
import { AssistiveMmlHandler } from '@mathjax/src/js/a11y/assistive-mml.js';
import { TeX } from '@mathjax/src/js/input/tex.js';
import { HandlerType } from '@mathjax/src/js/input/tex/HandlerTypes.js';
import { SVG } from '@mathjax/src/js/output/svg.js';
import '@mathjax/src/js/input/tex/base/BaseConfiguration.js';
import '@mathjax/src/js/input/tex/ams/AmsConfiguration.js';
import '@mathjax/src/js/input/tex/amscd/AmsCdConfiguration.js';
import '@mathjax/src/js/input/tex/bbm/BbmConfiguration.js';
import '@mathjax/src/js/input/tex/bboldx/BboldxConfiguration.js';
import '@mathjax/src/js/input/tex/bbox/BboxConfiguration.js';
import '@mathjax/src/js/input/tex/begingroup/BegingroupConfiguration.js';
import '@mathjax/src/js/input/tex/boldsymbol/BoldsymbolConfiguration.js';
import '@mathjax/src/js/input/tex/braket/BraketConfiguration.js';
import '@mathjax/src/js/input/tex/bussproofs/BussproofsConfiguration.js';
import '@mathjax/src/js/input/tex/cancel/CancelConfiguration.js';
import '@mathjax/src/js/input/tex/cases/CasesConfiguration.js';
import '@mathjax/src/js/input/tex/centernot/CenternotConfiguration.js';
import '@mathjax/src/js/input/tex/color/ColorConfiguration.js';
import '@mathjax/src/js/input/tex/colortbl/ColortblConfiguration.js';
import '@mathjax/src/js/input/tex/configmacros/ConfigMacrosConfiguration.js';
import '@mathjax/src/js/input/tex/dsfont/DsfontConfiguration.js';
import '@mathjax/src/js/input/tex/empheq/EmpheqConfiguration.js';
import '@mathjax/src/js/input/tex/enclose/EncloseConfiguration.js';
import '@mathjax/src/js/input/tex/extpfeil/ExtpfeilConfiguration.js';
import '@mathjax/src/js/input/tex/gensymb/GensymbConfiguration.js';
import '@mathjax/src/js/input/tex/mathtools/MathtoolsConfiguration.js';
import '@mathjax/src/js/input/tex/mhchem/MhchemConfiguration.js';
import '@mathjax/src/js/input/tex/newcommand/NewcommandConfiguration.js';
import '@mathjax/src/js/input/tex/noerrors/NoErrorsConfiguration.js';
import '@mathjax/src/js/input/tex/noundefined/NoUndefinedConfiguration.js';
import '@mathjax/src/js/input/tex/physics/PhysicsConfiguration.js';
import '@mathjax/src/js/input/tex/tagformat/TagFormatConfiguration.js';
import '@mathjax/src/js/input/tex/textcomp/TextcompConfiguration.js';
import '@mathjax/src/js/input/tex/textmacros/TextMacrosConfiguration.js';
import '@mathjax/src/js/input/tex/unicode/UnicodeConfiguration.js';
import '@mathjax/src/js/input/tex/units/UnitsConfiguration.js';
import '@mathjax/src/js/input/tex/upgreek/UpgreekConfiguration.js';
import '@mathjax/src/js/input/tex/verb/VerbConfiguration.js';

let renderer: ((source: string) => string) | undefined;
/** Static local SVG setup replaces the Node/CDN factory, with no runtime imports. */
export async function loadMathjax(): Promise<(source: string) => string> {
  if (renderer) return renderer;
  const adaptor = liteAdaptor();
  AssistiveMmlHandler(RegisterHTMLHandler(adaptor));
  const InputJax = new TeX<LiteElement, string, HTMLElement>({ packages: ['base', 'ams', 'amscd', 'bbm', 'bboldx', 'bbox', 'begingroup', 'boldsymbol', 'braket', 'bussproofs', 'cancel', 'cases', 'centernot', 'color', 'colortbl', 'configmacros', 'dsfont', 'empheq', 'enclose', 'extpfeil', 'gensymb', 'mathtools', 'mhchem', 'newcommand', 'noerrors', 'noundefined', 'physics', 'tagformat', 'textcomp', 'textmacros', 'unicode', 'units', 'upgreek', 'verb'], maxMacros: 1000, maxBuffer: 65536 });
  const OutputJax = new SVG<LiteElement, string, HTMLElement>({ fontData: MathJaxTexFont, fontCache: 'none' });
  const documentOptions = { InputJax, OutputJax, enableAssistiveMml: true };
  const md = new MarkdownIt({ html: false }).use(tex, {
    mathFence: true,
    render: (content: string, display: boolean) => adaptor.outerHTML(mathjax.document(content, documentOptions).convert(content, { display }) as LiteElement),
  }), cache = new Map<string, string>();
  let size = 0;
  return renderer = (source: string) => {
    const previous = cache.get(source); if (previous !== undefined) return previous;
    let result: string;
    try { result = source.length <= 65536 ? md.render(`\`\`\`math\n${source}\n\`\`\``) : `<pre><code>MathJax input exceeds the preview size limit.</code></pre>`; }
    catch { result = `<pre><code>${md.utils.escapeHtml(source)}</code></pre>`; }
    finally {
      InputJax.reset();
      for (const [type, name] of [[HandlerType.MACRO, 'new-Command'], [HandlerType.ENVIRONMENT, 'new-Environment'], [HandlerType.DELIMITER, 'new-Delimiter']] as const) {
        const map = InputJax.parseOptions.handlers.get(type).retrieve(name) as unknown as { map: Map<string, unknown> } | null;
        map?.map.clear();
      }
    }
    while (cache.size && (cache.size >= 32 || size + result.length > 2097152)) { const key = cache.keys().next().value!; size -= cache.get(key)!.length; cache.delete(key); }
    if (result.length <= 2097152) { cache.set(source, result); size += result.length; }
    return result;
  };
}
