import assert from "node:assert/strict";
import { analyzeDocument } from "../public/analyzer.js";

const cases = [
  {
    name: "钢铁企业完整链路与 B 类断点",
    fileName: "某钢铁股份-2024可持续发展报告.pdf",
    text: [
      "某钢铁股份2024可持续发展报告",
      "公司承诺到2030年将绿电采购占比提升至40%。",
      "公司承诺到2028年使吨钢碳排放较2020年下降18%。",
      "厂区分布式光伏一期项目并网发电，并完成首笔绿电直购签约。",
      "报告期内，公司完成烧结工序余热回收节能改造。",
      "本期公司绿电采购占比为21%，较上年提升5个百分点。",
      "本年度公司吨钢碳排放同比下降4.2%。"
    ].join("\n"),
    expected: {
      commitment: 2,
      action: 2,
      performance: 2,
      breakpoints: ["B"]
    }
  },
  {
    name: "化工企业 A 类断点",
    fileName: "某化工集团-2022可持续发展报告.pdf",
    text: [
      "某化工集团2022可持续发展报告",
      "公司承诺到2027年实现运营边界Scope 1+Scope 2碳中和。"
    ].join("\n"),
    expected: {
      commitment: 1,
      action: 0,
      performance: 0,
      breakpoints: ["A"]
    }
  },
  {
    name: "电力企业 C 类断点",
    fileName: "某电力股份-2024可持续发展报告.pdf",
    text: [
      "某电力股份2024可持续发展报告",
      "本年度公司碳排放同比下降10%。"
    ].join("\n"),
    expected: {
      commitment: 0,
      action: 0,
      performance: 1,
      breakpoints: ["C"]
    }
  },
  {
    name: "口号不得误识别",
    fileName: "某电子科技-2024可持续发展报告.pdf",
    text: [
      "某电子科技2024可持续发展报告",
      "公司持续推进绿色低碳转型，积极落实双碳目标。",
      "公司将不断降低碳排放，加大绿色投入。"
    ].join("\n"),
    expected: {
      commitment: 0,
      action: 0,
      performance: 0,
      breakpoints: []
    }
  },
  {
    name: "碳管理与耗能行动",
    fileName: "某制造企业-2024可持续发展报告.pdf",
    text: [
      "某制造企业2024可持续发展报告",
      "公司建立内部碳台账，开展员工碳管理培训。",
      "公司淘汰高耗能老旧设备。"
    ].join("\n"),
    expected: {
      commitment: 0,
      action: 2,
      performance: 0,
      breakpoints: ["B", "B"]
    }
  },
  {
    name: "未来计划不得识别为行动",
    fileName: "某材料企业-2024可持续发展报告.pdf",
    text: [
      "某材料企业2024可持续发展报告",
      "公司计划于2028年完成余热回收改造。",
      "公司拟开展能源管理平台建设。"
    ].join("\n"),
    expected: {
      commitment: 0,
      action: 0,
      performance: 0,
      breakpoints: []
    }
  },
  {
    name: "无承诺时行动与单项绩效直接关联",
    fileName: "某玻璃企业-2024可持续发展报告.pdf",
    text: [
      "某玻璃企业2024可持续发展报告",
      "报告期内，公司完成余热回收改造。",
      "本期余热发电量为1200万千瓦时。"
    ].join("\n"),
    expected: {
      commitment: 0,
      action: 1,
      performance: 1,
      breakpoints: []
    }
  },
  {
    name: "同一句多要素按一个标签处理",
    fileName: "某水泥企业-2024可持续发展报告.pdf",
    text: [
      "某水泥企业2024可持续发展报告",
      "公司承诺到2030年单位营收碳排放较2020年下降25%；报告期内已完成余热回收改造，节能率为6%。"
    ].join("\n"),
    expected: {
      commitment: 1,
      action: 0,
      performance: 0,
      breakpoints: ["A"]
    }
  },
  {
    name: "年份不得误作绩效数值",
    fileName: "某电力企业-2024可持续发展报告.pdf",
    text: [
      "某电力企业2024可持续发展报告",
      "2024年，公司碳排放总量为18.2万吨CO₂e，同比下降4.2%。"
    ].join("\n"),
    expected: {
      commitment: 0,
      action: 0,
      performance: 1,
      breakpoints: ["C"]
    },
    forbiddenPerformanceValue: 2024
  },
  {
    name: "目录导航不得识别为行动",
    fileName: "某企业-2024可持续发展报告.pdf",
    text: [
      "某企业2024可持续发展报告",
      "报告编制说明 高管致辞 公司基本信息 议题重要性评估 公司可持续发展治理安排 高质量发展专题 环境篇 社会篇 治理篇 附录"
    ].join("\n"),
    expected: {
      commitment: 0,
      action: 0,
      performance: 0,
      breakpoints: []
    }
  },
  {
    name: "气候风险情景不得识别为行动",
    fileName: "某企业-2024可持续发展报告.pdf",
    text: [
      "某企业2024可持续发展报告",
      "政府可能更新建筑法规和工程建设标准，提出更高能效要求，可能影响项目开发成本和运营安排。"
    ].join("\n"),
    expected: {
      commitment: 0,
      action: 0,
      performance: 0,
      breakpoints: []
    }
  },
  {
    name: "技术表格片段不得识别为行动",
    fileName: "某企业-2024可持续发展报告.pdf",
    text: [
      "某企业2024可持续发展报告",
      "技术类型：工艺工法 技术特点：采用节能灯具 管理优化：分区域责任制"
    ].join("\n"),
    expected: {
      commitment: 0,
      action: 0,
      performance: 0,
      breakpoints: []
    }
  },
  {
    name: "上一年度报告中的次年目标识别为承诺",
    fileName: "某企业-2024可持续发展报告.pdf",
    text: [
      "某企业2024可持续发展报告",
      "公司承诺到2025年使单位营收碳排放较2023年下降10%。"
    ].join("\n"),
    expected: {
      commitment: 1,
      action: 0,
      performance: 0,
      breakpoints: ["A"]
    }
  },
  {
    name: "外部政策目标不得识别为企业承诺",
    fileName: "某企业-2024可持续发展报告.pdf",
    text: [
      "某企业2024可持续发展报告",
      "根据住房和城乡建设部《“十四五”建筑节能与绿色建筑发展规划》的总体目标：到2025年，城镇新建建筑全面建成绿色建筑，建筑能耗和碳排放增长趋势得到有效控制。"
    ].join("\n"),
    expected: {
      commitment: 0,
      action: 0,
      performance: 0,
      breakpoints: []
    }
  }
];

const failures = [];

for (const testCase of cases) {
  const pages = [
    {
      page_number: 1,
      text: testCase.text,
      clean_text: testCase.text
    }
  ];
  const analysis = analyzeDocument(
    {
      file: { name: testCase.fileName },
      extracted_text: testCase.text,
      pages
    },
    { multi_document: true }
  );
  const counts = {
    commitment: 0,
    action: 0,
    performance: 0
  };

  for (const element of analysis.elements) {
    counts[element.element_type] += 1;
  }

  const breakpoints = analysis.breakpoints.map((item) => item.type).sort();
  const expectedBreakpoints = [...testCase.expected.breakpoints].sort();
  const performanceValues = analysis.elements
    .filter((element) => element.element_type === "performance")
    .map((element) => element.value);

  try {
    assert.equal(counts.commitment, testCase.expected.commitment);
    assert.equal(counts.action, testCase.expected.action);
    assert.equal(counts.performance, testCase.expected.performance);
    assert.deepEqual(breakpoints, expectedBreakpoints);
    if (testCase.forbiddenPerformanceValue !== undefined) {
      assert.ok(!performanceValues.includes(testCase.forbiddenPerformanceValue));
    }
    console.log(`PASS ${testCase.name}`);
  } catch (error) {
    failures.push({
      name: testCase.name,
      message: error.message,
      counts,
      breakpoints,
      performanceValues
    });
    console.error(`FAIL ${testCase.name}`);
  }
}

console.log(
  `\nAnalyzer regression: ${cases.length - failures.length}/${cases.length} passed`
);

if (failures.length > 0) {
  console.error(JSON.stringify(failures, null, 2));
  process.exitCode = 1;
}
