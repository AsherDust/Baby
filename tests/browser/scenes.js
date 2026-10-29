// 截图和对比度测试共用的示例数据：
//   empty / main / fresh / checkup-day / late / bag-done / labor / baby / baby-7m
//   名字后面加 -blue（比如 main-blue）：最近 5 天记了低落和焦虑，看心情关怀
// 需要先加载 dates.js、content.js、stories.js、journal.js、model.js；empty 返回 null
function seedScene(scene) {
  const blue = /-blue$/.test(scene);
  const name = scene.replace(/-blue$/, '');
  if (name === 'empty') return null;
  const M = Baby.model;
  const s = M.createState({ dueDate: '2027-01-29', preWeight: 52, height: 160, nickname: '豆豆' });
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
  s.journal = Baby.journal.normalize([
    { id: 'j1', date: '2026-10-12', time: '21:40', mood: 'excited', text: '今天豆豆踢得特别有劲，像在肚子里翻跟头。\n爸爸贴着肚子讲了半天故事，不知道听没听见。' },
    { id: 'j2', date: '2026-10-12', time: '09:15', mood: 'tired', text: '昨晚起夜三次，早上有点没精神。' },
    { id: 'j3', date: '2026-10-11', time: '20:05', mood: 'anxious', text: '后天要做糖耐，有点紧张，怕喝糖水会吐。' },
    { id: 'j4', date: '2026-10-08', time: '18:30', mood: 'happy', text: '买了第一件小衣服，奶黄色的，好小一件！' },
    { id: 'j5', date: '2026-10-03', time: '', mood: 'calm', text: '' },
    { id: 'j6', date: '2026-09-25', time: '16:20', mood: 'happy', text: '大排畸顺利通过，医生说豆豆很配合，一下就拍好了。' },
    { id: 'j7', date: '2026-09-18', time: '22:10', mood: 'low', text: '腰酸得睡不着，翻来覆去。' },
  ]);
  if (name === 'checkup-day') M.upsertWeight(s, '2026-10-13', 56.1);
  if (name === 'fresh') { s.meds = []; s.weights = []; s.journal = []; s.checkups = Baby.content.defaultCheckups(); s.profile.preWeight = null; s.profile.height = null; s.profile.nickname = ''; }
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
  if (name === 'baby' || name === 'baby-7m') {
    // 宝宝出生后：baby 是 2 个月大、记了一整天的；baby-7m 是 7 个月大、开始吃辅食的
    const B = Baby.baby;
    const small = name === 'baby';
    s.profile.dueDate = small ? '2026-08-20' : '2026-03-05';
    s.baby = B.born({ name: '豆豆', sex: 'girl', birthDate: small ? '2026-08-15' : '2026-03-02', birthTime: '06:40', weight: '3.2', length: '50', head: '34' });
    const b = s.baby;
    const grow = small
      ? [['2026-09-15', 4.4, 54.5, 37.2], ['2026-10-10', 5.3, 57.8, 38.6]]
      : [['2026-04-02', 4.3, 54.2, 37], ['2026-05-02', 5.4, 58, 38.9], ['2026-06-02', 6.2, 61.1, 40.3], ['2026-07-02', 6.8, 63.4, 41.2], ['2026-09-02', 7.6, 66.6, 42.4], ['2026-10-02', 7.9, 68, 42.9]];
    grow.forEach(([date, weight, length, head]) => B.setGrowth(b, { date, weight, length, head }));
    const done = small ? ['hepb-1', 'bcg', 'hepb-2'] : ['hepb-1', 'bcg', 'hepb-2', 'ipv-1', 'dtap-1', 'ipv-2', 'bopv-3', 'dtap-2', 'hepb-3', 'dtap-3'];
    for (const r of B.vaccineRows(b, Baby.babyBook, '2026-10-12')) if (done.includes(r.id)) B.setVaccine(b, r.id, { done: r.due });
    const exams = small ? [['visit', '2026-08-20'], ['d42', '2026-09-27']] : [['visit', '2026-03-08'], ['d42', '2026-04-14'], ['m3', '2026-06-05']];
    exams.forEach(([id, date]) => B.setExam(b, id, { done: date }));
    const papers = small ? ['cert', 'hukou', 'insure', 'card', 'vax'] : Baby.babyBook.papers.map((p) => p.id);
    papers.forEach((id, i) => { b.papers[id] = Baby.dates.addDays(b.birthDate, 2 + i); });
    if (small) B.setVaccine(b, 'ipv-1', { booked: '2026-10-13' });
    else {
      ['smile', 'head', 'roll', 'sit'].forEach((id, i) => { b.milestones[id] = ['2026-04-20', '2026-05-10', '2026-07-05', '2026-09-20'][i]; });
      B.addMoment(b, '第一次去公园', '2026-05-01');
      ['强化铁米粉', '猪肉', '南瓜', '胡萝卜', '西兰花', '苹果', '鸡蛋', '牛肉'].forEach((f, i) => { b.tried[f] = Baby.dates.addDays('2026-09-02', i * 3); });
      B.setFoodNote(b, '鸡蛋', 'reaction', '嘴边起了小红点', '2026-09-21');
      B.setFoodNote(b, '南瓜', 'like', '', '2026-09-10');
      B.setFoodNote(b, '西兰花', 'dislike', '吐出来了', '2026-09-15');
    }
    const t = (day, hm) => B.msAt(day, hm);
    const log = (day, hm, type, fields) => B.addLog(b, { type, start: t(day, hm), note: '', ...fields });
    const day = '2026-10-12';
    const prev = '2026-10-11';
    log(prev, '22:40', 'sleep', { end: t(day, '01:10') });
    log(day, '01:20', 'breast', { left: 600, right: 420, end: t(day, '01:37'), side: null, since: null });
    log(day, '01:45', 'diaper', { pee: true, poo: false, color: '' });
    log(day, '02:00', 'sleep', { end: t(day, '05:30') });
    log(day, '05:40', 'breast', { left: 480, right: 540, end: t(day, '05:57'), side: null, since: null });
    log(day, '06:00', 'diaper', { pee: true, poo: true, color: 'yellow' });
    log(day, '08:30', 'med', { name: '维生素 D', dose: '1 粒' });
    log(day, '09:00', 'bottle', { ml: small ? 90 : 150, milk: 'breast' });
    log(day, '09:40', 'sleep', { end: t(day, '11:10') });
    log(day, '11:15', 'diaper', { pee: true, poo: false, color: '' });
    if (!small) log(day, '11:30', 'food', { text: '猪肉泥', amount: '5 勺', recipe: 'pork-puree' });
    log(day, '12:30', 'breast', { left: 720, right: 300, end: t(day, '12:47'), side: null, since: null });
    log(day, '13:00', 'temp', { value: 36.9, site: 'armpit' });
    log(day, '13:20', 'sleep', { end: t(day, '15:00') });
    log(day, '15:05', 'diaper', { pee: false, poo: true, color: 'green' });
    log(day, '17:30', 'bottle', { ml: small ? 120 : 180, milk: 'formula' });
    if (!small) log(day, '18:10', 'food', { text: '南瓜小米粥', amount: '半碗', recipe: 'millet-pumpkin-congee' });
  }
  if (name === 'labor') {
    s.profile.dueDate = '2026-10-19';
    s.kicks = [session('k1', 1, 21, [3, 6, 7, 2, 9, 6, 8, 6, 7]),
      { id: 'live', start: now - 22 * MIN, end: null, taps: [now - 20 * MIN, now - 19 * MIN, now - 12 * MIN, now - 4 * MIN] }];
    const gaps = [6.5, 6, 5.5, 5.5, 5, 5, 5.5, 4.5, 5, 5, 4.5, 4.5];
    let t = now - gaps.reduce((a, b) => a + b, 0) * MIN;
    s.contractions = gaps.map((g, i) => { const c = { id: `q${i}`, start: t, end: t + (48 + (i % 4) * 6) * 1000 }; t += g * MIN; return c; });
  }
  if (blue) {
    for (let i = 0; i < 5; i += 1) {
      Baby.journal.add(s, { date: Baby.dates.addDays('2026-10-12', -i), mood: i % 2 ? 'anxious' : 'low', text: i ? '' : '夜里醒了好几次，白天也提不起劲。' }, '2026-10-12', Date.now());
    }
  }
  return s;
}
