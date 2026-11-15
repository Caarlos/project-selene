// Module cards, parsed from section 3 of docs/outreach_guide.md so the text has a single source.
export interface ModuleCard {
  name: string;
  backronym: string;
  role: string;
  myth: string;
}

export function parseModules(outreachMd: string): ModuleCard[] {
  const section = outreachMd.split(/^## /m).find((s) => s.startsWith('3.')) ?? '';
  return section
    .split(/^### /m)
    .slice(1)
    .map((block) => {
      const field = (label: string) => new RegExp(`\\*\\*${label}:\\*\\*\\s*(.+)`).exec(block)?.[1].trim() ?? '';
      return {
        name: block.split('\n')[0].split(' ')[0].trim(), // "SELENE (Core Engine)" -> "SELENE"
        backronym: field('Backronym'),
        role: field('What It Does in Plain Words').split(/(?<=\.)\s/)[0], // first sentence
        myth: field('The Myth'),
      };
    });
}

// Patch images are optional: the directory may not exist, then cards stay text-only.
const patches = import.meta.glob<string>('../../../../assets/patches/*.{webp,png}', {
  eager: true,
  query: '?url',
  import: 'default',
});

export function patchUrl(name: string): string | null {
  const key = Object.keys(patches).find((k) => /\/([^/]+)\.(webp|png)$/.exec(k)?.[1].toLowerCase() === name.toLowerCase());
  return key ? patches[key] : null;
}
