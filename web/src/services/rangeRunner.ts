// Runs the custom-date computation in `workerCount()` Web Workers (rangeWorker.ts) and merges the blocks.
import type {Horizons} from './loader';
import {
  emptyRangeValues,
  mergeChunk,
  splitCells,
  workerCount,
  type RangeValues,
  type WorkerJob,
  type WorkerMessage,
} from './rangeProtocol';

export interface RangeJobArgs {
  startIndex: number;
  endIndex: number;
  step_s: number;
  table: Float32Array;
  horizons: Horizons;
  nCells: number;
  /** Best point of a cell: lat, lon (deg), height above the reference sphere (m) */
  point(row: number): {lat_deg: number; lon_deg: number; height_m: number};
  onProgress(fraction: number): void;
}

export interface RangeJob {
  /** Terminates the workers now; `done` then resolves to null. */
  cancel(): void;
  /** Values for all `nCells` cells (NaN for cells without a horizon row), or null when cancelled. */
  done: Promise<RangeValues | null>;
}

export function startRangeJob(a: RangeJobArgs): RangeJob {
  const values = emptyRangeValues(a.nCells);
  const blocks = splitCells(a.horizons.n_rows, workerCount(navigator.hardwareConcurrency));
  const total = blocks.reduce((s, b) => s + b.to - b.from, 0);
  const workers: Worker[] = [];
  let cancelled = false;
  let finish: (v: RangeValues | null) => void;
  let fail: (e: Error) => void;
  const done = new Promise<RangeValues | null>((res, rej) => ((finish = res), (fail = rej)));
  let progress = 0;
  let pending = blocks.length;
  if (pending === 0) finish!(values);

  for (const b of blocks) {
    const count = b.to - b.from;
    const lat = new Float64Array(count);
    const lon = new Float64Array(count);
    const height = new Float64Array(count);
    const hor = new Int16Array(count * 360);
    for (let i = 0; i < count; i++) {
      const p = a.point(b.from + i);
      lat[i] = p.lat_deg;
      lon[i] = p.lon_deg;
      height[i] = p.height_m;
      hor.set(a.horizons.row_cdeg(b.from + i)!, i * 360);
    }
    const job: WorkerJob = {
      type: 'run',
      startIndex: a.startIndex,
      endIndex: a.endIndex,
      step_s: a.step_s,
      table: a.table.slice(a.startIndex * 5, a.endIndex * 5),
      lat_deg: lat,
      lon_deg: lon,
      height_m: height,
      horizons_cdeg: hor,
    };
    const w = new Worker(new URL('./rangeWorker.ts', import.meta.url), {type: 'module'});
    workers.push(w);
    w.onmessage = (ev: MessageEvent<WorkerMessage>) => {
      if (cancelled) return;
      const m = ev.data;
      if (m.type === 'progress') {
        progress += m.done;
        a.onProgress(Math.min(1, progress / total));
      } else {
        mergeChunk(values, b.from, m.metrics);
        w.terminate();
        if (--pending === 0) finish(values);
      }
    };
    w.onerror = (e) => {
      cancelled = true;
      workers.forEach((x) => x.terminate());
      fail(new Error(`Range worker failed: ${e.message || 'unknown error'}`));
    };
    w.postMessage(job, [job.table.buffer, lat.buffer, lon.buffer, height.buffer, hor.buffer]);
  }
  return {
    cancel() {
      cancelled = true;
      workers.forEach((w) => w.terminate());
      finish(null);
    },
    done,
  };
}
