import { analyzeDocument } from "./analyzer.js";
import {
  buildEvidenceChains,
  buildYearSeries,
  filterEvidenceChains,
  findChainForEvidence
} from "./chain-model.js";
import { extractPdfInBrowser } from "./pdf-client.js";

const MAX_PDF_MB = 200;

const sampleAnalysis = {
  schema_version: "1.0",
  company: {
    name: "某钢铁股份",
    report_year: 2024,
    industry: "钢铁"
  },
  elements: [
    {
      id: "C-01",
      element_type: "commitment",
      content: "2030年绿电采购占比提升至40%",
      report_year: 2022,
      page: 17,
      confidence: 0.96,
      review_status: "已核",
      metric: "绿电采购占比",
      target_value: "40%",
      baseline_year: "2022",
      due_year: 2030,
      linked_actions: ["A-01"],
      linked_performances: ["P-01"],
      chain_status: "complete"
    },
    {
      id: "C-02",
      element_type: "commitment",
      content: "2028年吨钢碳排放较2020年下降18%",
      report_year: 2022,
      page: 18,
      confidence: 0.94,
      review_status: "已核",
      metric: "吨钢碳排放强度",
      target_value: "-18%",
      baseline_year: "2020",
      due_year: 2028,
      linked_actions: ["A-02", "A-03"],
      linked_performances: ["P-02"],
      chain_status: "breakpoint_b"
    },
    {
      id: "C-03",
      element_type: "commitment",
      content: "2027年实现运营边界Scope1+Scope2碳中和",
      report_year: 2022,
      page: 20,
      confidence: 0.98,
      review_status: "已核",
      metric: "运营边界碳中和",
      target_value: "碳中和",
      baseline_year: "未单列",
      due_year: 2027,
      linked_actions: [],
      linked_performances: [],
      chain_status: "breakpoint_a"
    },
    {
      id: "A-01",
      element_type: "action",
      content: "厂区分布式光伏一期项目并网发电，并完成首笔绿电直购签约。",
      report_year: 2023,
      page: 23,
      confidence: 0.92,
      review_status: "已核",
      commitment_id: "C-01",
      linked_performances: ["P-01"],
      action_result_status: "direct"
    },
    {
      id: "A-02",
      element_type: "action",
      content: "完成烧结工序余热回收节能改造。",
      report_year: 2023,
      page: 22,
      confidence: 0.91,
      review_status: "已核",
      commitment_id: "C-02",
      linked_performances: [],
      action_result_status: "missing_direct_result"
    },
    {
      id: "A-03",
      element_type: "action",
      content: "上线能源管理平台，覆盖主要生产工序并开展重点设备能耗诊断。",
      report_year: 2024,
      page: 24,
      confidence: 0.88,
      review_status: "待核",
      commitment_id: "C-02",
      linked_performances: [],
      action_result_status: "missing_direct_result"
    },
    {
      id: "P-01",
      element_type: "performance",
      content: "本期绿电采购占比21%，较上年提升5个百分点。",
      report_year: 2024,
      page: 25,
      confidence: 0.97,
      review_status: "已核",
      metric: "绿电采购占比",
      value: "21",
      unit: "%",
      change: "较上年 +5 pp",
      commitment_id: "C-01",
      action_id: "A-01",
      performance_scope: "单项行动对应结果"
    },
    {
      id: "P-02",
      element_type: "performance",
      content: "本年度吨钢碳排放同比下降4.2%。",
      report_year: 2024,
      page: 25,
      confidence: 0.93,
      review_status: "已核",
      metric: "吨钢碳排放强度",
      value: "-4.2",
      unit: "%",
      change: "同比下降",
      commitment_id: "C-02",
      action_id: null,
      performance_scope: "集团整体口径"
    },
    {
      id: "P-03",
      element_type: "performance",
      content: "本年度碳排放同比下降10%。",
      report_year: 2024,
      page: 28,
      confidence: 0.9,
      review_status: "已核",
      metric: "碳排放总量",
      value: "-10",
      unit: "%",
      change: "同比下降",
      commitment_id: null,
      action_id: null,
      performance_scope: "未找到对应行动"
    }
  ],
  breakpoints: [
    {
      id: "BP-001",
      type: "A",
      title: "有承诺，连续年度报告未见跟进",
      description:
        "C-03 于 2022 年提出 2027 年运营边界碳中和，但 2023、2024 年报告均未检出对应减排行动或绩效更新。",
      commitment_id: "C-03",
      missing: ["对应行动", "绩效更新"],
      evidence_ids: ["C-03"],
      review_status: "待核"
    },
    {
      id: "BP-002",
      type: "B",
      title: "有行动，但缺少单项量化绩效",
      description:
        "A-02、A-03 已落地，但报告只披露集团整体吨钢碳排放结果，未单列两项行动各自的节能量、减排量或产出。",
      commitment_id: "C-02",
      missing: ["行动级量化结果"],
      evidence_ids: ["C-02", "A-02", "A-03", "P-02"],
      review_status: "待核"
    },
    {
      id: "BP-003",
      type: "C",
      title: "有绩效，但全文未见支撑行动",
      description:
        "P-03 披露本年度碳排放同比下降 10%，当前样本中未检出能够直接支撑该项结果的节能改造或绿电采购行动。",
      commitment_id: null,
      missing: ["对应行动"],
      evidence_ids: ["P-03"],
      review_status: "待核"
    }
  ]
};

const state = {
  analysis: sampleAnalysis,
  extraction: null,
  currentText: "",
  textView: "clean",
  query: "",
  schemaText: "",
  isUploading: false,
  navigationFrame: null,
  toastTimer: null,
  evidenceChains: [],
  chainFilter: "all",
  chainYearFilter: "all",
  selectedEvidenceId: null,
  showAllActions: false,
  showAllPerformances: false
};

const elements = {
  pdfInput: document.querySelector("#pdf-input"),
  selectFileButton: document.querySelector("#select-file-button"),
  loadDemoButton: document.querySelector("#load-demo-button"),
  dropzone: document.querySelector("#dropzone"),
  fileProgress: document.querySelector("#file-progress"),
  analysisStatusLabel: document.querySelector("#analysis-status-label"),
  toggleTextButton: document.querySelector("#toggle-text-button"),
  currentFileName: document.querySelector("#current-file-name"),
  currentFileSize: document.querySelector("#current-file-size"),
  clearFileButton: document.querySelector("#clear-file-button"),
  progressMessage: document.querySelector("#progress-message"),
  dataModeBadge: document.querySelector("#data-mode-badge"),
  commitmentCount: document.querySelector("#commitment-count"),
  actionCount: document.querySelector("#action-count"),
  performanceCount: document.querySelector("#performance-count"),
  breakpointCount: document.querySelector("#breakpoint-count"),
  textPanel: document.querySelector("#text-panel"),
  collapseTextButton: document.querySelector("#collapse-text-button"),
  logicSection: document.querySelector("#logic-section"),
  logicSummary: document.querySelector("#logic-summary"),
  logicResultGrid: document.querySelector("#logic-result-grid"),
  extractionStats: document.querySelector("#extraction-stats"),
  textPreview: document.querySelector("#text-preview"),
  cleanTextTab: document.querySelector("#clean-text-tab"),
  pageTextTab: document.querySelector("#page-text-tab"),
  textSearchInput: document.querySelector("#text-search-input"),
  copyTextButton: document.querySelector("#copy-text-button"),
  downloadTextButton: document.querySelector("#download-text-button"),
  debugDetailsContent: document.querySelector("#debug-details-content"),
  commitmentList: document.querySelector("#commitment-list"),
  actionList: document.querySelector("#action-list"),
  performanceList: document.querySelector("#performance-list"),
  breakpointList: document.querySelector("#breakpoint-list"),
  commitmentSectionCount: document.querySelector("#commitment-section-count"),
  actionSectionCount: document.querySelector("#action-section-count"),
  performanceSectionCount: document.querySelector("#performance-section-count"),
  openSchemaButton: document.querySelector("#open-schema-button"),
  closeSchemaButton: document.querySelector("#close-schema-button"),
  copySchemaButton: document.querySelector("#copy-schema-button"),
  schemaDialog: document.querySelector("#schema-dialog"),
  schemaCode: document.querySelector("#schema-code"),
  toast: document.querySelector("#toast"),
  summaryFootnoteText: document.querySelector("#summary-footnote-text"),
  navItems: [...document.querySelectorAll(".nav-item")],
  chainFilterGroup: document.querySelector("#chain-filter-group"),
  chainHealthRing: document.querySelector("#chain-health-ring"),
  chainHealthCaption: document.querySelector("#chain-health-caption"),
  chainHealthRate: document.querySelector("#chain-health-rate"),
  chainHealthSummary: document.querySelector("#chain-health-summary"),
  chainYearChart: document.querySelector("#chain-year-chart"),
  chainMap: document.querySelector("#chain-map"),
  chainInspector: document.querySelector("#chain-inspector")
};

initialize();

function initialize() {
  bindUploadEvents();
  bindTextEvents();
  bindDialogEvents();
  bindNavigationEvents();
  bindChainEvents();
  bindListEvents();
  renderAnalysis(state.analysis);
}

function bindUploadEvents() {
  elements.selectFileButton.addEventListener("click", (event) => {
    event.stopPropagation();
    elements.pdfInput.click();
  });

  elements.dropzone.addEventListener("click", () => elements.pdfInput.click());
  elements.dropzone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      elements.pdfInput.click();
    }
  });

  elements.pdfInput.addEventListener("change", () => {
    const [file] = elements.pdfInput.files;
    if (file) {
      handlePdfFile(file);
    }
  });

  for (const eventName of ["dragenter", "dragover"]) {
    elements.dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      elements.dropzone.classList.add("is-dragging");
    });
  }

  for (const eventName of ["dragleave", "drop"]) {
    elements.dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      elements.dropzone.classList.remove("is-dragging");
    });
  }

  elements.dropzone.addEventListener("drop", (event) => {
    const [file] = event.dataTransfer.files;
    if (file) {
      handlePdfFile(file);
    }
  });

  elements.clearFileButton.addEventListener("click", resetToDemo);

  elements.loadDemoButton.addEventListener("click", (event) => {
    event.stopPropagation();
    if (state.isUploading) {
      showToast("请等待当前 PDF 抽取完成");
      return;
    }
    elements.fileProgress.hidden = true;
    elements.fileProgress.classList.remove("is-complete");
    elements.textPanel.hidden = true;
    elements.toggleTextButton.disabled = true;
    elements.toggleTextButton.textContent = "查看文本抽取过程";
    state.analysis = sampleAnalysis;
    elements.dataModeBadge.textContent = "演示数据";
    renderAnalysis(sampleAnalysis);
    document.querySelector("#logic-section").scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  });
}

function bindTextEvents() {
  elements.toggleTextButton.addEventListener("click", () => {
    setTextPanelVisibility(elements.textPanel.hidden);
  });

  elements.collapseTextButton.addEventListener("click", () => {
    setTextPanelVisibility(false);
  });

  elements.cleanTextTab.addEventListener("click", () => {
    state.textView = "clean";
    updateTextView();
  });

  elements.pageTextTab.addEventListener("click", () => {
    state.textView = "pages";
    updateTextView();
  });

  elements.textSearchInput.addEventListener("input", (event) => {
    state.query = event.target.value.trim();
    updateTextView();
  });

  elements.copyTextButton.addEventListener("click", async () => {
    if (!state.currentText) {
      showToast("当前没有可复制的抽取文本");
      return;
    }
    await copyText(state.currentText);
    showToast("抽取文本已复制");
  });

  elements.downloadTextButton.addEventListener("click", () => {
    if (!state.currentText || !state.extraction) {
      showToast("当前没有可下载的抽取文本");
      return;
    }

    const safeName = state.extraction.file.name.replace(/\.pdf$/i, "");
    const blob = new Blob([state.currentText], {
      type: "text/plain;charset=utf-8"
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${safeName}_extracted.txt`;
    link.click();
    URL.revokeObjectURL(url);
    showToast("TXT 文件已生成");
  });
}

function bindDialogEvents() {
  elements.openSchemaButton.addEventListener("click", openSchemaDialog);
  elements.closeSchemaButton.addEventListener("click", () =>
    elements.schemaDialog.close()
  );
  elements.schemaDialog.addEventListener("click", (event) => {
    if (event.target === elements.schemaDialog) {
      elements.schemaDialog.close();
    }
  });
  elements.copySchemaButton.addEventListener("click", async () => {
    await copyText(state.schemaText);
    showToast("JSON Schema 已复制");
  });
}

function bindNavigationEvents() {
  const targets = elements.navItems
    .map((item) => {
      const target = document.querySelector(item.getAttribute("href"));
      return target ? { item, target } : null;
    })
    .filter(Boolean);

  const setActive = (activeItem) => {
    elements.navItems.forEach((candidate) => {
      const isActive = candidate === activeItem;
      candidate.classList.toggle("is-active", isActive);
      if (isActive) {
        candidate.setAttribute("aria-current", "location");
      } else {
        candidate.removeAttribute("aria-current");
      }
    });
  };

  const updateActiveNavigation = () => {
    state.navigationFrame = null;

    if (targets.length === 0) {
      return;
    }

    const activationLine =
      window.scrollY + Math.min(window.innerHeight * 0.34, 340);
    let activeTarget = targets[0];

    for (const candidate of targets) {
      const top =
        candidate.target.getBoundingClientRect().top + window.scrollY;
      if (top <= activationLine) {
        activeTarget = candidate;
      }
    }

    const reachedBottom =
      window.scrollY + window.innerHeight >=
      document.documentElement.scrollHeight - 4;
    if (reachedBottom) {
      activeTarget = targets.at(-1);
    }

    setActive(activeTarget.item);
  };

  const scheduleNavigationUpdate = () => {
    if (state.navigationFrame !== null) {
      return;
    }
    state.navigationFrame = window.requestAnimationFrame(
      updateActiveNavigation
    );
  };

  for (const item of elements.navItems) {
    item.addEventListener("click", () => {
      setActive(item);
    });
  }

  window.addEventListener("scroll", scheduleNavigationUpdate, {
    passive: true
  });
  window.addEventListener("resize", scheduleNavigationUpdate);
  updateActiveNavigation();
}

function bindChainEvents() {
  elements.chainFilterGroup.addEventListener("click", (event) => {
    const button = event.target.closest("[data-chain-filter]");
    if (!button) {
      return;
    }

    state.chainFilter = button.dataset.chainFilter || "all";
    state.selectedEvidenceId = null;
    renderChainExplorer(state.analysis);
  });

  elements.chainYearChart.addEventListener("click", (event) => {
    const button = event.target.closest("[data-chain-year]");
    if (!button) {
      return;
    }

    const year = Number(button.dataset.chainYear);
    state.chainYearFilter =
      Number(state.chainYearFilter) === year ? "all" : year;
    renderChainExplorer(state.analysis);
  });

  elements.chainMap.addEventListener("click", (event) => {
    const node = event.target.closest("[data-evidence-id]");
    if (!node) {
      return;
    }
    selectChainEvidence(node.dataset.evidenceId);
  });

  elements.chainInspector.addEventListener("click", (event) => {
    const clearButton = event.target.closest("[data-chain-clear]");
    if (clearButton) {
      clearChainSelection();
      return;
    }

    const locateButton = event.target.closest("[data-chain-locate]");
    if (locateButton) {
      locateEvidenceCard(locateButton.dataset.chainLocate);
    }
  });
}

function bindListEvents() {
  elements.actionList.addEventListener("click", (event) => {
    if (!event.target.closest('[data-list-toggle="actions"]')) {
      return;
    }
    state.showAllActions = !state.showAllActions;
    renderActions(
      state.analysis.elements.filter(
        (element) => element.element_type === "action"
      )
    );
  });

  elements.performanceList.addEventListener("click", (event) => {
    if (!event.target.closest('[data-list-toggle="performances"]')) {
      return;
    }
    state.showAllPerformances = !state.showAllPerformances;
    renderPerformances(
      state.analysis.elements.filter(
        (element) => element.element_type === "performance"
      )
    );
  });
}

async function handlePdfFile(file) {
  if (state.isUploading) {
    showToast("当前已有文件正在处理");
    return;
  }

  if (!file.name.toLowerCase().endsWith(".pdf")) {
    showToast("请选择 PDF 格式的可持续报告");
    elements.pdfInput.value = "";
    return;
  }

  if (file.size > MAX_PDF_MB * 1024 * 1024) {
    showToast(`文件超过 ${MAX_PDF_MB} MB，请压缩后再试`);
    elements.pdfInput.value = "";
    return;
  }

  state.isUploading = true;
  elements.currentFileName.textContent = file.name;
  elements.currentFileSize.textContent = formatFileSize(file.size);
  elements.fileProgress.hidden = false;
  elements.fileProgress.classList.remove("is-complete");
  elements.dataModeBadge.textContent = "抽取中";
  elements.clearFileButton.disabled = true;
  elements.toggleTextButton.disabled = true;
  elements.analysisStatusLabel.textContent = "正在本地分析…";
  setProgressStep("extract", "active");
  elements.progressMessage.textContent = "正在读取 PDF 页面与文本层…";

  try {
    elements.progressMessage.textContent = "正在浏览器本地读取 PDF 文本层…";
    const payload = await extractPdfInBrowser(file);
    elements.progressMessage.textContent = "文本抽取完成，正在本地识别气候要素…";
    payload.analysis = analyzeDocument(payload, {
      multi_document: false
    });
    commitExtraction(payload);
  } catch (error) {
    elements.dataModeBadge.textContent = "抽取失败";
    elements.analysisStatusLabel.textContent = "分析失败 · 请检查 PDF";
    elements.toggleTextButton.disabled = true;
    elements.progressMessage.textContent =
      error.message || "PDF 抽取失败，请稍后重试。";
    setProgressStep("extract", "error");
    showToast(error.message || "PDF 抽取失败");
  } finally {
    state.isUploading = false;
    elements.clearFileButton.disabled = false;
    elements.pdfInput.value = "";
  }
}

function commitExtraction(payload) {
  state.extraction = payload;
  state.currentText = payload.cleaned_text || payload.extracted_text || "";
  state.textView = "clean";
  state.query = "";
  elements.textSearchInput.value = "";

  setProgressStep("extract", "complete");
  setProgressStep("clean", "complete");
  renderExtractionStats(payload.stats);
  renderDebugDetails(payload.debug);
  updateTextView();
  elements.textPanel.hidden = true;
  elements.toggleTextButton.disabled = false;
  elements.toggleTextButton.textContent = "查看文本抽取过程";
  elements.fileProgress.classList.add("is-complete");

  const analysis = normalizeAnalysis(payload.analysis);
  const counts = {
    commitments: analysis.elements.filter(
      (element) => element.element_type === "commitment"
    ).length,
    actions: analysis.elements.filter(
      (element) => element.element_type === "action"
    ).length,
    performances: analysis.elements.filter(
      (element) => element.element_type === "performance"
    ).length,
    breakpoints: analysis.breakpoints.length
  };

  state.analysis = analysis;

  if (analysis.elements.length === 0) {
    elements.dataModeBadge.textContent = "未识别";
    elements.analysisStatusLabel.textContent = "分析完成 · 未找到有效要素";
    elements.progressMessage.textContent =
      `已抽取 ${payload.stats.page_count} 页，但未找到满足规则的气候要素。请检查下方文本；扫描版 PDF 还需 OCR。`;
    setProgressStep("recognize", "complete");
    renderInsightPanel(analysis);
    clearElementSections(
      "未识别到气候要素",
      "请确认报告是否包含可抽取的文字层，并检查原文是否明确写出年份、指标或已实施措施。"
    );
    updateSummary({ commitments: 0, actions: 0, performances: 0, breakpoints: 0 });
    showToast("文本抽取完成，但未识别到三类气候要素");
  } else {
    elements.dataModeBadge.textContent = "规则分析";
    elements.analysisStatusLabel.textContent = "分析完成 · 已生成证据链";
    elements.progressMessage.textContent =
      counts.commitments === 0
        ? `已抽取 ${payload.stats.page_count} 页：未识别到“量化指标 + 截止年份”的有效承诺；另检出 ${counts.actions} 条行动和 ${counts.performances} 项绩效候选。该结果不能解释为企业没有目标，需人工复核。`
        : `已抽取 ${payload.stats.page_count} 页并生成规则分析：${counts.commitments} 条承诺、${counts.actions} 条行动、${counts.performances} 项绩效。`;
    setProgressStep("recognize", "complete");
    renderAnalysis(analysis);
    showToast(
      `分析完成：识别 ${counts.commitments + counts.actions + counts.performances} 条要素`
    );
  }

  elements.summaryFootnoteText.textContent =
    "当前结果由本地规则分析器生成，用于检查页面和证据链流程；分类、关联和断点均需人工复核。";
  elements.logicSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

function updateProcessStep(stepName) {
  const step = document.querySelector(`[data-step="${stepName}"]`);
  return step;
}

function setTextPanelVisibility(isVisible) {
  elements.textPanel.hidden = !isVisible;
  elements.toggleTextButton.textContent = isVisible
    ? "收起文本抽取过程"
    : "查看文本抽取过程";
  if (isVisible) {
    elements.textPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function setProgressStep(stepName, status) {
  const step = updateProcessStep(stepName);
  if (!step) {
    return;
  }
  step.classList.remove("is-active", "is-complete", "is-error");
  if (status === "active") {
    step.classList.add("is-active");
  }
  if (status === "complete") {
    step.classList.add("is-complete");
  }
  if (status === "error") {
    step.classList.add("is-error");
  }
}

function renderExtractionStats(stats) {
  elements.extractionStats.innerHTML = [
    [stats.page_count, "PDF 页数"],
    [formatInteger(stats.cleaned_character_count), "清洗后字符"],
    [formatInteger(stats.text_item_count), "文本片段"],
    [stats.removed_line_count, "剔除重复行"],
    [prepareElapsedTime(stats.elapsed_ms), "抽取耗时"]
  ]
    .map(
      ([value, label]) => `
        <article class="extraction-stat">
          <strong>${escapeHtml(String(value))}</strong>
          <small>${escapeHtml(label)}</small>
        </article>
      `
    )
    .join("");
}

function renderDebugDetails(debug) {
  const warnings = debug.warnings || [];
  const removed = debug.removed_repeated_lines || [];
  const items = [];

  items.push(
    `<li>抽取引擎：${escapeHtml(debug.engine || "PDF.js")}；当前为文本层抽取，不包含 OCR。</li>`
  );

  for (const warning of warnings) {
    items.push(`<li>${escapeHtml(warning)}</li>`);
  }

  if (removed.length === 0) {
    items.push("<li>未发现重复页眉、页脚或独立页码。</li>");
  } else {
    items.push(`<li>共剔除 ${removed.length} 行重复页眉、页脚或页码。</li>`);
    for (const entry of removed.slice(0, 8)) {
      items.push(
        `<li>第 ${entry.page} 页 · ${escapeHtml(entry.reason)}：${escapeHtml(
          entry.line
        )}</li>`
      );
    }
  }

  elements.debugDetailsContent.innerHTML = `<ul>${items.join("")}</ul>`;
}

function updateTextView() {
  if (!state.extraction) {
    return;
  }

  const isCleanView = state.textView === "clean";
  const text = isCleanView
    ? state.extraction.cleaned_text
    : state.extraction.pages
        .map((page) => `【第 ${page.page_number} 页】\n${page.text}`)
        .join("\n\n");
  state.currentText = text;

  elements.cleanTextTab.classList.toggle("is-active", isCleanView);
  elements.cleanTextTab.setAttribute("aria-selected", String(isCleanView));
  elements.pageTextTab.classList.toggle("is-active", !isCleanView);
  elements.pageTextTab.setAttribute("aria-selected", String(!isCleanView));

  elements.textPreview.innerHTML = formatPreviewText(text, state.query);
}

function formatPreviewText(text, query) {
  const safeText = escapeHtml(text || "未抽取到正文文本。");
  const pageLabelPattern = /【第\s*(\d+)\s*页】/g;
  const withPageLabels = safeText.replace(
    pageLabelPattern,
    '<span class="page-label">第 $1 页</span>'
  );

  if (!query) {
    return withPageLabels || "未抽取到正文文本。";
  }

  const escapedQuery = escapeRegExp(escapeHtml(query));
  return withPageLabels.replace(
    new RegExp(escapedQuery, "gi"),
    (match) => `<mark>${match}</mark>`
  );
}

function renderAnalysis(analysis) {
  analysis = normalizeAnalysis(analysis);
  state.analysis = analysis;
  state.chainFilter = "all";
  state.chainYearFilter = "all";
  state.selectedEvidenceId = null;
  state.showAllActions = false;
  state.showAllPerformances = false;
  const commitments = analysis.elements.filter(
    (element) => element.element_type === "commitment"
  );
  const actions = analysis.elements.filter(
    (element) => element.element_type === "action"
  );
  const performances = analysis.elements.filter(
    (element) => element.element_type === "performance"
  );

  renderCommitments(commitments);
  renderActions(actions);
  renderPerformances(performances);
  renderBreakpoints(analysis.breakpoints);
  renderInsightPanel(analysis);
  renderChainExplorer(analysis);
  updateSummary({
    commitments: commitments.length,
    actions: actions.length,
    performances: performances.length,
    breakpoints: analysis.breakpoints.length
  });
  setSectionCounts(commitments.length, actions.length, performances.length);
}

function renderInsightPanel(analysis) {
  const commitments = analysis.elements.filter(
    (element) => element.element_type === "commitment"
  );
  const actions = analysis.elements.filter(
    (element) => element.element_type === "action"
  );
  const performances = analysis.elements.filter(
    (element) => element.element_type === "performance"
  );
  const completeChains = commitments.filter(
    (commitment) => commitment.chain_status === "complete"
  ).length;
  const breakpointCounts = { A: 0, B: 0, C: 0 };
  for (const breakpoint of analysis.breakpoints) {
    if (breakpoint.type in breakpointCounts) {
      breakpointCounts[breakpoint.type] += 1;
    }
  }
  const traceable = analysis.elements.filter(
    (element) =>
      (element.source_quote || element.content) && Number.isInteger(element.page)
  ).length;
  const traceabilityRate =
    analysis.elements.length === 0
      ? 0
      : Math.round((traceable / analysis.elements.length) * 100);
  const gapCount = analysis.breakpoints.length;

  elements.logicSummary.textContent =
    commitments.length === 0
      ? "当前文本未形成有效承诺链；请查看承诺识别结果或展开文本抽取过程核对原文。"
      : `共识别 ${commitments.length} 条承诺、${actions.length} 条行动和 ${performances.length} 项绩效。${completeChains} 条承诺形成完整证据链，${gapCount} 条出现证据缺失或待确认断点。`;

  elements.logicResultGrid.innerHTML = `
    <article class="logic-result-card is-primary">
      <small>可追溯证据</small>
      <strong>${traceabilityRate}%</strong>
      <p>${traceable} / ${analysis.elements.length} 条结果保留原文与页码</p>
    </article>
    <article class="logic-result-card">
      <small>完整证据链</small>
      <strong>${padCount(completeChains)}</strong>
      <p>承诺、对应行动与绩效均已检出</p>
    </article>
    <article class="logic-result-card">
      <small>A · 承诺无跟进</small>
      <strong>${padCount(breakpointCounts.A)}</strong>
      <p>需跨后续年度报告持续确认</p>
    </article>
    <article class="logic-result-card">
      <small>B / C · 证据链断裂</small>
      <strong>${padCount(breakpointCounts.B + breakpointCounts.C)}</strong>
      <p>B ${breakpointCounts.B} 条行动缺结果，C ${breakpointCounts.C} 条绩效缺支撑</p>
    </article>
  `;
}

function renderChainExplorer(analysis) {
  analysis = normalizeAnalysis(analysis);
  const chains = buildEvidenceChains(analysis);
  const commitments = analysis.elements.filter(
    (element) => element.element_type === "commitment"
  );
  const completeChains = chains.filter(
    (chain) => chain.type === "complete" && !chain.isOrphan
  ).length;
  const gapChains = chains.filter(
    (chain) => chain.type !== "complete" && !chain.isOrphan
  ).length;
  const orphanChains = chains.filter((chain) => chain.isOrphan).length;
  const rate =
    commitments.length === 0
      ? 0
      : Math.round((completeChains / commitments.length) * 100);

  state.evidenceChains = chains;

  renderChainFilters(chains);
  renderChainHealth({
    commitments,
    completeChains,
    gapChains,
    orphanChains,
    rate
  });
  renderChainYears(analysis.elements);
  renderChainMap(chains);

  if (state.selectedEvidenceId) {
    const selectedChain = findChainForEvidence(
      chains,
      state.selectedEvidenceId
    );
    if (selectedChain) {
      renderChainInspector(selectedChain, state.selectedEvidenceId);
      applyChainSelection(selectedChain, state.selectedEvidenceId);
    } else {
      clearChainSelection();
    }
  } else {
    renderChainInspector(null);
  }
}

function renderChainFilters(chains) {
  const counts = {
    all: chains.length,
    complete: chains.filter((chain) => chain.type === "complete").length,
    A: chains.filter((chain) => chain.type === "A").length,
    B: chains.filter((chain) => chain.type === "B").length,
    C: chains.filter((chain) => chain.type === "C").length
  };

  elements.chainFilterGroup
    .querySelectorAll("[data-chain-filter]")
    .forEach((button) => {
      const filter = button.dataset.chainFilter;
      const isActive = filter === state.chainFilter;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
      const count = button.querySelector("strong");
      if (count) {
        count.textContent = String(counts[filter] ?? 0);
      }
    });
}

function renderChainHealth({
  commitments,
  completeChains,
  gapChains,
  orphanChains,
  rate
}) {
  elements.chainHealthRing.style.setProperty("--chain-rate", `${rate}`);
  elements.chainHealthRing.innerHTML = `
    <div class="chain-ring-center">
      <strong>${rate}<small>%</small></strong>
      <span>完整率</span>
    </div>
  `;
  elements.chainHealthCaption.textContent = `${completeChains} / ${commitments.length}`;
  elements.chainHealthRate.textContent = `${rate}%`;
  elements.chainHealthSummary.textContent =
    commitments.length === 0
      ? "当前未形成以承诺为起点的证据链"
      : `${completeChains} 条完整，${gapChains} 条待核，${orphanChains} 项孤立证据`;
}

function renderChainYears(allElements) {
  const series = buildYearSeries(allElements);
  if (series.length === 0) {
    elements.chainYearChart.innerHTML =
      '<div class="chain-year-empty">当前结果没有可用的报告年份</div>';
    return;
  }

  const maxTotal = Math.max(...series.map((entry) => entry.total), 1);
  elements.chainYearChart.innerHTML = series
    .map((entry) => {
      const isActive = Number(entry.year) === Number(state.chainYearFilter);
      const height = Math.max(22, Math.round((entry.total / maxTotal) * 92));
      return `
        <button
          class="chain-year-bar${isActive ? " is-active" : ""}"
          type="button"
          data-chain-year="${entry.year}"
          aria-pressed="${isActive}"
          aria-label="筛选 ${entry.year} 年，共 ${entry.total} 条证据"
        >
          <span class="chain-year-count">${entry.total}</span>
          <span class="chain-year-stack" style="--bar-height:${height}px">
            <i class="is-commitment" style="--segment-count:${entry.commitment}"></i>
            <i class="is-action" style="--segment-count:${entry.action}"></i>
            <i class="is-performance" style="--segment-count:${entry.performance}"></i>
          </span>
          <strong>${entry.year}</strong>
          <small>C${entry.commitment} · A${entry.action} · P${entry.performance}</small>
        </button>
      `;
    })
    .join("");
}

function renderChainMap(chains) {
  const visibleChains = filterEvidenceChains(chains, state.chainFilter);
  if (visibleChains.length === 0) {
    elements.chainMap.innerHTML = `
      <div class="chain-map-empty">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="5" cy="6" r="2"></circle>
          <circle cx="19" cy="12" r="2"></circle>
          <circle cx="5" cy="18" r="2"></circle>
          <path d="M7 6h3a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2h3M7 18h3a2 2 0 0 0 2-2v-2a2 2 0 0 1 2-2"></path>
        </svg>
        <strong>当前筛选下没有证据链</strong>
        <p>切换到“全部”查看本轮识别出的全部承诺与孤立证据。</p>
      </div>
    `;
    return;
  }

  elements.chainMap.innerHTML = visibleChains
    .map((chain) => {
      const actions = renderChainNodeGroup(
        chain,
        chain.actions,
        "action",
        "未检出行动"
      );
      const performances = renderChainNodeGroup(
        chain,
        chain.performances,
        "performance",
        "未检出绩效"
      );
      const commitmentNode =
        chain.commitment &&
        renderEvidenceNode(chain.commitment, chain, "commitment");
      const orphanLabel = chain.isOrphan
        ? `<div class="orphan-chain-label">${escapeHtml(chain.label)}</div>`
        : "";

      return `
        <article class="chain-map-row chain-type-${escapeHtml(
          chain.type.toLowerCase()
        )}" data-chain-id="${escapeHtml(chain.id)}">
          <div class="chain-state">
            <span>${String(chain.index).padStart(2, "0")}</span>
            <strong>${escapeHtml(
              chain.type === "complete" ? "✓" : chain.type === "review" ? "?" : chain.type
            )}</strong>
            <small>${escapeHtml(chain.label)}</small>
          </div>
          <div class="chain-node-slot chain-commitment-slot">
            ${commitmentNode || '<div class="chain-missing-node"><strong>未识别承诺</strong><small>当前证据无法归入目标</small></div>'}
            ${orphanLabel}
          </div>
          <div class="chain-connector ${chain.actions.length ? "is-connected" : "is-missing"}" aria-hidden="true"></div>
          <div class="chain-node-slot">${actions}</div>
          <div class="chain-connector ${chain.performances.length ? "is-connected" : "is-missing"}" aria-hidden="true"></div>
          <div class="chain-node-slot">${performances}</div>
        </article>
      `;
    })
    .join("");

  applyChainYearFilter();
  if (state.selectedEvidenceId) {
    const selectedChain = findChainForEvidence(
      state.evidenceChains,
      state.selectedEvidenceId
    );
    if (selectedChain) {
      applyChainSelection(selectedChain, state.selectedEvidenceId);
    }
  }
}

function renderChainNodeGroup(chain, nodes, type, missingLabel) {
  if (nodes.length === 0) {
    return `
      <div class="chain-missing-node">
        <strong>${escapeHtml(missingLabel)}</strong>
        <small>${type === "action" ? "承诺后未见实施证据" : "未见对应量化结果"}</small>
      </div>
    `;
  }

  const visibleNodes = nodes.slice(0, 2);
  const remaining = nodes.length - visibleNodes.length;
  return `
    <div class="chain-node-stack">
      ${visibleNodes.map((node) => renderEvidenceNode(node, chain, type)).join("")}
      ${remaining > 0 ? `<span class="chain-more">另有 ${remaining} 条关联证据</span>` : ""}
    </div>
  `;
}

function renderEvidenceNode(element, chain, type) {
  const isSelected = state.selectedEvidenceId === element.id;
  return `
    <button
      class="chain-evidence-node is-${escapeHtml(type)}${isSelected ? " is-selected" : ""}"
      type="button"
      data-evidence-id="${escapeHtml(element.id)}"
      data-chain-id="${escapeHtml(chain.id)}"
      aria-pressed="${isSelected}"
      title="${escapeHtml(evidenceNodeTitle(element))}"
    >
      <span class="chain-node-top">
        <strong>${escapeHtml(element.id)}</strong>
        <small>${escapeHtml(String(element.report_year || "年份待确认"))} · p.${escapeHtml(
          String(element.page ?? "—")
        )}</small>
      </span>
      <span class="chain-node-title">${escapeHtml(evidenceNodeTitle(element))}</span>
    </button>
  `;
}

function evidenceNodeTitle(element) {
  if (element.element_type === "performance") {
    return `${element.metric || "量化绩效"} ${element.value ?? "—"}${element.unit || ""}`;
  }
  return element.content || element.metric || "待确认证据";
}

function applyChainYearFilter() {
  const activeYear = Number(state.chainYearFilter);
  const hasYearFilter = Number.isInteger(activeYear);

  elements.chainMap
    .querySelectorAll("[data-evidence-id]")
    .forEach((node) => {
      const element = state.analysis.elements.find(
        (candidate) => candidate.id === node.dataset.evidenceId
      );
      const isOutsideYear =
        hasYearFilter && Number(element?.report_year) !== activeYear;
      node.classList.toggle("is-outside-year", isOutsideYear);
    });
}

function selectChainEvidence(evidenceId) {
  const chain = findChainForEvidence(state.evidenceChains, evidenceId);
  if (!chain) {
    return;
  }

  state.selectedEvidenceId = evidenceId;
  renderChainInspector(chain, evidenceId);
  applyChainSelection(chain, evidenceId);
}

function applyChainSelection(chain, evidenceId) {
  elements.chainMap
    .querySelectorAll("[data-evidence-id]")
    .forEach((node) => {
      const isSelected = node.dataset.evidenceId === evidenceId;
      const isRelated = chain.elementIds.includes(node.dataset.evidenceId);
      node.classList.toggle("is-selected", isSelected);
      node.classList.toggle("is-context", isRelated && !isSelected);
      node.setAttribute("aria-pressed", String(isSelected));
    });

  elements.chainMap.querySelectorAll("[data-chain-id]").forEach((row) => {
    row.classList.toggle("is-active", row.dataset.chainId === chain.id);
  });

  document.querySelectorAll(".evidence-section [data-evidence-id]").forEach(
    (card) => {
      const isSelected = card.dataset.evidenceId === evidenceId;
      const isRelated = chain.elementIds.includes(card.dataset.evidenceId);
      card.classList.toggle("is-evidence-selected", isSelected);
      card.classList.toggle("is-evidence-related", isRelated && !isSelected);
    }
  );
}

function clearChainSelection() {
  state.selectedEvidenceId = null;
  renderChainInspector(null);
  elements.chainMap
    .querySelectorAll("[data-evidence-id]")
    .forEach((node) => {
      node.classList.remove("is-selected", "is-context");
      node.setAttribute("aria-pressed", "false");
    });
  elements.chainMap
    .querySelectorAll("[data-chain-id]")
    .forEach((row) => row.classList.remove("is-active"));
  document
    .querySelectorAll(
      ".evidence-section .is-evidence-selected, .evidence-section .is-evidence-related"
    )
    .forEach((card) => {
      card.classList.remove("is-evidence-selected", "is-evidence-related");
    });
}

function renderChainInspector(chain, evidenceId = null) {
  if (!chain || !evidenceId) {
    elements.chainInspector.innerHTML = `
      <div class="chain-inspector-empty">
        <span class="inspector-icon">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="5" cy="6" r="2"></circle>
            <circle cx="19" cy="12" r="2"></circle>
            <circle cx="5" cy="18" r="2"></circle>
            <path d="M7 6h3a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2h3M7 18h3a2 2 0 0 0 2-2v-2a2 2 0 0 1 2-2"></path>
          </svg>
        </span>
        <h3>选择图谱节点</h3>
        <p>查看原文、年份、页码和同链路证据，并联动高亮下方卡片。</p>
      </div>
    `;
    return;
  }

  const element = chain.elements.find((item) => item.id === evidenceId);
  if (!element) {
    return;
  }
  const typeLabels = {
    commitment: "气候承诺",
    action: "落地行动",
    performance: "量化绩效"
  };
  const relatedEvidences = chain.elementIds.filter((id) => id !== evidenceId);
  const chainStatusText =
    chain.type === "complete"
      ? "完整证据链"
      : chain.type === "review"
        ? "待人工复核"
        : `${chain.type} · ${chain.label}`;

  elements.chainInspector.innerHTML = `
    <div class="inspector-selected">
      <div class="inspector-top">
        <span class="inspector-kicker">SELECTED EVIDENCE</span>
        <button class="inspector-close" type="button" data-chain-clear aria-label="清除图谱选择">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m6 6 12 12M18 6 6 18"></path>
          </svg>
        </button>
      </div>
      <div class="inspector-type">
        <span>${escapeHtml(element.id)}</span>
        ${escapeHtml(typeLabels[element.element_type] || "证据")}
      </div>
      <h3>${escapeHtml(evidenceNodeTitle(element))}</h3>
      <blockquote>“${escapeHtml(element.source_quote || element.content || evidenceNodeTitle(element))}”</blockquote>
      <dl class="inspector-meta">
        <div><dt>报告年份</dt><dd>${escapeHtml(String(element.report_year || "待确认"))}</dd></div>
        <div><dt>原文页码</dt><dd>p.${escapeHtml(String(element.page ?? "—"))}</dd></div>
        <div><dt>复核状态</dt><dd>${escapeHtml(element.review_status || "待核")}</dd></div>
        <div><dt>链路判定</dt><dd>${escapeHtml(chainStatusText)}</dd></div>
      </dl>
      ${
        relatedEvidences.length > 0
          ? `
            <div class="inspector-related">
              <small>同链路证据</small>
              <div>${relatedEvidences
                .map((id) => `<span>${escapeHtml(id)}</span>`)
                .join("")}</div>
            </div>
          `
          : ""
      }
      ${
        chain.breakpoints.length > 0
          ? `
            <div class="inspector-gaps">
              <small>关联断点</small>
              ${chain.breakpoints
                .map(
                  (breakpoint) => `
                    <p><strong>${escapeHtml(breakpoint.type)} · ${escapeHtml(
                      breakpoint.id
                    )}</strong>${escapeHtml(breakpoint.title)}</p>
                  `
                )
                .join("")}
            </div>
          `
          : ""
      }
      <button class="inspector-locate" type="button" data-chain-locate="${escapeHtml(
        evidenceId
      )}">
        定位到展示区
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 12h14M14 7l5 5-5 5"></path>
        </svg>
      </button>
    </div>
  `;
}

function locateEvidenceCard(evidenceId) {
  const card = [...document.querySelectorAll(
    ".evidence-section [data-evidence-id]"
  )].find((candidate) => candidate.dataset.evidenceId === evidenceId);
  if (!card) {
    showToast("展示区没有找到对应证据");
    return;
  }

  card.scrollIntoView({ behavior: "smooth", block: "center" });
  card.classList.add("is-located");
  window.setTimeout(() => card.classList.remove("is-located"), 1800);
}

function renderCommitments(commitments) {
  if (commitments.length === 0) {
    elements.commitmentList.innerHTML = emptyState(
      "等待承诺要素",
      "上传报告后，具有量化指标及截止年份的气候目标将展示在这里。"
    );
    return;
  }

  elements.commitmentList.innerHTML = commitments
    .map((commitment) => {
      const status = commitmentStatus(commitment.chain_status);
      const hasBreakpoint = commitment.chain_status !== "complete";
      const actionPresent = commitment.linked_actions.length > 0;
      const performancePresent = commitment.linked_performances.length > 0;
      const performanceComplete =
        performancePresent && commitment.chain_status === "complete";

      return `
        <article class="commitment-card${hasBreakpoint ? " has-breakpoint" : ""}" data-evidence-id="${escapeHtml(
          commitment.id
        )}">
          <div class="commitment-top">
            <span class="element-id">${escapeHtml(commitment.id)}</span>
            <span class="status-pill ${status.className}">${escapeHtml(
              status.label
            )}</span>
          </div>
          <h3>${escapeHtml(commitment.content)}</h3>
          <div class="target-meta">
            <span class="meta-chip">指标 <strong>${escapeHtml(
              commitment.metric
            )}</strong></span>
            <span class="meta-chip">目标值 <strong>${escapeHtml(
              commitment.target_value
            )}</strong></span>
            <span class="meta-chip">截止 <strong>${escapeHtml(
              String(commitment.due_year)
            )}</strong></span>
            <span class="meta-chip">${escapeHtml(
              String(commitment.report_year)
            )} · p.${escapeHtml(String(commitment.page))}</span>
          </div>
          <blockquote class="evidence-quote">
            “${escapeHtml(commitment.content)}”
          </blockquote>
          <div class="chain-progress" aria-label="证据链进度">
            <div class="chain-node is-present">
              <span>1</span>
              <small>承诺</small>
            </div>
            <div class="chain-line ${actionPresent ? "is-present" : ""}"></div>
            <div class="chain-node ${
              actionPresent ? "is-present" : "is-missing"
            }">
              <span>2</span>
              <small>${actionPresent ? `${commitment.linked_actions.length} 条行动` : "未检出行动"}</small>
            </div>
            <div class="chain-line ${performanceComplete ? "is-present" : ""}"></div>
            <div class="chain-node ${
              performanceComplete ? "is-present" : "is-missing"
            }">
              <span>3</span>
              <small>${
                performancePresent
                  ? performanceComplete
                    ? "有对应绩效"
                    : "仅汇总绩效"
                  : "未检出绩效"
              }</small>
            </div>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderActions(actions) {
  if (actions.length === 0) {
    elements.actionList.innerHTML = emptyState(
      "等待行动要素",
      "已经实施的技术改造、项目、采购安排或管理措施将展示在这里。"
    );
    return;
  }

  const visibleActions = state.showAllActions ? actions : actions.slice(0, 10);
  const actionCards = visibleActions
    .map((action) => {
      const hasDirectResult = action.action_result_status === "direct";
      return `
        <article class="action-card" data-evidence-id="${escapeHtml(action.id)}">
          <div class="action-year">${escapeHtml(String(action.report_year))}</div>
          <div class="action-main">
            <div class="action-top">
              <span class="element-id">${escapeHtml(action.id)}</span>
              <span class="outline-badge">${escapeHtml(action.review_status)}</span>
            </div>
            <h3>${escapeHtml(action.content)}</h3>
            <p>原文定位：p.${escapeHtml(String(action.page))} · 置信度 ${formatPercent(
              action.confidence
            )}</p>
          </div>
          <div class="action-side">
            <small>对应承诺</small>
            <span class="link-chip">${escapeHtml(action.commitment_id || "无归属")}</span>
            <span class="result-state ${hasDirectResult ? "is-complete" : ""}">
              ${hasDirectResult ? "已找到单项绩效" : "缺少行动级绩效"}
            </span>
          </div>
        </article>
      `;
    })
    .join("");

  elements.actionList.innerHTML =
    actionCards +
    (actions.length > 10 ? listToggle(actions.length, "actions") : "");
}

function renderPerformances(performances) {
  if (performances.length === 0) {
    elements.performanceList.innerHTML = emptyState(
      "等待绩效要素",
      "已经发生、带有数值和单位的气候结果将展示在这里。"
    );
    return;
  }

  const visiblePerformances = state.showAllPerformances
    ? performances
    : performances.slice(0, 6);
  const performanceCards = visiblePerformances
    .map((performance) => {
      const hasAction = Boolean(performance.action_id);
      return `
        <article class="performance-card" data-evidence-id="${escapeHtml(
          performance.id
        )}">
          <div class="performance-top">
            <span class="element-id">${escapeHtml(performance.id)}</span>
            <span class="status-pill ${
              hasAction ? "status-complete" : "status-warning"
            }">${hasAction ? "有行动佐证" : "行动待核"}</span>
          </div>
          <div class="performance-value">
            ${escapeHtml(performance.value)}
            <small>${escapeHtml(performance.unit)}</small>
          </div>
          <h3>${escapeHtml(performance.metric)}</h3>
          <p>${escapeHtml(performance.change)} · ${escapeHtml(
            performance.performance_scope
          )}</p>
          <div class="performance-footer">
            <span>${escapeHtml(String(performance.report_year))} · p.${escapeHtml(
              String(performance.page)
            )}</span>
            <span class="link-chip">${escapeHtml(
              performance.commitment_id || "无归属"
            )}</span>
          </div>
        </article>
      `;
    })
    .join("");

  elements.performanceList.innerHTML =
    performanceCards +
    (performances.length > 6
      ? listToggle(performances.length, "performances")
      : "");
}

function renderBreakpoints(breakpoints) {
  if (breakpoints.length === 0) {
    elements.breakpointList.innerHTML = emptyState(
      "等待断点判定",
      "AI 识别与链路匹配完成前，这里不会给出断点结论。"
    );
    return;
  }

  const labels = {
    A: "承诺无跟进",
    B: "行动缺结果",
    C: "绩效缺支撑"
  };

  elements.breakpointList.innerHTML = breakpoints
    .map(
      (breakpoint) => `
        <article class="breakpoint-card breakpoint-${escapeHtml(
          breakpoint.type.toLowerCase()
        )}">
          <div class="breakpoint-code">${escapeHtml(breakpoint.type)}</div>
          <div class="breakpoint-content">
            <div class="breakpoint-top">
              <span class="element-id">${escapeHtml(breakpoint.id)} · ${
                labels[breakpoint.type] || "证据断点"
              }</span>
              <span class="status-pill status-review">${escapeHtml(
                breakpoint.review_status
              )}</span>
            </div>
            <h3>${escapeHtml(breakpoint.title)}</h3>
            <p>${escapeHtml(breakpoint.description)}</p>
          </div>
          <div class="breakpoint-proof">
            <small>${breakpoint.commitment_id ? `关联 ${escapeHtml(breakpoint.commitment_id)} · ` : ""}缺失证据</small>
            <div class="missing-tags">
              ${breakpoint.missing
                .map((item) => `<span>${escapeHtml(item)}</span>`)
                .join("")}
            </div>
          </div>
        </article>
      `
    )
    .join("");
}

function clearElementSections(title, description) {
  elements.commitmentList.innerHTML = emptyState(title, description);
  elements.actionList.innerHTML = emptyState(title, description);
  elements.performanceList.innerHTML = emptyState(title, description);
  elements.breakpointList.innerHTML = emptyState(
    "尚未进行 AI 识别",
    "文本抽取质量确认后，按固定输出协议接入模型，再生成断点候选。"
  );
  setSectionCounts(0, 0, 0);
  renderChainExplorer({ elements: [], breakpoints: [] });
}

function updateSummary(counts) {
  elements.commitmentCount.textContent = padCount(counts.commitments);
  elements.actionCount.textContent = padCount(counts.actions);
  elements.performanceCount.textContent = padCount(counts.performances);
  elements.breakpointCount.textContent = padCount(counts.breakpoints);
}

function setSectionCounts(commitments, actions, performances) {
  elements.commitmentSectionCount.textContent = `${commitments} 条承诺`;
  elements.actionSectionCount.textContent = `${actions} 条行动`;
  elements.performanceSectionCount.textContent = `${performances} 项绩效`;
}

function commitmentStatus(chainStatus) {
  if (chainStatus === "complete") {
    return { className: "status-complete", label: "链路完整" };
  }
  if (chainStatus === "breakpoint_a") {
    return { className: "status-warning", label: "A · 无跟进" };
  }
  if (chainStatus === "breakpoint_c") {
    return { className: "status-warning", label: "C · 缺行动支撑" };
  }
  return { className: "status-warning", label: "B · 缺单项绩效" };
}

function normalizeAnalysis(input) {
  if (!input) {
    return {
      elements: [],
      breakpoints: []
    };
  }

  const elements = (input.elements || []).map((element) => {
    if (element.element_type === "commitment") {
      const target = element.normalized_target || {};
      return {
        ...element,
        metric: element.metric || target.metric || "气候相关指标",
        target_value: element.target_value || target.target_value || "原文目标",
        due_year: element.due_year || target.due_year || "待确认",
        baseline_year:
          element.baseline_year || target.baseline_year || "未单列",
        linked_actions: element.linked_actions || [],
        linked_performances: element.linked_performances || [],
        chain_status: element.chain_status || "needs_review"
      };
    }

    if (element.element_type === "action") {
      return {
        ...element,
        commitment_id: element.commitment_id || null,
        linked_performances: element.linked_performances || [],
        action_result_status:
          element.action_result_status ||
          (element.linked_performances?.length > 0
            ? "direct"
            : "missing_direct_result")
      };
    }

    return {
      ...element,
      value: element.value ?? "—",
      unit: element.unit || "",
      change: element.change || "当期披露",
      performance_scope: element.performance_scope || "待确认统计口径",
      commitment_id: element.commitment_id || null,
      action_id: element.action_id || null
    };
  });

  return {
    ...input,
    elements,
    breakpoints: (input.breakpoints || []).map((breakpoint) => ({
      ...breakpoint,
      description: breakpoint.description || breakpoint.reason || "待人工复核",
      missing: breakpoint.missing || breakpoint.missing_evidence || ["待确认证据"]
    }))
  };
}

function emptyState(title, description) {
  return `
    <div class="section-empty">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3v18M5 8h14M7 16h10" />
      </svg>
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(description)}</p>
    </div>
  `;
}

function listToggle(total, type) {
  const isActions = type === "actions";
  const expanded = isActions
    ? state.showAllActions
    : state.showAllPerformances;
  const noun = isActions ? "行动" : "绩效";
  const visibleCount = isActions ? 10 : 6;

  return `
    <div class="list-expand-row">
      <button
        class="list-expand-button"
        type="button"
        data-list-toggle="${type}"
        aria-expanded="${expanded}"
      >
        ${expanded ? `收起，仅显示 ${visibleCount} 条` : `显示全部 ${total} 条${noun}`}
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="${expanded ? "m6 15 6-6 6 6" : "m6 9 6 6 6-6"}"></path>
        </svg>
      </button>
    </div>
  `;
}

function resetToDemo() {
  if (state.isUploading) {
    return;
  }
  state.extraction = null;
  state.currentText = "";
  state.query = "";
  elements.fileProgress.hidden = true;
  elements.fileProgress.classList.remove("is-complete");
  elements.textPanel.hidden = true;
  elements.toggleTextButton.disabled = true;
  elements.toggleTextButton.textContent = "查看文本抽取过程";
  elements.textSearchInput.value = "";
  elements.dataModeBadge.textContent = "演示数据";
  state.analysis = sampleAnalysis;
  renderAnalysis(sampleAnalysis);
  showToast("已切换到演示数据");
}

async function openSchemaDialog() {
  elements.schemaDialog.showModal();
  if (state.schemaText) {
    elements.schemaCode.textContent = state.schemaText;
    return;
  }

  try {
    const response = await fetch("./docs/ai-output.schema.json");
    if (!response.ok) {
      throw new Error("协议文件读取失败");
    }
    state.schemaText = await response.text();
    elements.schemaCode.textContent = state.schemaText;
  } catch (error) {
    elements.schemaCode.textContent = `无法载入 Schema：${error.message}`;
  }
}

async function copyText(text) {
  if (!text) {
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
}

function showToast(message) {
  clearTimeout(state.toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  state.toastTimer = setTimeout(() => {
    elements.toast.classList.remove("is-visible");
  }, 2600);
}

function formatFileSize(bytes) {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(0)} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatInteger(value) {
  return Number(value || 0).toLocaleString("zh-CN");
}

function prepareElapsedTime(milliseconds) {
  if (milliseconds < 1000) {
    return `${milliseconds} ms`;
  }
  return `${(milliseconds / 1000).toFixed(1)} s`;
}

function formatPercent(value) {
  return `${Math.round(Number(value || 0) * 100)}%`;
}

function padCount(value) {
  return String(value).padStart(2, "0");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
