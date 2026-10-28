(function () {
  'use strict';
  const Baby = globalThis.Baby || (globalThis.Baby = {});
  const D = Baby.dates;

  const pad = (n) => String(n).padStart(2, '0');

  function escapeText(s) {
    return String(s)
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r?\n/g, '\\n');
  }

  function utf8Length(ch) {
    const cp = ch.codePointAt(0);
    if (cp < 0x80) return 1;
    if (cp < 0x800) return 2;
    if (cp < 0x10000) return 3;
    return 4;
  }

  // RFC 5545：每行最多 75 字节，超出部分折到下一行并以空格开头；不能把一个汉字拆开。
  function fold(line) {
    const parts = [];
    let cur = '';
    let bytes = 0;
    for (const ch of line) {
      const n = utf8Length(ch);
      if (bytes + n > 75) {
        parts.push(cur);
        cur = ' ';
        bytes = 1;
      }
      cur += ch;
      bytes += n;
    }
    parts.push(cur);
    return parts.join('\r\n');
  }

  /** 分钟数 → ISO 8601 时长，如 750 → PT12H30M，-240 → -PT4H */
  function duration(minutes) {
    const sign = minutes < 0 ? '-' : '';
    const m = Math.abs(minutes);
    const h = Math.floor(m / 60);
    const rest = m % 60;
    return `${sign}PT${h ? `${h}H` : ''}${rest || !h ? `${rest}M` : ''}`;
  }

  const compact = (iso) => iso.replace(/-/g, '');
  const clock = (min) => `${pad(Math.floor(min / 60))}${pad(min % 60)}00`;
  const stamp = (now) => now.toISOString().replace(/\.\d{3}/, '').replace(/[-:]/g, '');

  /**
   * events: [{ uid, title, description, date, time?, minutes?, alarms: [{ before, text }] }]
   * alarm.before 是相对开始时间提前的分钟数，负数表示开始之后；全天事件以当天 0 点为开始。
   * 有具体时间的事件用"浮动时间"（不带时区），按设备当地时间显示。
   */
  function build(events, now, name = '产检日程') {
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Pregnancy Desk//ZH-CN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      `X-WR-CALNAME:${escapeText(name)}`,
    ];
    for (const ev of events) {
      lines.push('BEGIN:VEVENT', `UID:${ev.uid}`, `DTSTAMP:${stamp(now)}`);
      if (ev.time) {
        const [h, m] = ev.time.split(':').map(Number);
        const start = h * 60 + m;
        const end = start + (ev.minutes || 60);
        const endDate = D.addDays(ev.date, Math.floor(end / 1440));
        lines.push(`DTSTART:${compact(ev.date)}T${clock(start)}`, `DTEND:${compact(endDate)}T${clock(end % 1440)}`);
      } else {
        lines.push(`DTSTART;VALUE=DATE:${compact(ev.date)}`, `DTEND;VALUE=DATE:${compact(D.addDays(ev.date, 1))}`);
      }
      lines.push(`SUMMARY:${escapeText(ev.title)}`);
      if (ev.description) lines.push(`DESCRIPTION:${escapeText(ev.description)}`);
      for (const a of ev.alarms || []) {
        lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escapeText(a.text)}`, `TRIGGER:${duration(-a.before)}`, 'END:VALARM');
      }
      lines.push('END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    return `${lines.map(fold).join('\r\n')}\r\n`;
  }

  /** 产检 → 日历事件：前一晚 8 点提醒；全天事件当天早上 8 点再提醒，有时间的提前 1 小时提醒 */
  function checkupEvent(ck, status) {
    const lines = [`孕 ${D.formatGA(status.ga)} 周${status.booked ? '' : ' · 按孕周推算的建议日期，约好后记得在蜜罐里改成医院给的日子'}`];
    if (ck.items.length) lines.push(`检查：${ck.items.join('、')}`);
    if (ck.prep) lines.push(`准备：${ck.prep}`);
    if (ck.tip) lines.push(ck.tip);

    let alarms;
    if (ck.time) {
      const [h, m] = ck.time.split(':').map(Number);
      alarms = [
        { before: h * 60 + m + 240, text: `明天产检：${ck.title}` },
        { before: 60, text: `1 小时后产检：${ck.title}` },
      ];
    } else {
      alarms = [
        { before: 240, text: `明天产检：${ck.title}` },
        { before: -480, text: `今天产检：${ck.title}` },
      ];
    }

    return {
      uid: `${ck.id}@pregnancy-desk`,
      title: `产检 · ${ck.title}`,
      description: lines.join('\n'),
      date: status.date,
      time: ck.time,
      alarms,
    };
  }

  /** 疫苗 → 日历事件（全天）：前一晚 8 点和当天早上 8 点提醒；约好了按约的日子，没约就按最早可以打的日子 */
  function vaccineEvent(row, babyName) {
    const title = `${row.name}第 ${row.dose} 剂`;
    const who = babyName || '宝宝';
    const lines = [row.booked ? `${who}约好打${title}` : `${who}${row.when}可以打${title}了，具体日子按接种门诊的预约`];
    if (row.note) lines.push(row.note);
    lines.push('带上预防接种证；打完在接种门诊留观 30 分钟。');
    return {
      uid: `${row.id}@pregnancy-desk-baby`,
      title: `打疫苗 · ${title}`,
      description: lines.join('\n'),
      date: row.booked || row.due,
      alarms: [
        { before: 240, text: `明天打疫苗：${title}` },
        { before: -480, text: `今天打疫苗：${title}` },
      ],
    };
  }

  Baby.calendar = { build, checkupEvent, vaccineEvent, fold, escapeText, duration };
})();
