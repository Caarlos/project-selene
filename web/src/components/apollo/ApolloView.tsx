// APOLLO documentation view (PLAN.md section 7.5): renders the Markdown in docs/ with KaTeX, plus module cards.
import 'katex/dist/katex.min.css';
import './apollo.css';
import {useEffect, useMemo, useState, type ReactNode} from 'react';
import Markdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import outreach from '../../../../docs/outreach_guide.md?raw';
import primer from '../../../../docs/TECHNICAL_PRIMER.md?raw';
import validation from '../../../../docs/validation.md?raw';
import {docHref, extractHeadings, findHeadingId, parseDocHash, slug, type DocId} from './headings';
import {parseModules, patchUrl, type ModuleCard} from './modules';

const DOCS = {
  primer: {title: 'Technical primer', md: primer},
  outreach: {title: 'Outreach guide', md: outreach},
  validation: {title: 'Validation', md: validation},
};
const TABS: [DocId, string][] = [
  ['primer', DOCS.primer.title],
  ['outreach', DOCS.outreach.title],
  ['validation', DOCS.validation.title],
  ['modules', 'Modules'],
];

const textOf = (n: ReactNode): string =>
  typeof n === 'string' || typeof n === 'number'
    ? String(n)
    : Array.isArray(n)
      ? n.map(textOf).join('')
      : n && typeof n === 'object' && 'props' in n
        ? textOf((n.props as {children?: ReactNode}).children)
        : '';

const heading = (Tag: 'h2' | 'h3' | 'h4') =>
  function Heading({children}: {children?: ReactNode}) {
    return <Tag id={slug(textOf(children))}>{children}</Tag>;
  };
const COMPONENTS = {h2: heading('h2'), h3: heading('h3'), h4: heading('h4')};

function Card({m}: {m: ModuleCard}) {
  const img = patchUrl(m.name);
  return (
    <article className="rounded border border-slate-700 bg-slate-900 p-4" data-testid={`module-${m.name}`}>
      <div className="flex items-start gap-3">
        {img && <img src={img} alt={`${m.name} mission patch`} className="h-16 w-16 rounded" />}
        <div>
          <h3 className="text-lg font-bold text-slate-100">{m.name}</h3>
          <p className="text-sm text-sky-300">{m.backronym}</p>
        </div>
      </div>
      <p className="mt-2 text-sm text-slate-300">{m.role}</p>
      <p className="mt-2 text-sm text-slate-400">{m.myth}</p>
    </article>
  );
}

export default function ApolloView() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const on = () => setHash(location.hash);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const {doc, h} = parseDocHash(hash);
  const md = doc === 'modules' ? '' : DOCS[doc].md;
  const toc = useMemo(() => extractHeadings(md).filter((x) => x.level <= 3), [md]);
  const modules = useMemo(() => parseModules(outreach), []);
  const target = h && findHeadingId(md, h); // a missing heading falls back to the top, without error

  useEffect(() => {
    if (target) document.getElementById(target)?.scrollIntoView();
    else document.getElementById('apollo-scroll')?.scrollTo(0, 0);
  }, [doc, target]);

  return (
    <div className="flex min-h-0 flex-1" data-testid="apollo-view">
      <nav className="w-72 shrink-0 overflow-y-auto border-r border-slate-800 p-3 text-sm" aria-label="Documents">
        <ul className="mb-3 space-y-1">
          {TABS.map(([id, title]) => (
            <li key={id}>
              <a href={docHref(id)} className={`block rounded px-2 py-1 ${id === doc ? 'bg-slate-700 font-semibold' : 'hover:bg-slate-800'}`}>
                {title}
              </a>
            </li>
          ))}
        </ul>
        <ul className="space-y-0.5 border-t border-slate-800 pt-2">
          {toc.map((x) => (
            <li key={x.id} style={{paddingLeft: `${(x.level - 2) * 0.75}rem`}}>
              <a href={docHref(doc, x.id)} className="text-slate-400 hover:text-slate-100">
                {x.text}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <main id="apollo-scroll" className="min-w-0 flex-1 overflow-y-auto p-6">
        {doc === 'modules' ? (
          <div className="grid max-w-5xl gap-4 md:grid-cols-2">
            {modules.map((m) => (
              <Card key={m.name} m={m} />
            ))}
          </div>
        ) : (
          <div className="doc-prose" data-testid="apollo-doc">
            <Markdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} components={COMPONENTS}>
              {md}
            </Markdown>
          </div>
        )}
      </main>
    </div>
  );
}
