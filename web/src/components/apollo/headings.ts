// Heading ids for the documentation view. One slug function serves the renderer, the table of contents and metric links.

/** "sun_best_pct" stays as is; "3. The SELENE Ecosystem" becomes "3-the-selene-ecosystem". */
export function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

export interface Heading {
  level: number;
  text: string;
  id: string;
}

/** ATX headings of level 2 to 4, skipping fenced code. shortcut: duplicate heading texts share an id (first wins), no document has any, upgrade if one does. */
export function extractHeadings(md: string): Heading[] {
  const out: Heading[] = [];
  let fenced = false;
  for (const line of md.split('\n')) {
    if (/^\s*```/.test(line)) fenced = !fenced;
    const m = !fenced && /^(#{2,4})\s+(.+?)\s*#*\s*$/.exec(line);
    if (m) {
      const text = m[2].replace(/[`*]/g, '');
      out.push({level: m[1].length, text, id: slug(text)});
    }
  }
  return out;
}

/** Id of the heading whose text equals `wanted` (a metric column id), or null when the document has no such heading. */
export function findHeadingId(md: string, wanted: string): string | null {
  const id = slug(wanted);
  return extractHeadings(md).some((h) => h.id === id) ? id : null;
}

export const DOC_IDS = ['primer', 'outreach', 'validation', 'modules'] as const;
export type DocId = (typeof DOC_IDS)[number];

/** "#doc=primer&h=sun_best_pct" to {doc, h}; unknown or missing doc falls back to the primer. */
export function parseDocHash(hash: string): {doc: DocId; h: string | null} {
  const p = new URLSearchParams(hash.replace(/^#/, ''));
  const doc = DOC_IDS.find((d) => d === p.get('doc')) ?? 'primer';
  return {doc, h: p.get('h')};
}

export const docHref = (doc: DocId, h?: string) => `#doc=${doc}${h ? `&h=${encodeURIComponent(h)}` : ''}`;
