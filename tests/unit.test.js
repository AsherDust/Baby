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

// ---------- model：用药与补剂 ----------

const med = (over = {}) => ({ name: '叶酸', kind: 'supplement', dose: '每天 1 片', start: '2026-02-01', end: null, note: '', ...over });

test('用药表单校验', () => {
  const today = '2026-10-12';
  eq(M.medError(med(), today), null);
  ok(/名字/.test(M.medError(med({ name: '  ' }), today)));
  ok(/开始日期/.test(M.medError(med({ start: '' }), today)));
  ok(/晚于今天/.test(M.medError(med({ start: '2026-10-13' }), today)));
  ok(/早于开始/.test(M.medError(med({ end: '2026-01-01' }), today)));
  eq(M.medError(med({ end: '2026-12-01' }), today), null, '计划以后停是可以的');
});

test('用药记录：按开始日期排，算出孕龄范围、天数和经过的阶段', () => {
  // 末次月经 2026-04-24，今天 2026-10-12 是第 171 天
  const s = M.createState({ dueDate: DUE });
  M.addMed(s, med({ name: '钙片', start: '2026-09-11' }));
  M.addMed(s, med({ start: '2026-02-01', end: '2026-07-17' }));
  M.addMed(s, med({ name: '黄体酮', kind: 'medicine', start: '2026-05-28', end: '2026-07-03' }));
  M.addMed(s, med({ name: '铁剂', start: '2026-10-01', end: '2026-11-30' }));
  const rows = M.medRows(s, '2026-10-12');
  eq(rows.map((r) => r.med.name), ['叶酸', '黄体酮', '钙片', '铁剂']);
  const [folic, prog, calcium, iron] = rows;
  eq([folic.startGA, folic.untilGA, folic.ongoing, folic.days, folic.stages], [-82, 84, false, 167, ['pre', 't1']]);
  eq(prog.stages, ['t1']);
  eq([calcium.ongoing, calcium.untilGA, calcium.endGA, calcium.days, calcium.stages], [true, 171, null, 32, ['t2']]);
  eq([iron.ongoing, iron.untilGA, iron.endGA], [true, 171, 220], '计划以后停的只算到今天');
  M.stopMed(s, calcium.med.id, '2026-10-12');
  const stopped = M.medRows(s, '2026-10-12')[2];
  eq([stopped.ongoing, stopped.untilGA, stopped.days], [false, 171, 32], '今天停的不算在吃');
});

test('用药时间轴：往前画到最早的开始（最多孕前 16 周），往后 40–44 周', () => {
  const s = M.createState({ dueDate: DUE });
  const tl = () => M.medTimeline(M.medRows(s, '2026-10-12'), 171);
  eq(tl(), { from: 0, to: 280 });
  M.addMed(s, med({ start: '2026-02-01', end: '2026-07-17' }));
  eq(tl(), { from: -82, to: 280 });
  M.addMed(s, med({ name: '很早', start: '2025-06-01', end: '2025-07-01' }));
  eq(tl().from, -112);
  M.addMed(s, med({ name: '吃到产后', start: '2026-10-01', end: '2027-03-01' }));
  eq(tl().to, 308);
});

test('用药：添加时整理文字，修改、记为停了、删除', () => {
  const s = M.createState({ dueDate: DUE });
  const m = M.addMed(s, med({ name: '  复合维生素  ', note: '长'.repeat(200) }));
  ok(/^m-/.test(m.id));
  eq([m.name, m.note.length, m.end], ['复合维生素', 120, null]);
  M.updateMed(s, m.id, med({ name: '复合维生素', kind: 'medicine', end: '' }));
  eq([s.meds[0].kind, s.meds[0].end], ['medicine', null]);
  const stopped = M.stopMed(s, m.id, '2026-10-12');
  eq([stopped.previous, s.meds[0].end], [null, '2026-10-12']);
  eq(M.stopMed(s, 'nope', '2026-10-12'), null);
  eq(M.removeMed(s, m.id).index, 0);
  eq(M.removeMed(s, m.id), null);
});

// ---------- model：数胎动 ----------

const MIN = 60000;
const T0 = Date.UTC(2026, 9, 12, 12, 0);
const at = (m) => T0 + m * MIN;
const kickSession = (id, startMin, tapMins, endMin = null) =>
  ({ id, start: at(startMin), end: endMin == null ? null : at(endMin), taps: tapMins.map((m) => at(m)) });
const everySix = (from) => [0, 6, 12, 18, 24, 30, 36, 42, 48, 54].map((m) => from + m);

test('胎动：5 分钟内连续的只算 1 次', () => {
  eq(M.countedKicks([0, 1, 4.9, 5, 11, 12].map(at)).map((t) => (t - T0) / MIN), [0, 5, 11]);
  eq(M.countedKicks([]), []);
});

test('胎动：开始、点「动了」、满 1 小时自动结束', () => {
  const s = M.createState({ dueDate: DUE });
  eq(M.tapKick(s, at(0)), null, '没开始时点了不算');
  const k = M.startKicks(s, at(0));
  eq(M.startKicks(s, at(3)), k, '数着的时候再点开始还是这一次');
  eq([M.tapKick(s, at(1)).counted, M.tapKick(s, at(2)).counted, M.tapKick(s, at(7)).counted], [true, false, true]);
  eq(M.activeKicks(s, at(59.9)), k);
  eq(M.activeKicks(s, at(60)), null);
  eq(M.tapKick(s, at(61)), null, '过了 1 小时点了不算');
  eq(M.settleKicks(s, at(61)), k);
  eq([k.end, M.settleKicks(s, at(62))], [at(60), null]);
  const next = M.startKicks(s, at(90));
  ok(next !== k && s.kicks.length === 2);
  eq(M.endKicks(s, at(100)).end, at(100));
  eq(M.activeKicks(s, at(101)), null);
});

test('胎动：每次的结论，和最近几次的平均比', () => {
  const s = M.createState({ dueDate: DUE });
  s.kicks = [
    kickSession('a', 0, everySix(0), 60),
    kickSession('b', 120, everySix(120), 180),
    kickSession('c', 240, everySix(240), 300),
    kickSession('d', 360, [360, 370, 380, 390], 420),
    kickSession('e', 480, [480, 490], 540),
    kickSession('f', 600, [600], 620),
    kickSession('g', 700, [700, 706, 712], 720),
    kickSession('h', 800, [801]),
  ];
  const rows = M.kickReview(s, at(810));
  eq(rows.map((r) => r.session.id).join(''), 'hgfedcba', '新的在前');
  eq(rows.map((r) => r.verdict), [null, 'ok', 'short', 'low', 'drop', 'ok', 'ok', 'ok']);
  const d = rows[4];
  eq([d.count, d.baseline, d.full, d.minutes], [4, 10, true, 60]);
  eq([rows[2].minutes, rows[2].full], [20, false]);
  eq([rows[0].running, rows[0].count, rows[0].minutes], [true, 1, 10]);
  eq(rows[0].date, D.localISO(new Date(at(800))));
});

// ---------- model：宫缩计时 ----------

const contraction = (id, startMin, seconds) => ({ id, start: at(startMin), end: seconds == null ? null : at(startMin) + seconds * 1000 });

test('宫缩：点一下开始、再点一下结束，开始新的时清掉 7 天前的', () => {
  const s = M.createState({ dueDate: DUE });
  s.contractions = [contraction('old', -8 * 24 * 60, 50)];
  const first = M.toggleContraction(s, at(0));
  ok(first.started && M.activeContraction(s) === first.contraction);
  eq(s.contractions.map((c) => c.id), [first.contraction.id], '7 天前的清掉了');
  const second = M.toggleContraction(s, at(0) + 50000);
  ok(!second.started && second.contraction === first.contraction);
  eq([first.contraction.end - first.contraction.start, M.activeContraction(s)], [50000, null]);
  eq(M.removeContraction(s, first.contraction.id).index, 0);
  eq(M.removeContraction(s, 'nope'), null);
});

test('宫缩：列表算出持续多久、隔了多久', () => {
  const s = M.createState({ dueDate: DUE });
  s.contractions = [contraction('a', 0, 40), contraction('b', 7, 55), contraction('c', 13)];
  const rows = M.contractionRows(s, at(14));
  eq(rows.map((r) => [r.contraction.id, r.duration, r.interval]), [['c', null, 6 * MIN], ['b', 55000, 7 * MIN], ['a', 40000, null]]);
  eq(M.contractionRows(s, at(14), 10 * MIN).length, 2, '只看最近一段时间');
});

test('宫缩：判断规律程度（5-1-1）', () => {
  const s = M.createState({ dueDate: DUE });
  const series = (every, seconds, n) => Array.from({ length: n }, (_, i) => contraction(`q${i}`, i * every, seconds));
  const stats = (now) => M.contractionStats(s, now);

  s.contractions = series(5, 60, 13);
  const go = stats(at(60) + 61000);
  eq([go.count, go.avgInterval, go.avgDuration, go.level], [12, 5, 60, 'go']);

  s.contractions = series(5, 60, 6);
  eq(stats(at(26)).level, 'watch', '才持续了 25 分钟，还不算 5-1-1');
  s.contractions = series(8, 40, 6);
  eq(stats(at(41)).level, 'watch');
  s.contractions = series(15, 40, 4);
  eq([stats(at(46)).avgInterval, stats(at(46)).level], [15, 'early']);
  s.contractions = series(5, 60, 1);
  eq(stats(at(2)).level, 'none');
  s.contractions = [contraction('a', 0, 50), contraction('b', 5, 600), contraction('c', 10, 50)];
  eq(stats(at(11)).count, 2, '超过 5 分钟的多半是忘了点结束，不算');
});

// ---------- model：血压 ----------

const bp = (over = {}) => ({ date: '2026-10-12', time: '08:30', sys: '118', dia: '76', pulse: '', note: '', ...over });

test('血压：表单校验', () => {
  const today = '2026-10-12';
  eq(M.bpError(bp(), today), null);
  ok(/高压/.test(M.bpError(bp({ sys: '' }), today)));
  ok(/高压/.test(M.bpError(bp({ sys: '118.5' }), today)), '要整数');
  ok(/低压/.test(M.bpError(bp({ dia: '20' }), today)));
  ok(/填反/.test(M.bpError(bp({ sys: '70', dia: '110' }), today)));
  ok(/心率/.test(M.bpError(bp({ pulse: '300' }), today)));
  ok(/晚于今天/.test(M.bpError(bp({ date: '2026-10-13' }), today)));
});

test('血压：按日期时间排，分级，最近 7 天汇总', () => {
  const s = M.createState({ dueDate: DUE });
  const a = M.addBp(s, bp({ date: '2026-10-12', time: '20:00', sys: '142', dia: '88' }));
  M.addBp(s, bp({ date: '2026-10-12', time: '08:00' }));
  M.addBp(s, bp({ date: '2026-10-01', time: '', sys: '165', dia: '100' }));
  M.addBp(s, bp({ date: '2026-10-08', sys: '85', dia: '55', pulse: '72' }));
  eq(s.bp.map((r) => `${r.date} ${r.time}`), ['2026-10-01 ', '2026-10-08 08:30', '2026-10-12 08:00', '2026-10-12 20:00']);
  eq([a.sys, a.dia, a.pulse], [142, 88, null]);
  eq(s.bp.map(M.bpLevel), ['severe', 'low', 'ok', 'high']);
  eq(M.bpLevel({ sys: 130, dia: 90 }), 'high', '低压到 90 也算高');
  const sum = M.bpSummary(s, '2026-10-12');
  eq([sum.count, sum.high, sum.todayCount, sum.latest.time], [3, 1, 2, '20:00']);
  eq(M.removeBp(s, a.id).index, 3);
  eq(M.removeBp(s, a.id), null);
});

// ---------- model：血糖 ----------

test('血糖：目标值和分级（餐后 1 小时 / 2 小时）', () => {
  eq([M.glucoseTarget('fasting', 2), M.glucoseTarget('lunch', 2), M.glucoseTarget('lunch', 1), M.glucoseTarget('night', 1)], [5.3, 6.7, 7.8, 6.7]);
  eq(M.glucoseLevel(5.3, 'fasting', 2), 'ok', '等于目标值不算高');
  eq(M.glucoseLevel(5.4, 'fasting', 2), 'high');
  eq(M.glucoseLevel(7.2, 'dinner', 2), 'high');
  eq(M.glucoseLevel(7.2, 'dinner', 1), 'ok');
  eq(M.glucoseLevel(3.2, 'breakfast', 2), 'low');
  eq([M.parseGlucose('5,6'), M.parseGlucose(' 6.25 '), M.parseGlucose('0.5'), M.parseGlucose('abc'), M.parseGlucose('40')], [5.6, 6.3, null, null, null]);
});

test('血糖：同一天同一时间点只留一条，按天汇总', () => {
  const s = M.createState({ dueDate: DUE });
  const g = (date, slot, value) => ({ date, slot, value });
  eq(M.glucoseError(g('2026-10-12', 'lunch', '6.1'), '2026-10-12'), null);
  ok(/mmol/.test(M.glucoseError(g('2026-10-12', 'lunch', '110'), '2026-10-12')));
  ok(/什么时候/.test(M.glucoseError(g('2026-10-12', 'brunch', '6'), '2026-10-12')));
  eq(M.setGlucose(s, g('2026-10-12', 'lunch', '6.1')), null);
  M.setGlucose(s, g('2026-10-12', 'fasting', '5.6'));
  M.setGlucose(s, g('2026-10-11', 'night', '3.1'));
  eq(M.setGlucose(s, g('2026-10-12', 'lunch', '7.0')), { date: '2026-10-12', slot: 'lunch', value: 6.1 }, '返回被替换的');
  eq(s.glucose.map((x) => `${x.date}/${x.slot}`), ['2026-10-11/night', '2026-10-12/fasting', '2026-10-12/lunch']);
  eq(M.glucoseDays(s), [{ date: '2026-10-12', values: { fasting: 5.6, lunch: 7 } }, { date: '2026-10-11', values: { night: 3.1 } }]);
  const sum = M.glucoseSummary(s, '2026-10-12');
  eq([sum.count, sum.high, sum.low, sum.today.length], [3, 2, 1, 2]);
  s.prefs.glucoseAfter = 1;
  eq(M.glucoseSummary(s, '2026-10-12').high, 1, '改成餐后 1 小时，7.0 就不算高了');
  eq(M.removeGlucose(s, '2026-10-11', 'night').value, 3.1);
  eq(M.removeGlucose(s, '2026-10-11', 'night'), null);
});

// ---------- model：B 超 ----------

test('B 超：校验、取整、标出超出一般范围的', () => {
  const today = '2026-10-12';
  const f = (values, over = {}) => ({ date: '2026-09-25', values, placenta: '', note: '', ...over });
  eq(M.usError(f({ bpd: '48.26', fl: '35' }), today), null);
  ok(/至少/.test(M.usError(f({ bpd: '' }), today)));
  ok(/双顶径/.test(M.usError(f({ bpd: '4.8' }), today)), '可能把厘米当成了毫米');
  ok(/晚于今天/.test(M.usError(f({ bpd: '48' }, { date: '2026-10-13' }), today)));
  eq(M.usError(f({}, { note: '只看了胎位' }), today), null, '只写备注也行');
  const s = M.createState({ dueDate: DUE });
  const a = M.addUltrasound(s, f({ bpd: '48.26', fl: '35', efw: '412.6', afi: ' 4,5 ' }));
  eq(a.values, { bpd: 48.3, fl: 35, afi: 4.5, efw: 413 });
  eq([M.usFlag('afi', 4.5), M.usFlag('afi', 12), M.usFlag('afi', 25), M.usFlag('fhr', 170), M.usFlag('dvp', 1.5), M.usFlag('bpd', 1)], ['low', null, 'high', 'high', 'low', null]);
  const b = M.addUltrasound(s, f({ crl: '45' }, { date: '2026-07-17' }));
  const rows = M.ultrasoundRows(s);
  eq(rows.map((r) => [r.record.id, r.ga, r.prev && r.prev.id]), [[a.id, 154, b.id], [b.id, 84, null]]);
  M.updateUltrasound(s, b.id, f({ crl: '46' }, { date: '2026-10-01' }));
  eq(s.ultrasounds.map((u) => u.id), [a.id, b.id], '改了日期重新排');
  eq(M.removeUltrasound(s, a.id).index, 0);
});

// ---------- content：妈妈这周 ----------

test('妈妈这周：每个孕周都有内容', () => {
  for (let w = 0; w <= 44; w += 1) {
    const m = C.momAt(w);
    ok(m.body && m.care, `第 ${w} 周没有内容`);
  }
  ok(/孕吐/.test(C.momAt(7).body) && /胎动/.test(C.momAt(18).body) && /见红/.test(C.momAt(39).body));
  ok(/3 次以上/.test(C.tipAt(29)), '数胎动的说法和小工具一致');
});

// ---------- content：能不能吃 ----------

test('能不能吃：按名称和别名搜索，按级别筛选', () => {
  eq(C.searchFoods('螃蟹').map((f) => [f.name, f.level]), [['螃蟹', 'ok']]);
  ok(C.searchFoods('刺身').some((f) => f.name === '生鱼片'), '别名也能搜到');
  ok(C.searchFoods('  咖啡 ').length === 1, '前后空格不影响');
  eq(C.searchFoods('', 'all').length, C.FOODS.length);
  const no = C.searchFoods('', 'no');
  ok(no.length > 5 && no.every((f) => f.level === 'no'));
  eq(C.searchFoods('不存在的东西'), []);
});

test('能不能吃：每条数据都完整，名字不重复', () => {
  const levels = C.FOOD_LEVELS.map((l) => l.id);
  const groups = C.FOOD_GROUPS.map((g) => g.id);
  for (const f of C.FOODS) {
    ok(levels.includes(f.level) && groups.includes(f.group), `${f.name} 的分类或级别不对`);
    ok(f.name && f.note.length >= 6, `${f.name} 缺说明`);
  }
  eq(new Set(C.FOODS.map((f) => f.name)).size, C.FOODS.length);
  ok(groups.every((g) => C.FOODS.some((f) => f.group === g)), '每个分类都有内容');
});

// ---------- model：数据校验 ----------

test('normalize：新建的数据存取一圈不变', () => {
  const s = M.createState({ dueDate: DUE, preWeight: 52, nickname: '豆豆' });
  M.upsertWeight(s, '2026-10-12', 56.2);
  M.addCheckup(s, { title: '复查', date: '2026-11-01', time: '09:00', items: ['血常规'], prep: '空腹' });
  M.toggleBagItem(s, 'id-cards');
  M.addBagItem(s, 'baby', '口水巾');
  M.addMed(s, med({ end: '2026-07-17', note: '医生开的' }));
  M.addMed(s, med({ name: '黄体酮', kind: 'medicine', start: '2026-05-28' }));
  s.kicks = [kickSession('k1', 0, [1, 2, 9], 60), kickSession('k2', 120, [121])];
  s.contractions = [contraction('q1', 0, 50), contraction('q2', 6)];
  M.addBp(s, bp({ pulse: '80', note: '饭后' }));
  M.setGlucose(s, { date: '2026-10-12', slot: 'fasting', value: '5.1' });
  M.addUltrasound(s, { date: '2026-09-25', values: { bpd: '48', efw: '400' }, placenta: '后壁 0 级', note: '' });
  s.prefs.glucoseAfter = 1;
  eq(M.normalize(JSON.parse(JSON.stringify(s))), s);
});

test('normalize：血压、血糖、B 超的清理', () => {
  const base = M.normalize({ profile: { dueDate: DUE } });
  eq([base.prefs, base.bp, base.glucose, base.ultrasounds], [{ glucoseAfter: 2 }, [], [], []]);
  const s = M.normalize({
    profile: { dueDate: DUE },
    prefs: { glucoseAfter: '1' },
    bp: [{ id: 'a', date: '2026-10-12', time: '25:00', sys: 120, dia: 80 }, { id: 'b', date: '2026-10-12', sys: 80, dia: 120 }],
    glucose: [
      { date: '2026-10-12', slot: 'lunch', value: 6.1 },
      { date: '2026-10-12', slot: 'lunch', value: 6.4 },
      { date: '2026-10-12', slot: 'tea', value: 6 },
      { date: '2026-10-12', slot: 'fasting', value: 99 },
    ],
    ultrasounds: [{ id: 'u', date: '2026-09-25', values: { bpd: 48, fl: 'x', hc: 9999 } }, { id: 'v', date: '2026-09-26', values: {} }],
  });
  eq(s.prefs.glucoseAfter, 2, '只认 1 和 2');
  eq(s.bp, [{ id: 'a', date: '2026-10-12', time: '', sys: 120, dia: 80, pulse: null, note: '' }]);
  eq(s.glucose, [{ date: '2026-10-12', slot: 'lunch', value: 6.4 }]);
  eq(s.ultrasounds.map((u) => [u.id, u.values]), [['u', { bpd: 48 }]]);
});

test('normalize：胎动和宫缩记录的清理', () => {
  const base = M.normalize({ profile: { dueDate: DUE } });
  eq([base.kicks, base.contractions], [[], []]);
  const s = M.normalize({
    profile: { dueDate: DUE },
    kicks: [
      { id: 'b', start: at(200), end: at(500), taps: [at(250), at(201), 'x', at(100), at(270)] },
      { id: 'a', start: at(0), end: null, taps: [] },
      { id: 'bad', start: 'yesterday' },
    ],
    contractions: [{ id: 'q', start: at(5), end: at(4) }, { id: 'p', start: at(1), end: at(2) }, { start: at(3) }],
  });
  eq(s.kicks.map((k) => k.id), ['a', 'b'], '按开始时间排');
  eq([s.kicks[1].end, s.kicks[1].taps], [at(260), [at(201), at(250)]], '超过 1 小时的截掉');
  eq(s.contractions, [{ id: 'p', start: at(1), end: at(2) }, { id: 'q', start: at(5), end: null }]);
});

test('normalize：老数据没有用药记录时为空，坏记录清掉', () => {
  eq(M.normalize({ profile: { dueDate: DUE } }).meds, []);
  const s = M.normalize({
    profile: { dueDate: DUE },
    meds: [
      { id: 'a', name: '叶酸', kind: '不认识', start: '2026-02-01', end: '2026-01-01', dose: 3 },
      { id: 'b', name: '没有开始日期' },
      { id: 'a', name: '重复的 id', start: '2026-03-01' },
      { name: '没 id', start: '2026-03-01' },
      null,
    ],
  });
  eq(s.meds, [{ id: 'a', name: '叶酸', kind: 'supplement', dose: '', start: '2026-02-01', end: null, note: '' }]);
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
