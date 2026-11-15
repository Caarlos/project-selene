// Base <-> ice link (PLAN.md section 7.4): steepest mean slope among the cells crossed by the straight line between
// two cell centres. The line is straight in projection metres (as drawn on the map) and sampled every ~1 km.
import {projectStereo_m, unprojectStereo_deg} from '../../services/projection';

export interface SlopeAlongLine {
  /** Steepest `slope_mean_deg` over the crossed cells that have a value; null when none has. */
  maxSlope_deg: number | null;
  /** Row index of that cell. */
  cellIndex: number | null;
  /** Distinct scenario cells crossed. */
  cellsCrossed: number;
}

/**
 * `cellAt(lat, lon)` maps a point to its scenario row, or undefined when the cell is not in the scenario (skipped).
 * Samples include both end points.
 */
export function steepestSlopeAlong(
  a: {lat_deg: number; lon_deg: number},
  b: {lat_deg: number; lon_deg: number},
  cellAt: (lat_deg: number, lon_deg: number) => number | undefined,
  slope_mean_deg: ArrayLike<number | null>,
  step_m = 1000,
): SlopeAlongLine {
  const [ax, ay] = projectStereo_m(a.lat_deg, a.lon_deg);
  const [bx, by] = projectStereo_m(b.lat_deg, b.lon_deg);
  const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step_m));
  const crossed = new Set<number>();
  let maxSlope_deg: number | null = null;
  let cellIndex: number | null = null;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const [lat, lon] = unprojectStereo_deg(ax + t * (bx - ax), ay + t * (by - ay));
    const row = cellAt(lat, lon);
    if (row === undefined || crossed.has(row)) continue;
    crossed.add(row);
    const s = slope_mean_deg[row];
    if (s !== null && s !== undefined && (maxSlope_deg === null || s > maxSlope_deg)) {
      maxSlope_deg = s;
      cellIndex = row;
    }
  }
  return {maxSlope_deg, cellIndex, cellsCrossed: crossed.size};
}
