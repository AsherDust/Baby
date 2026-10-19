(function () {
  'use strict';
  const Baby = globalThis.Baby || (globalThis.Baby = {});
  const D = Baby.dates;
  const M = Baby.model;

  const f1 = (n) => n.toFixed(1);

  /** 体重曲线（SVG 字符串）：横轴是孕周，纵轴是千克 */
  function weight({ weights, dueDate, preWeight, today, width, height }) {
    if (!weights.length) return '';
    const pad = { l: 40, r: 18, t: 24, b: 30 };
    const iw = width - pad.l - pad.r;
    const ih = height - pad.t - pad.b;
    const pts = weights.map((w) => ({ ...w, ga: D.gestation(dueDate, w.date).days }));
    const todayGA = D.gestation(dueDate, today).days;

    const gas = pts.map((p) => p.ga);
    const minGA = Math.min(...gas);
    let w0 = Math.floor(minGA / 7) - 1;
    let w1 = Math.ceil(Math.max(...gas, todayGA) / 7) + 1;
    if (minGA >= 0) w0 = Math.max(0, w0);
    if (w1 - w0 < 8) w1 = w0 + 8;

    const vals = pts.map((p) => p.kg);
    if (preWeight != null) vals.push(preWeight);
    let y0 = Math.floor(Math.min(...vals) - 0.5);
    let y1 = Math.ceil(Math.max(...vals) + 0.5);
    if (y1 - y0 < 4) {
      y0 = Math.floor((y0 + y1) / 2 - 2);
      y1 = y0 + 4;
    }
    const yStep = y1 - y0 <= 6 ? 1 : y1 - y0 <= 14 ? 2 : 5;
    y0 = Math.floor(y0 / yStep) * yStep;
    y1 = Math.ceil(y1 / yStep) * yStep;

    const sx = (ga) => pad.l + ((ga / 7 - w0) / (w1 - w0)) * iw;
    const sy = (kg) => pad.t + ((y1 - kg) / (y1 - y0)) * ih;
    const bottom = pad.t + ih;

    const out = [];
    for (let v = y0; v <= y1; v += yStep) {
      const y = f1(sy(v));
      out.push(`<line x1="${pad.l}" x2="${width - pad.r}" y1="${y}" y2="${y}" class="c-grid"/>`);
      out.push(`<text x="${pad.l - 10}" y="${y}" dy="0.35em" text-anchor="end" class="c-label">${v}</text>`);
    }

    const maxLabels = Math.max(2, Math.floor(iw / 48));
    const xStep = [1, 2, 4, 8].find((s) => (w1 - w0) / s <= maxLabels) || 8;
    for (let w = Math.max(0, Math.ceil(w0 / xStep) * xStep); w <= w1; w += xStep) {
      out.push(`<text x="${f1(sx(w * 7))}" y="${height - 8}" text-anchor="middle" class="c-label">${w}周</text>`);
    }

    const tx = f1(sx(todayGA));
    out.push(`<line x1="${tx}" x2="${tx}" y1="${pad.t - 4}" y2="${bottom}" class="c-today"/>`);
    out.push(`<text x="${tx}" y="${pad.t - 10}" text-anchor="middle" class="c-today-label">今天</text>`);

    if (preWeight != null) {
      const by = sy(preWeight);
      out.push(`<line x1="${pad.l}" x2="${width - pad.r}" y1="${f1(by)}" y2="${f1(by)}" class="c-base"/>`);
      out.push(`<text x="${width - pad.r - 4}" y="${f1(by + 15)}" text-anchor="end" class="c-base-label">孕前 ${M.formatKg(preWeight)}</text>`);
    }

    const xy = pts.map((p) => [sx(p.ga), sy(p.kg)]);
    if (xy.length > 1) {
      const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${f1(x)} ${f1(y)}`).join(' ');
      out.push(`<path d="${line} L${f1(xy[xy.length - 1][0])} ${f1(bottom)} L${f1(xy[0][0])} ${f1(bottom)} Z" class="c-area"/>`);
      out.push(`<path d="${line}" class="c-line"/>`);
    }

    pts.forEach((p, i) => {
      const [x, y] = xy[i];
      const last = i === pts.length - 1;
      const tip = `${D.formatDate(p.date)} · ${p.ga >= 0 ? `孕 ${D.formatGA(p.ga)} 周` : '孕前'} · ${M.formatKg(p.kg)} kg`;
      out.push(`<circle cx="${f1(x)}" cy="${f1(y)}" r="${last ? 5.5 : 3.5}" class="c-pt${last ? ' c-pt-last' : ''}"><title>${tip}</title></circle>`);
    });

    const [lx, ly] = xy[xy.length - 1];
    const labelY = ly - 13 < pad.t + 4 ? ly + 22 : ly - 13;
    const anchor = lx > width - pad.r - 24 ? 'end' : lx < pad.l + 24 ? 'start' : 'middle';
    out.push(`<text x="${f1(lx)}" y="${f1(labelY)}" text-anchor="${anchor}" class="c-last-label">${M.formatKg(pts[pts.length - 1].kg)}</text>`);

    return `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="体重变化曲线">
      <defs>
        <linearGradient id="c-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stop-color="#E9A93C" stop-opacity="0.34"/>
          <stop offset="1" stop-color="#E9A93C" stop-opacity="0"/>
        </linearGradient>
      </defs>
      ${out.join('')}
    </svg>`;
  }

  /** 血压折线（最近 14 次，等间距）：高压、低压两条线，140 / 90 两条参考线 */
  function bp({ records, width, height }) {
    const list = records.slice(-14);
    if (!list.length) return '';
    const pad = { l: 34, r: 16, t: 16, b: 26 };
    const iw = width - pad.l - pad.r;
    const ih = height - pad.t - pad.b;
    const vals = list.flatMap((r) => [r.sys, r.dia]).concat(140, 90);
    const y0 = Math.floor((Math.min(...vals) - 10) / 20) * 20;
    const y1 = Math.ceil((Math.max(...vals) + 10) / 20) * 20;
    const n = list.length;
    const sx = (i) => pad.l + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
    const sy = (v) => pad.t + ((y1 - v) / (y1 - y0)) * ih;

    const out = [];
    for (let v = y0; v <= y1; v += 20) {
      const y = f1(sy(v));
      out.push(`<line x1="${pad.l}" x2="${width - pad.r}" y1="${y}" y2="${y}" class="c-grid"/>`);
      out.push(`<text x="${pad.l - 8}" y="${y}" dy="0.35em" text-anchor="end" class="c-label">${v}</text>`);
    }
    for (const g of [140, 90]) {
      const y = f1(sy(g));
      out.push(`<line x1="${pad.l}" x2="${width - pad.r}" y1="${y}" y2="${y}" class="c-guide"/>`);
    }
    const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 56))));
    list.forEach((r, i) => {
      if (i % every && i !== n - 1) return;
      const [, m, d] = r.date.split('-').map(Number);
      out.push(`<text x="${f1(sx(i))}" y="${height - 8}" text-anchor="middle" class="c-label">${m}/${d}</text>`);
    });
    for (const [key, cls] of [['sys', 'c-line'], ['dia', 'c-line c-line-2']]) {
      if (n > 1) out.push(`<path d="${list.map((r, i) => `${i ? 'L' : 'M'}${f1(sx(i))} ${f1(sy(r[key]))}`).join(' ')}" class="${cls}"/>`);
      list.forEach((r, i) => {
        const tip = `${D.formatDate(r.date)}${r.time ? ` ${r.time}` : ''} · ${r.sys}/${r.dia}`;
        out.push(`<circle cx="${f1(sx(i))}" cy="${f1(sy(r[key]))}" r="3.5" class="c-pt${key === 'dia' ? ' c-pt-2' : ''}"><title>${tip}</title></circle>`);
      });
    }
    return `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="血压变化">${out.join('')}</svg>`;
  }

  Baby.chart = { weight, bp };
})();
