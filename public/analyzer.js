// Shared by the Node server and browser-only static deployment.
const CLIMATE_TERMS = [
  "温室气体",
  "碳排放",
  "二氧化碳",
  "CO2",
  "CO₂",
  "碳强度",
  "排放强度",
  "碳中和",
  "碳达峰",
  "碳管理",
  "碳台账",
  "碳盘查",
  "碳核查",
  "碳足迹",
  "碳交易",
  "能耗",
  "耗能",
  "能效",
  "能源消耗",
  "能源消费",
  "绿电",
  "绿证",
  "清洁能源",
  "可再生能源",
  "光伏",
  "风电",
  "节能",
  "减排",
  "余热",
  "余压",
  "节能改造",
  "资源综合利用",
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
  "技改",
  "安装",
  "加装",
  "上线",
  "部署",
  "建立",
  "开展",
  "实施",
  "完成",
  "淘汰",
  "替换",
  "回收",
  "利用",
  "培训",
  "认证",
  "核查",
  "盘查",
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
  "较去年",
  "较202",
  "相较于",
  "下降",
  "降低",
  "上升",
  "提升",
  "提高",
  "达到",
  "实现",
  "录得",
  "共计",
  "为",
  "累计"
];

const MITIGATION_OBJECT_TERMS = [
  "碳减排",
  "减排",
  "节能",
  "能效",
  "碳排放",
  "温室气体",
  "二氧化碳",
  "绿电",
  "绿证",
  "清洁能源",
  "可再生能源",
  "光伏",
  "风电",
  "余热",
  "余压",
  "碳台账",
  "碳盘查",
  "碳核查",
  "碳管理",
  "CCUS",
  "超低能耗",
  "绿色建筑",
  "绿色施工",
  "能源管理",
  "低碳供应链",
  "低碳技术",
  "节能设备",
  "耗能",
  "能耗"
];

const SPECIFIC_MITIGATION_TERMS = [
  "余热",
  "余压",
  "光伏",
  "风电",
  "绿电",
  "绿证",
  "清洁能源",
  "可再生能源",
  "碳台账",
  "碳盘查",
  "碳核查",
  "碳管理",
  "CCUS",
  "节能改造",
  "节能设备",
  "能耗诊断",
  "能源管理平台",
  "超低能耗",
  "绿色建筑",
  "绿色施工",
  "低碳材料",
  "低碳技术",
  "低碳供应链",
  "装配式",
  "能效",
  "耗能",
  "能耗"
];

const CONCRETE_ACTION_TERMS = [
  "完成",
  "实施",
  "建设",
  "建成",
  "投运",
  "并网",
  "改造",
  "技改",
  "安装",
  "加装",
  "上线",
  "部署",
  "采购",
  "直购",
  "签约",
  "建立",
  "制定",
  "开展",
  "组织",
  "推行",
  "采用",
  "应用",
  "淘汰",
  "替换",
  "回收",
  "利用",
  "优化",
  "运营",
  "认证",
  "核查",
  "盘查",
  "诊断",
  "培训"
];

const NAVIGATION_TERMS = [
  "报告编制说明",
  "高管致辞",
  "公司基本信息",
  "议题重要性评估",
  "公司可持续发展治理安排",
  "高质量发展专题",
  "环境篇",
  "社会篇",
  "治理篇",
  "附录"
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
    pattern: /能耗|耗能|能效|节电|节能|余热|余压|用电|能源管理|能源消耗|能源消费|节能量/,
    label: "能耗 / 节能"
  },
  {
    tag: "neutral",
    pattern: /碳中和|碳达峰|净零/,
    label: "碳中和 / 碳达峰"
  },
  {
    tag: "carbon",
    pattern: /碳排放|温室气体|二氧化碳|CO2|CO₂|碳强度|吨钢碳|减排|排放强度|碳足迹/,
    label: "碳排放 / 温室气体"
  }
];

export function analyzeDocument(extraction, options = {}) {
  return analyzeExtractions([extraction], {
    ...options,
    multi_document: Boolean(options.multi_document)
  });
}

export function analyzeDocuments(extractions, options = {}) {
  return analyzeExtractions(extractions, {
    ...options,
    multi_document: extractions.length > 1
  });
}

function analyzeExtractions(extractions, options = {}) {
  const documents = extractions.map((extraction, index) => {
    const reportYear = inferReportYear(
      extraction.file?.name,
      extraction.extracted_text || ""
    );
    const documentName =
      extraction.file?.name || `上传报告 ${String(index + 1).padStart(2, "0")}`;
    const sentences = collectSentences(extraction.pages || []).map(
      (sentence) => ({
        ...sentence,
        document_index: index,
        document_name: documentName,
        report_year: reportYear
      })
    );

    return {
      index,
      name: documentName,
      report_year: reportYear,
      extraction,
      sentences
    };
  });
  const sentences = documents.flatMap((document) => document.sentences);
  const companyName = inferCompanyName(
    sentences,
    documents.map((document) => document.name).join(" ")
  );
  const elements = [];
  const warnings = [];

  for (const sentence of sentences) {
    const result = classifySentence(sentence.text, sentence.report_year);
    if (!result) {
      continue;
    }

    elements.push({
      ...result,
      report_year: sentence.report_year,
      page: sentence.page,
      source_quote: sentence.text,
      source_document: {
        index: sentence.document_index,
        name: sentence.document_name,
        report_year: sentence.report_year
      },
      review_status: result.confidence >= 0.82 ? "待核" : "存疑",
      notes: result.notes || ""
    });
  }

  const dedupedElements = dedupeElements(elements, Boolean(options.multi_document));
  const commitments = dedupedElements.filter(
    (element) => element.element_type === "commitment"
  );
  const actions = dedupedElements.filter(
    (element) => element.element_type === "action"
  );
  const performances = dedupedElements.filter(
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
  if (documents.length > 1) {
    warnings.push(
      `已合并分析 ${documents.length} 份报告。跨年度关联按报告年份和语义相似度生成候选，仍需人工核对同一承诺口径。`
    );
  }

  const reportYears = [
    ...new Set(
      documents
        .map((document) => document.report_year)
        .filter((year) => Number.isInteger(year))
    )
  ].sort((first, second) => first - second);

  return {
    schema_version: "1.0",
    analysis_mode: "rule_preview",
    company: {
      name: companyName,
      industry: "待人工补充"
    },
    report_context: {
      report_years: reportYears,
      document_count: documents.length
    },
    elements: [...commitments, ...actions, ...performances],
    breakpoints,
    analysis_meta: {
      model_name: "本地规则分析器",
      model_version: "0.4",
      prompt_version: "not_applicable",
      generated_at: new Date().toISOString(),
      human_review_required: true
    },
    warnings
  };
}

function dedupeElements(elements, multiDocument) {
  if (!multiDocument) {
    return elements;
  }

  const byKey = new Map();
  const deduped = [];

  for (const element of elements) {
    const key = `${element.element_type}:${normalizeForSimilarity(
      element.content
    )}`;
    const existing = byKey.get(key);

    if (!existing) {
      const copy = {
        ...element,
        source_occurrences: [
          {
            document_name: element.source_document?.name || "上传报告",
            report_year: element.report_year,
            page: element.page
          }
        ]
      };
      byKey.set(key, copy);
      deduped.push(copy);
      continue;
    }

    if (
      !existing.source_occurrences.some(
        (occurrence) =>
          occurrence.document_name === element.source_document?.name &&
          occurrence.page === element.page
      )
    ) {
      existing.source_occurrences.push({
        document_name: element.source_document?.name || "上传报告",
        report_year: element.report_year,
        page: element.page
      });
    }

    if ((element.report_year || 9999) < (existing.report_year || 9999)) {
      existing.report_year = element.report_year;
      existing.page = element.page;
      existing.source_quote = element.source_quote;
      existing.source_document = element.source_document;
    }
    existing.latest_report_year = Math.max(
      existing.latest_report_year || existing.report_year || 0,
      element.report_year || 0
    );
  }

  return deduped;
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
        .split(/(?<=[。！？!?])/)
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
      previous.length <= 120 &&
      !/[。！？]$/.test(previous)
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
  if (
    /(?:在不|在|于|和|与|及|的|为|对|将|把|从|向|通过|并|且|或|包括|其中)$/.test(
      compact
    )
  ) {
    return null;
  }
  const years = [...compact.matchAll(/20\d{2}/g)].map((match) =>
    Number(match[0])
  );
  const referenceYear = Number.isInteger(fallbackYear)
    ? fallbackYear
    : new Date().getFullYear();
  const futureYears = years.filter((year) => year > referenceYear);
  const hasFutureSignal = FUTURE_TERMS.some((term) => compact.includes(term));
  const hasPerformanceSignal = PERFORMANCE_TERMS.some((term) =>
    compact.includes(term)
  );
  const hasStrongPerformanceSignal =
    /(本期|本年度|报告期内|截至|同比|较上年|较去年|相较于|下降|降低|上升|提升|提高|达到|实现|录得|累计)/.test(
      compact
    );
  const measurement = inferMeasurement(compact);
  const hasNumber = Boolean(measurement);
  const actionAssessment = assessMitigationAction(compact, measurement);
  const hasActionPotential =
    actionAssessment.accepted &&
    !/(计划|拟|将于|将在|预计|即将|力争|目标(?:是|为)?)/.test(compact) &&
    !/^(到20|在20)/.test(compact);
  const hasPerformancePotential =
    hasPerformanceSignal &&
    hasStrongPerformanceSignal &&
    hasNumber &&
    futureYears.length === 0 &&
    !isNavigationNoise(compact) &&
    !isLikelyTableNoise(compact) &&
    !/(承诺|计划|目标|将|拟|预计).*(下降|降低|提升|提高|达到|实现)/.test(
      compact
    );

  const isCommitment =
    futureYears.length > 0 &&
    !isNavigationNoise(compact) &&
    !isLikelyTableNoise(compact) &&
    !isExternalPolicyStatement(compact) &&
    (hasNumber || /碳中和|碳达峰|净零/.test(compact)) &&
    (hasFutureSignal || /年.*(?:实现|达到|降至|下降|提升至|占比)/.test(compact));

  if (isCommitment) {
    const dueYear = Math.max(...futureYears);
    const mixedSignals = hasActionPotential || hasPerformancePotential;
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
      notes: mixedSignals
        ? "句内同时存在目标以及行动或结果信号；按“一句话一个标签”优先标记为承诺，需人工拆分核对。"
        : "由规则根据截止年份、量化指标和气候主题识别，需人工复核。"
    };
  }

  if (hasPerformancePotential) {
    const mixedSignals = hasActionPotential;
    return {
      element_type: "performance",
      content: text,
      report_year: inferSentenceReportYear(compact, null, fallbackYear),
      confidence: 0.84,
      metric: inferMetricLabel(compact),
      value: measurement.value,
      unit: measurement.unit,
      notes: mixedSignals
        ? "句内同时存在行动与量化结果；按“一句话一个标签”标记为绩效，需人工核对是否应拆分原文。"
        : "由规则识别的当期或历史结果，需确认统计边界和对应行动。"
    };
  }

  if (hasActionPotential) {
    return {
      element_type: "action",
      content: text,
      report_year: inferSentenceReportYear(compact, null, fallbackYear),
      confidence: actionAssessment.confidence,
      notes:
        actionAssessment.specific
          ? "由规则识别的具体减排措施，需人工确认是否真实落地及所属承诺。"
          : "由规则识别的已实施措施，证据强度一般，需人工确认是否属于减排行动。"
    };
  }

  return null;
}

function assessMitigationAction(text, measurement) {
  if (
    /^(?:方米|平方米|吨|万吨|万千瓦时|千瓦时|[%％])/.test(text) ||
    (/(可能|有望|如果|若|趋势|风险|机遇)/.test(text) &&
      !/(完成|实施|建成|投运|已|报告期内|本年度)/.test(text))
  ) {
    return {
      accepted: false,
      confidence: 0,
      specific: false
    };
  }

  const hasSpecificObject = SPECIFIC_MITIGATION_TERMS.some((term) =>
    text.includes(term)
  );
  const hasConcretePair = hasConcreteMitigationAction(text);
  const hasImplementationMarker =
    /(已|报告期内|本年度|全年|累计|完成|实施|建成|投运|并网|改造|技改|安装|加装|上线|部署|采购|直购|签约|建立|制定|开展|组织|推行|采用|应用|淘汰|替换|取得|认证|核查|盘查|诊断|培训)/.test(
      text
    );
  const hasExecutionPhrase =
    /(通过|采用|建立|上线|完成|实施|开展|组织|推行|应用|取得)/.test(text);

  let confidence = 0.58;
  if (hasSpecificObject) {
    confidence += 0.12;
  }
  if (hasImplementationMarker) {
    confidence += 0.08;
  }
  if (measurement) {
    confidence += 0.05;
  }
  if (hasExecutionPhrase) {
    confidence += 0.04;
  }
  if (!hasSpecificObject) {
    confidence -= 0.04;
  }
  if (text.length > 200) {
    confidence -= 0.05;
  }

  confidence = Math.max(0, Math.min(0.92, confidence));
  return {
    accepted: hasConcretePair && confidence >= 0.77,
    confidence: Math.round(confidence * 100) / 100,
    specific: hasSpecificObject
  };
}

function hasConcreteMitigationAction(text) {
  if (
    isNavigationNoise(text) ||
    isLikelyTableNoise(text) ||
    !MITIGATION_OBJECT_TERMS.some((term) => text.includes(term))
  ) {
    return false;
  }

  const actionGroup = CONCRETE_ACTION_TERMS.join("|");
  const objectGroup = MITIGATION_OBJECT_TERMS.join("|");
  const forward = new RegExp(
    `(?:${actionGroup})[^。！？]{0,45}(?:${objectGroup})`
  );
  const reverse = new RegExp(
    `(?:${objectGroup})[^。！？]{0,45}(?:${actionGroup})`
  );

  return forward.test(text) || reverse.test(text);
}

function isNavigationNoise(text) {
  const navigationHits = NAVIGATION_TERMS.filter((term) =>
    text.includes(term)
  ).length;
  return (
    navigationHits >= 3 ||
    /报告编制说明.{0,8}高管致辞|环境篇.{0,8}社会篇.{0,8}治理篇/.test(text)
  );
}

function isLikelyTableNoise(text) {
  const colonCount = (text.match(/[：:]/g) || []).length;
  const tableLabelHits = (
    text.match(
      /技术类型|技术特点|管理优化|质量提升|成本降低|安全优势|指标名称|单位/g
    ) || []
  ).length;
  return (
    (colonCount >= 3 && tableLabelHits >= 2) ||
    (text.length > 220 && colonCount >= 4) ||
    (/指标名称/.test(text) && /(2023|2024|2025)/.test(text))
  );
}

function isExternalPolicyStatement(text) {
  const citesPolicyTarget =
    /(根据|按照).{0,35}(规划|政策|标准|要求).{0,55}(总体目标|目标|到20)/.test(
      text
    ) ||
    /《[^》]{2,60}(?:规划|方案|意见|办法)》.{0,55}(总体目标|目标|到20)/.test(
      text
    );
  const citesAuthority =
    /(住房和城乡建设部|国务院|国家发展改革委|生态环境部|国家能源局|工业和信息化部)/.test(
      text
    );
  return citesPolicyTarget && citesAuthority;
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

    const candidateActions = actions.filter((action) => {
      const sameCommitmentScope = performance.commitment_id
        ? action.commitment_id === performance.commitment_id
        : !action.commitment_id;
      return (
        sameCommitmentScope &&
        (!multiDocument ||
          (action.report_year || 0) <= (performance.report_year || 9999))
      );
    });
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

  const orphanPerformances = performances.filter(
    (item) => !item.commitment_id && !item.action_id
  );
  if (orphanPerformances.length > 3) {
    breakpoints.push({
      id: `BP-${String(index).padStart(3, "0")}`,
      type: "C",
      commitment_id: null,
      title: `${orphanPerformances.length} 项绩效未进入可追溯行动链`,
      reason:
        "识别到多项量化气候绩效，但当前报告未形成能够关联承诺与行动的有效证据链。建议按页码抽查统计口径和支撑项目。",
      missing_evidence: ["对应承诺", "对应行动"],
      evidence_ids: orphanPerformances.map((performance) => performance.id),
      review_status: "待核"
    });
    index += 1;
  } else {
    for (const performance of orphanPerformances) {
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
  }

  const orphanActions = actions.filter(
    (item) => !item.commitment_id && item.linked_performances.length === 0
  );
  if (orphanActions.length > 5) {
    breakpoints.push({
      id: `BP-${String(index).padStart(3, "0")}`,
      type: "B",
      commitment_id: null,
      title: `${orphanActions.length} 条行动未关联承诺或行动级绩效`,
      reason:
        "识别到多项已实施减排措施，但当前文本未能建立“承诺—行动—量化结果”的完整对应关系。建议按证据页码逐条复核，而不是将数量直接视为企业问题数量。",
      missing_evidence: ["对应承诺", "行动级量化结果"],
      evidence_ids: orphanActions.map((action) => action.id),
      review_status: "待核"
    });
    index += 1;
  } else {
    for (const action of orphanActions) {
      breakpoints.push({
        id: `BP-${String(index).padStart(3, "0")}`,
        type: "B",
        commitment_id: null,
        title: "有行动，但未披露行动级量化绩效",
        reason:
          "识别到已实施的减排行动，但未找到与该行动直接对应的减排量、节能量或绿电增量。",
        missing_evidence: ["行动级量化结果"],
        evidence_ids: [action.id],
        review_status: "待核"
      });
      index += 1;
    }
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
    /(下降|降低至|降低|减少至|提升至|提高至|增至|降至|达到|占比(?:提升)?至)\s*(\d+(?:\.\d+)?)\s*(%|％|个百分点|万吨|吨标煤|吨标准煤|吨|万度|万千瓦时|千瓦时)?/
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

function inferMeasurement(text) {
  const pattern =
    /(\d+(?:\.\d+)?)\s*(%|％|个百分点|万吨|吨标煤|吨标准煤|吨|万度|万千瓦时|千瓦时|kWh|MWh|GJ|万立方米|立方米|亿元|元)/i;
  const matches = [...text.matchAll(new RegExp(pattern.source, "gi"))];
  if (matches.length === 0) {
    return null;
  }
  const match = matches.at(-1);
  return {
    value: Number(match[1]),
    unit: match[2]
  };
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

  if (isGreenPowerPair) {
    return true;
  }

  const specificTerms = [
    "余热",
    "余压",
    "烧结",
    "锅炉",
    "电机",
    "空压机",
    "中央空调",
    "照明",
    "分布式光伏",
    "风电",
    "能源管理平台",
    "碳台账",
    "CCUS"
  ];
  return specificTerms.some(
    (term) => performanceText.includes(term) && actionText.includes(term)
  );
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
