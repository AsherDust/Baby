(function () {
  'use strict';
  const Baby = globalThis.Baby || (globalThis.Baby = {});
  const D = Baby.dates;
  const M = Baby.model;

  const f1 = (n) => n.toFixed(1);

  /** 体重曲线（SVG 字符串）：横轴是孕周，纵轴是千克；plan 是 M.gainPlan 的结果，适用时画出推荐范围 */
  function weight({ weights, dueDate, preWeight, plan = null, today, width, height }) {
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

    // 推荐范围画到 42 周为止：[孕周, 下限, 上限]
    const band = [];
    if (plan && plan.applies && preWeight != null) {
      for (let w = Math.max(w0, 0); w <= Math.min(w1, 42); w += 1) band.push([w, ...M.gainRange(plan, w * 7).map((g) => preWeight + g)]);
    }

    const vals = pts.map((p) => p.kg);
    if (preWeight != null) vals.push(preWeight);
    if (band.length > 1) vals.push(...band.map((b) => b[2]));
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

    if (band.length > 1) {
      const edge = (i) => band.map((b) => `${f1(sx(b[0] * 7))} ${f1(sy(b[i]))}`);
      out.push(`<path d="M${edge(2).join(' L')} L${edge(1).reverse().join(' L')} Z" class="c-gain"/>`);
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

    return `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="体重变化曲线${band.length > 1 ? '，浅绿色是推荐范围' : ''}">
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

  /**
   * 生长曲线（SVG 字符串）：横轴月龄，纵轴体重 / 身长 / 头围。
   * curves 是 P3、P15、P50、P85、P97 五条线 [{ label, points: [[天, 数值]] }]，points 是宝宝自己量的 [{ day, value, date }]
   */
  function growth({ curves, points, unit, label, width, height }) {
    const pad = { l: 36, r: 34, t: 12, b: 28 };
    const iw = width - pad.l - pad.r;
    const ih = height - pad.t - pad.b;
    const maxDay = curves[0].points[curves[0].points.length - 1][0];
    const months = maxDay / 30.4375;
    const vals = curves.flatMap((c) => c.points.map((p) => p[1])).concat(points.map((p) => p.value));
    const span = Math.max(...vals) - Math.min(...vals);
    const yStep = [0.5, 1, 2, 5, 10].find((s) => span / s <= 7) || 10;
    const y0 = Math.floor(Math.min(...vals) / yStep) * yStep;
    const y1 = Math.ceil(Math.max(...vals) / yStep) * yStep;
    const sx = (day) => pad.l + (day / maxDay) * iw;
    const sy = (v) => pad.t + ((y1 - v) / (y1 - y0)) * ih;
    const path = (pts) => pts.map(([d, v], i) => `${i ? 'L' : 'M'}${f1(sx(d))} ${f1(sy(v))}`).join(' ');
    const band = (lo, hi) => `${path(lo.points)} ${hi.points.slice().reverse().map(([d, v]) => `L${f1(sx(d))} ${f1(sy(v))}`).join(' ')} Z`;

    const out = [];
    for (let v = y0; v <= y1 + 1e-9; v += yStep) {
      const y = f1(sy(v));
      out.push(`<line x1="${pad.l}" x2="${width - pad.r}" y1="${y}" y2="${y}" class="c-grid"/>`);
      out.push(`<text x="${pad.l - 8}" y="${y}" dy="0.35em" text-anchor="end" class="c-label">${Math.round(v * 10) / 10}</text>`);
    }
    const maxLabels = Math.max(2, Math.floor(iw / 44));
    const xStep = [1, 2, 3, 4, 6].find((s) => months / s <= maxLabels) || 6;
    for (let m = 0; m <= months + 1e-9; m += xStep) {
      out.push(`<text x="${f1(sx(m * 30.4375))}" y="${height - 8}" text-anchor="middle" class="c-label">${m}月</text>`);
    }
    out.push(`<path d="${band(curves[0], curves[4])}" class="c-band"/>`);
    out.push(`<path d="${band(curves[1], curves[3])}" class="c-band c-band-mid"/>`);
    curves.forEach((c) => {
      out.push(`<path d="${path(c.points)}" class="c-pline${c.label === 'P50' ? ' c-pline-mid' : ''}"/>`);
      const [d, v] = c.points[c.points.length - 1];
      out.push(`<text x="${f1(sx(d) + 4)}" y="${f1(sy(v))}" dy="0.35em" class="c-plabel">${c.label}</text>`);
    });
    if (points.length > 1) out.push(`<path d="${path(points.map((p) => [p.day, p.value]))}" class="c-line"/>`);
    points.forEach((p, i) => {
      const last = i === points.length - 1;
      out.push(`<circle cx="${f1(sx(p.day))}" cy="${f1(sy(p.value))}" r="${last ? 5 : 3.5}" class="c-pt${last ? ' c-pt-last' : ''}"><title>${D.formatDate(p.date)} · ${p.value} ${unit}</title></circle>`);
    });
    return `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${label}">${out.join('')}</svg>`;
  }

  Baby.chart = { weight, bp, growth };
})();
