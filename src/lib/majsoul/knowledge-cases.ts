import type { AnalysisIntent, AnalysisKnowledgeCase } from "./types";

const SOURCES = {
  wrcRules: {
    title: "World Riichi Championship Rules 2022",
    url: "https://www.worldriichi.org/s/WRC_Rules_2022_20220708_site.pdf",
  },
  riichiWikiDora: {
    title: "Riichi Wiki: Dora",
    url: "https://riichi.wiki/Dora",
  },
  riichiWikiDefense: {
    title: "Riichi Wiki: Defense",
    url: "https://riichi.wiki/Defense",
  },
  riichiWikiSuji: {
    title: "Riichi Wiki: Suji",
    url: "https://riichi.wiki/Suji",
  },
  riichiWikiKabe: {
    title: "Riichi Wiki: Kabe",
    url: "https://riichi.wiki/Kabe",
  },
  riichiBookOne: {
    title: "Riichi Book 1",
    url: "https://repo.riichi.moe/books/rb1/index.html",
  },
} satisfies Record<string, NonNullable<AnalysisKnowledgeCase["sources"]>[number]>;

export const ANALYSIS_KNOWLEDGE_CASES: AnalysisKnowledgeCase[] = [
  {
    id: "same-efficiency-white-green-dragon-dora-potential",
    intent: "compare_candidate_discards",
    triggerTiles: ["5z", "6z"],
    ruleTags: ["dora", "dragon-order", "same-efficiency", "user-correction"],
    matchKeywords: ["白板", "白", "发财", "发", "红中", "中", "宝牌", "指示牌", "牌效相同"],
    conditions: ["白板和发财都是候选切牌", "两者牌效相同或接近", "安全度没有明显差异", "需要解释为什么保留其中一张三元牌"],
    positiveExplanation:
      "白板和发财当前牌效相同时，要继续比较未来宝牌潜力。三元牌宝牌顺序是白 -> 发 -> 中 -> 白；发财成为未来宝牌需要白板作为指示牌，白板成为未来宝牌需要红中作为指示牌。若白板已见而红中未见，同牌效下白板的未来宝牌潜力更高，因此更能解释先切发财、保留白板。",
    negativeClaims: ["宝牌指示牌是9筒所以白板发财无关", "用户混淆宝牌概念", "发财和白板完全对称所以只能说Mortal模型偏好"],
    requiredFacts: ["三元牌顺序：白 -> 发 -> 中 -> 白", "发财的指示牌是白板", "白板的指示牌是红中", "比较白板/发财时必须看对应指示牌已见数"],
    sources: [SOURCES.wrcRules, SOURCES.riichiWikiDora],
  },
  {
    id: "dora-indicator-is-not-dora",
    intent: "dora_explanation",
    triggerTiles: [],
    ruleTags: ["dora", "indicator"],
    matchKeywords: ["宝牌", "dora", "指示牌", "赤宝", "里宝", "杠宝"],
    conditions: ["用户询问宝牌价值", "回答需要区分指示牌和实际宝牌"],
    positiveExplanation: "宝牌指示牌不是宝牌本身，指示牌的下一张才是宝牌。解释任何宝牌价值前，先列出当前指示牌和由它推出的实际宝牌。",
    negativeClaims: ["把宝牌指示牌当成宝牌", "未核对当前指示牌就断言某张牌不是宝牌"],
    requiredFacts: ["数牌9的下一张是1", "风牌东南西北循环", "三元牌白发中循环"],
    sources: [SOURCES.wrcRules, SOURCES.riichiWikiDora],
  },
  {
    id: "user-correction-must-be-checked",
    intent: "user_correction",
    triggerTiles: [],
    ruleTags: ["correction", "faithfulness"],
    matchKeywords: ["其实", "不是", "应该", "正确", "你说错", "这个地方", "我觉得"],
    conditions: ["用户指出了具体规则", "用户指出了当前可见牌事实", "用户在纠正上一条回答"],
    positiveExplanation: "用户指出具体规则或可见牌事实时，先对照工具结果核查；若工具结果支持用户说法，要明确承认并吸收纠正。若工具结果不足，不得直接判定用户错误。",
    negativeClaims: ["在没有工具依据时说用户混淆概念", "忽略用户提供的正确规则"],
    requiredFacts: ["用户纠正需要被工具事实核对", "没有证据时只能说明无法验证"],
    sources: [SOURCES.riichiBookOne],
  },
  {
    id: "genbutsu-is-stronger-than-suji",
    intent: "safety_check",
    triggerTiles: [],
    ruleTags: ["defense", "genbutsu", "suji", "riichi"],
    matchKeywords: ["现物", "筋", "筋牌", "立直", "安牌", "安全", "危险", "押", "降"],
    conditions: ["有对手立直或明显听牌压力", "候选牌里存在现物和非现物"],
    positiveExplanation: "有人立直时，现物是已经被该家切过或通过规则确认不会放铳的牌，通常比筋牌线索更可靠。筋牌只是降低两面等待风险，不等于绝对安全。",
    negativeClaims: ["筋牌就是安全牌", "有筋就可以无视立直", "现物和筋的安全度相同"],
    requiredFacts: ["确认是哪一家立直", "分别检查候选牌是否是该家的现物", "筋牌只能削弱两面等待风险"],
    sources: [SOURCES.riichiWikiDefense, SOURCES.riichiWikiSuji],
  },
  {
    id: "suji-does-not-cover-closed-or-edge-waits",
    intent: "safety_check",
    triggerTiles: [],
    ruleTags: ["defense", "suji", "wait-shape"],
    matchKeywords: ["筋", "筋牌", "两面", "坎张", "边张", "单骑", "安全"],
    conditions: ["用户用筋牌解释安全性", "需要提醒筋牌的适用边界"],
    positiveExplanation: "筋牌主要基于两面听牌的限制来降低危险度，但不能防坎张、边张、双碰或单骑。因此回答里不能把筋牌说成完全安全，只能说相对降低一部分风险。",
    negativeClaims: ["筋牌一定不会放铳", "筋牌覆盖所有听牌形", "因为是筋所以绝对安全"],
    requiredFacts: ["当前是否有立直家", "该牌是否为现物", "该牌是否只是筋牌而非绝对安全牌"],
    sources: [SOURCES.riichiWikiSuji, SOURCES.riichiWikiDefense],
  },
  {
    id: "kabe-reduces-but-does-not-eliminate-risk",
    intent: "safety_check",
    triggerTiles: [],
    ruleTags: ["defense", "kabe", "wall"],
    matchKeywords: ["壁", "四枚见", "三枚见", "安全", "危险", "放铳"],
    conditions: ["用户提到壁", "可见牌支持某张牌形成壁线索"],
    positiveExplanation: "壁可以根据已见张数推断某些两面形较难成立，但它仍然是相对安全线索，不是现物。尤其在单骑、双碰、坎张等形下仍可能放铳。",
    negativeClaims: ["有壁就是绝对安全", "四枚见可以排除所有等待", "壁和现物一样安全"],
    requiredFacts: ["目标牌相关数牌的已见张数", "该牌是否同时是现物", "是否存在宝牌、役牌或副露压力"],
    sources: [SOURCES.riichiWikiKabe, SOURCES.riichiWikiDefense],
  },
  {
    id: "tile-efficiency-same-waits-need-secondary-factors",
    intent: "compare_candidate_discards",
    triggerTiles: [],
    ruleTags: ["tile-efficiency", "same-efficiency", "secondary-factors"],
    matchKeywords: ["牌效相同", "受入相同", "向听相同", "为什么", "而不是", "比较"],
    conditions: ["两个候选切牌向听和受入相同或接近", "需要解释非牌效因素"],
    positiveExplanation: "当候选切牌的向听、受入和待牌集合相同或非常接近时，不能只重复牌效数据。需要继续比较宝牌/未来宝牌潜力、役种机会、安全度、手牌改良空间和引擎排序。",
    negativeClaims: ["牌效相同所以没有理由", "只能说模型偏好", "受入一样时无需比较其他因素"],
    requiredFacts: ["候选切牌后的向听", "候选切牌后的受入和待牌集合", "候选牌的宝牌、安全、役种线索"],
    sources: [SOURCES.riichiBookOne],
  },
  {
    id: "isolated-yakuhai-honor-value-depends-on-context",
    intent: "discard_choice",
    triggerTiles: [],
    ruleTags: ["yakuhai", "honor", "tile-efficiency", "dora"],
    matchKeywords: ["役牌", "字牌", "白板", "发财", "红中", "东", "南", "西", "北", "孤张"],
    conditions: ["候选牌包含孤立字牌", "需要比较速度和价值"],
    positiveExplanation: "孤立字牌的价值不是固定的：自风、场风、三元牌、宝牌相关和已见张数都会改变保留价值。早巡可以为了役牌机会保留，速度或安全压力变强时则更倾向处理。",
    negativeClaims: ["所有孤立字牌价值相同", "役牌一定要留", "孤立字牌一定先切"],
    requiredFacts: ["目标玩家自风和场风", "该字牌已见张数", "该字牌是否为宝牌或宝牌指示牌相关", "当前巡目和防守压力"],
    sources: [SOURCES.riichiBookOne, SOURCES.riichiWikiDora],
  },
  {
    id: "placement-sensitive-avoid-four-needs-round-context",
    intent: "placement_strategy",
    triggerTiles: [],
    ruleTags: ["placement", "endgame", "honba", "round-wind", "avoid-4", "push-fold"],
    matchKeywords: ["避4", "打点", "本场", "供托", "东场", "南场", "西场", "北场", "名次", "分差", "点差", "追分", "守位", "保四", "末局", "终局", "收支"],
    conditions: ["用户问的是打点/避4/守位，而不是单纯牌效题", "需要结合场风、本场、供托和名次"],
    positiveExplanation:
      "避4和打点不是纯牌效题，必须结合局况来判断。东风场更常看效率和铺垫，南风场尤其末局更看名次、分差、本场和供托；有时为了追分要提高打点，有时为了守位要更保守。",
    negativeClaims: ["避4只看牌效", "本场没用", "东风场和南风场判断完全一样"],
    requiredFacts: ["当前是东风场还是南风场", "本场和供托", "当前名次与分差", "是否末局/是否需要追分或守位"],
    sources: [SOURCES.riichiBookOne, SOURCES.riichiWikiDefense],
  },
];

export function retrieveKnowledgeCases({
  intent,
  focusTiles,
  question,
}: {
  intent: AnalysisIntent;
  focusTiles: string[];
  question: string;
}) {
  const normalizedQuestion = question.toLowerCase();
  const tileSet = new Set(focusTiles);
  const correctionCue = /(你.*(错|不对)|刚才.*(错|不对)|纠正|更正|不是这个意思|其实不是|不是因为|我说的是|你忽略|你混淆|这个地方)/.test(normalizedQuestion);

  return ANALYSIS_KNOWLEDGE_CASES.map((item) => ({ item, score: scoreKnowledgeCase(item, intent, tileSet, normalizedQuestion) }))
    .filter(({ item, score }) => score > 0 && (item.intent !== "user_correction" || correctionCue || intent === "user_correction"))
    .sort((left, right) => right.score - left.score || left.item.id.localeCompare(right.item.id))
    .map(({ item }) => item)
    .slice(0, 4);
}

function scoreKnowledgeCase(item: AnalysisKnowledgeCase, intent: AnalysisIntent, focusTiles: Set<string>, normalizedQuestion: string) {
  const intentCompatible = item.intent === intent || item.intent === "user_correction" || (intent === "user_correction" && item.intent === "compare_candidate_discards");
  if (!intentCompatible) {
    return 0;
  }

  let score = item.intent === intent ? 4 : 1;
  const triggerMatched = !item.triggerTiles.length || item.triggerTiles.every((tile) => focusTiles.has(tile));
  if (!triggerMatched) {
    return 0;
  }

  if (item.triggerTiles.length) {
    score += item.triggerTiles.length * 3;
  }

  for (const tag of item.ruleTags) {
    if (normalizedQuestion.includes(tag.toLowerCase())) {
      score += 2;
    }
  }

  for (const keyword of item.matchKeywords ?? []) {
    if (normalizedQuestion.includes(keyword.toLowerCase())) {
      score += 2;
    }
  }

  if (normalizedQuestion.includes("发财") && normalizedQuestion.includes("白") && item.ruleTags.includes("dragon-order")) {
    score += 6;
  }

  if (normalizedQuestion.includes("宝牌") && item.ruleTags.includes("dora")) {
    score += 3;
  }

  if (/(其实|不是|应该|正确|你说错|这个地方)/.test(normalizedQuestion) && item.ruleTags.includes("correction")) {
    score += 4;
  }

  if (/(现物|筋|筋牌|壁|立直|安牌|安全|危险|押|降)/.test(normalizedQuestion) && item.ruleTags.includes("defense")) {
    score += 3;
  }

  return score;
}
