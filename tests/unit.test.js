/* global load, print */
['dates', 'content', 'model', 'storage', 'calendar', 'chart'].forEach((name) => load(`js/${name}.js`));

const { dates: D, content: C, model: M, storage: S, calendar: Cal, chart: Chart } = globalThis.Baby;

let passed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed += 1;
  } catch (e) {
    failures.push(`✗ ${name}\n    ${e.message}`);
  }
}

function eq(actual, expected, label = '') {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${label} 期望 ${b}，实际 ${a}`);
}

function ok(cond, label = '断言失败') {
  if (!cond) throw new Error(label);
}

const utf8Bytes = (s) => unescape(encodeURIComponent(s)).length;

// 预产期 2027-01-29 → 末次月经 2026-04-24；2026-10-12 正好是 24⁺³ 周
const DUE = '2027-01-29';

// ---------- dates ----------

test('isISODate 能识别闰年和非法日期', () => {
  eq(D.isISODate('2028-02-29'), true);
  eq(D.isISODate('2026-02-29'), false);
  eq(D.isISODate('2026-13-01'), false);
  eq(D.isISODate('2026-1-01'), false);
  eq(D.isISODate(null), false);
});

test('日期加减跨月跨年', () => {
  eq(D.addDays('2026-12-31', 1), '2027-01-01');
  eq(D.addDays('2028-03-01', -1), '2028-02-29');
  eq(D.diffDays('2026-10-12', DUE), 109);
  eq(D.diffDays(DUE, '2026-10-12'), -109);
});

test('预产期与末次月经互推（280 天）', () => {
  eq(D.lmpFromDue(DUE), '2026-04-24');
  eq(D.dueFromLmp('2026-04-24'), DUE);
});

test('孕龄计算', () => {
  eq(D.gestation(DUE, '2026-10-12'), { days: 171, weeks: 24, day: 3 });
  eq(D.gestation(DUE, DUE), { days: 280, weeks: 40, day: 0 });
  eq(D.gestation(DUE, '2026-04-20'), { days: -4, weeks: -1, day: 3 });
  eq(D.dateAtGestation(DUE, 84), '2026-07-17');
});

test('孕期阶段分界：14 周、28 周', () => {
  eq([97, 98, 195, 196].map(D.trimester), [1, 2, 2, 3]);
});

test('孕周与窗口的写法', () => {
  eq(D.formatGA(171), '24⁺³');
  eq(D.formatGA(168), '24');
  eq(D.formatWindow(77, 97), '11–13⁺⁶ 周');
  eq(D.formatWindow(196, 202), '28 周');
  eq(D.formatWindow(168, 195), '24–27⁺⁶ 周');
});

test('日期显示', () => {
  eq(D.formatDate('2026-10-15', { weekday: true }), '10月15日 周四');
  eq(D.formatDate(DUE, { relativeTo: '2026-10-12' }), '2027年1月29日');
  eq(D.formatDate('2026-11-02', { relativeTo: '2026-10-12' }), '11月2日');
  eq(D.weekday('2026-10-12'), '一');
  eq([0, 1, 2, 5, -1, -2, -6].map(D.formatRelative), ['今天', '明天', '后天', '5 天后', '昨天', '前天', '6 天前']);
});

// ---------- content ----------

test('宝宝大小覆盖 4–42 周且连续', () => {
  eq(C.SIZES.map((s) => s.week), Array.from({ length: 39 }, (_, i) => i + 4));
  eq(C.babyAt(2).week, 4);
  eq(C.babyAt(60).week, 42);
  eq(C.babyAt(24).name, '玉米');
});

test('每一周都有小提醒', () => {
  for (let w = 0; w <= 44; w += 1) ok(C.tipAt(w), `第 ${w} 周没有提醒`);
});

test('产检模板：id 唯一、窗口合理、按孕周排序', () => {
  const list = C.defaultCheckups();
  eq(new Set(list.map((c) => c.id)).size, list.length, 'id 重复');
  for (const c of list) ok(c.start <= c.target && c.target <= c.end, `${c.title} 窗口不对`);
  const targets = list.map((c) => c.target);
  eq(targets, targets.slice().sort((a, b) => a - b), '没按孕周排');
});

test('产检模板每次返回新副本', () => {
  const a = C.defaultCheckups();
  a[0].items.push('改坏');
  a[0].done = true;
  const b = C.defaultCheckups();
  ok(!b[0].items.includes('改坏') && b[0].done === false);
});

test('待产包默认清单：id 唯一、名字不重复、每个分类都有东西', () => {
  const list = C.defaultBag();
  eq(new Set(list.map((b) => b.id)).size, list.length, 'id 重复');
  eq(new Set(list.map((b) => b.name)).size, list.length, '名字重复');
  const groups = C.BAG_GROUPS.map((g) => g.id);
  for (const b of list) ok(groups.includes(b.group) && !b.done && !b.custom, `${b.name} 不对`);
  for (const g of groups) ok(list.some((b) => b.group === g), `${g} 分类是空的`);
  list[0].done = true;
  eq(C.defaultBag()[0].done, false, '应该每次返回新副本');
});

// ---------- model：体重 ----------

test('解析体重输入', () => {
  eq(M.parseKg('56.2'), 56.2);
  eq(M.parseKg(' 56,2 '), 56.2);
  eq(M.parseKg('56.2kg'), 56.2);
  eq(M.parseKg('56.25 公斤'), 56.25);
  eq(M.parseKg('112斤'), 56);
  eq(M.parseKg(52), 52);
  eq(['', 'abc', '20', '300', '56.256', '5 6', null].map(M.parseKg), [null, null, null, null, null, null, null]);
});

test('体重显示', () => {
  eq([56, 56.2, 56.25].map(M.formatKg), ['56.0', '56.2', '56.25']);
  eq([0.3, -0.25, 0, 0.001].map(M.formatKgDiff), ['+0.3', '−0.25', '±0', '±0']);
});

test('同一天的体重只保留一条，按日期排好', () => {
  const s = M.createState({ dueDate: DUE });
  M.upsertWeight(s, '2026-10-12', 56.2);
  M.upsertWeight(s, '2026-10-01', 55.4);
  M.upsertWeight(s, '2026-10-12', 56.4);
  eq(s.weights, [{ date: '2026-10-01', kg: 55.4 }, { date: '2026-10-12', kg: 56.4 }]);
  eq(M.removeWeight(s, '2026-10-01'), { date: '2026-10-01', kg: 55.4 });
  eq(M.removeWeight(s, '2026-10-01'), null);
  eq(s.weights.length, 1);
});

test('体重小结：变化、累计增重、今天是否已记', () => {
  const s = M.createState({ dueDate: DUE, preWeight: 52 });
  M.upsertWeight(s, '2026-10-05', 55.9);
  M.upsertWeight(s, '2026-10-12', 56.2);
  const today = M.weightSummary(s, '2026-10-12');
  eq(today.change, 0.3);
  eq(today.gain, 4.2);
  eq(today.todayEntry, { date: '2026-10-12', kg: 56.2 });
  const later = M.weightSummary(s, '2026-10-15');
  eq(later.todayEntry, null);
  eq(later.daysSinceLast, 3);
  const noPre = M.weightSummary(M.createState({ dueDate: DUE }), '2026-10-12');
  eq([noPre.latest, noPre.gain, noPre.daysSinceLast], [null, null, null]);
});

test('预产期校验', () => {
  eq(M.dueDateError(DUE, '2026-10-12'), null);
  ok(M.dueDateError('', '2026-10-12'));
  ok(M.dueDateError('2027-09-01', '2026-10-12'), '太远的预产期应该报错');
  ok(M.dueDateError('2026-08-01', '2026-10-12'), '早已过去的预产期应该报错');
  eq(M.dueDateError('2026-10-01', '2026-10-12'), null, '刚过预产期几天是正常的');
});

// ---------- model：产检 ----------

const nt = () => C.defaultCheckups().find((c) => c.id === 'nt');

test('产检状态：建议日期当天 / 之前 / 窗口内 / 窗口后', () => {
  // NT 建议 12 周 = 2026-07-17，窗口到 13⁺⁶ 周 = 2026-07-30
  eq(M.checkupStatus(nt(), DUE, '2026-07-17').kind, 'today');
  const before = M.checkupStatus(nt(), DUE, '2026-07-10');
  eq([before.kind, before.diff, before.booked, before.ga], ['upcoming', 7, false, 84]);
  const open = M.checkupStatus(nt(), DUE, '2026-07-20');
  eq([open.kind, open.daysLeft], ['open', 10]);
  eq(M.checkupStatus(nt(), DUE, '2026-07-30').daysLeft, 0);
  eq(M.checkupStatus(nt(), DUE, '2026-07-31').kind, 'past');
});

test('产检状态：约好的日期过了就是已过，完成优先', () => {
  const ck = { ...nt(), date: '2026-07-22' };
  eq(M.checkupStatus(ck, DUE, '2026-07-25').kind, 'past');
  eq(M.checkupStatus(ck, DUE, '2026-07-22').kind, 'today');
  eq(M.checkupStatus({ ...ck, done: true }, DUE, '2026-07-22').kind, 'done');
});

test('产检日程按日期排序，自己加的会插进对应位置', () => {
  const s = M.createState({ dueDate: DUE });
  M.addCheckup(s, { title: '复查血常规', date: '2026-08-20', items: [] });
  const rows = M.scheduleRows(s, '2026-07-01');
  const dates = rows.map((r) => r.status.date);
  eq(dates, dates.slice().sort());
  const i = rows.findIndex((r) => r.ck.title === '复查血常规');
  ok(rows[i - 1].status.date <= '2026-08-20' && rows[i + 1].status.date >= '2026-08-20');
});

test('下一次产检：窗口期内还没约的排最前', () => {
  const s = M.createState({ dueDate: DUE });
  s.checkups.filter((c) => c.target < 84).forEach((c) => { c.done = true; });
  eq(M.nextCheckup(M.scheduleRows(s, '2026-07-20')).ck.id, 'nt');
  M.updateCheckup(s, 'nt', { done: true });
  eq(M.nextCheckup(M.scheduleRows(s, '2026-07-20')).ck.id, 'screening');
  s.checkups.forEach((c) => { c.done = true; });
  eq(M.nextCheckup(M.scheduleRows(s, '2026-07-20')), null);
});

test('页面提醒只包含今天和明天、没完成的产检', () => {
  const s = M.createState({ dueDate: DUE });
  M.updateCheckup(s, 'ogtt', { date: '2026-10-13' });
  M.updateCheckup(s, 'anomaly', { date: '2026-10-12' });
  const ids = M.reminders(M.scheduleRows(s, '2026-10-12')).map((r) => r.ck.id);
  eq(ids, ['anomaly', 'ogtt']);
  M.updateCheckup(s, 'anomaly', { done: true });
  eq(M.reminders(M.scheduleRows(s, '2026-10-12')).map((r) => r.ck.id), ['ogtt']);
});

test('系统通知：前一天 18 点后、当天 7 点后各一次，不重复', () => {
  const s = M.createState({ dueDate: DUE });
  M.updateCheckup(s, 'ogtt', { date: '2026-10-13', time: '08:30' });
  eq(M.pendingNotifications(s, '2026-10-12', 17), []);
  const eve = M.pendingNotifications(s, '2026-10-12', 18);
  eq(eve.map((n) => n.key), ['ogtt@2026-10-13#eve']);
  ok(eve[0].title === '明天产检：糖耐量 OGTT' && eve[0].body.startsWith('08:30 · 前一晚'));
  M.markNotified(s, eve.map((n) => n.key), '2026-10-12');
  eq(M.pendingNotifications(s, '2026-10-12', 21), []);
  eq(M.pendingNotifications(s, '2026-10-13', 6), []);
  eq(M.pendingNotifications(s, '2026-10-13', 7).map((n) => n.key), ['ogtt@2026-10-13#day']);
  M.updateCheckup(s, 'ogtt', { date: '2026-10-20' });
  eq(M.pendingNotifications(s, '2026-10-19', 19).map((n) => n.key), ['ogtt@2026-10-20#eve'], '改期后应重新提醒');
});

test('通知记录会清理 60 天前的', () => {
  const s = M.createState({ dueDate: DUE });
  s.notified = { old: '2026-07-01', recent: '2026-10-01' };
  M.markNotified(s, ['new'], '2026-10-12');
  eq(Object.keys(s.notified).sort(), ['new', 'recent']);
});

test('删除与恢复默认产检', () => {
  const s = M.createState({ dueDate: DUE });
  const custom = M.addCheckup(s, { title: '牙科检查', date: '2026-11-01' });
  eq(M.removeCheckup(s, 'nt').index, 2);
  eq(M.removeCheckup(s, 'nt'), null);
  M.updateCheckup(s, 'ogtt', { done: true, date: '2026-10-13' });
  M.resetCheckups(s);
  const ogtt = s.checkups.find((c) => c.id === 'ogtt');
  ok(s.checkups.some((c) => c.id === 'nt'), 'NT 应该恢复');
  ok(s.checkups.some((c) => c.id === custom.id), '自己加的应保留');
  eq([ogtt.done, ogtt.date], [false, null]);
});

// ---------- model：待产包 ----------

test('待产包：打勾、添加、删除和统计', () => {
  const s = M.createState({ dueDate: DUE });
  const total = C.defaultBag().length;
  eq(M.bagSummary(s), { total, done: 0, left: total });
  eq(M.toggleBagItem(s, 'id-cards').done, true);
  eq(M.toggleBagItem(s, 'nope'), null);
  const mine = M.addBagItem(s, 'mom', '吸奶器');
  ok(mine.custom && /^b-/.test(mine.id) && !mine.done);
  const mom = M.bagGroups(s).find((g) => g.id === 'mom');
  eq(mom.items[mom.items.length - 1].name, '吸奶器', '新加的排在分类最后');
  eq(M.bagGroups(s).find((g) => g.id === 'docs').done, 1);
  eq(M.bagSummary(s), { total: total + 1, done: 1, left: total });
  eq(M.addBagItem(s, '不存在的分类', '充电宝').group, 'misc');
  eq(M.removeBagItem(s, mine.id).item.name, '吸奶器');
  eq(M.removeBagItem(s, mine.id), null);
});

test('待产包：空分类也保留，方便往里加', () => {
  const s = M.createState({ dueDate: DUE });
  s.bag = s.bag.filter((b) => b.group !== 'docs');
  const docs = M.bagGroups(s).find((g) => g.id === 'docs');
  eq([docs.items.length, docs.done], [0, 0]);
  eq(M.bagGroups(s).map((g) => g.id), C.BAG_GROUPS.map((g) => g.id));
});

test('待产包：新物品名不能为空、不能重复', () => {
  const s = M.createState({ dueDate: DUE });
  ok(M.bagItemError(s, ''));
  ok(/已经在清单里/.test(M.bagItemError(s, '保温杯')));
  eq(M.bagItemError(s, '吸奶器'), null);
});

test('待产包：恢复默认找回删掉的、清掉勾选，自己加的保持原样', () => {
  const s = M.createState({ dueDate: DUE });
  M.toggleBagItem(s, 'diapers');
  M.removeBagItem(s, 'car-seat');
  const mine = M.addBagItem(s, 'misc', '充电宝');
  M.toggleBagItem(s, mine.id);
  M.resetBag(s);
  ok(s.bag.some((b) => b.id === 'car-seat'), '删掉的应该找回来');
  eq(s.bag.find((b) => b.id === 'diapers').done, false);
  eq(s.bag.find((b) => b.id === mine.id).done, true);
  eq(s.bag.length, C.defaultBag().length + 1);
});

// ---------- model：数据校验 ----------

test('normalize：新建的数据存取一圈不变', () => {
  const s = M.createState({ dueDate: DUE, preWeight: 52, nickname: '豆豆' });
  M.upsertWeight(s, '2026-10-12', 56.2);
  M.addCheckup(s, { title: '复查', date: '2026-11-01', time: '09:00', items: ['血常规'], prep: '空腹' });
  M.toggleBagItem(s, 'id-cards');
  M.addBagItem(s, 'baby', '口水巾');
  eq(M.normalize(JSON.parse(JSON.stringify(s))), s);
});

test('normalize：拒绝没有预产期的数据，清理坏字段', () => {
  eq(M.normalize(null), null);
  eq(M.normalize({ profile: {} }), null);
  eq(M.normalize('oops'), null);
  const s = M.normalize({
    profile: { dueDate: DUE, preWeight: 'abc', nickname: '  一个特别特别特别长的小名字  ' },
    weights: [{ date: '2026-10-12', kg: 56 }, { date: '2026-10-12', kg: 57 }, { date: 'x', kg: 50 }, { date: '2026-10-01', kg: 999 }, null],
    checkups: [
      { id: 'a', title: '有日期', date: '2026-11-01', time: '25:00' },
      { id: 'a', title: '重复的 id', date: '2026-11-02' },
      { id: 'b', title: '既没日期也没孕周' },
      { id: '', title: '没 id', date: '2026-11-01' },
    ],
    notified: { k: '2026-10-12', bad: 1 },
  });
  eq(s.profile, { dueDate: DUE, preWeight: null, nickname: '一个特别特别特别长的小名' });
  eq(s.weights, [{ date: '2026-10-12', kg: 57 }]);
  eq(s.checkups.map((c) => [c.id, c.time]), [['a', '']]);
  eq(s.notified, { k: '2026-10-12' });
});

test('normalize：老数据没有 checkups 字段时补上默认日程', () => {
  eq(M.normalize({ profile: { dueDate: DUE } }).checkups.length, C.defaultCheckups().length);
});

test('normalize：老数据没有待产包时补上默认清单，删光了的保持空，坏条目清掉', () => {
  eq(M.normalize({ profile: { dueDate: DUE } }).bag, C.defaultBag());
  eq(M.normalize({ profile: { dueDate: DUE }, bag: [] }).bag, []);
  const s = M.normalize({
    profile: { dueDate: DUE },
    bag: [
      { id: 'x', group: 'mom', name: '  吸奶器  ', done: 'yes' },
      { id: 'x', group: 'mom', name: '重复的 id' },
      { id: 'y', group: '外星', name: '未知分类', note: 7, done: true, custom: true },
      { id: 'z', group: 'baby', name: '   ' },
      { name: '没 id' },
      null,
    ],
  });
  eq(s.bag, [
    { id: 'x', group: 'mom', name: '吸奶器', note: '', done: false, custom: false },
    { id: 'y', group: 'misc', name: '未知分类', note: '', done: true, custom: true },
  ]);
});

test('备份：导出再导入一致，坏文件给出中文错误', () => {
  const s = M.createState({ dueDate: DUE, preWeight: 52 });
  M.upsertWeight(s, '2026-10-12', 56.2);
  eq(S.parseBackup(S.backupText(s, new Date('2026-10-12T10:00:00Z'))), s);
  let message = '';
  try { S.parseBackup('{not json'); } catch (e) { message = e.message; }
  ok(/不是有效的备份/.test(message), message);
  try { S.parseBackup('{"profile":{}}'); } catch (e) { message = e.message; }
  ok(/没找到预产期/.test(message), message);
});

// ---------- calendar ----------

test('日历时长格式', () => {
  eq([750, -240, 480, 60, 0, -750].map(Cal.duration), ['PT12H30M', '-PT4H', 'PT8H', 'PT1H', 'PT0M', '-PT12H30M']);
});

test('日历文本转义', () => {
  eq(Cal.escapeText('a,b;c\\d\ne'), 'a\\,b\\;c\\\\d\\ne');
});

test('日历长行按字节折行，不拆汉字', () => {
  const line = `DESCRIPTION:${'孕期产检提醒🍯'.repeat(12)}`;
  const folded = Cal.fold(line);
  for (const part of folded.split('\r\n')) ok(utf8Bytes(part) <= 75, `超长：${utf8Bytes(part)} 字节`);
  eq(folded.split('\r\n').map((p, i) => (i ? p.slice(1) : p)).join(''), line);
  eq(Cal.fold('SHORT'), 'SHORT');
});

test('日历：全天产检带前一晚 8 点和当天 8 点提醒', () => {
  const ck = nt();
  const ics = Cal.build([Cal.checkupEvent(ck, M.checkupStatus(ck, DUE, '2026-07-01'))], new Date('2026-07-01T02:03:04.567Z'));
  ok(ics.startsWith('BEGIN:VCALENDAR\r\n') && ics.endsWith('END:VCALENDAR\r\n'));
  ok(!/[^\r]\n/.test(ics), '必须用 CRLF 换行');
  const unfolded = ics.replace(/\r\n /g, '');
  for (const s of ['UID:nt@pregnancy-desk', 'DTSTAMP:20260701T020304Z', 'DTSTART;VALUE=DATE:20260717', 'DTEND;VALUE=DATE:20260718', 'SUMMARY:产检 · NT 检查', 'TRIGGER:-PT4H', 'TRIGGER:PT8H', '建议日期']) {
    ok(unfolded.includes(s), `缺少 ${s}`);
  }
});

test('日历：有时间的产检，前一晚 8 点和提前 1 小时提醒，跨午夜正确', () => {
  const ck = { ...nt(), date: '2026-07-17', time: '08:30' };
  const ics = Cal.build([Cal.checkupEvent(ck, M.checkupStatus(ck, DUE, '2026-07-01'))], new Date()).replace(/\r\n /g, '');
  for (const s of ['DTSTART:20260717T083000', 'DTEND:20260717T093000', 'TRIGGER:-PT12H30M', 'TRIGGER:-PT1H']) ok(ics.includes(s), `缺少 ${s}`);
  ok(!ics.includes('建议日期'), '约好的日期不该写建议日期');
  const late = Cal.build([{ uid: 'x', title: 't', date: '2026-12-31', time: '23:30', alarms: [] }], new Date());
  ok(late.includes('DTEND:20270101T003000'), late);
});

// ---------- chart ----------

test('体重曲线：空数据不画，有数据时点数正确且没有 NaN', () => {
  eq(Chart.weight({ weights: [], dueDate: DUE, preWeight: null, today: '2026-10-12', width: 500, height: 200 }), '');
  const weights = [{ date: '2026-08-01', kg: 53.1 }, { date: '2026-09-01', kg: 54.6 }, { date: '2026-10-12', kg: 56.2 }];
  const svg = Chart.weight({ weights, dueDate: DUE, preWeight: 52, today: '2026-10-12', width: 500, height: 200 });
  eq((svg.match(/<circle/g) || []).length, 3);
  ok(!svg.includes('NaN') && !svg.includes('Infinity'), '坐标里有 NaN');
  ok(svg.includes('孕前 52.0') && svg.includes('今天'));
  const single = Chart.weight({ weights: weights.slice(0, 1), dueDate: DUE, preWeight: null, today: '2026-10-12', width: 300, height: 180 });
  ok(single.includes('<circle') && !single.includes('NaN'));
});

print(`\n${passed} 通过，${failures.length} 失败`);
if (failures.length) {
  print(failures.join('\n'));
  throw new Error('有测试没通过');
}
