// 截图和对比度测试共用的示例数据：
//   empty / main / fresh / checkup-day / late / bag-done / labor
// 需要先加载 dates.js、content.js、stories.js、model.js；empty 返回 null
function seedScene(name) {
  if (name === 'empty') return null;
  const M = Baby.model;
  const s = M.createState({ dueDate: '2027-01-29', preWeight: 52, nickname: '豆豆' });
  [['2026-06-12', 52.4], ['2026-06-26', 52.1], ['2026-07-10', 52.6], ['2026-07-24', 53.0], ['2026-08-07', 53.6],
   ['2026-08-21', 54.1], ['2026-09-04', 54.6], ['2026-09-18', 55.2], ['2026-10-02', 55.7], ['2026-10-09', 55.9]]
    .forEach(([d, k]) => M.upsertWeight(s, d, k));
  for (const id of ['early-us', 'booking', 'nt', 'screening']) M.updateCheckup(s, id, { done: true });
  M.updateCheckup(s, 'anomaly', { date: '2026-09-25', done: true });
  M.updateCheckup(s, 'ogtt', { date: '2026-10-13', time: '08:30' });
  [{ name: '叶酸', kind: 'supplement', dose: '每天 0.4 mg', start: '2026-02-01', end: '2026-07-17', note: '' },
   { name: '黄体酮', kind: 'medicine', dose: '每天 2 次', start: '2026-05-28', end: '2026-07-03', note: '医生开的，保胎' },
   { name: '复合维生素', kind: 'supplement', dose: '每天 1 片', start: '2026-07-18', end: null, note: '含叶酸，替换单独的叶酸' },
   { name: '阿莫西林', kind: 'medicine', dose: '每天 3 次', start: '2026-08-20', end: '2026-08-22', note: '牙龈发炎' },
   { name: '钙片', kind: 'supplement', dose: '每天 600 mg', start: '2026-09-11', end: null, note: '' }]
    .forEach((m) => M.addMed(s, m));
  [['2026-09-20', '08:10', 112, 72, 78], ['2026-09-27', '08:05', 116, 74, 80], ['2026-10-04', '20:30', 121, 78, 84],
   ['2026-10-08', '08:20', 118, 76, 79], ['2026-10-10', '21:00', 136, 86, 88], ['2026-10-11', '08:15', 142, 92, 90],
   ['2026-10-12', '08:00', 128, 82, 82]]
    .forEach(([date, time, sys, dia, pulse]) => M.addBp(s, { date, time, sys, dia, pulse, note: '' }));
  [['2026-10-12', 'fasting', '5.1'], ['2026-10-12', 'breakfast', '6.4'],
   ['2026-10-11', 'fasting', '5.5'], ['2026-10-11', 'breakfast', '6.2'], ['2026-10-11', 'lunch', '7.2'], ['2026-10-11', 'dinner', '6.5'], ['2026-10-11', 'night', '6.0'],
   ['2026-10-10', 'fasting', '4.9'], ['2026-10-10', 'lunch', '6.6'], ['2026-10-10', 'dinner', '3.1'],
   ['2026-10-08', 'fasting', '5.0'], ['2026-10-08', 'breakfast', '6.1'], ['2026-09-28', 'fasting', '4.8']]
    .forEach(([date, slot, value]) => M.setGlucose(s, { date, slot, value }));
  M.addUltrasound(s, { date: '2026-07-06', values: { crl: '62.5', fhr: '158' }, placenta: '', note: 'NT 1.4 mm' });
  M.addUltrasound(s, { date: '2026-09-25', values: { bpd: '58.2', hc: '212', ac: '186', fl: '41.3', fhr: '146', dvp: '5.1', efw: '520' }, placenta: '后壁 0 级', note: '大排畸未见异常' });
  M.addUltrasound(s, { date: '2026-10-09', values: { bpd: '62.4', hc: '226', ac: '203', fl: '45.0', fhr: '142', afi: '4.6', efw: '640' }, placenta: '后壁 0 级', note: '' });
  if (name === 'checkup-day') M.upsertWeight(s, '2026-10-13', 56.1);
  if (name === 'fresh') { s.meds = []; s.weights = []; s.checkups = Baby.content.defaultCheckups(); s.profile.preWeight = null; s.profile.nickname = ''; }
  if (name === 'late' || name === 'bag-done') {
    s.profile.dueDate = '2026-11-30';
    s.checkups.forEach((c) => { c.date = null; c.time = ''; c.done = c.target < 231; });
    M.addBagItem(s, 'mom', '吸奶器');
    const ticks = name === 'bag-done' ? s.bag.map((b) => b.id)
      : ['id-cards', 'insurance', 'handbook', 'reports', 'pads', 'underpads', 'briefs', 'diapers', 'wipes', 'charger'];
    ticks.forEach((id) => M.toggleBagItem(s, id));
  }
  const MIN = 60000;
  const now = Date.now();
  const session = (id, daysAgo, hour, gaps, minutes = 60) => {
    const d = new Date(now - daysAgo * 86400000);
    d.setHours(hour, 0, 0, 0);
    const start = d.getTime();
    let t = start;
    return { id, start, end: start + minutes * MIN, taps: gaps.map((g) => (t += g * MIN)) };
  };
  if (name === 'late') {
    s.kicks = [
      session('k1', 4, 21, [3, 6, 7, 2, 9, 6, 8, 6, 7]),
      session('k2', 3, 21, [5, 7, 6, 8, 1, 9, 6, 7]),
      session('k3', 2, 20, [2, 6, 9, 7, 6, 8, 6, 6, 5]),
      session('k4', 1, 21, [4, 6, 6, 3, 7, 9, 8]),
      session('k5', 1, 13, [5, 8, 12], 25),
      session('k6', 0, Math.max(new Date(now).getHours() - 2, 0), [2, 7, 1, 8, 6, 9, 7]),
    ];
  }
  if (name === 'labor') {
    s.profile.dueDate = '2026-10-19';
    s.kicks = [session('k1', 1, 21, [3, 6, 7, 2, 9, 6, 8, 6, 7]),
      { id: 'live', start: now - 22 * MIN, end: null, taps: [now - 20 * MIN, now - 19 * MIN, now - 12 * MIN, now - 4 * MIN] }];
    const gaps = [6.5, 6, 5.5, 5.5, 5, 5, 5.5, 4.5, 5, 5, 4.5, 4.5];
    let t = now - gaps.reduce((a, b) => a + b, 0) * MIN;
    s.contractions = gaps.map((g, i) => { const c = { id: `q${i}`, start: t, end: t + (48 + (i % 4) * 6) * 1000 }; t += g * MIN; return c; });
  }
  return s;
}
