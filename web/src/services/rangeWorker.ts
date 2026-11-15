// Web Worker: the four metrics for one block of cells over a table range. See rangeProtocol.ts for the messages.
import {cellMetrics, precomputeRange} from './rangeKernel';
import {PROGRESS_CHUNK_CELLS, type WorkerJob, type WorkerMessage} from './rangeProtocol';

const post = (m: WorkerMessage, transfer: Transferable[] = []) =>
  (self as unknown as {postMessage(m: WorkerMessage, t: Transferable[]): void}).postMessage(m, transfer);

self.onmessage = (ev: MessageEvent<WorkerJob>) => {
  const job = ev.data;
  // the block's table starts at row `startIndex`, so the vectors are built over [0, n)
  const rv = precomputeRange(job.table, 0, job.endIndex - job.startIndex, job.step_s);
  const count = job.lat_deg.length;
  const metrics = new Float64Array(4 * count);
  const m = new Float64Array(4);
  for (let i = 0; i < count; i++) {
    cellMetrics(job.lat_deg[i], job.lon_deg[i], job.height_m[i], job.horizons_cdeg.subarray(i * 360, (i + 1) * 360), rv, m);
    metrics.set(m, 4 * i);
    if ((i + 1) % PROGRESS_CHUNK_CELLS === 0) post({type: 'progress', done: PROGRESS_CHUNK_CELLS});
  }
  post({type: 'progress', done: count % PROGRESS_CHUNK_CELLS });
  post({type: 'done', metrics}, [metrics.buffer]);
};
