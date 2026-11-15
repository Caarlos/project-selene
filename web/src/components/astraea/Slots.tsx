// Named empty places in the layout for later tasks. Replace a <Slot> with the real component; keep the data-slot name.

export function Slot({name, task, title}: {name: string; task: string; title: string}) {
  return (
    <section data-slot={name} className="rounded border border-dashed border-slate-700 p-3 text-sm text-slate-500">
      {title} (task {task}, not built yet)
    </section>
  );
}
