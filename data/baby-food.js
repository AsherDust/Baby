// 辅食食谱：按《中国 7～24 月龄婴幼儿喂养指南（2022）》的原则整理，手写的，改的时候跑一遍单元测试。
// stage 是几个月起可以吃；用料第一项是食材名（记「吃过哪些」靠它），第二项是大概的量。1 岁以内都不放盐和糖
(globalThis.Baby || (globalThis.Baby = {})).babyFood = {
  tags: [['iron', '补铁'], ['protein', '蛋白质'], ['dha', 'DHA'], ['calcium', '补钙'], ['vitamin', '维生素'], ['fiber', '膳食纤维']],
  allergens: [['egg', '鸡蛋'], ['fish', '鱼'], ['shrimp', '虾'], ['wheat', '小麦'], ['soy', '大豆']],
  // 不算作「新食材」的：水、奶、油、淀粉
  plain: ['温开水', '母乳或配方奶', '油', '淀粉'],
  // 菜名前小圆点的颜色：和孕期食谱同名的食材用 recipeBook.colors 里的，这里只补那边没有的。
  // 左右两半默认取前两样有颜色的用料（上面那几样不算）；粥、软饭、面条写了 dot，取肉和菜
  colors: {
    强化铁米粉: '#EFE2C2', 猪肉: '#E9A7A0', 牛肉: '#B04A3E', 鸡肉: '#F3D7B5', 香菇: '#9A6B47', 苹果: '#C73E4A',
    面条: '#F1E2B8', 饺子皮: '#F3E6C4',
  },

  recipes: [
    // ---------- 6 个月：细腻的泥糊 ----------
    {
      id: 'iron-cereal', stage: 6, name: '强化铁米粉', minutes: 5, good: ['iron'], allergens: [],
      items: [['强化铁米粉', '1～2 勺'], ['温开水', '适量']],
      steps: ['按包装上说的比例，用 50℃ 左右的温开水调开。', '调成能挂在勺子上、慢慢往下流的稀糊。', '从一两勺开始喂，宝宝爱吃再慢慢加。'],
      tip: '第一口辅食的好选择。不用加糖，调好了尽快吃。',
    },
    {
      id: 'pork-puree', stage: 6, name: '猪肉泥', minutes: 25, good: ['iron', 'protein'], allergens: [],
      items: [['猪肉', '里脊 20 克'], ['温开水', '适量']],
      steps: ['里脊去掉筋膜，切小块，冷水下锅煮 15 分钟，煮到中间完全变白。', '加两勺煮肉的汤，用料理机打成很细的泥。', '太稠就再加点汤，调到能顺滑地挂在勺子上。'],
      tip: '肉泥是补铁的好来源。可以一次多做些分小格冷冻，吃的时候取一格热透。',
    },
    {
      id: 'beef-puree', stage: 6, name: '牛肉泥', minutes: 30, good: ['iron', 'protein'], allergens: [],
      items: [['牛肉', '里脊 20 克'], ['温开水', '适量']],
      steps: ['牛肉切小块，冷水下锅，水开后撇去浮沫，再煮 20 分钟到软烂。', '加两勺汤，用料理机打成细泥。', '可以和米粉调在一起吃。'],
      tip: '牛肉的铁比猪肉还多一些，每周可以安排几次。',
    },
    {
      id: 'liver-puree', stage: 6, name: '猪肝泥', minutes: 20, good: ['iron', 'vitamin'], allergens: [],
      items: [['猪肝', '10 克'], ['温开水', '适量']],
      steps: ['猪肝切片，泡在清水里 30 分钟，中间换两次水。', '冷水下锅煮 10 分钟，煮到切开没有血色。', '加点温开水，用料理机或研磨碗磨成细泥。'],
      tip: '补铁很好，但维生素 A 多，一周 1～2 次、每次一小勺就够。',
    },
    {
      id: 'pumpkin-puree', stage: 6, name: '南瓜泥', minutes: 20, good: ['vitamin', 'fiber'], allergens: [],
      items: [['南瓜', '50 克']],
      steps: ['南瓜去皮去籽，切薄片。', '水开后上锅蒸 15 分钟，筷子一戳就透。', '用勺子压成泥，或者加点温开水打细。'],
      tip: '南瓜甜甜的，宝宝大多爱吃；也可以拌进米粉里。',
    },
    {
      id: 'carrot-puree', stage: 6, name: '胡萝卜泥', minutes: 20, good: ['vitamin'], allergens: [],
      items: [['胡萝卜', '50 克']],
      steps: ['胡萝卜去皮切薄片。', '上锅蒸 15 分钟，蒸到很软。', '加温开水打成细泥。'],
      tip: '',
    },
    {
      id: 'broccoli-puree', stage: 6, name: '西兰花泥', minutes: 15, good: ['vitamin', 'fiber'], allergens: [],
      items: [['西兰花', '30 克']],
      steps: ['西兰花取花的部分，用淡盐水泡 10 分钟再冲洗干净。', '上锅蒸 8 分钟到软。', '加温开水打成细泥。'],
      tip: '绿叶菜一开始可能吃不惯，换着做几次就好。',
    },
    {
      id: 'potato-puree', stage: 6, name: '土豆泥', minutes: 20, good: ['fiber'], allergens: [],
      items: [['土豆', '50 克'], ['母乳或配方奶', '1～2 勺']],
      steps: ['土豆去皮切薄片，发芽、发青的部分整个不要。', '上锅蒸 15 分钟到软。', '压成泥，加一两勺奶调顺滑。'],
      tip: '',
    },
    {
      id: 'apple-puree', stage: 6, name: '蒸苹果泥', minutes: 10, good: ['vitamin', 'fiber'], allergens: [],
      items: [['苹果', '半个']],
      steps: ['苹果去皮去核，切小块。', '上锅蒸 5 分钟到软。', '用勺子压成泥。'],
      tip: '刚开始吃辅食的宝宝，水果蒸软了更好消化。',
    },
    {
      id: 'banana-puree', stage: 6, name: '香蕉泥', minutes: 3, good: ['vitamin'], allergens: [],
      items: [['香蕉', '半根']],
      steps: ['选熟透的香蕉，剥皮后用勺子压成泥，现压现吃。'],
      tip: '香蕉放久了会变黑，吃多少压多少。',
    },
    {
      id: 'yolk-puree', stage: 6, name: '蛋黄泥', minutes: 15, good: ['protein', 'iron'], allergens: ['egg'],
      items: [['鸡蛋', '取蛋黄，先从 1/4 个开始'], ['温开水', '适量']],
      steps: ['鸡蛋冷水下锅，水开后再煮 10 分钟，煮到蛋黄全熟。', '取出蛋黄，加温开水或者米粉压成泥。'],
      tip: '鸡蛋容易过敏，第一次只吃一点，观察 2～3 天，没问题再慢慢加量。',
    },

    // ---------- 7～9 个月：稠一点的泥糊、碎末 ----------
    {
      id: 'egg-custard', stage: 7, name: '蒸鸡蛋羹', minutes: 15, good: ['protein'], allergens: ['egg'],
      items: [['鸡蛋', '1 个']],
      steps: ['鸡蛋打散，加 1.5 倍的温开水搅匀，过筛撇掉泡沫。', '盖上盘子，水开后小火蒸 10 分钟。', '蒸到中间完全凝固，晾温了用勺子喂。'],
      tip: '不放盐和酱油，原味就好。',
    },
    {
      id: 'beef-carrot-congee', stage: 7, name: '牛肉胡萝卜粥', minutes: 40, good: ['iron', 'protein'], allergens: [], dot: ['牛肉', '胡萝卜'],
      items: [['大米', '15 克'], ['牛肉', '15 克'], ['胡萝卜', '20 克']],
      steps: ['大米加 10 倍的水，小火熬 30 分钟成稠粥。', '牛肉煮熟切成很碎的末，胡萝卜蒸软压碎。', '一起倒进粥里再煮 5 分钟，刚开始可以打得更细一些。'],
      tip: '',
    },
    {
      id: 'bass-puree', stage: 7, name: '鲈鱼泥', minutes: 15, good: ['protein', 'dha'], allergens: ['fish'],
      items: [['鲈鱼', '去骨的鱼肉 30 克']],
      steps: ['取鲈鱼背上的肉，切掉鱼皮。', '上锅蒸 8 分钟，蒸到一拨就散。', '一边压碎一边仔细挑出小刺。'],
      tip: '鱼容易过敏，第一次只吃一两勺；鲈鱼、鳕鱼这类刺少的鱼都可以。',
    },
    {
      id: 'liver-spinach-congee', stage: 7, name: '菠菜猪肝粥', minutes: 40, good: ['iron', 'vitamin'], allergens: [], dot: ['猪肝', '菠菜'],
      items: [['大米', '15 克'], ['猪肝', '10 克'], ['菠菜', '15 克']],
      steps: ['大米熬成稠粥。', '猪肝泡去血水，煮熟后剁成末；菠菜放进开水里焯 1 分钟，剁碎。', '一起放进粥里再煮 3 分钟。'],
      tip: '猪肝一周 1～2 次就够。菠菜焯过水，草酸少了，更好吸收。',
    },
    {
      id: 'millet-pumpkin-congee', stage: 7, name: '南瓜小米粥', minutes: 35, good: ['vitamin', 'fiber'], allergens: [],
      items: [['小米', '15 克'], ['南瓜', '30 克']],
      steps: ['小米淘洗干净，加 10 倍的水，水开后转小火。', '放进切小块的南瓜，煮 25 分钟到小米开花、南瓜软烂。', '压碎拌匀，晾温了喂。'],
      tip: '这碗没有肉，配一点肉泥或蛋黄更好。',
    },
    {
      id: 'chicken-broccoli', stage: 7, name: '鸡肉西兰花泥', minutes: 20, good: ['protein', 'vitamin'], allergens: [],
      items: [['鸡肉', '鸡胸肉 20 克'], ['西兰花', '20 克']],
      steps: ['鸡胸肉切小块煮 12 分钟，切开中间没有粉色。', '西兰花蒸 8 分钟到软。', '一起剁碎，或者加点汤打成粗一点的泥。'],
      tip: '',
    },
    {
      id: 'tofu-greens', stage: 7, name: '豆腐青菜羹', minutes: 15, good: ['calcium', 'protein'], allergens: ['soy'],
      items: [['豆腐', '嫩豆腐 30 克'], ['小油菜', '叶子 15 克']],
      steps: ['豆腐放进开水里焯 2 分钟，压成碎末。', '小油菜叶焯软后剁碎。', '锅里加小半碗水煮开，放豆腐和菜碎煮 3 分钟。'],
      tip: '',
    },
    {
      id: 'tomato-beef-noodle', stage: 7, name: '番茄牛肉碎面', minutes: 20, good: ['iron', 'vitamin'], allergens: ['wheat'], dot: ['番茄', '牛肉'],
      items: [['面条', '婴儿面条 15 克'], ['牛肉', '15 克'], ['番茄', '30 克']],
      steps: ['番茄用开水烫一下去皮，切碎；牛肉煮熟剁成末。', '面条掰成短段，放进开水煮软。', '放番茄碎和牛肉末再煮 3 分钟，压一压就好。'],
      tip: '选不加盐的婴儿面条；面条含小麦，第一次少吃点。',
    },
    {
      id: 'sweet-potato-oat', stage: 7, name: '红薯燕麦糊', minutes: 20, good: ['fiber'], allergens: [],
      items: [['红薯', '30 克'], ['燕麦片', '10 克'], ['母乳或配方奶', '适量']],
      steps: ['红薯蒸 15 分钟到软，压成泥。', '燕麦片加水煮 5 分钟成糊。', '和红薯泥拌匀，太稠就加点奶。'],
      tip: '',
    },

    // ---------- 10～12 个月：碎块、软块、手指食物 ----------
    {
      id: 'pork-soft-rice', stage: 10, name: '肉末蔬菜软饭', minutes: 30, good: ['iron', 'protein'], allergens: [], dot: ['猪肉', '小油菜'],
      items: [['大米', '20 克'], ['猪肉', '肉末 20 克'], ['胡萝卜', '20 克'], ['小油菜', '15 克']],
      steps: ['大米多放一倍的水，煮成软软的饭。', '少许油把肉末炒熟，放胡萝卜碎和青菜碎炒软，加两勺水焖 2 分钟。', '拌进软饭里。'],
      tip: '不放盐和酱油，肉和菜本身的鲜味就够了。',
    },
    {
      id: 'veggie-egg-pancake', stage: 10, name: '蔬菜鸡蛋小饼', minutes: 15, good: ['protein', 'vitamin'], allergens: ['egg', 'wheat'], dot: ['鸡蛋', '西葫芦'],
      items: [['鸡蛋', '1 个'], ['面粉', '10 克'], ['西葫芦', '20 克'], ['胡萝卜', '10 克'], ['油', '少许']],
      steps: ['西葫芦和胡萝卜擦成细丝，剁碎一点。', '和鸡蛋、面粉搅成稠糊。', '平底锅刷一点油，小火煎成小圆饼，两面熟透，切成小条让宝宝抓着吃。'],
      tip: '',
    },
    {
      id: 'chicken-balls', stage: 10, name: '鸡肉丸', minutes: 25, good: ['protein'], allergens: [],
      items: [['鸡肉', '鸡胸肉 40 克'], ['胡萝卜', '10 克'], ['淀粉', '少许']],
      steps: ['鸡胸肉和胡萝卜一起剁成细泥，加一点淀粉和水搅匀。', '用小勺子舀成小丸子，放进开水里煮到浮起，再煮 3 分钟。', '晾温切成两半给宝宝。'],
      tip: '一次多做些，煮熟后冷冻，吃的时候煮透。',
    },
    {
      id: 'salmon-potato-cake', stage: 10, name: '三文鱼土豆饼', minutes: 25, good: ['dha', 'protein'], allergens: ['fish'],
      items: [['三文鱼', '30 克'], ['土豆', '50 克'], ['油', '少许']],
      steps: ['三文鱼和土豆一起蒸 15 分钟，鱼挑掉刺，土豆去皮。', '一起压成泥，捏成小饼。', '平底锅刷一点油，两面各煎 2 分钟。'],
      tip: '三文鱼的 DHA 多、含汞低，一定要做熟透。',
    },
    {
      id: 'shrimp-congee', stage: 10, name: '虾仁西兰花粥', minutes: 35, good: ['protein', 'vitamin'], allergens: ['shrimp'], dot: ['虾仁', '西兰花'],
      items: [['大米', '20 克'], ['虾仁', '20 克'], ['西兰花', '15 克']],
      steps: ['大米熬成稠粥。', '虾仁去虾线剁碎，西兰花切碎。', '放进粥里煮 5 分钟，虾仁全部变红就好。'],
      tip: '虾容易过敏，第一次少吃一点，观察 2～3 天。',
    },
    {
      id: 'veggie-sticks', stage: 10, name: '蒸蔬菜条', minutes: 15, good: ['vitamin', 'fiber'], allergens: [],
      items: [['胡萝卜', '30 克'], ['西葫芦', '30 克']],
      steps: ['胡萝卜、西葫芦切成手指粗细的条。', '上锅蒸 10 分钟，蒸到用手指能轻松压扁。', '晾温后让宝宝自己抓着吃。'],
      tip: '手指食物要软到能压扁，吃的时候大人在旁边看着。',
    },
    {
      id: 'mini-wonton', stage: 10, name: '鲜肉小馄饨', minutes: 30, good: ['protein', 'iron'], allergens: ['wheat'],
      items: [['馄饨皮', '6 张'], ['猪肉', '肉末 30 克'], ['小油菜', '15 克']],
      steps: ['肉末和剁碎的青菜拌匀做馅。', '每张皮包一点点馅，捏成小馄饨。', '水开后煮 5 分钟，捞出剪成小块。'],
      tip: '馅里不放盐和酱油；一次多包些冷冻起来，煮的时候不用解冻。',
    },

    // ---------- 1～2 岁：软一点、淡一点的家常饭菜 ----------
    {
      id: 'tomato-beef-rice', stage: 13, name: '番茄牛肉烩饭', minutes: 30, good: ['iron', 'vitamin'], allergens: [], dot: ['番茄', '牛肉'],
      items: [['大米', '米饭半碗'], ['牛肉', '肉末 30 克'], ['番茄', '50 克'], ['洋葱', '10 克']],
      steps: ['番茄去皮切小丁，洋葱切碎。', '少许油炒熟牛肉末，放洋葱和番茄炒出汤汁。', '加小半碗水煮 5 分钟，浇在软米饭上拌匀。'],
      tip: '1 岁以后可以放一点点盐，全天加起来不超过 1.5 克。',
    },
    {
      id: 'shrimp-scrambled-egg', stage: 13, name: '虾仁滑蛋', minutes: 10, good: ['protein'], allergens: ['egg', 'shrimp'],
      items: [['鸡蛋', '1 个'], ['虾仁', '30 克'], ['油', '少许']],
      steps: ['虾仁去虾线切小丁，鸡蛋打散。', '少许油把虾仁炒到变红，倒入蛋液。', '小火炒到鸡蛋完全凝固。'],
      tip: '',
    },
    {
      id: 'pork-cabbage-dumpling', stage: 13, name: '猪肉白菜小饺子', minutes: 40, good: ['protein', 'fiber'], allergens: ['wheat'], dot: ['猪肉', '白菜'],
      items: [['饺子皮', '8 张'], ['猪肉', '肉末 40 克'], ['白菜', '40 克']],
      steps: ['白菜剁碎，挤掉一点水，和肉末拌匀。', '包成小一点的饺子。', '水开后下锅，再开两次就熟了，捞出切成两半晾温。'],
      tip: '可以一次多包些冷冻起来。',
    },
    {
      id: 'bass-tofu-soup', stage: 13, name: '鲈鱼豆腐羹', minutes: 20, good: ['protein', 'calcium', 'dha'], allergens: ['fish', 'soy'],
      items: [['鲈鱼', '去骨的鱼肉 40 克'], ['豆腐', '嫩豆腐 40 克']],
      steps: ['鱼肉切小块，豆腐切小丁。', '水开后先放豆腐煮 3 分钟，再放鱼肉煮 3 分钟。', '鱼肉熟透后用勺子压散，挑干净刺。'],
      tip: '',
    },
    {
      id: 'mushroom-chicken-rice', stage: 13, name: '香菇鸡肉饭', minutes: 30, good: ['protein', 'fiber'], allergens: [], dot: ['香菇', '鸡肉'],
      items: [['大米', '米饭半碗'], ['鸡肉', '鸡腿肉 30 克'], ['香菇', '1 朵'], ['胡萝卜', '20 克']],
      steps: ['鸡腿肉去皮切小丁，香菇、胡萝卜切碎。', '少许油把鸡肉炒熟，放香菇和胡萝卜炒软，加两勺水焖 3 分钟。', '拌进软米饭里。'],
      tip: '',
    },
    {
      id: 'egg-tomato-noodle', stage: 13, name: '番茄鸡蛋面', minutes: 15, good: ['protein', 'vitamin'], allergens: ['egg', 'wheat'], dot: ['番茄', '鸡蛋'],
      items: [['面条', '30 克'], ['鸡蛋', '1 个'], ['番茄', '50 克'], ['小油菜', '15 克']],
      steps: ['番茄去皮切小丁，炒出汤汁后加一碗水煮开。', '下面条煮软，淋入打散的鸡蛋，蛋花凝固。', '放剁碎的青菜煮 1 分钟，剪成小段。'],
      tip: '',
    },
  ],
};
