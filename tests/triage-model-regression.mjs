import {
  buildReviewPortfolio,
  buildReviewTasks,
  evaluateBaseline,
  solveReviewPortfolio
} from "../public/triage-model.js";

const tasks = [
  task("A", 9, 6, 0),
  task("B", 8, 5, 1),
  task("C", 12, 9, 2)
];
const optimized = solveReviewPortfolio(tasks, 15);
const greedy = evaluateBaseline(tasks, 15, "risk", "风险贪心");

assert(
  optimized.selectedKeys.includes("task:A") &&
    optimized.selectedKeys.includes("task:C"),
  "exact knapsack should outperform the ratio-greedy choice"
);
assert(
  optimized.objectiveValue > greedy.objectiveValue,
  "optimized objective should exceed ratio greedy"
);
assert(optimized.effort <= optimized.budget, "budget constraint must hold");

const analysis = {
  elements: [
    {
      id: "C-01",
      element_type: "commitment",
      content: "2030 年绿电占比达到 40%",
      due_year: 2030,
      report_year: 2024,
      confidence: 0.91,
      review_status: "待核"
    },
    {
      id: "A-01",
      element_type: "action",
      content: "完成光伏项目并网",
      commitment_id: "C-01",
      confidence: 0.84,
      review_status: "待核"
    },
    {
      id: "P-01",
      element_type: "performance",
      content: "绿电占比 21%",
      commitment_id: "C-01",
      confidence: 0.82,
      review_status: "待核"
    }
  ],
  breakpoints: [
    {
      id: "BP-001",
      type: "A",
      title: "行动缺少行动级绩效",
      description: "项目结果仅披露集团汇总口径。",
      commitment_id: "C-01",
      evidence_ids: ["C-01", "A-01", "P-01"],
      missing: ["行动级绩效"],
      review_status: "待核"
    }
  ]
};

const reviewTasks = buildReviewTasks(analysis);
assert(
  reviewTasks.length === 1 && reviewTasks[0].sourceId === "BP-001",
  "evidence referenced by a breakpoint should not be double counted"
);

const portfolio = buildReviewPortfolio(analysis, {
  budget: 60,
  riskMode: "expected"
});
assert(portfolio.optimized.effort <= 60, "portfolio must respect budget");
assert(
  portfolio.optimized.coverage >= 0 && portfolio.optimized.coverage <= 1,
  "coverage should be a ratio"
);
assert(
  portfolio.sensitivity.every(
    (entry, index, values) =>
      index === 0 || entry.optimizedCoverage >= values[index - 1].optimizedCoverage
  ),
  "coverage should be monotonic when budget increases"
);
assert(
  portfolio.robustness.averageOverlap >= 0 &&
    portfolio.robustness.averageOverlap <= 1,
  "robustness overlap should be a ratio"
);

console.log("triage-model regression passed");

function task(id, value, effort, order) {
  return {
    key: `task:${id}`,
    sourceId: id,
    sourceType: "test",
    type: "test",
    title: id,
    description: id,
    confidence: 0.8,
    riskScore: value / 20,
    riskTier: value >= 8 ? "high" : "medium",
    uncertainty: 0.1,
    valueLow: value * 0.9,
    valueExpected: value,
    valueHigh: value * 1.1,
    effort,
    reviewStatus: "待核",
    order
  };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
