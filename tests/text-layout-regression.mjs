import assert from "node:assert/strict";
import { reconstructTextLines } from "../public/text-layout.js";

function token(text, x, y, width, fontSize = 10) {
  return {
    str: text,
    width,
    transform: [fontSize, 0, 0, fontSize, x, y]
  };
}

const twoColumnItems = [
  token("保利发展2025年度可持续发展报告", 80, 780, 430, 16),
  token("双碳战略", 80, 700, 80, 14),
  token("气候风险", 350, 700, 80, 14),
  token("推动节能减排", 80, 680, 150),
  token("识别转型风险", 350, 680, 150),
  token("完善碳管理体系", 80, 660, 150),
  token("开展气候情景分析", 350, 660, 150),
  token("北京公司开展碳中和认证", 80, 640, 190),
  token("建立绿色建造技术体系", 350, 640, 190)
];

const lines = reconstructTextLines(twoColumnItems, 595);
assert.deepEqual(lines, [
  "保利发展2025年度可持续发展报告",
  "双碳战略",
  "推动节能减排",
  "完善碳管理体系",
  "北京公司开展碳中和认证",
  "气候风险",
  "识别转型风险",
  "开展气候情景分析",
  "建立绿色建造技术体系"
]);
assert.ok(lines.every((line) => !line.includes("双碳战略气候风险")));
assert.ok(lines.every((line) => !line.includes("推动节能减排识别转型风险")));

const fragmentedLine = reconstructTextLines(
  [
    token("2025年，公司", 80, 500, 72),
    token("碳排放同比下降4.2%。", 156, 500, 120)
  ],
  595
);
assert.deepEqual(fragmentedLine, ["2025年，公司碳排放同比下降4.2%。"]);

console.log("text-layout regression passed");
