// Shared by the Node server and browser-only static deployment.
const CLIMATE_TERMS = [
  "温室气体",
  "碳排放",
  "二氧化碳",
  "CO2",
  "CO₂",
  "碳强度",
  "碳中和",
  "碳达峰",
  "能耗",
  "能效",
  "绿电",
  "清洁能源",
  "可再生能源",
  "光伏",
  "风电",
  "节能",
  "减排",
  "余热",
  "CCUS"
];

const ACTION_TERMS = [
  "建设",
  "建成",
  "投运",
  "并网",
  "采购",
  "直购",
  "签约",
  "改造",
  "安装",
  "上线",
  "建立",
  "开展",
  "实施",
  "完成",
  "淘汰",
  "替换",
  "回收",
  "培训",
  "认证",
  "诊断",
  "优化",
  "运营"
];

const PERFORMANCE_TERMS = [
  "本期",
  "本年度",
  "报告期内",
  "截至",
  "同比",
  "较上年",
  "较202",
  "下降",
  "上升",
  "提升",
  "达到",
  "实现",
  "为",
  "累计"
];

const FUTURE_TERMS = [
  "计划",
  "拟",
  "预计",
  "将",
  "目标",
  "力争",
  "承诺",
  "到20",
  "在20"
];

const METRIC_RULES = [
  {
    tag: "green_power",
    pattern: /绿电|清洁能源|可再生能源|光伏|风电/,
    label: "绿电 / 清洁能源"
  },
  {
    tag: "energy",
    pattern: /能耗|能效|节电|节能|余热|用电|能源管理/,
    label: "能耗 / 节能"
  },
  {
    tag: "neutral",
    pattern: /碳中和|碳达峰|净零/,
    label: "碳中和 / 碳达峰"
  },
  {
    tag: "carbon",
    pattern: /碳排放|温室气体|二氧化碳|CO2|CO₂|碳强度|吨钢碳|减排/,
    label: "碳排放 / 温室气体"
  }
];

export function analyzeDocument(extraction, options = {}) {
  const sentences = collectSentences(extraction.pages || []);
  const reportYear = inferReportYear(
    extraction.file?.name,
    extraction.extracted_text || ""
  );
  const companyName = inferCompanyName(sentences, extraction.file?.name);
  const elements = [];
  const warnings = [];

  for (const sentence of sentences) {
    const result = classifySentence(sentence.text, reportYear);
    if (!result) {
      continue;
    }

    elements.push({
      ...result,
      report_year: result.report_year || reportYear,
      page: sentence.page,
      source_quote: sentence.text,
      review_status: result.confidence >= 0.82 ? "待核" : "存疑",
      notes: result.notes || ""
    });
  }

  const commitments = elements.filter(
    (element) => element.element_type === "commitment"
  );
  const actions = elements.filter((element) => element.element_type === "action");
  const performances = elements.filter(
    (element) => element.element_type === "performance"
  );

  commitments.forEach((commitment, index) => {
    commitment.id = `C-${String(index + 1).padStart(2, "0")}`;
    commitment.linked_actions = [];
    commitment.linked_performances = [];
    commitment.chain_status = "needs_review";
  });

  actions.forEach((action, index) => {
    action.id = `A-${String(index + 1).padStart(2, "0")}`;
    action.commitment_id = null;
    action.action_kind = inferActionKind(action.content);
    action.linked_performances = [];
  });

  performances.forEach((performance, index) => {
    performance.id = `P-${String(index + 1).padStart(2, "0")}`;
    performance.commitment_id = null;
    performance.action_id = null;
    performance.performance_scope = "待确认统计口径";
  });

  linkElements(
    commitments,
    actions,
    performances,
    Boolean(options.multi_document)
  );
  const breakpoints = buildBreakpoints(
    commitments,
    actions,
    performances,
    Boolean(options.multi_document)
  );

  if (commitments.length === 0) {
    warnings.push("未识别到同时满足“量化指标 + 截止年份 + 气候主题”的有效承诺。");
  }
  if (actions.length === 0) {
    warnings.push("未识别到明确的已实施减排行动。");
  }
  if (performances.length === 0) {
    warnings.push("未识别到已经发生且带数值、单位的气候绩效。");
  }
  if (sentences.length === 0) {
    warnings.push("PDF 未抽取到可用于分析的句子，可能为扫描件或图表页。");
  }

  return {
    schema_version: "1.0",
    analysis_mode: "rule_preview",
    company: {
      name: companyName,
      industry: "待人工补充"
    },
    report_context: {
      report_years: reportYear ? [reportYear] : [],
      document_count: 1
    },
    elements: [...commitments, ...actions, ...performances],
    breakpoints,
    analysis_meta: {
      model_name: "本地规则分析器",
      model_version: "0.1",
      prompt_version: "not_applicable",
      generated_at: new Date().toISOString(),
      human_review_required: true
    },
    warnings
  };
}

function collectSentences(pages) {
  const sentences = [];

  for (const page of pages) {
    const pageText = page.clean_text || page.text || "";
    const lines = pageText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const paragraphs = mergeWrappedLines(lines);
    for (const paragraph of paragraphs) {
      const parts = paragraph
        .split(/(?<=[。！？!?；;])/)
        .map((part) => part.trim())
        .filter((part) => part.length >= 6);

      for (const part of parts) {
        sentences.push({
          page: page.page_number,
          text: part
        });
      }
    }
  }

  const seen = new Set();
  return sentences.filter((sentence) => {
    const key = sentence.text.replace(/\s+/g, "");
    if (seen.has(key) || !CLIMATE_TERMS.some((term) => sentence.text.includes(term))) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function mergeWrappedLines(lines) {
  const paragraphs = [];
  for (const line of lines) {
    const isHeading =
      line.length <= 24 &&
      !/[。！？；]$/.test(line) &&
      !/[，、]/.test(line);
    const previous = paragraphs.at(-1);

    if (
      previous &&
      !isHeading &&
      previous.length <= 80 &&
      !/[。！？；]$/.test(previous)
    ) {
      paragraphs[paragraphs.length - 1] = `${previous}${line}`;
    } else if (!isHeading) {
      paragraphs.push(line);
    }
  }
  return paragraphs;
}

function classifySentence(text, fallbackYear) {
  const compact = text.replace(/\s+/g, "");
  const years = [...compact.matchAll(/20\d{2}/g)].map((match) =>
    Number(match[0])
  );
  const currentYear = new Date().getFullYear();
  const futureYears = years.filter((year) => year >= currentYear);
  const hasFutureSignal = FUTURE_TERMS.some((term) => compact.includes(term));
  const hasActionSignal = ACTION_TERMS.some((term) => compact.includes(term));
  const hasPerformanceSignal = PERFORMANCE_TERMS.some((term) =>
    compact.includes(term)
  );
  const hasNumber = /\d+(?:\.\d+)?\s*(?:%|％|万吨|吨|万度|万千瓦时|千瓦时|万立方米|立方米|亿元|元)/.test(
    compact
  );

  const isCommitment =
    futureYears.length > 0 &&
    (hasNumber || /碳中和|碳达峰|净零/.test(compact)) &&
    (hasFutureSignal || /年.*(?:实现|达到|降至|下降|提升至|占比)/.test(compact));

  if (isCommitment) {
    const dueYear = Math.max(...futureYears);
    return {
      element_type: "commitment",
      content: text,
      report_year: fallbackYear,
      confidence: hasNumber ? 0.9 : 0.82,
      normalized_target: {
        metric: inferMetricLabel(compact),
        target_value: inferTargetValue(compact),
        baseline_year: inferBaselineYear(compact, years),
        due_year: dueYear
      },
      notes: "由规则根据截止年份、量化指标和气候主题识别，需人工复核。"
    };
  }

  if (
    hasPerformanceSignal &&
    hasNumber &&
    !futureYears.some((year) => year > new Date().getFullYear()) &&
    !/(承诺|计划|目标|将|拟|预计).*(下降|提升|达到|实现)/.test(compact)
  ) {
    return {
      element_type: "performance",
      content: text,
      report_year: inferSentenceReportYear(compact, null, fallbackYear),
      confidence: 0.84,
      metric: inferMetricLabel(compact),
      value: inferResultValue(compact),
      unit: inferUnit(compact),
      notes: "由规则识别的当期或历史结果，需确认统计边界和对应行动。"
    };
  }

  if (
    hasActionSignal &&
    !/(计划|拟|将于|预计|即将|力争|目标)/.test(compact) &&
    !/^(到20|在20)/.test(compact)
  ) {
    return {
      element_type: "action",
      content: text,
      report_year: inferSentenceReportYear(compact, null, fallbackYear),
      confidence: 0.76,
      notes: "由规则识别的已实施措施，需人工确认是否真实落地及所属承诺。"
    };
  }

  return null;
}

function linkElements(commitments, actions, performances, multiDocument) {
  for (const action of actions) {
    const commitment = chooseCommitment(
      commitments,
      action,
      (candidate) =>
        !multiDocument ||
        (candidate.report_year || 0) <= (action.report_year || 9999)
    );
    if (commitment) {
      action.commitment_id = commitment.id;
      commitment.linked_actions.push(action.id);
    }
  }

  for (const performance of performances) {
    const candidateCommitments = commitments.filter(
      (commitment) =>
        !multiDocument ||
        (commitment.report_year || 0) <= (performance.report_year || 9999)
    );
    const commitment = chooseCommitment(candidateCommitments, performance);

    if (commitment) {
      performance.commitment_id = commitment.id;
      commitment.linked_performances.push(performance.id);
    }

    const candidateActions = actions.filter(
      (action) =>
        performance.commitment_id &&
        action.commitment_id === performance.commitment_id &&
        (!multiDocument ||
          (action.report_year || 0) <= (performance.report_year || 9999))
    );
    const action = chooseCommitment(candidateActions, performance);
    if (
      action &&
      isDirectActionPerformance(performance, action)
    ) {
      performance.action_id = action.id;
      action.linked_performances.push(performance.id);
      performance.performance_scope = "语义相关的单项行动结果（待核）";
    } else {
      performance.performance_scope = commitment
        ? "集团整体或未指明具体行动，不能替代行动级绩效"
        : "无归属绩效";
    }
  }

  for (const commitment of commitments) {
    const hasActions = commitment.linked_actions.length > 0;
    const directPerformances = commitment.linked_performances.filter((id) => {
      const performance = performances.find((item) => item.id === id);
      return Boolean(performance?.action_id);
    });

    if (hasActions && directPerformances.length > 0) {
      commitment.chain_status = "complete";
    } else if (hasActions) {
      commitment.chain_status = "breakpoint_b";
    } else if (commitment.linked_performances.length > 0) {
      commitment.chain_status = "breakpoint_c";
    } else {
      commitment.chain_status = "breakpoint_a";
    }
  }
}

function chooseCommitment(candidates, element, filter = () => true) {
  const elementTags = inferTags(element.content);
  const elementText = normalizeForSimilarity(element.content);
  let best = null;
  let bestScore = -Infinity;

  for (const candidate of candidates.filter(filter)) {
    const candidateTags = inferTags(
      candidate.content || JSON.stringify(candidate.normalized_target || {})
    );
    const tagScore = [...elementTags].reduce(
      (score, tag) => score + tagRelationScore(tag, candidateTags),
      0
    );
    const candidateText = normalizeForSimilarity(
      candidate.content || JSON.stringify(candidate.normalized_target || {})
    );
    const textScore = bigramSimilarity(elementText, candidateText);
    const score = tagScore + textScore;

    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return bestScore >= 1 ? best : null;
}

function buildBreakpoints(commitments, actions, performances, multiDocument) {
  const breakpoints = [];
  let index = 1;

  for (const commitment of commitments) {
    if (commitment.chain_status === "breakpoint_a") {
      breakpoints.push({
        id: `BP-${String(index).padStart(3, "0")}`,
        type: "A",
        commitment_id: commitment.id,
        title: "有承诺，当前文件中未检出跟进",
        reason: multiDocument
          ? "承诺发布后未识别到对应行动或绩效更新，建议结合后续年度报告确认。"
          : "当前仅分析一份报告。未检出对应行动或绩效，但 A 类断点需结合承诺发布后的后续年度报告确认。",
        missing_evidence: ["对应行动", "绩效更新"],
        evidence_ids: [commitment.id],
        review_status: "待核"
      });
      index += 1;
    }

    if (commitment.chain_status === "breakpoint_b") {
      breakpoints.push({
        id: `BP-${String(index).padStart(3, "0")}`,
        type: "B",
        commitment_id: commitment.id,
        title: "有行动，但缺少可对应的量化绩效",
        reason:
          "当前文件中已识别到相关行动，但未找到能够直接归属于该行动的减排量、节能量或绿电增量。",
        missing_evidence: ["行动级量化结果"],
        evidence_ids: [
          commitment.id,
          ...commitment.linked_actions,
          ...commitment.linked_performances
        ],
        review_status: "待核"
      });
      index += 1;
    }

    if (commitment.chain_status === "breakpoint_c") {
      breakpoints.push({
        id: `BP-${String(index).padStart(3, "0")}`,
        type: "C",
        commitment_id: commitment.id,
        title: "有绩效，但缺少对应行动支撑",
        reason:
          "当前文件中已识别到与承诺相关的绩效，但未找到能够支撑该结果的已实施行动。",
        missing_evidence: ["对应行动"],
        evidence_ids: [
          commitment.id,
          ...commitment.linked_performances
        ],
        review_status: "待核"
      });
      index += 1;
    }
  }

  for (const performance of performances.filter(
    (item) => !item.commitment_id && !item.action_id
  )) {
    breakpoints.push({
      id: `BP-${String(index).padStart(3, "0")}`,
      type: "C",
      commitment_id: null,
      title: "有绩效，但全文未见支撑行动",
      reason:
        "识别到量化气候绩效，但未能关联到有效承诺或已实施行动，建议核查报告其他章节。",
      missing_evidence: ["对应行动"],
      evidence_ids: [performance.id],
      review_status: "待核"
    });
    index += 1;
  }

  return breakpoints;
}

function inferReportYear(fileName, fullText) {
  const fileNameMatch = String(fileName || "").match(/(20\d{2})/);
  if (fileNameMatch) {
    return Number(fileNameMatch[1]);
  }

  const reportYearMatch = String(fullText).match(
    /(20\d{2})\s*(?:年)?\s*(?:可持续发展|ESG|社会责任|环境、社会|年度报告)/i
  );
  if (reportYearMatch) {
    return Number(reportYearMatch[1]);
  }

  return new Date().getFullYear() - 1;
}

function inferCompanyName(sentences, fileName) {
  for (const sentence of sentences.slice(0, 8)) {
    const match = sentence.text.match(
      /([\u4e00-\u9fa5A-Za-z0-9（）()·]{2,30}(?:股份有限公司|有限公司|集团|股份))/
    );
    if (match) {
      return match[1];
    }
  }

  const baseName = String(fileName || "上传报告").replace(/\.pdf$/i, "");
  return baseName.replace(/20\d{2}.*$/, "").trim() || "上传报告";
}

function inferSentenceReportYear(text, dueYear, fallbackYear) {
  const years = [...text.matchAll(/20\d{2}/g)]
    .map((match) => Number(match[0]))
    .filter(
      (year) =>
        year !== dueYear &&
        year <=
          (Number.isInteger(fallbackYear)
            ? fallbackYear
            : new Date().getFullYear())
    );
  return years.length > 0 ? Math.max(...years) : fallbackYear;
}

function inferMetricLabel(text) {
  for (const rule of METRIC_RULES) {
    if (rule.pattern.test(text)) {
      return rule.label;
    }
  }
  return "气候相关指标";
}

function inferTargetValue(text) {
  const match = text.match(
    /(下降|提升至|降至|达到|占比(?:提升)?至)\s*(\d+(?:\.\d+)?)\s*(%|％|万吨|吨|万度|万千瓦时|千瓦时)?/
  );
  if (match) {
    return `${match[2]}${match[3] || ""}`;
  }
  if (/碳中和/.test(text)) {
    return "碳中和";
  }
  if (/碳达峰/.test(text)) {
    return "碳达峰";
  }
  return "原文目标";
}

function inferBaselineYear(text, years) {
  const baselineMatch = text.match(/较\s*(20\d{2})\s*(?:年|基准年)/);
  if (baselineMatch) {
    return Number(baselineMatch[1]);
  }
  return years.length > 1 ? Math.min(...years) : null;
}

function inferResultValue(text) {
  const match = text.match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : "";
}

function inferUnit(text) {
  const match = text.match(/(%|％|万吨|吨|万度|万千瓦时|千瓦时|万立方米|立方米)/);
  return match ? match[1] : "";
}

function inferActionKind(text) {
  if (/采购|直购|签约/.test(text)) return "采购安排";
  if (/改造|设备|技术/.test(text)) return "技术改造";
  if (/平台|台账|管理|培训|诊断/.test(text)) return "管理措施";
  if (/建设|建成|并网|投运/.test(text)) return "项目";
  return "其他";
}

function isDirectActionPerformance(performance, action) {
  const performanceText = String(performance.content || "");
  const actionText = String(action.content || "");
  const hasExplicitActionReference =
    /(该|本|此)(?:项目|改造|措施|平台)|由此|带来|产出|贡献|改造后|上线后|投运后/.test(
      performanceText
    );

  if (hasExplicitActionReference) {
    return true;
  }

  const performanceTags = inferTags(performanceText);
  const actionTags = inferTags(actionText);
  const isGreenPowerPair =
    performanceTags.has("green_power") &&
    actionTags.has("green_power") &&
    /绿电|光伏|清洁能源|可再生能源/.test(performanceText);

  return isGreenPowerPair;
}

function inferTags(text) {
  return new Set(
    METRIC_RULES.filter((rule) => rule.pattern.test(text)).map(
      (rule) => rule.tag
    )
  );
}

function tagRelationScore(tag, candidateTags) {
  const relatedScores = {
    carbon: {
      carbon: 5,
      neutral: 3,
      energy: 2,
      green_power: 1
    },
    energy: {
      energy: 5,
      carbon: 2.5,
      neutral: 1.5,
      green_power: 1
    },
    neutral: {
      neutral: 5,
      carbon: 2,
      energy: 1.5,
      green_power: 1
    },
    green_power: {
      green_power: 5,
      energy: 1.5,
      carbon: 1
    }
  };

  return Math.max(
    0,
    ...[...candidateTags].map(
      (candidateTag) => relatedScores[tag]?.[candidateTag] || 0
    )
  );
}

function normalizeForSimilarity(text) {
  return String(text)
    .replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, "")
    .toLowerCase();
}

function bigramSimilarity(first, second) {
  if (first.length < 2 || second.length < 2) {
    return 0;
  }

  const firstBigrams = new Set();
  for (let index = 0; index < first.length - 1; index += 1) {
    firstBigrams.add(first.slice(index, index + 2));
  }

  let overlap = 0;
  for (let index = 0; index < second.length - 1; index += 1) {
    if (firstBigrams.has(second.slice(index, index + 2))) {
      overlap += 1;
    }
  }
  return overlap / Math.max(1, firstBigrams.size);
}
