// 360-degree horizon chart (PLAN.md section 7.1): terrain horizon as a filled area, Sun and Earth tracks over the
// active date range as point clouds. Lazy-loaded by the inspector; imports only the ECharts parts it uses.
import {LineChart, ScatterChart} from 'echarts/charts';
import {GridComponent, LegendComponent, TooltipComponent} from 'echarts/components';
import * as echarts from 'echarts/core';
import {CanvasRenderer} from 'echarts/renderers';
import {useEffect, useRef} from 'react';
import type {CellSky} from './useCellSky';

echarts.use([LineChart, ScatterChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

const COMPASS: Record<number, string> = {0: 'N', 90: 'E', 180: 'S', 270: 'W', 360: 'N'};
const TEXT = '#cbd5e1';
const SUN = '#fbbf24';
const EARTH = '#38bdf8';

function points(track: Float32Array, sky: CellSky): [number, number, string][] {
  const out: [number, number, string][] = [];
  for (let i = 0; i < track.length; i += 3) {
    out.push([track[i], track[i + 1], new Date(sky.t0_ms + track[i + 2] * sky.step_s * 1000).toISOString().slice(0, 16) + 'Z']);
  }
  return out;
}

export function buildOption(sky: CellSky) {
  const horizon: [number, number][] = Array.from({length: 361}, (_, az) => [az, sky.horizon_cdeg[az % 360] / 100]);
  const sun = points(sky.sun, sky);
  const earth = points(sky.earth, sky);
  let lo = Infinity;
  let hi = -Infinity;
  for (const [, el] of [...horizon, ...sun, ...earth]) {
    lo = Math.min(lo, el);
    hi = Math.max(hi, el);
  }
  const yMin = Math.floor(lo - 1);
  const yMax = Math.ceil(hi + 1);
  const tip = (name: string) => (p: {value: [number, number, string]}) =>
    `${name}<br/>${p.value[2]} UTC<br/>azimuth ${p.value[0].toFixed(1)}°, elevation ${p.value[1].toFixed(2)}°`;
  return {
    animation: false,
    backgroundColor: 'transparent',
    textStyle: {color: TEXT},
    legend: {top: 0, right: 0, textStyle: {color: TEXT}, data: ['Terrain horizon', 'Sun', 'Earth']},
    tooltip: {trigger: 'item'},
    grid: {left: 40, right: 12, top: 30, bottom: 28},
    xAxis: {
      type: 'value',
      min: 0,
      max: 360,
      interval: 45,
      name: 'azimuth, clockwise from north',
      nameLocation: 'middle',
      nameGap: 22,
      nameTextStyle: {color: TEXT, fontSize: 10},
      axisLabel: {color: TEXT, formatter: (v: number) => (v % 90 === 0 ? `${COMPASS[v]} ${v}°` : `${v}°`), fontSize: 10},
      splitLine: {show: true, lineStyle: {color: '#334155'}},
    },
    yAxis: {
      type: 'value',
      min: yMin,
      max: yMax,
      name: 'elevation (°)',
      nameTextStyle: {color: TEXT, fontSize: 10},
      axisLabel: {color: TEXT, fontSize: 10},
      splitLine: {lineStyle: {color: '#334155'}},
    },
    series: [
      {
        name: 'Terrain horizon',
        type: 'line',
        data: horizon,
        symbol: 'none',
        lineStyle: {color: '#94a3b8', width: 1},
        areaStyle: {color: '#64748b', opacity: 0.6, origin: 'start'},
        tooltip: {formatter: (p: {value: [number, number]}) => `Horizon<br/>azimuth ${p.value[0]}°, elevation ${p.value[1].toFixed(2)}°`},
        z: 1,
      },
      {name: 'Sun', type: 'scatter', data: sun, symbolSize: 3, itemStyle: {color: SUN}, tooltip: {formatter: tip('Sun')}, z: 3},
      {name: 'Earth', type: 'scatter', data: earth, symbolSize: 3, itemStyle: {color: EARTH}, tooltip: {formatter: tip('Earth')}, z: 2},
    ],
  };
}

export default function HorizonChart({sky}: {sky: CellSky}) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.EChartsType | null>(null);

  useEffect(() => {
    if (!el.current) return;
    const c = echarts.init(el.current, undefined, {renderer: 'canvas'});
    chart.current = c;
    const ro = new ResizeObserver(() => c.resize());
    ro.observe(el.current);
    return () => {
      ro.disconnect();
      c.dispose();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    chart.current?.setOption(buildOption(sky), true);
  }, [sky]);

  return <div ref={el} className="h-64 w-full" data-testid="horizon-chart" />;
}
