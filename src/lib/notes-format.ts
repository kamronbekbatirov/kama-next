// Convert the lightweight Markdown that Claude writes into the rich-text HTML the
// notes editor (TipTap) stores and renders. Dependency-free and focused on the
// constructs Claude actually uses: bold / italic / strike / code / links,
// headings, bullet & numbered lists, and to-do checklists. If the input already
// looks like HTML it is returned unchanged.

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function inlineMd(s: string): string {
  return escapeHtml(s)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
    .replace(/(^|[^_])_([^_\n]+)_/g, "$1<em>$2</em>")
    .replace(/~~([^~]+)~~/g, "<s>$1</s>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>');
}

const TASK = /^\s*[-*]\s+\[([ xX])\]\s+(.*)$/;
const BULLET = /^\s*[-*]\s+(.*)$/;
const ORDERED = /^\s*\d+[.)]\s+(.*)$/;
const HEADING = /^(#{1,3})\s+(.*)$/;
const QUOTE = /^>\s?(.*)$/;

export function markdownToHtml(md: string): string {
  const src = (md ?? "").trim();
  if (!src) return "";
  if (src.startsWith("<")) return md; // already HTML — leave it

  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let para: string[] = [];
  const flushPara = () => {
    if (para.length) {
      html.push(`<p>${para.map(inlineMd).join("<br>")}</p>`);
      para = [];
    }
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") { flushPara(); i++; continue; }

    const h = line.match(HEADING);
    if (h) { flushPara(); const lvl = h[1].length; html.push(`<h${lvl}>${inlineMd(h[2])}</h${lvl}>`); i++; continue; }

    // To-do list — checked before bullets, since "- [ ]" also matches a bullet.
    if (TASK.test(line)) {
      flushPara();
      const items: string[] = [];
      while (i < lines.length && TASK.test(lines[i])) {
        const t = lines[i].match(TASK)!;
        const checked = t[1].toLowerCase() === "x";
        items.push(`<li data-type="taskItem" data-checked="${checked}"><p>${inlineMd(t[2])}</p></li>`);
        i++;
      }
      html.push(`<ul data-type="taskList">${items.join("")}</ul>`);
      continue;
    }

    if (BULLET.test(line)) {
      flushPara();
      const items: string[] = [];
      while (i < lines.length && BULLET.test(lines[i]) && !TASK.test(lines[i])) {
        items.push(`<li><p>${inlineMd(lines[i].match(BULLET)![1])}</p></li>`);
        i++;
      }
      html.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    if (ORDERED.test(line)) {
      flushPara();
      const items: string[] = [];
      while (i < lines.length && ORDERED.test(lines[i])) {
        items.push(`<li><p>${inlineMd(lines[i].match(ORDERED)![1])}</p></li>`);
        i++;
      }
      html.push(`<ol>${items.join("")}</ol>`);
      continue;
    }

    const q = line.match(QUOTE);
    if (q) { flushPara(); html.push(`<blockquote><p>${inlineMd(q[1])}</p></blockquote>`); i++; continue; }

    para.push(line);
    i++;
  }
  flushPara();
  return html.join("");
}
