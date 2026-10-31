(function () {
  'use strict';
  // 中文词典。键按模块分组（due.*、med.*、merge.*……），{名字} 换成参数。
  // 新写的话先在这里加键，界面里用 Baby.i18n.t(键, 参数)；核心逻辑返回 Baby.i18n.msg(键, 参数)
  const Baby = globalThis.Baby || (globalThis.Baby = {});
  (Baby.lang || (Baby.lang = {})).zh = {
    // 好几种表单共用的
    'form.pickDate': '选一下日期',
    'form.notFuture': '日期不能晚于今天',

    // 预产期
    'due.missing': '先选一下预产期',
    'due.tooFar': '这个预产期离现在超过 40 周了，再确认一下？',
    'due.tooOld': '这个预产期已经过去很久了，再确认一下？',

    // 待产包
    'bag.nameMissing': '先写上要带什么',
    'bag.duplicate': '「{name}」已经在清单里了',

    // 用药和补剂
    'med.nameMissing': '写一下药或补剂的名字',
    'med.startMissing': '选一下开始日期',
    'med.startFuture': '开始日期不能晚于今天',
    'med.endInvalid': '结束日期格式不对，重新选一下',
    'med.endBeforeStart': '结束日期不能早于开始日期',

    // 血压、血糖、B 超
    'bp.sys': '高压（收缩压）填 {min}–{max} 之间的整数',
    'bp.dia': '低压（舒张压）填 {min}–{max} 之间的整数',
    'bp.reversed': '高压要比低压大，是不是填反了？',
    'bp.pulse': '心率填 {min}–{max} 之间的整数，不知道可以空着',
    'glucose.slotMissing': '选一下是什么时候测的',
    'glucose.range': '血糖填 {min}–{max} 之间的数，单位是 mmol/L，例如 5.2',
    'us.dateMissing': '选一下检查日期',
    'us.range': '{name}填 {min}–{max} {unit} 之间的数，看看单位对不对',
    'us.empty': '至少填一项数值',

    // 心情
    'mood.missing': '先选一个心情吧',
    'mood.tooLong': '写得太长啦，最多 {max} 字',

    // 宝宝出生
    'birth.sexMissing': '选一下是男宝还是女宝',
    'birth.dateMissing': '选一下出生日期',
    'birth.dateFuture': '出生日期不能晚于今天',
    'birth.farFromDue': '出生日期离预产期太远了，再确认一下？',
    'birth.timeFormat': '出生时间填成 08:30 这样',
    'birth.range': '出生{name}填 {min}–{max} {unit} 之间的数',

    // 宝宝的日常记录
    'log.typeMissing': '记的是什么？',
    'log.whenMissing': '选一下日期和时间',
    'log.future': '时间不能晚于现在',
    'log.breastMinutes': '两边一共喂了几分钟？填 1–120 之间的数',
    'log.bottleMl': '喝了多少毫升？填 {min}–{max} 之间的数',
    'log.foodMissing': '吃了什么？写一下',
    'log.sleepTooLong': '一觉最长记 24 小时',
    'log.wakeFuture': '醒来的时间不能晚于现在',
    'log.diaperMissing': '选一下是尿了还是便了',
    'log.temp': '体温填 {min}–{max} 之间的数，例如 36.8',
    'log.pumpMl': '吸了多少毫升？每边填 0–{max} 之间的数',
    'log.medMissing': '吃的什么药？写一下名字',

    // 成长档案
    'growth.dateMissing': '选一下哪天量的',
    'growth.beforeBirth': '日期不能早于出生那天',
    'growth.empty': '体重、身长、头围至少填一样',
    'growth.range': '{name}填 {min}–{max} {unit} 之间的数',

    // 备份文件
    'backup.invalid': '这个文件打不开，不是有效的备份',
    'backup.noDue': '备份里没找到预产期，可能不是蜜罐导出的',

    // 合并：每样东西叫什么（键是 core/merge.js 里的编号）
    'merge.what.weight': '体重',
    'merge.what.bp': '血压',
    'merge.what.glucose': '血糖',
    'merge.what.med': '用药和补剂',
    'merge.what.us': 'B 超',
    'merge.what.journal': '心情',
    'merge.what.kick': '数胎动',
    'merge.what.contraction': '宫缩',
    'merge.what.checkup': '产检',
    'merge.what.bag': '待产包',
    'merge.what.log': '宝宝的日常记录',
    'merge.what.growth': '身长体重',
    'merge.what.moment': '其它的第一次',
    'merge.what.xv': '自费疫苗',
    'merge.what.stash': '存奶',
    'merge.what.vaccine': '疫苗',
    'merge.what.exam': '体检',
    'merge.what.paper': '办证清单',
    'merge.what.milestone': '里程碑',
    'merge.what.tooth': '长牙',
    'merge.what.tried': '吃过的食材',
    'merge.what.food': '辅食的标记',
    'merge.what.menu': '食谱里换过的菜',
    'merge.what.bought': '买菜清单',
    'merge.what.fav': '收藏的菜',
    'merge.what.avoid': '忌口',
    'merge.what.story-fav': '收藏的故事',
    'merge.what.story-block': '不想听的故事',
    'merge.what.profile': '预产期和资料',
    'merge.what.glucoseAfter': '餐后测血糖的时间',
    'merge.what.pelvicHold': '盆底肌每次憋几秒',
    'merge.what.birth': '宝宝的出生信息',
    'merge.what.babyAll': '宝宝的信息和记录',
    // 合并：加了、改了、跟着删了几条（条：一条条的记录；项：一个个的设置；份：整个宝宝的记录）
    'merge.added.entry': '加 {n} 条',
    'merge.added.item': '加 {n} 项',
    'merge.added.copy': '加 {n} 份',
    'merge.updated.entry': '改 {n} 条',
    'merge.updated.item': '改 {n} 项',
    'merge.updated.copy': '改 {n} 份',
    'merge.dropped.entry': '跟着对方删 {n} 条',
    'merge.dropped.item': '跟着对方删 {n} 项',
    'merge.dropped.copy': '跟着对方删 {n} 份',
    // 合并：要说一声的
    'merge.note.timing': '两边都有正在计时的喂奶或睡觉，对方那条先没合；都停了以后再合一次',
    'merge.note.birthTheirs': '两边宝宝的出生日期不一样，用的是对方后来改的',
    'merge.note.birthMine': '两边宝宝的出生日期不一样，用的是这台手机上的',
    'merge.note.dueTheirs': '两边的预产期不一样，用的是对方后来改的',
    'merge.note.dueMine': '两边的预产期不一样，用的是这台手机上的',
  };
})();
