// Landing page: what the application does, in the order a first-time visitor needs it. Shown until the map is opened.
import {MISSION_PRESETS} from '../artemis/presets';

const MAIN = [
  {
    title: 'Cell inspector with the local horizon',
    module: 'ASTRAEA',
    text: 'Click any cell to see its 360° skyline as the terrain draws it, with the paths of the Sun and the Earth plotted against it. You see when and why a site is lit, dark, or out of contact with Earth, next to its measured values: sunlight, darkness, slope, temperature and ice.',
  },
  {
    title: 'Artemis mission presets',
    module: 'ARTEMIS',
    text: `One click sets the weights and filters for a mission type: ${MISSION_PRESETS.map((p) => p.label).join(', ')}. The preset values are this project's own assumptions, not NASA requirements.`,
  },
  {
    title: 'Multi-criteria decision analysis',
    module: 'ASTRAEA',
    text: 'Five criteria are weighed against each other: sunlight, Earth communications, terrain safety, ice proximity and shielding. Move the sliders or set hard filters and every cell is scored and recoloured at once, with the ten best listed.',
  },
];

const ALSO = [
  {
    title: 'Choose what the colours show',
    text: 'The map colours are not fixed. Use "Colour by" in the legend to switch from the overall score to any single measurement, such as sunlight, slope or ice index.',
  },
  {
    title: 'Change the dates of the analysis',
    text: 'The Dates tab recomputes sunlight and Earth visibility for a date range of your choice, including polar summer and winter months. For simplicity, only 2027 is included in the web app so far.',
  },
  {
    title: 'Compare up to three cells',
    text: 'Pin candidate cells from the inspector and the Compare tab shows them side by side, with the best value of each row highlighted.',
  },
];

export default function Landing() {
  return (
    <div className="flex-1 overflow-y-auto" data-testid="landing">
      <div className="mx-auto max-w-5xl space-y-10 px-6 py-12">
        <section className="space-y-4">
          <p className="text-sm tracking-widest text-sky-300 uppercase">Lunar south pole · 80°S to 90°S</p>
          <h2 className="text-4xl font-bold">Find and compare landing sites at the Moon&apos;s south pole</h2>
          <p className="max-w-3xl text-lg text-slate-300">
            SELENE scores thousands of hexagonal cells on sunlight, contact with Earth, terrain, ice and shielding, so
            you can weigh the trade-offs of a landing or base site yourself.
          </p>
          <a
            href="#map"
            data-testid="landing-open-map"
            className="inline-block rounded bg-sky-600 px-5 py-2 text-lg font-semibold text-white hover:bg-sky-500"
          >
            Open the map
          </a>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          {MAIN.map((f) => (
            <article key={f.title} className="rounded border border-slate-700 bg-slate-900 p-5">
              <p className="text-xs tracking-wider text-sky-300">{f.module}</p>
              <h3 className="mt-1 text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-slate-300">{f.text}</p>
            </article>
          ))}
        </section>

        <section>
          <h3 className="text-base font-semibold text-slate-400">Good to know</h3>
          <dl className="mt-3 grid gap-x-8 gap-y-4 md:grid-cols-3">
            {ALSO.map((f) => (
              <div key={f.title}>
                <dt className="font-semibold">{f.title}</dt>
                <dd className="mt-1 text-sm text-slate-300">{f.text}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </div>
  );
}
