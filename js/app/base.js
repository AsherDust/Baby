(function () {
  'use strict';
  // 各页共用的：页面上固定的元素、常量、小工具、设备判断，当前数据 app.state 和界面状态 ui
  const { dates: D, model: M, storage: S } = globalThis.Baby;
  const app = {};
  globalThis.Baby.app = app;

  const root = document.getElementById('app');
  const toastBox = document.getElementById('toast');
  const settingsDialog = document.getElementById('settings-dialog');
  const checkupDialog = document.getElementById('checkup-dialog');
  const medDialog = document.getElementById('med-dialog');
  const sheetDialog = document.getElementById('sheet-dialog');
  const DIALOGS = [settingsDialog, checkupDialog, medDialog, sheetDialog];

  // 页面都用地址栏的 # 区分，手机上的返回键就能退回上一页
  const SECTIONS = {
    today: { name: '今天', subs: [''] },
    records: { name: '记录', subs: ['weight', 'bp', 'glucose', 'meds'] },
    journal: { name: '心情', subs: [''] },
    checkups: { name: '产检', subs: ['schedule', 'ultrasound'] },
    // 宝宝出生后底部的「产检」换成「宝宝」，产检收进「记录」里
    baby: { name: '宝宝', subs: ['', 'growth', 'vaccines', 'health', 'food'] },
    tools: { name: '工具', subs: ['', 'kicks', 'contractions', 'food', 'recipes', 'weaning', 'bag', 'weeks', 'story'] },
  };
  const TABS = { pregnant: ['today', 'records', 'journal', 'checkups', 'tools'], baby: ['today', 'records', 'journal', 'baby', 'tools'] };
  // 有的页面里还分几页，地址里多一段，例如 #/tools/recipes/shop
  const SUB_VIEWS = { recipes: ['', 'all', 'shop'] };
  const SUB_NAMES = {
    weight: '体重',
    bp: '血压',
    glucose: '血糖',
    meds: '用药',
    schedule: '产检日程',
    ultrasound: 'B 超单',
    kicks: '数数胎动',
    contractions: '宫缩计时',
    food: '能不能吃',
    recipes: '孕期食谱',
    weaning: '辅食食谱',
    bag: '待产包包',
    weeks: '每周变化',
    story: '睡前故事',
  };

  /** 页面的名字；宝宝出生后「孕期食谱」叫「哺乳食谱」 */
  const subName = (id) => (id === 'recipes' && app.state && app.state.baby ? '哺乳食谱' : SUB_NAMES[id]);

  const WEIGHTS_SHOWN = 6;
  // 心情时间线一次显示几条，点「看更早的」再多显示这么多
  const JOURNAL_SHOWN = 20;
  // 首屏从 32 周起提醒收拾待产包，最好 36 周前备齐
  const BAG_REMIND_FROM = 32 * 7;
  const BAG_READY_BY = 36 * 7;
  // 28 周起每天提醒数胎动；不满 37 周的规律宫缩按早产处理
  const KICKS_FROM = 28 * 7;
  const TERM_FROM = 37 * 7;
  const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);
  const kg = M.formatKg;
  const kgDiff = M.formatKgDiff;
  const clamp01 = (n) => Math.min(Math.max(n, 0), 1);
  const pad2 = (n) => String(n).padStart(2, '0');
  const hhmm = (t) => `${pad2(new Date(t).getHours())}:${pad2(new Date(t).getMinutes())}`;
  const notifyPermission = () => ('Notification' in window ? Notification.permission : 'unsupported');
  // 每次都现查，不缓存：从浏览器「添加到主屏幕」后再打开，结果就变了
  const isStandalone = () => navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  const isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isWeChat = () => /MicroMessenger/i.test(navigator.userAgent);
  const isMobile = () => isIOS() || /Android/i.test(navigator.userAgent);
  const isTouch = () => window.matchMedia('(pointer: coarse)').matches;
  // iPhone 上在浏览器里（不是从主屏幕图标）打开时，长时间没用的网站数据可能被系统清掉
  const atRisk = () => isIOS() && !isStandalone();

  app.state = S.load();
  const ui = {
    today: D.today(),
    showAllWeights: false,
    bagAdding: null,
    medStage: 'all',
    kickFeedback: '',
    focusNext: '',
    foodQuery: '',
    foodLevel: 'all',
    // 孕期食谱：看今天还是明天（0 / 1），全部食谱的筛选，忌口展开着没有
    recipeDay: 0,
    recipeKind: 'all',
    recipeTag: '',
    recipeOnly: '',
    recipeQuery: '',
    avoidOpen: false,
    // 宝宝页：日常看哪天（0 是今天，-1 是昨天），成长曲线看哪一项
    babyDay: 0,
    growthMetric: 'weight',
    triedOpen: false,
    vaccinesDoneOpen: false,
    glucoseSlot: '',
    // 心情页上选好、还没记下的心情；首页点小脸进来时也先放这里
    journalMood: '',
    journalShown: JOURNAL_SHOWN,
    clearInputs: [],
    undo: null,
    // 正在朗读：{ id, index（第几段）, total, playing }
    reading: null,
    storyShelf: false,
    // 服务器上有新版本了，刷新一下就能用上
    updateReady: false,
  };
  // 故事正文按部下载后放这里：{ 部: { status: 'loading' | 'ready' | 'error', data } }
  const storyTexts = {};
  // 每次整页重绘后要做的事；后加载的模块往里放，免得前面的模块反过来依赖它们
  const afterRender = [];

  function greeting(hour) {
    if (hour < 5) return '夜深了';
    if (hour < 9) return '早上好';
    if (hour < 12) return '上午好';
    if (hour < 14) return '中午好';
    if (hour < 18) return '下午好';
    return '晚上好';
  }

  Object.assign(app, {
    root, toastBox, settingsDialog, checkupDialog, medDialog, sheetDialog, DIALOGS, SECTIONS, TABS, SUB_VIEWS, SUB_NAMES, subName,
    WEIGHTS_SHOWN, JOURNAL_SHOWN, BAG_REMIND_FROM, BAG_READY_BY, KICKS_FROM, TERM_FROM, esc, kg, kgDiff, clamp01, pad2, hhmm,
    notifyPermission, isStandalone, isIOS, isWeChat, isMobile, isTouch, atRisk, ui, storyTexts, afterRender, greeting
  });
})();
