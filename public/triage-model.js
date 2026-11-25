const BREAKPOINT_RISK = {
  A: 0.96,
  B: 0.86,
  C: 0.9
};

const ELEMENT_RISK = {
  commitment: 0.82,
  action: 0.66,
  performance: 0.72
};

const BREAKPOINT_EFFORT = {
  A: 20,
  B: 18,
  C: 16
};

const ELEMENT_EFFORT = {
  commitment: 12,
  action: 8,
  performance: 7
};

export function buildReviewPortfolio(
  analysis,
  { budget = 90, riskMode = "expected" } = {}
) {
  const tasks = buildReviewTasks(analysis);
  const normalizedBudget = Math.max(10, Math.round(Number(budget) || 90));
  const optimized = solveReviewPortfolio(
    tasks,
    normalizedBudget,
    riskMode
  );
  const baselines = [
    evaluateBaseline(tasks, normalizedBudget, "document", "文档顺序"),
    evaluateBaseline(tasks, normalizedBudget, "confidence", "低置信度优先"),
    evaluateBaseline(tasks, normalizedBudget, "risk", "风险价值贪心")
  ];
  const sensitivity = buildSensitivity(tasks, riskMode);
  const robustness = buildRobustness(tasks, optimized, normalizedBudget);

  return {
    budget: normalizedBudget,
    riskMode,
    tasks,
    optimized,
    baselines,
    sensitivity,
    robustness,
    totalExpectedValue: sumExpectedValue(tasks)
  };
}

export function buildReviewTasks(analysis = {}) {
  const elements = Array.isArray(analysis.elements) ? analysis.elements : [];
  const breakpoints = Array.isArray(analysis.breakpoints)
    ? analysis.breakpoints
    : [];
  const elementById = new Map(elements.map((element) => [element.id, element]));
  const referencedEvidence = new Set();
  const tasks = [];

  for (const breakpoint of breakpoints) {
    const evidenceIds = Array.isArray(breakpoint.evidence_ids)
      ? breakpoint.evidence_ids
      : [];
    evidenceIds.forEach((id) => referencedEvidence.add(id));
    const linkedElements = evidenceIds
      .map((id) => elementById.get(id))
      .filter(Boolean);
    const commitment =
      elementById.get(breakpoint.commitment_id) ||
      linkedElements.find((element) => element.element_type === "commitment");
    const confidence = minimumConfidence(linkedElements, 0.72);
    const uncertainty = estimateUncertainty(confidence);
    const urgency = estimateUrgency(commitment);
    const unresolved = reviewRiskFactor(breakpoint.review_status);
    const missingCount = Array.isArray(breakpoint.missing)
      ? breakpoint.missing.length
      : 1;
    const riskScore = clamp(
      (BREAKPOINT_RISK[breakpoint.type] || 0.78) *
        urgency *
        unresolved *
        (1 + Math.min(0.18, missingCount * 0.04)),
      0.08,
      1.2
    );
    const effort = Math.round(
      (BREAKPOINT_EFFORT[breakpoint.type] || 16) +
        Math.max(0, missingCount - 1) * 2
    );

    tasks.push(
      createTask({
        key: `breakpoint:${breakpoint.id}`,
        sourceId: breakpoint.id,
        sourceType: "breakpoint",
        type: breakpoint.type,
        title: breakpoint.title || `${breakpoint.type} 类断点`,
        description:
          breakpoint.description ||
          `缺失证据：${(breakpoint.missing || []).join("、")}`,
        confidence,
        riskScore,
        uncertainty,
        effort,
        reviewStatus: breakpoint.review_status
      })
    );
  }

  for (const element of elements) {
    if (referencedEvidence.has(element.id)) {
      continue;
    }
    if (element.review_status === "已排除") {
      continue;
    }

    const confidence = clamp(Number(element.confidence) || 0.72, 0, 1);
    const uncertainty = estimateUncertainty(confidence);
    const urgency = estimateUrgency(
      element.element_type === "commitment"
        ? element
        : elementById.get(element.commitment_id)
    );
    const riskScore = clamp(
      (ELEMENT_RISK[element.element_type] || 0.64) *
        urgency *
        reviewRiskFactor(element.review_status),
      0.08,
      1.15
    );

    tasks.push(
      createTask({
        key: `element:${element.id}`,
        sourceId: element.id,
        sourceType: "element",
        type: element.element_type,
        title: element.content || `${element.element_type} 证据核验`,
        description:
          element.source_quote || "核验要素分类、原文定位与关联关系。",
        confidence,
        riskScore,
        uncertainty,
        effort: ELEMENT_EFFORT[element.element_type] || 8,
        reviewStatus: element.review_status
      })
    );
  }

  return tasks.map((task, index) => ({ ...task, order: index }));
}

export function solveReviewPortfolio(tasks, budget, riskMode = "expected") {
  const safeTasks = Array.isArray(tasks) ? tasks : [];
  const capacity = Math.max(0, Math.floor(Number(budget) || 0));
  const values = safeTasks.map((task) => taskValue(task, riskMode));
  const previous = Array.from({ length: capacity + 1 }, () => 0);
  const table = [previous.slice()];

  for (let index = 0; index < safeTasks.length; index += 1) {
    const current = previous.slice();
    const effort = Math.max(1, Math.round(safeTasks[index].effort));
    const value = values[index];
    for (let used = effort; used <= capacity; used += 1) {
      current[used] = Math.max(
        current[used],
        previous[used - effort] + value
      );
    }
    table.push(current);
    previous.splice(0, previous.length, ...current);
  }

  const selected = [];
  let remaining = capacity;
  for (let row = safeTasks.length; row > 0; row -= 1) {
    if (table[row][remaining] === table[row - 1][remaining]) {
      continue;
    }
    const task = safeTasks[row - 1];
    selected.push(task);
    remaining -= Math.max(1, Math.round(task.effort));
  }
  selected.reverse();

  return summarizeSelection(
    safeTasks,
    selected,
    capacity,
    riskMode,
    "optimized"
  );
}

export function evaluateBaseline(tasks, budget, strategy, label) {
  const safeTasks = Array.isArray(tasks) ? tasks : [];
  const capacity = Math.max(0, Math.floor(Number(budget) || 0));
  let ordered;

  if (strategy === "confidence") {
    ordered = [...safeTasks].sort(
      (left, right) =>
        left.confidence - right.confidence || right.riskScore - left.riskScore
    );
  } else if (strategy === "risk") {
    ordered = [...safeTasks].sort(
      (left, right) =>
        right.valueExpected / right.effort -
          left.valueExpected / left.effort ||
        right.riskScore - left.riskScore
    );
  } else {
    ordered = [...safeTasks].sort((left, right) => left.order - right.order);
  }

  const selected = [];
  let used = 0;
  for (const task of ordered) {
    const effort = Math.max(1, Math.round(task.effort));
    if (used + effort > capacity) {
      continue;
    }
    selected.push(task);
    used += effort;
  }

  return summarizeSelection(
    safeTasks,
    selected,
    capacity,
    "expected",
    strategy,
    label
  );
}

function createTask({
  key,
  sourceId,
  sourceType,
  type,
  title,
  description,
  confidence,
  riskScore,
  uncertainty,
  effort,
  reviewStatus
}) {
  const expected = riskScore * 100;
  return {
    key,
    sourceId,
    sourceType,
    type,
    title,
    description,
    confidence: round(confidence, 3),
    riskScore: round(riskScore, 3),
    riskTier:
      riskScore >= 0.84 ? "high" : riskScore >= 0.66 ? "medium" : "low",
    uncertainty: round(uncertainty, 3),
    valueLow: round(expected * (1 - uncertainty), 2),
    valueExpected: round(expected, 2),
    valueHigh: round(expected * (1 + uncertainty), 2),
    effort: Math.max(1, Math.round(effort)),
    reviewStatus: reviewStatus || "待复核"
  };
}

function taskValue(task, riskMode) {
  if (riskMode === "robust") return task.valueLow;
  if (riskMode === "opportunity") return task.valueHigh;
  return task.valueExpected;
}

function summarizeSelection(
  tasks,
  selected,
  budget,
  riskMode,
  strategy,
  label = "优化组合"
) {
  const totalExpected = sumExpectedValue(tasks);
  const selectedExpected = sumExpectedValue(selected);
  const highRiskTasks = tasks.filter((task) => task.riskTier === "high");
  const selectedHighRisk = selected.filter((task) => task.riskTier === "high");
  const effort = selected.reduce((total, task) => total + task.effort, 0);

  return {
    strategy,
    label,
    riskMode,
    selected,
    selectedKeys: selected.map((task) => task.key),
    selectedCount: selected.length,
    effort,
    budget,
    utilization: budget > 0 ? round(effort / budget, 3) : 0,
    objectiveValue: round(
      selected.reduce((total, task) => total + taskValue(task, riskMode), 0),
      2
    ),
    coveredValue: round(selectedExpected, 2),
    coverage: totalExpected > 0 ? round(selectedExpected / totalExpected, 3) : 0,
    highRiskCoverage:
      highRiskTasks.length > 0
        ? round(selectedHighRisk.length / highRiskTasks.length, 3)
        : 1
  };
}

function buildSensitivity(tasks, riskMode) {
  const budgets = [30, 60, 90, 120, 180];
  return budgets.map((budget) => {
    const optimized = solveReviewPortfolio(tasks, budget, riskMode);
    const confidenceBaseline = evaluateBaseline(
      tasks,
      budget,
      "confidence",
      "低置信度优先"
    );
    return {
      budget,
      optimizedCoverage: optimized.coverage,
      baselineCoverage: confidenceBaseline.coverage,
      selectedCount: optimized.selectedCount
    };
  });
}

function buildRobustness(tasks, optimized, budget) {
  if (!tasks.length) {
    return {
      averageOverlap: 0,
      minimumCoverage: 0,
      scenarioCount: 0
    };
  }

  const baseKeys = new Set(optimized.selectedKeys);
  const random = seededRandom(20261125);
  const overlaps = [];
  const coverages = [];
  const expectedTotal = sumExpectedValue(tasks);

  for (let scenario = 0; scenario < 25; scenario += 1) {
    const perturbed = tasks.map((task) => {
      const multiplier = 0.8 + random() * 0.4;
      const adjustedExpected = task.valueExpected * multiplier;
      return {
        ...task,
        valueLow: task.valueLow * multiplier,
        valueExpected: adjustedExpected,
        valueHigh: task.valueHigh * multiplier
      };
    });
    const selection = solveReviewPortfolio(perturbed, budget, "expected");
    const selectedKeys = new Set(selection.selectedKeys);
    const union = new Set([...baseKeys, ...selectedKeys]);
    const intersection = [...baseKeys].filter((key) => selectedKeys.has(key));
    overlaps.push(union.size > 0 ? intersection.length / union.size : 1);
    coverages.push(
      expectedTotal > 0
        ? selection.selected.reduce(
            (total, task) => total + task.valueExpected,
            0
          ) / expectedTotal
        : 0
    );
  }

  return {
    averageOverlap: round(average(overlaps), 3),
    minimumCoverage: round(Math.min(...coverages), 3),
    scenarioCount: overlaps.length
  };
}

function minimumConfidence(elements, fallback) {
  const values = elements
    .map((element) => Number(element.confidence))
    .filter((value) => Number.isFinite(value));
  return values.length > 0 ? Math.min(...values) : fallback;
}

function estimateUrgency(commitment) {
  if (!commitment) return 1;
  const dueYear = Number(commitment.due_year);
  const reportYear = Number(commitment.report_year);
  if (!Number.isFinite(dueYear) || !Number.isFinite(reportYear)) return 1;
  const remainingYears = dueYear - reportYear;
  if (remainingYears <= 2) return 1.18;
  if (remainingYears <= 5) return 1.08;
  if (remainingYears <= 10) return 1;
  return 0.92;
}

function reviewRiskFactor(status) {
  if (status === "已确认" || status === "已核") return 0.82;
  if (status === "存疑") return 1.06;
  if (status === "已排除") return 0.08;
  return 1;
}

function estimateUncertainty(confidence) {
  return clamp(0.04 + (1 - clamp(confidence, 0, 1)) * 0.35, 0.05, 0.28);
}

function sumExpectedValue(tasks) {
  return round(
    tasks.reduce((total, task) => total + task.valueExpected, 0),
    2
  );
}

function average(values) {
  return values.length
    ? values.reduce((total, value) => total + value, 0) / values.length
    : 0;
}

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, Number(value) || 0));
}

function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
}
