'use client';

import { useState } from 'react';

export default function ActivityChart({ periods, group }) {
  const [selected, setSelected] = useState(Math.max(0, periods.length - 1));
  if (!periods.length) return <p>No hay periodos para mostrar.</p>;
  const maximum = Math.max(1, ...periods.map(([, count]) => count));
  const x = index => 40 + (periods.length === 1 ? 400 : index * 800 / (periods.length - 1));
  const y = count => 210 - count * 180 / maximum;
  const line = periods.map(([, count], index) => `${x(index)},${y(count)}`).join(' ');
  const [period, count] = periods[selected];
  const label = group === 'week' ? `Semana del ${period}` : period;
  const total = periods.reduce((sum, [, count]) => sum + count, 0);
  function pointAt(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    const fraction = ((event.clientX - rect.left) / rect.width * 880 - 40) / 800;
    setSelected(Math.max(0, Math.min(periods.length - 1, Math.round(fraction * (periods.length - 1)))));
  }
  return <div>
    <h2 style={{ fontSize: 24, margin: '0 0 8px' }}>Actividad de tu Tappia</h2>
    <p>Explora las aperturas del periodo seleccionado. Pasa el cursor por la gráfica o mueve el control.</p>
    <div aria-live="polite" style={{ color: '#214a35', fontSize: 18, minHeight: 32 }}>
      <strong>{count.toLocaleString('es-MX')} aperturas</strong> · {label}
    </div>
    {!total && <p>Todavía no hay aperturas en este intervalo.</p>}
    <svg viewBox="0 0 880 250" role="img" aria-label={`Actividad: ${total} aperturas en ${periods.length} periodos. Usa el control inferior para consultar cada periodo.`} onPointerMove={pointAt} onPointerDown={pointAt} style={{ width: '100%', display: 'block', touchAction: 'pan-y' }}>
      {[0, 0.5, 1].map(fraction => <g key={fraction}>
        <line x1="40" x2="840" y1={y(maximum * fraction)} y2={y(maximum * fraction)} stroke="#dce3d5" />
        <text x="32" y={y(maximum * fraction) + 4} textAnchor="end" fontSize="12" fill="#566a5c">{Number((maximum * fraction).toFixed(1))}</text>
      </g>)}
      <polygon points={`${x(0)},210 ${line} ${x(periods.length - 1)},210`} fill="#e5efe5" />
      <polyline points={line} fill="none" stroke="#214a35" strokeWidth="3" strokeLinejoin="round" />
      <line x1={x(selected)} x2={x(selected)} y1="25" y2="210" stroke="#7a967c" strokeDasharray="4 4" />
      <circle cx={x(selected)} cy={y(count)} r="6" fill="#214a35" stroke="white" strokeWidth="2" />
      <text x="40" y="240" fontSize="13" fill="#566a5c">{periods[0][0]}</text>
      <text x="840" y="240" textAnchor="end" fontSize="13" fill="#566a5c">{periods[periods.length - 1][0]}</text>
    </svg>
    <label style={{ display: 'block' }}>Explorar periodo
      <input type="range" min="0" max={periods.length - 1} value={selected} onChange={event => setSelected(Number(event.target.value))} aria-valuetext={`${label}: ${count} aperturas`} style={{ display: 'block', width: '100%', accentColor: '#214a35', minHeight: 32 }} />
    </label>
  </div>;
}
