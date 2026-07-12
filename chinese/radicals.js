/* radicals.js — logic for radicals.html. */
// Each radical: char (with common variant form in parens if applicable), pinyin,
// meaning (semantic field), optional note (variant/pedagogical name), and one
// example word that contains the radical.
const RADICAL_GROUPS = [
  { strokes: 1, items: [
    { char: '一', pinyin: 'yī', meaning: 'one', word: '二', wordPinyin: 'èr', wordMeaning: 'two' },
    { char: '丨', pinyin: 'gǔn', meaning: 'line, stick', word: '中', wordPinyin: 'zhōng', wordMeaning: 'middle' },
    { char: '丶', pinyin: 'zhǔ', meaning: 'dot', word: '主', wordPinyin: 'zhǔ', wordMeaning: 'master, owner' },
    { char: '丿', pinyin: 'piě', meaning: 'left slash', word: '久', wordPinyin: 'jiǔ', wordMeaning: 'long (time)' },
    { char: '乙', pinyin: 'yǐ', meaning: 'second; twist', word: '也', wordPinyin: 'yě', wordMeaning: 'also' },
    { char: '亅', pinyin: 'jué', meaning: 'hook', word: '了', wordPinyin: 'le', wordMeaning: 'completed (particle)' },
  ]},
  { strokes: 2, items: [
    { char: '二', pinyin: 'èr', meaning: 'two', word: '五', wordPinyin: 'wǔ', wordMeaning: 'five' },
    { char: '亠', pinyin: 'tóu', meaning: 'lid', word: '亮', wordPinyin: 'liàng', wordMeaning: 'bright' },
    { char: '人 (亻)', pinyin: 'rén', meaning: 'person', note: '亻 is called 单人旁 (dān rén páng) "single person side"', word: '你', wordPinyin: 'nǐ', wordMeaning: 'you' },
    { char: '儿', pinyin: 'ér', meaning: 'legs; son', word: '元', wordPinyin: 'yuán', wordMeaning: 'first; origin' },
    { char: '入', pinyin: 'rù', meaning: 'enter', word: '内', wordPinyin: 'nèi', wordMeaning: 'inside' },
    { char: '八', pinyin: 'bā', meaning: 'eight; divide', word: '公', wordPinyin: 'gōng', wordMeaning: 'public' },
    { char: '冂', pinyin: 'jiōng', meaning: 'down box', word: '再', wordPinyin: 'zài', wordMeaning: 'again' },
    { char: '冖', pinyin: 'mì', meaning: 'cover', note: 'called 秃宝盖 (tū bǎo gài) "bare roof"', word: '军', wordPinyin: 'jūn', wordMeaning: 'army' },
    { char: '冫', pinyin: 'bīng', meaning: 'ice', note: 'called 两点水 (liǎng diǎn shuǐ) "two-dot water"', word: '冷', wordPinyin: 'lěng', wordMeaning: 'cold' },
    { char: '几', pinyin: 'jī', meaning: 'small table', word: '凡', wordPinyin: 'fán', wordMeaning: 'ordinary' },
    { char: '凵', pinyin: 'kǎn', meaning: 'open box', word: '凶', wordPinyin: 'xiōng', wordMeaning: 'fierce' },
    { char: '刀 (刂)', pinyin: 'dāo', meaning: 'knife', note: '刂 is called 立刀旁 (lì dāo páng) "standing knife side"', word: '分', wordPinyin: 'fēn', wordMeaning: 'divide; minute' },
  ]},
  { strokes: 3, items: [
    { char: '力', pinyin: 'lì', meaning: 'strength', word: '加', wordPinyin: 'jiā', wordMeaning: 'add' },
    { char: '勹', pinyin: 'bāo', meaning: 'wrap', word: '勺', wordPinyin: 'sháo', wordMeaning: 'spoon' },
    { char: '匕', pinyin: 'bǐ', meaning: 'spoon; dagger', word: '化', wordPinyin: 'huà', wordMeaning: 'change' },
    { char: '匚', pinyin: 'fāng', meaning: 'box', word: '匠', wordPinyin: 'jiàng', wordMeaning: 'craftsman' },
    { char: '十', pinyin: 'shí', meaning: 'ten', word: '千', wordPinyin: 'qiān', wordMeaning: 'thousand' },
    { char: '卜', pinyin: 'bǔ', meaning: 'divination', word: '卡', wordPinyin: 'kǎ', wordMeaning: 'card' },
    { char: '卩', pinyin: 'jié', meaning: 'seal', word: '印', wordPinyin: 'yìn', wordMeaning: 'stamp; print' },
    { char: '厂', pinyin: 'hǎn', meaning: 'cliff', word: '厉', wordPinyin: 'lì', wordMeaning: 'severe; strict' },
    { char: '厶', pinyin: 'sī', meaning: 'private', word: '去', wordPinyin: 'qù', wordMeaning: 'go' },
    { char: '又', pinyin: 'yòu', meaning: 'again; right hand', word: '反', wordPinyin: 'fǎn', wordMeaning: 'opposite' },
    { char: '口', pinyin: 'kǒu', meaning: 'mouth', word: '吃', wordPinyin: 'chī', wordMeaning: 'eat' },
    { char: '囗', pinyin: 'wéi', meaning: 'enclosure', word: '国', wordPinyin: 'guó', wordMeaning: 'country' },
    { char: '土', pinyin: 'tǔ', meaning: 'earth', word: '地', wordPinyin: 'dì', wordMeaning: 'ground' },
    { char: '士', pinyin: 'shì', meaning: 'scholar', word: '壮', wordPinyin: 'zhuàng', wordMeaning: 'strong' },
    { char: '夕', pinyin: 'xī', meaning: 'evening', word: '多', wordPinyin: 'duō', wordMeaning: 'many' },
    { char: '大', pinyin: 'dà', meaning: 'big', word: '天', wordPinyin: 'tiān', wordMeaning: 'sky' },
    { char: '女', pinyin: 'nǚ', meaning: 'woman', word: '好', wordPinyin: 'hǎo', wordMeaning: 'good' },
    { char: '子', pinyin: 'zǐ', meaning: 'child', word: '字', wordPinyin: 'zì', wordMeaning: 'character; word' },
    { char: '宀', pinyin: 'mián', meaning: 'roof', note: 'called 宝盖头 (bǎo gài tóu) "treasure-cover top"', word: '家', wordPinyin: 'jiā', wordMeaning: 'home' },
    { char: '寸', pinyin: 'cùn', meaning: 'inch', word: '对', wordPinyin: 'duì', wordMeaning: 'correct' },
    { char: '小', pinyin: 'xiǎo', meaning: 'small', word: '少', wordPinyin: 'shǎo', wordMeaning: 'few; little' },
    { char: '尸', pinyin: 'shī', meaning: 'body; corpse', word: '尾', wordPinyin: 'wěi', wordMeaning: 'tail' },
    { char: '山', pinyin: 'shān', meaning: 'mountain', word: '岁', wordPinyin: 'suì', wordMeaning: 'year (of age)' },
    { char: '川 (巛)', pinyin: 'chuān', meaning: 'river', word: '州', wordPinyin: 'zhōu', wordMeaning: 'state; region' },
    { char: '工', pinyin: 'gōng', meaning: 'work', word: '左', wordPinyin: 'zuǒ', wordMeaning: 'left' },
    { char: '己', pinyin: 'jǐ', meaning: 'self', word: '已', wordPinyin: 'yǐ', wordMeaning: 'already' },
    { char: '巾', pinyin: 'jīn', meaning: 'cloth', word: '布', wordPinyin: 'bù', wordMeaning: 'cloth' },
    { char: '干', pinyin: 'gān', meaning: 'shield; dry', word: '平', wordPinyin: 'píng', wordMeaning: 'flat; even' },
    { char: '幺', pinyin: 'yāo', meaning: 'tiny', word: '幼', wordPinyin: 'yòu', wordMeaning: 'young' },
    { char: '广', pinyin: 'guǎng', meaning: 'shelter', word: '店', wordPinyin: 'diàn', wordMeaning: 'shop' },
    { char: '廴', pinyin: 'yǐn', meaning: 'long stride', word: '建', wordPinyin: 'jiàn', wordMeaning: 'build' },
    { char: '弋', pinyin: 'yì', meaning: 'dart; shoot', word: '式', wordPinyin: 'shì', wordMeaning: 'style; pattern' },
    { char: '弓', pinyin: 'gōng', meaning: 'bow', word: '张', wordPinyin: 'zhāng', wordMeaning: 'stretch; measure word' },
    { char: '彡', pinyin: 'shān', meaning: 'hair; bristle', word: '影', wordPinyin: 'yǐng', wordMeaning: 'shadow' },
    { char: '彳', pinyin: 'chì', meaning: 'step', note: 'called 双人旁 (shuāng rén páng) "double person side"', word: '很', wordPinyin: 'hěn', wordMeaning: 'very' },
  ]},
  { strokes: 4, items: [
    { char: '心 (忄)', pinyin: 'xīn', meaning: 'heart', note: '忄 is called 竖心旁 (shù xīn páng) "upright heart side"', word: '想', wordPinyin: 'xiǎng', wordMeaning: 'think' },
    { char: '戈', pinyin: 'gē', meaning: 'spear; dagger-axe', word: '我', wordPinyin: 'wǒ', wordMeaning: 'I; me' },
    { char: '户', pinyin: 'hù', meaning: 'door; household', word: '房', wordPinyin: 'fáng', wordMeaning: 'house; room' },
    { char: '手 (扌)', pinyin: 'shǒu', meaning: 'hand', note: '扌 is called 提手旁 (tí shǒu páng) "raised hand side"', word: '打', wordPinyin: 'dǎ', wordMeaning: 'hit' },
    { char: '攵', pinyin: 'pū', meaning: 'tap; rap', note: 'called 反文旁 (fǎn wén páng) "reversed 文 side"', word: '教', wordPinyin: 'jiào', wordMeaning: 'teach' },
    { char: '斗', pinyin: 'dǒu', meaning: 'dipper; measure', word: '料', wordPinyin: 'liào', wordMeaning: 'material' },
    { char: '斤', pinyin: 'jīn', meaning: 'axe', word: '新', wordPinyin: 'xīn', wordMeaning: 'new' },
    { char: '方', pinyin: 'fāng', meaning: 'square; direction', word: '放', wordPinyin: 'fàng', wordMeaning: 'put; release' },
    { char: '日', pinyin: 'rì', meaning: 'sun; day', word: '明', wordPinyin: 'míng', wordMeaning: 'bright' },
    { char: '曰', pinyin: 'yuē', meaning: 'say', word: '曲', wordPinyin: 'qū', wordMeaning: 'song; crooked' },
    { char: '月', pinyin: 'yuè', meaning: 'moon; flesh', word: '期', wordPinyin: 'qī', wordMeaning: 'period (of time)' },
    { char: '木', pinyin: 'mù', meaning: 'tree; wood', word: '林', wordPinyin: 'lín', wordMeaning: 'forest' },
    { char: '欠', pinyin: 'qiàn', meaning: 'owe; yawn', word: '歌', wordPinyin: 'gē', wordMeaning: 'song' },
    { char: '止', pinyin: 'zhǐ', meaning: 'stop', word: '正', wordPinyin: 'zhèng', wordMeaning: 'correct; upright' },
    { char: '歹', pinyin: 'dǎi', meaning: 'bad; death', word: '死', wordPinyin: 'sǐ', wordMeaning: 'death; dead' },
    { char: '殳', pinyin: 'shū', meaning: 'weapon; strike', word: '段', wordPinyin: 'duàn', wordMeaning: 'section; segment' },
    { char: '母', pinyin: 'mǔ', meaning: 'mother', word: '每', wordPinyin: 'měi', wordMeaning: 'every' },
    { char: '比', pinyin: 'bǐ', meaning: 'compare', word: '毕', wordPinyin: 'bì', wordMeaning: 'finish; complete' },
    { char: '毛', pinyin: 'máo', meaning: 'fur; hair', word: '毯', wordPinyin: 'tǎn', wordMeaning: 'blanket; carpet' },
    { char: '氏', pinyin: 'shì', meaning: 'clan; family name', word: '民', wordPinyin: 'mín', wordMeaning: 'people' },
    { char: '气', pinyin: 'qì', meaning: 'steam; gas', word: '氧', wordPinyin: 'yǎng', wordMeaning: 'oxygen' },
    { char: '水 (氵)', pinyin: 'shuǐ', meaning: 'water', note: '氵 is called 三点水 (sān diǎn shuǐ) "three-dot water"', word: '河', wordPinyin: 'hé', wordMeaning: 'river' },
    { char: '火 (灬)', pinyin: 'huǒ', meaning: 'fire', note: '灬 is called 四点底 (sì diǎn dǐ) "four-dot bottom"', word: '烧', wordPinyin: 'shāo', wordMeaning: 'burn' },
    { char: '爪 (爫)', pinyin: 'zhǎo', meaning: 'claw', word: '爬', wordPinyin: 'pá', wordMeaning: 'climb; crawl' },
    { char: '父', pinyin: 'fù', meaning: 'father', word: '爸', wordPinyin: 'bà', wordMeaning: 'dad' },
    { char: '片', pinyin: 'piàn', meaning: 'slice; slab', word: '版', wordPinyin: 'bǎn', wordMeaning: 'edition; plate' },
    { char: '牙', pinyin: 'yá', meaning: 'tooth; fang', word: '牙', wordPinyin: 'yá', wordMeaning: 'tooth (itself)' },
    { char: '牛 (牜)', pinyin: 'niú', meaning: 'ox; cow', note: '牜 is called 牛字旁 (niú zì páng) "ox side"', word: '特', wordPinyin: 'tè', wordMeaning: 'special' },
    { char: '犬 (犭)', pinyin: 'quǎn', meaning: 'dog', note: '犭 is called 反犬旁 (fǎn quǎn páng) "reversed dog side"', word: '狗', wordPinyin: 'gǒu', wordMeaning: 'dog' },
  ]},
  { strokes: 5, items: [
    { char: '玉 (王)', pinyin: 'yù', meaning: 'jade', note: 'as a component often written 王, called 斜玉旁 (xié yù páng) "slanted jade side"', word: '玩', wordPinyin: 'wán', wordMeaning: 'play' },
    { char: '瓜', pinyin: 'guā', meaning: 'melon', word: '瓜', wordPinyin: 'guā', wordMeaning: 'melon (itself)' },
    { char: '瓦', pinyin: 'wǎ', meaning: 'tile', word: '瓶', wordPinyin: 'píng', wordMeaning: 'bottle' },
    { char: '甘', pinyin: 'gān', meaning: 'sweet', word: '甜', wordPinyin: 'tián', wordMeaning: 'sweet' },
    { char: '生', pinyin: 'shēng', meaning: 'life; birth', word: '生', wordPinyin: 'shēng', wordMeaning: 'born; student (itself)' },
    { char: '用', pinyin: 'yòng', meaning: 'use', word: '用', wordPinyin: 'yòng', wordMeaning: 'to use (itself)' },
    { char: '田', pinyin: 'tián', meaning: 'field', word: '男', wordPinyin: 'nán', wordMeaning: 'male' },
    { char: '疒', pinyin: 'nè', meaning: 'sickness', note: 'called 病字旁 (bìng zì páng) "illness side"', word: '病', wordPinyin: 'bìng', wordMeaning: 'illness' },
    { char: '癶', pinyin: 'bō', meaning: 'footsteps', word: '登', wordPinyin: 'dēng', wordMeaning: 'ascend; climb' },
    { char: '白', pinyin: 'bái', meaning: 'white', word: '百', wordPinyin: 'bǎi', wordMeaning: 'hundred' },
    { char: '皮', pinyin: 'pí', meaning: 'skin', word: '皱', wordPinyin: 'zhòu', wordMeaning: 'wrinkle' },
    { char: '皿', pinyin: 'mǐn', meaning: 'dish; vessel', word: '盘', wordPinyin: 'pán', wordMeaning: 'plate; tray' },
    { char: '目', pinyin: 'mù', meaning: 'eye', word: '眼', wordPinyin: 'yǎn', wordMeaning: 'eye' },
    { char: '矢', pinyin: 'shǐ', meaning: 'arrow', word: '知', wordPinyin: 'zhī', wordMeaning: 'know' },
    { char: '石', pinyin: 'shí', meaning: 'stone', word: '破', wordPinyin: 'pò', wordMeaning: 'break' },
    { char: '示 (礻)', pinyin: 'shì', meaning: 'spirit; reveal', note: '礻 is called 示字旁 (shì zì páng) "spirit side"', word: '神', wordPinyin: 'shén', wordMeaning: 'god; spirit' },
    { char: '禾', pinyin: 'hé', meaning: 'grain; crop', word: '秋', wordPinyin: 'qiū', wordMeaning: 'autumn' },
    { char: '穴', pinyin: 'xué', meaning: 'cave; hole', word: '空', wordPinyin: 'kōng', wordMeaning: 'empty; sky' },
    { char: '立', pinyin: 'lì', meaning: 'stand', word: '站', wordPinyin: 'zhàn', wordMeaning: 'stand; station' },
  ]},
  { strokes: 6, items: [
    { char: '竹 (⺮)', pinyin: 'zhú', meaning: 'bamboo', note: 'called 竹字头 (zhú zì tóu) "bamboo top"', word: '笑', wordPinyin: 'xiào', wordMeaning: 'laugh; smile' },
    { char: '米', pinyin: 'mǐ', meaning: 'rice', word: '粉', wordPinyin: 'fěn', wordMeaning: 'powder' },
    { char: '糸 (纟)', pinyin: 'mì', meaning: 'silk', note: '纟 is called 绞丝旁 (jiǎo sī páng) "twisted silk side"', word: '红', wordPinyin: 'hóng', wordMeaning: 'red' },
    { char: '缶', pinyin: 'fǒu', meaning: 'jar; pot', word: '缺', wordPinyin: 'quē', wordMeaning: 'lack; missing' },
    { char: '网 (罒)', pinyin: 'wǎng', meaning: 'net', word: '罚', wordPinyin: 'fá', wordMeaning: 'punish' },
    { char: '羊', pinyin: 'yáng', meaning: 'sheep', word: '美', wordPinyin: 'měi', wordMeaning: 'beautiful' },
    { char: '羽', pinyin: 'yǔ', meaning: 'feather', word: '习', wordPinyin: 'xí', wordMeaning: 'practice; study' },
    { char: '老 (耂)', pinyin: 'lǎo', meaning: 'old', note: '耂 is called 老字头 (lǎo zì tóu) "old top"', word: '考', wordPinyin: 'kǎo', wordMeaning: 'test; exam' },
    { char: '耳', pinyin: 'ěr', meaning: 'ear', word: '听', wordPinyin: 'tīng', wordMeaning: 'listen' },
    { char: '耒', pinyin: 'lěi', meaning: 'plow', word: '耕', wordPinyin: 'gēng', wordMeaning: 'plow; till' },
    { char: '舌', pinyin: 'shé', meaning: 'tongue', word: '舍', wordPinyin: 'shě', wordMeaning: 'give up; house' },
    { char: '舟', pinyin: 'zhōu', meaning: 'boat', word: '船', wordPinyin: 'chuán', wordMeaning: 'boat; ship' },
    { char: '艮', pinyin: 'gèn', meaning: 'stopping; tough', word: '良', wordPinyin: 'liáng', wordMeaning: 'good' },
    { char: '色', pinyin: 'sè', meaning: 'color', word: '艳', wordPinyin: 'yàn', wordMeaning: 'colorful; bright' },
    { char: '艸 (艹)', pinyin: 'cǎo', meaning: 'grass', note: '艹 is called 草字头 (cǎo zì tóu) "grass top"', word: '花', wordPinyin: 'huā', wordMeaning: 'flower' },
    { char: '虍', pinyin: 'hū', meaning: 'tiger stripe', word: '虎', wordPinyin: 'hǔ', wordMeaning: 'tiger' },
    { char: '虫', pinyin: 'chóng', meaning: 'insect; bug', word: '蛋', wordPinyin: 'dàn', wordMeaning: 'egg' },
    { char: '血', pinyin: 'xuè', meaning: 'blood', word: '血', wordPinyin: 'xuè', wordMeaning: 'blood (itself)' },
    { char: '行', pinyin: 'xíng', meaning: 'go; walk', word: '街', wordPinyin: 'jiē', wordMeaning: 'street' },
    { char: '衣 (衤)', pinyin: 'yī', meaning: 'clothes', note: '衤 is called 衣字旁 (yī zì páng) "clothes side"', word: '裤', wordPinyin: 'kù', wordMeaning: 'trousers; pants' },
    { char: '西 (覀)', pinyin: 'xī', meaning: 'west; cover', word: '要', wordPinyin: 'yào', wordMeaning: 'want; need' },
  ]},
  { strokes: 7, items: [
    { char: '见 (見)', pinyin: 'jiàn', meaning: 'see', word: '视', wordPinyin: 'shì', wordMeaning: 'look at; view' },
    { char: '角', pinyin: 'jiǎo', meaning: 'horn', word: '解', wordPinyin: 'jiě', wordMeaning: 'untie; solve' },
    { char: '言 (讠)', pinyin: 'yán', meaning: 'speech', note: '讠 is called 言字旁 (yán zì páng) "speech side"', word: '说', wordPinyin: 'shuō', wordMeaning: 'speak; say' },
    { char: '谷', pinyin: 'gǔ', meaning: 'valley', word: '谷', wordPinyin: 'gǔ', wordMeaning: 'valley (itself)' },
    { char: '豆', pinyin: 'dòu', meaning: 'bean', word: '豌', wordPinyin: 'wān', wordMeaning: 'pea' },
    { char: '豕', pinyin: 'shǐ', meaning: 'pig', word: '豚', wordPinyin: 'tún', wordMeaning: 'piglet' },
    { char: '豸', pinyin: 'zhì', meaning: 'cat-like animal', word: '貌', wordPinyin: 'mào', wordMeaning: 'appearance' },
    { char: '贝 (貝)', pinyin: 'bèi', meaning: 'shell; money', word: '财', wordPinyin: 'cái', wordMeaning: 'wealth' },
    { char: '赤', pinyin: 'chì', meaning: 'red', word: '赤', wordPinyin: 'chì', wordMeaning: 'red; bare (itself)' },
    { char: '走', pinyin: 'zǒu', meaning: 'walk; run', word: '起', wordPinyin: 'qǐ', wordMeaning: 'rise; get up' },
    { char: '足 (⻊)', pinyin: 'zú', meaning: 'foot', word: '跑', wordPinyin: 'pǎo', wordMeaning: 'run' },
    { char: '身', pinyin: 'shēn', meaning: 'body', word: '躺', wordPinyin: 'tǎng', wordMeaning: 'lie down' },
    { char: '车 (車)', pinyin: 'chē', meaning: 'cart; vehicle', word: '转', wordPinyin: 'zhuǎn', wordMeaning: 'turn' },
    { char: '辛', pinyin: 'xīn', meaning: 'bitter; labor', word: '辣', wordPinyin: 'là', wordMeaning: 'spicy' },
    { char: '辶 (辵)', pinyin: 'chuò', meaning: 'walk; movement', note: 'called 走之底 (zǒu zhī dǐ) "walking bottom"', word: '过', wordPinyin: 'guò', wordMeaning: 'pass; cross' },
    { char: '邑 (阝右)', pinyin: 'yì', meaning: 'city; village', note: 'on the right, called 右耳旁 (yòu ěr páng) "right ear side"', word: '那', wordPinyin: 'nà', wordMeaning: 'that' },
    { char: '酉', pinyin: 'yǒu', meaning: 'wine vessel', word: '酒', wordPinyin: 'jiǔ', wordMeaning: 'wine; alcohol' },
    { char: '里', pinyin: 'lǐ', meaning: 'village; distance unit', word: '重', wordPinyin: 'zhòng', wordMeaning: 'heavy' },
  ]},
  { strokes: 8, items: [
    { char: '金 (钅)', pinyin: 'jīn', meaning: 'metal; gold', note: '钅 is called 金字旁 (jīn zì páng) "metal side"', word: '钱', wordPinyin: 'qián', wordMeaning: 'money' },
    { char: '长 (長)', pinyin: 'cháng', meaning: 'long', word: '长', wordPinyin: 'cháng', wordMeaning: 'long (itself)' },
    { char: '门 (門)', pinyin: 'mén', meaning: 'door; gate', word: '问', wordPinyin: 'wèn', wordMeaning: 'ask' },
    { char: '阜 (阝左)', pinyin: 'fù', meaning: 'mound', note: 'on the left, called 左耳旁 (zuǒ ěr páng) "left ear side"', word: '阳', wordPinyin: 'yáng', wordMeaning: 'sun; yang' },
    { char: '隹', pinyin: 'zhuī', meaning: 'short-tailed bird', word: '集', wordPinyin: 'jí', wordMeaning: 'gather; collect' },
    { char: '雨', pinyin: 'yǔ', meaning: 'rain', word: '雪', wordPinyin: 'xuě', wordMeaning: 'snow' },
    { char: '青', pinyin: 'qīng', meaning: 'blue-green', word: '静', wordPinyin: 'jìng', wordMeaning: 'quiet' },
    { char: '非', pinyin: 'fēi', meaning: 'wrong; not', word: '靠', wordPinyin: 'kào', wordMeaning: 'lean on; rely on' },
  ]},
  { strokes: 9, items: [
    { char: '面', pinyin: 'miàn', meaning: 'face', word: '面', wordPinyin: 'miàn', wordMeaning: 'face; noodles (itself)' },
    { char: '革', pinyin: 'gé', meaning: 'leather', word: '鞋', wordPinyin: 'xié', wordMeaning: 'shoes' },
    { char: '韭', pinyin: 'jiǔ', meaning: 'chives', word: '韭', wordPinyin: 'jiǔ', wordMeaning: 'chives (itself)' },
    { char: '音', pinyin: 'yīn', meaning: 'sound', word: '音', wordPinyin: 'yīn', wordMeaning: 'sound (itself)' },
    { char: '页 (頁)', pinyin: 'yè', meaning: 'page; head', word: '题', wordPinyin: 'tí', wordMeaning: 'topic; question' },
    { char: '风 (風)', pinyin: 'fēng', meaning: 'wind', word: '飘', wordPinyin: 'piāo', wordMeaning: 'flutter; float' },
    { char: '飞 (飛)', pinyin: 'fēi', meaning: 'fly', word: '飞', wordPinyin: 'fēi', wordMeaning: 'to fly (itself)' },
    { char: '食 (饣)', pinyin: 'shí', meaning: 'food; eat', note: '饣 is called 食字旁 (shí zì páng) "food side"', word: '饭', wordPinyin: 'fàn', wordMeaning: 'rice; meal' },
    { char: '首', pinyin: 'shǒu', meaning: 'head', word: '首', wordPinyin: 'shǒu', wordMeaning: 'head; first (itself)' },
    { char: '香', pinyin: 'xiāng', meaning: 'fragrant', word: '香', wordPinyin: 'xiāng', wordMeaning: 'fragrant (itself)' },
  ]},
  { strokes: 10, items: [
    { char: '马 (馬)', pinyin: 'mǎ', meaning: 'horse', word: '骑', wordPinyin: 'qí', wordMeaning: 'ride' },
    { char: '骨', pinyin: 'gǔ', meaning: 'bone', word: '骨', wordPinyin: 'gǔ', wordMeaning: 'bone (itself)' },
    { char: '高', pinyin: 'gāo', meaning: 'tall', word: '高', wordPinyin: 'gāo', wordMeaning: 'tall (itself)' },
    { char: '鬼', pinyin: 'guǐ', meaning: 'ghost', word: '魂', wordPinyin: 'hún', wordMeaning: 'soul' },
  ]},
  { strokes: 11, items: [
    { char: '鱼 (魚)', pinyin: 'yú', meaning: 'fish', word: '鲜', wordPinyin: 'xiān', wordMeaning: 'fresh' },
    { char: '鸟 (鳥)', pinyin: 'niǎo', meaning: 'bird', word: '鸡', wordPinyin: 'jī', wordMeaning: 'chicken' },
    { char: '鹿', pinyin: 'lù', meaning: 'deer', word: '鹿', wordPinyin: 'lù', wordMeaning: 'deer (itself)' },
    { char: '麦 (麥)', pinyin: 'mài', meaning: 'wheat', word: '麦', wordPinyin: 'mài', wordMeaning: 'wheat (itself)' },
    { char: '麻', pinyin: 'má', meaning: 'hemp', word: '麻', wordPinyin: 'má', wordMeaning: 'hemp; numb (itself)' },
  ]},
  { strokes: 12, items: [
    { char: '黄 (黃)', pinyin: 'huáng', meaning: 'yellow', word: '黄', wordPinyin: 'huáng', wordMeaning: 'yellow (itself)' },
    { char: '黑', pinyin: 'hēi', meaning: 'black', word: '墨', wordPinyin: 'mò', wordMeaning: 'ink' },
  ]},
  { strokes: 13, items: [
    { char: '鼓', pinyin: 'gǔ', meaning: 'drum', word: '鼓', wordPinyin: 'gǔ', wordMeaning: 'drum (itself)' },
    { char: '鼠', pinyin: 'shǔ', meaning: 'rat; mouse', word: '鼠', wordPinyin: 'shǔ', wordMeaning: 'mouse; rat (itself)' },
  ]},
  { strokes: 14, items: [
    { char: '鼻', pinyin: 'bí', meaning: 'nose', word: '鼻', wordPinyin: 'bí', wordMeaning: 'nose (itself)' },
    { char: '齐 (齊)', pinyin: 'qí', meaning: 'even; together', word: '齐', wordPinyin: 'qí', wordMeaning: 'even; together (itself)' },
  ]},
  { strokes: 15, items: [
    { char: '齿 (齒)', pinyin: 'chǐ', meaning: 'tooth', word: '齿', wordPinyin: 'chǐ', wordMeaning: 'tooth (itself)' },
  ]},
  { strokes: 16, items: [
    { char: '龙 (龍)', pinyin: 'lóng', meaning: 'dragon', word: '龙', wordPinyin: 'lóng', wordMeaning: 'dragon (itself)' },
  ]},
  { strokes: 17, items: [
    { char: '龟 (龜)', pinyin: 'guī', meaning: 'turtle', word: '龟', wordPinyin: 'guī', wordMeaning: 'turtle (itself)' },
  ]},
];

function speak(text) {
  if (!window.speechSynthesis) return;
  speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.lang = 'zh-CN';
  utt.rate = 0.8;
  speechSynthesis.speak(utt);
}

function firstGlyph(str) {
  return str.replace(/\s*\(.*\)\s*$/, '').split('')[0];
}

// Many radicals have a distinct "combining form" glyph used only inside other
// characters (e.g. 人 -> 亻, called 单人旁). These are written in the data as
// "人 (亻)" with the combining form's name buried in `note`. Pull both out so
// each combining form can get its own visible card.
//
// NOT every "X (Y)" entry is a combining-form pair, though — some are just a
// simplified/traditional character pair (e.g. 见 (見), 车 (車)), where the
// bracketed form is a full independent character, not a bound component. Only
// split entries that are genuinely primary-character -> bound-component pairs.
const COMBINING_FORM_CHARS = new Set([
  '人 (亻)', '刀 (刂)', '川 (巛)', '心 (忄)', '手 (扌)', '水 (氵)', '火 (灬)',
  '爪 (爫)', '牛 (牜)', '犬 (犭)', '玉 (王)', '示 (礻)', '竹 (⺮)', '糸 (纟)',
  '网 (罒)', '老 (耂)', '艸 (艹)', '衣 (衤)', '西 (覀)', '言 (讠)', '足 (⻊)',
  '邑 (阝右)', '金 (钅)', '阜 (阝左)', '食 (饣)',
]);

// Pulls a "名称 (pīnyīn)" pedagogical name out of a note, e.g. from
// 'called 双人旁 (shuāng rén páng) "double person side"' -> 双人旁 / shuāng rén páng.
function extractNamedForm(note) {
  const m = note && note.match(/([一-鿿]{2,5})\s*\(([^)]+)\)/);
  return m ? { name: m[1], pinyin: m[2] } : null;
}

function parseVariant(item) {
  if (!COMBINING_FORM_CHARS.has(item.char)) return null;
  const m = item.char.match(/^(.+?)\s*\((.+?)\)$/);
  const named = extractNamedForm(item.note);
  return {
    primary: m[1].trim(),
    variantChar: m[2].trim(),
    variantName: named ? named.name : null,
    variantPinyin: named ? named.pinyin : null,
  };
}

function tagAsCombiningForm(card) {
  card.classList.add('is-variant');
  const tag = document.createElement('div');
  tag.className = 'variant-tag';
  tag.textContent = '偏旁';
  card.insertBefore(tag, card.firstChild);
}

function buildCard(item, { char, note, noteClass = 'rad-note' } = {}) {
  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.search = [item.char, item.pinyin, item.meaning, item.word, item.wordPinyin, item.wordMeaning, note]
    .join(' ').toLowerCase();

  const top = document.createElement('div');
  top.className = 'card-top';

  const radChar = document.createElement('div');
  radChar.className = 'rad-char';
  radChar.textContent = char;
  radChar.title = 'Play sound';
  radChar.addEventListener('click', () => speak(firstGlyph(item.char)));
  top.appendChild(radChar);

  const info = document.createElement('div');
  info.className = 'rad-info';
  const pinyinEl = document.createElement('div');
  pinyinEl.className = 'rad-pinyin';
  pinyinEl.textContent = item.pinyin;
  const meaningEl = document.createElement('div');
  meaningEl.className = 'rad-meaning';
  meaningEl.textContent = item.meaning;
  info.appendChild(pinyinEl);
  info.appendChild(meaningEl);
  if (note) {
    const noteEl = document.createElement('div');
    noteEl.className = noteClass;
    noteEl.textContent = note;
    info.appendChild(noteEl);
  }
  top.appendChild(info);

  const speakBtn = document.createElement('button');
  speakBtn.className = 'speak-btn';
  speakBtn.textContent = '🔊';
  speakBtn.title = 'Play radical + word';
  speakBtn.addEventListener('click', () => speak(firstGlyph(item.char) + '，' + item.word));
  top.appendChild(speakBtn);

  card.appendChild(top);
  card.appendChild(Object.assign(document.createElement('div'), { className: 'divider' }));

  const wordRow = document.createElement('div');
  wordRow.className = 'word-row';
  const wordChar = document.createElement('span');
  wordChar.className = 'word-char';
  wordChar.textContent = item.word;
  wordChar.title = 'Play word';
  wordChar.addEventListener('click', () => speak(item.word));
  const wordPinyin = document.createElement('span');
  wordPinyin.className = 'word-pinyin';
  wordPinyin.textContent = item.wordPinyin;
  const wordMeaning = document.createElement('span');
  wordMeaning.className = 'word-meaning';
  wordMeaning.textContent = item.wordMeaning;
  wordRow.appendChild(wordChar);
  wordRow.appendChild(wordPinyin);
  wordRow.appendChild(wordMeaning);
  card.appendChild(wordRow);

  return card;
}

// Build UI
const main = document.getElementById('main');
const nav = document.getElementById('stroke-nav');

RADICAL_GROUPS.forEach(({ strokes, items }) => {
  const id = 'strokes-' + strokes;

  const a = document.createElement('a');
  a.href = '#' + id;
  a.textContent = strokes;
  a.dataset.group = id;
  a.addEventListener('click', e => {
    e.preventDefault();
    const target = document.getElementById(id);
    const stickyH = document.getElementById('stroke-nav').offsetHeight;
    const top = target.getBoundingClientRect().top + window.scrollY - stickyH - 8;
    window.scrollTo({ top, behavior: 'smooth' });
  });
  nav.appendChild(a);

  const group = document.createElement('div');
  group.className = 'group';
  group.id = id;
  const gl = document.createElement('div');
  gl.className = 'group-label';
  gl.textContent = `${strokes} stroke${strokes === 1 ? '' : 's'}`;
  group.appendChild(gl);

  const grid = document.createElement('div');
  grid.className = 'grid';

  items.forEach(item => {
    const variant = parseVariant(item);

    if (variant) {
      // Standalone/full-form card (e.g. 人).
      grid.appendChild(buildCard(item, { char: variant.primary }));

      // Combining-form card (e.g. 亻, "单人旁") — the form actually used
      // inside other characters, shown as its own entry so it's easy to find.
      const variantCard = buildCard(item, {
        char: variant.variantChar,
        note: variant.variantName || null,
        noteClass: 'rad-variant-name',
      });
      tagAsCombiningForm(variantCard);
      grid.appendChild(variantCard);
    } else {
      // Some radicals (e.g. 彳 "双人旁", 疒 "病字旁") only ever exist as a bound
      // form — there's no separate standalone character to pair them with —
      // but they're still named 偏旁, so tag them too instead of only tagging
      // the split primary/combining-form pairs above.
      const named = extractNamedForm(item.note);
      const card = buildCard(item, {
        char: item.char,
        note: named ? named.name : item.note,
        noteClass: named ? 'rad-variant-name' : 'rad-note',
      });
      if (named) tagAsCombiningForm(card);
      grid.appendChild(card);
    }
  });

  group.appendChild(grid);
  main.appendChild(group);
});

document.getElementById('count-note').textContent = `${document.querySelectorAll('.card').length} entries`;

// Search + variant-only filter
const searchInput = document.getElementById('search');
const variantOnlyInput = document.getElementById('variant-only');

function applyFilters() {
  const q = searchInput.value.trim().toLowerCase();
  const variantOnly = variantOnlyInput.checked;
  document.querySelectorAll('.card').forEach(card => {
    const matchesSearch = !q || card.dataset.search.includes(q);
    const matchesVariant = !variantOnly || card.classList.contains('is-variant');
    card.classList.toggle('hidden', !(matchesSearch && matchesVariant));
  });
  document.querySelectorAll('.group').forEach(group => {
    const anyVisible = [...group.querySelectorAll('.card')].some(c => !c.classList.contains('hidden'));
    group.style.display = anyVisible ? '' : 'none';
  });
}

searchInput.addEventListener('input', applyFilters);
variantOnlyInput.addEventListener('change', applyFilters);

// Highlight nav link for the group closest to top of viewport
const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    const link = nav.querySelector(`[data-group="${entry.target.id}"]`);
    if (link) link.classList.toggle('current', entry.isIntersecting);
  });
}, { rootMargin: '-20% 0px -75% 0px' });

document.querySelectorAll('.group').forEach(g => observer.observe(g));
