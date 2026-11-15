import {docHref} from '../apollo/headings';

/** Small "?" link to a heading of the technical primer (W7); `id` is the heading text, e.g. a column or KPI id. */
export default function DocLink({id}: {id: string}) {
  return (
    <a href={docHref('primer', id)} title={`Formula and data source of ${id}`} className="ml-1 text-sky-400 hover:underline">
      ?
    </a>
  );
}
