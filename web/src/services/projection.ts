// South polar stereographic projection on the lunar sphere (PLAN.md section 7.1) and lunar surface distance.
// Longitude 0 points up (+y), 90E points right (+x); true scale at the pole.
import {cellToBoundary} from 'h3-js';

/** Moon reference sphere radius, metres (PLAN.md section 5). */
export const R_MOON_M = 1_737_400;

const RAD = Math.PI / 180;

/** (lat, lon) in degrees -> [x_m, y_m]. `r = 2R tan(pi/4 - |lat|/2)`, `x = r sin(lon)`, `y = r cos(lon)`. */
export function projectStereo_m(lat_deg: number, lon_deg: number): [number, number] {
  const r = 2 * R_MOON_M * Math.tan(Math.PI / 4 - (Math.abs(lat_deg) * RAD) / 2);
  return [r * Math.sin(lon_deg * RAD), r * Math.cos(lon_deg * RAD)];
}

/** [x_m, y_m] -> [lat_deg, lon_deg], southern hemisphere, lon east-positive in (-180, 180]. The pole returns lon 0. */
export function unprojectStereo_deg(x_m: number, y_m: number): [number, number] {
  const lat = -90 + (2 * Math.atan(Math.hypot(x_m, y_m) / (2 * R_MOON_M))) / RAD;
  const lon = Math.atan2(x_m, y_m) / RAD;
  return [lat, lon <= -180 ? lon + 360 : lon];
}

/** Great-circle distance along the lunar reference sphere, metres (haversine, R = 1,737,400 m). */
export function surfaceDistance_m(lat1_deg: number, lon1_deg: number, lat2_deg: number, lon2_deg: number): number {
  const p1 = lat1_deg * RAD;
  const p2 = lat2_deg * RAD;
  const a =
    Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(((lon2_deg - lon1_deg) * RAD) / 2) ** 2;
  return 2 * R_MOON_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Outline of an H3 cell in projection metres, flat [x0, y0, x1, y1, ...] (deck.gl `positionFormat: 'XY'`).
 * Cells have 6, 7 or 8 vertices. H3 lat/lon are read as selenographic (D-01); no seam handling is needed after projecting.
 */
export function cellPolygon_m(h3: string): number[] {
  return cellToBoundary(h3).flatMap(([lat, lon]) => projectStereo_m(lat, lon));
}
