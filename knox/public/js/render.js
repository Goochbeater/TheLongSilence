// Small, escape-first renderer: everything is HTML-escaped before any formatting is
// applied, so model output can never inject markup. Handles Knox's <story> tags, the
// protocol tags R1 sometimes leaks into its answer, and a modest slice of markdown.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);

const SEAL = '▓▓▓▓▓';
const TAGS = ['story', 'guardian_thinking', 'weaver_thinking', 'final_thinking'];
const PROTOCOL_LABELS = {
  guardian_thinking: 'Knox-Guardian · security analysis',
  weaver_thinking: 'Knox-Weaver · story planning',
  final_thinking: 'Consensus check',
};
const TAG_RE = new RegExp(`<(${TAGS.join('|')})>([\\s\\S]*?)(?:</\\1>|$)`, 'g');
const STRAY_RE = new RegExp(`</?(?:${TAGS.join('|')})>`, 'g');
const PARTIAL_RE = /<\/?[a-z_]*$/;

export function renderReasoning(text) {
  return escapeHtml(text).split(SEAL).join(`<span class="seal" title="Sealed by the ward">${SEAL}</span>`);
}

export function renderAnswer(text, streaming = false) {
  if (streaming) {
    const partial = text.match(PARTIAL_RE);
    if (partial && TAGS.some((t) => `<${t}>`.startsWith(partial[0]) || `</${t}>`.startsWith(partial[0]))) {
      text = text.slice(0, partial.index);
    }
  }
  let html = '';
  let last = 0;
  TAG_RE.lastIndex = 0;
  for (let m; (m = TAG_RE.exec(text));) {
    html += markdown(text.slice(last, m.index));
    const inner = m[2].replace(/^\s+|\s+$/g, '');
    if (m[1] === 'story') html += `<div class="story">${markdown(inner)}</div>`;
    else html += `<details class="protocol"><summary>${PROTOCOL_LABELS[m[1]]}</summary><div>${markdown(inner)}</div></details>`;
    last = m.index + m[0].length;
    if (m[0].length === 0) TAG_RE.lastIndex++;
  }
  html += markdown(text.slice(last));
  return html;
}

function markdown(src) {
  src = src.replace(STRAY_RE, '');
  if (!src.trim()) return '';
  let html = '';
  const fence = /```([\w+-]*)[^\n]*\n?([\s\S]*?)(?:```|$)/g;
  let last = 0;
  for (let m; (m = fence.exec(src));) {
    html += blocks(src.slice(last, m.index));
    html += `<pre><code>${escapeHtml(m[2].replace(/\n$/, ''))}</code></pre>`;
    last = m.index + m[0].length;
  }
  return html + blocks(src.slice(last));
}

function blocks(src) {
  let html = '';
  for (const block of src.replace(/\r\n?/g, '\n').split(/\n{2,}/)) {
    const trimmed = block.replace(/^\n+|\s+$/g, '');
    if (!trimmed) continue;
    const lines = trimmed.split('\n');
    if (lines.every((l) => /^\s*[-*•]\s+/.test(l))) {
      html += `<ul>${lines.map((l) => `<li>${inline(l.replace(/^\s*[-*•]\s+/, ''))}</li>`).join('')}</ul>`;
    } else if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) {
      html += `<ol>${lines.map((l) => `<li>${inline(l.replace(/^\s*\d+[.)]\s+/, ''))}</li>`).join('')}</ol>`;
    } else if (lines.every((l) => /^\s*>/.test(l))) {
      html += `<blockquote>${lines.map((l) => inline(l.replace(/^\s*>\s?/, ''))).join('<br>')}</blockquote>`;
    } else if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(trimmed)) {
      html += '<hr>';
    } else {
      const parts = lines.map((l) => {
        const h = l.match(/^\s*#{1,6}\s+(.*)$/);
        return h ? `</p><p class="md-h">${inline(h[1])}</p><p>` : inline(l);
      });
      html += `<p>${parts.join('<br>')}</p>`.replace(/<p>(?:<br>)*<\/p>/g, '').replace(/<br><\/p>/g, '</p>').replace(/<p><br>/g, '<p>');
    }
  }
  return html;
}

function inline(text) {
  const codes = [];
  let s = escapeHtml(text).replace(/`([^`\n]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
  s = s
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_\n]+)__/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\n]+)\*(?![*\w])/g, '$1<em>$2</em>')
    .replace(/(^|[^_\w])_([^_\n]+)_(?![_\w])/g, '$1<em>$2</em>')
    .replace(/~~([^~\n]+)~~/g, '<s>$1</s>')
    .split(SEAL).join(`<span class="seal">${SEAL}</span>`);
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`);
}
