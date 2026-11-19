const EVIDENCE_TYPES = new Set(["commitment", "action", "performance"]);

const CHAIN_LABELS = {
  complete: "链路完整",
  A: "承诺无跟进",
  B: "行动缺结果",
  C: "绩效缺支撑",
  review: "待人工复核"
};

export function buildEvidenceChains(analysis = {}) {
  const elements = (analysis.elements || []).filter((element) =>
    EVIDENCE_TYPES.has(element.element_type)
  );
  const commitments = elements.filter(
    (element) => element.element_type === "commitment"
  );
  const actions = elements.filter(
    (element) => element.element_type === "action"
  );
  const performances = elements.filter(
    (element) => element.element_type === "performance"
  );
  const breakpoints = analysis.breakpoints || [];
  const usedElementIds = new Set();

  const chains = commitments.map((commitment, index) => {
    const linkedActions = uniqueById([
      ...actions.filter((action) => action.commitment_id === commitment.id),
      ...actions.filter((action) =>
        (commitment.linked_actions || []).includes(action.id)
      )
    ]);
    const linkedActionIds = new Set(linkedActions.map((action) => action.id));
    const linkedPerformances = uniqueById([
      ...performances.filter(
        (performance) => performance.commitment_id === commitment.id
      ),
      ...performances.filter((performance) =>
        (commitment.linked_performances || []).includes(performance.id)
      ),
      ...performances.filter(
        (performance) =>
          performance.action_id && linkedActionIds.has(performance.action_id)
      )
    ]);
    const relatedBreakpoints = breakpoints.filter(
      (breakpoint) => breakpoint.commitment_id === commitment.id
    );
    const type = resolveChainType(
      commitment,
      linkedActions,
      linkedPerformances
    );
    const chainElements = [
      commitment,
      ...linkedActions,
      ...linkedPerformances
    ];

    chainElements.forEach((element) => usedElementIds.add(element.id));

    return {
      id: `chain-${commitment.id}`,
      index: index + 1,
      type,
      label: CHAIN_LABELS[type],
      commitment,
      actions: linkedActions,
      performances: linkedPerformances,
      breakpoints: relatedBreakpoints,
      elements: chainElements,
      elementIds: chainElements.map((element) => element.id),
      isOrphan: false
    };
  });

  const orphanedElements = elements.filter(
    (element) => !usedElementIds.has(element.id)
  );

  for (const element of orphanedElements) {
    const type = element.element_type === "performance" ? "C" : "review";
    chains.push({
      id: `orphan-${element.id}`,
      index: chains.length + 1,
      type,
      label: element.element_type === "performance" ? "孤立绩效" : "无归属证据",
      commitment: element.element_type === "commitment" ? element : null,
      actions: element.element_type === "action" ? [element] : [],
      performances: element.element_type === "performance" ? [element] : [],
      breakpoints: breakpoints.filter((breakpoint) =>
        (breakpoint.evidence_ids || []).includes(element.id)
      ),
      elements: [element],
      elementIds: [element.id],
      isOrphan: true
    });
  }

  return chains;
}

export function filterEvidenceChains(chains, filter = "all") {
  if (filter === "all") {
    return chains;
  }

  if (filter === "complete") {
    return chains.filter((chain) => chain.type === "complete");
  }

  if (filter === "review") {
    return chains.filter((chain) => chain.type !== "complete");
  }

  return chains.filter((chain) => chain.type === filter);
}

export function buildYearSeries(elements = []) {
  const byYear = new Map();

  for (const element of elements) {
    const year = Number(element.report_year);
    if (!Number.isInteger(year)) {
      continue;
    }

    if (!byYear.has(year)) {
      byYear.set(year, {
        year,
        commitment: 0,
        action: 0,
        performance: 0,
        total: 0
      });
    }

    const entry = byYear.get(year);
    if (EVIDENCE_TYPES.has(element.element_type)) {
      entry[element.element_type] += 1;
      entry.total += 1;
    }
  }

  return [...byYear.values()].sort((left, right) => left.year - right.year);
}

export function findChainForEvidence(chains, evidenceId) {
  return (
    chains.find((chain) => chain.elementIds.includes(evidenceId)) || null
  );
}

export function chainTypeLabel(type) {
  return CHAIN_LABELS[type] || CHAIN_LABELS.review;
}

function resolveChainType(commitment, actions, performances) {
  if (
    commitment.chain_status === "complete" ||
    (actions.length > 0 &&
      performances.length > 0 &&
      commitment.chain_status !== "breakpoint_b" &&
      commitment.chain_status !== "breakpoint_c")
  ) {
    return "complete";
  }
  if (commitment.chain_status === "breakpoint_a") {
    return "A";
  }
  if (commitment.chain_status === "breakpoint_b") {
    return "B";
  }
  if (commitment.chain_status === "breakpoint_c") {
    return "C";
  }
  if (actions.length === 0 && performances.length === 0) {
    return "A";
  }
  if (actions.length > 0 && performances.length === 0) {
    return "B";
  }
  if (actions.length === 0 && performances.length > 0) {
    return "C";
  }
  return "review";
}

function uniqueById(items) {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}
