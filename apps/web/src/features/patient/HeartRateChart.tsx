import { useState } from 'react';
import { HEART_RATE, chartSummary, type Sample } from './data';

// Plain SVG polyline (no chart dependency). viewBox 0 0 360 156; plot x 40–348 across the sample
// device-time range, y 128→12 for 40–180. The table view is the accessible/keyboard alternative.
const X0 = 40, X1 = 348, Y0 = 128, Y1 = 12, V0 = 40, V1 = 180;
const minutes = (iso: string) => Date.parse(iso) / 60000;

export function HeartRateChart({ samples, all = HEART_RATE.samples, interactive = false }: { samples: Sample[]; all?: Sample[]; interactive?: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  if (all.length === 0) return <p className="pt-hint">No heart-rate samples in this record.</p>;
  const t0 = minutes(all[0].iso), t1 = minutes(all.at(-1)!.iso), span = Math.max(t1 - t0, 1);
  const x = (s: Sample) => X0 + ((minutes(s.iso) - t0) / span) * (X1 - X0);
  const y = (v: number) => Y0 - ((v - V0) / (V1 - V0)) * (Y0 - Y1);
  const points = samples.map(s => `${x(s).toFixed(1)},${y(s.value).toFixed(1)}`).join(' ');
  const last = samples.at(-1);
  const mid = all[Math.floor((all.length - 1) / 2)];
  const labels = [...new Map([all[0], mid, all.at(-1)!].map(s => [s.iso, s])).values()];
  const hov = hover !== null ? all[hover] : null;

  return <div className="pt-chart">
    <svg viewBox="0 0 360 156" width="100%" role="img" aria-label={samples.length ? chartSummary(samples) : 'Heart rate: waiting for samples.'}>
      {[60, 120, 180].map(v => <g key={v}>
        <line x1={X0} x2={X1} y1={y(v)} y2={y(v)} stroke="#E4E7EC" strokeWidth="1" />
        <text x={X0 - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#3F4752">{v}</text>
      </g>)}
      <line x1={X0} x2={X1} y1={Y0} y2={Y0} stroke="#B9C2CE" strokeWidth="1" />
      {labels.map((s, i) => <text key={s.iso} x={x(s)} y={Y0 + 18} textAnchor={i === 0 ? 'start' : i === labels.length - 1 ? 'end' : 'middle'} fontSize="11" fill="#3F4752">{s.time}</text>)}
      {samples.length > 1 && <polyline points={points} fill="none" stroke="#1D4ED8" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
      {last && <circle cx={x(last)} cy={y(last.value)} r="4.5" fill="#1D4ED8" stroke="#FFFFFF" strokeWidth="2" />}
      {hov && <line x1={x(hov)} x2={x(hov)} y1={Y1} y2={Y0} stroke="#3F4752" strokeWidth="1" strokeDasharray="3 3" />}
    </svg>
    {interactive && <div className="pt-chart-hits" aria-hidden="true" onMouseLeave={() => setHover(null)}>
      {all.map((s, i) => {
        const left = i === 0 ? X0 : (x(all[i - 1]) + x(s)) / 2, right = i === all.length - 1 ? X1 : (x(s) + x(all[i + 1])) / 2;
        return <div key={s.iso} className="pt-chart-hit" style={{ left: `${(left / 360) * 100}%`, width: `${((right - left) / 360) * 100}%` }} onMouseEnter={() => setHover(i)} />;
      })}
      {hov && <div className="pt-chart-tip" style={{ left: `${(x(hov) / 360) * 100}%`, top: `${(y(hov.value) / 156) * 100}%` }}>
        <span className="mono">{hov.time}</span> · {hov.value} {HEART_RATE.unit} · device time
      </div>}
    </div>}
  </div>;
}

export function ReadingsTable({ samples }: { samples: Sample[] }) {
  return <div className="pt-table" role="table" aria-label="Heart-rate samples, device time">
    <div role="row" className="pt-table-row pt-table-head"><span role="columnheader">Device time</span><span role="columnheader">Heart rate</span><span role="columnheader">Unit</span><span role="columnheader">Source</span></div>
    {samples.map(s => <div role="row" key={s.iso} className="pt-table-row">
      <span role="cell" className="mono">{s.time}</span><span role="cell" className="mono">{s.value}</span><span role="cell">{HEART_RATE.unit}</span><span role="cell">Consumer wearable</span>
    </div>)}
  </div>;
}
