import {
  analyzeDocument,
  analyzeDocuments
} from "./analyzer.js";
import {
  buildEvidenceChains,
  buildYearSeries,
  filterEvidenceChains,
  findChainForEvidence,
  normalizeChainStatus
} from "./chain-model.js";
import { extractPdfInBrowser } from "./pdf-client.js";
import { buildReviewPortfolio } from "./triage-model.js";

const MAX_PDF_MB = 200;

const sampleAnalysis = {
  schema_version: "1.1",
  breakpoint_scheme: "CAP",
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
      chain_status: "action_gap"
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
      chain_status: "commitment_gap"
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
      type: "C",
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
      type: "A",
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
      type: "P",
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
  analysisMode: "sample",
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
  showAllPerformances: false,
  pendingFiles: [],
  sourceFiles: [],
  pdfDocumentCache: new Map(),
  sourceViewer: null,
  aiSettings: null,
  triageBudget: 60,
  triageRiskMode: "expected",
  triagePortfolio: null,
  presenterStep: 0,
  builtInDemoLoading: false
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
  fileQueueList: document.querySelector("#file-queue-list"),
  startAnalysisButton: document.querySelector("#start-analysis-button"),
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
  openExportButton: document.querySelector("#open-export-button"),
  exportDialog: document.querySelector("#export-dialog"),
  closeExportDialogButton: document.querySelector(
    "#close-export-dialog-button"
  ),
  exportJsonButton: document.querySelector("#export-json-button"),
  exportCsvButton: document.querySelector("#export-csv-button"),
  sourceDialog: document.querySelector("#source-dialog"),
  sourceDialogTitle: document.querySelector("#source-dialog-title"),
  sourceDialogMeta: document.querySelector("#source-dialog-meta"),
  closeSourceDialogButton: document.querySelector(
    "#close-source-dialog-button"
  ),
  sourcePrevPage: document.querySelector("#source-prev-page"),
  sourceNextPage: document.querySelector("#source-next-page"),
  sourcePageIndicator: document.querySelector("#source-page-indicator"),
  sourceCanvasShell: document.querySelector("#source-canvas-shell"),
  sourcePdfCanvas: document.querySelector("#source-pdf-canvas"),
  sourceHighlightLayer: document.querySelector(
    "#source-highlight-layer"
  ),
  sourceLoading: document.querySelector("#source-loading"),
  sourceQuote: document.querySelector("#source-quote"),
  sourceEvidenceMeta: document.querySelector("#source-evidence-meta"),
  openAiSettingsButton: document.querySelector("#open-ai-settings-button"),
  aiDialog: document.querySelector("#ai-dialog"),
  closeAiDialogButton: document.querySelector("#close-ai-dialog-button"),
  aiSettingsForm: document.querySelector("#ai-settings-form"),
  aiEnabledInput: document.querySelector("#ai-enabled-input"),
  aiEndpointInput: document.querySelector("#ai-endpoint-input"),
  aiModelInput: document.querySelector("#ai-model-input"),
  aiKeyInput: document.querySelector("#ai-key-input"),
  clearAiSettingsButton: document.querySelector("#clear-ai-settings-button"),
  qualityEngineStatus: document.querySelector("#quality-engine-status"),
  openMethodologyButton: document.querySelector("#open-methodology-button"),
  openAiDisclosureButton: document.querySelector(
    "#open-ai-disclosure-button"
  ),
  aiDisclosureDialog: document.querySelector("#ai-disclosure-dialog"),
  closeAiDisclosureButton: document.querySelector(
    "#close-ai-disclosure-button"
  ),
  copyAiDisclosureButton: document.querySelector(
    "#copy-ai-disclosure-button"
  ),
  triageSection: document.querySelector("#triage-section"),
  triageBudgetInput: document.querySelector("#triage-budget-input"),
  triageBudgetOutput: document.querySelector("#triage-budget-output"),
  triageMetrics: document.querySelector("#triage-metrics"),
  baselineComparison: document.querySelector("#baseline-comparison"),
  triageSensitivity: document.querySelector("#triage-sensitivity"),
  triagePriorityList: document.querySelector("#triage-priority-list"),
  triageRobustness: document.querySelector("#triage-robustness"),
  riskModeButtons: [
    ...document.querySelectorAll("[data-risk-mode]")
  ],
  startFinalsDemoButton: document.querySelector(
    "#start-finals-demo-button"
  ),
  presenterGuide: document.querySelector("#presenter-guide"),
  presenterStepLabel: document.querySelector("#presenter-step"),
  presenterTitle: document.querySelector("#presenter-title"),
  presenterCopy: document.querySelector("#presenter-copy"),
  presenterAction: document.querySelector("#presenter-action"),
  presenterProgressBar: document.querySelector("#presenter-progress-bar"),
  presenterPrevButton: document.querySelector("#presenter-prev-button"),
  presenterNextButton: document.querySelector("#presenter-next-button"),
  exitPresenterButton: document.querySelector("#exit-presenter-button"),
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
  loadAiSettings();
  bindUploadEvents();
  bindTextEvents();
  bindDialogEvents();
  bindReviewAndExportEvents();
  bindTriageAndPresentationEvents();
  bindSourceViewerEvents();
  bindAiSettingsEvents();
  bindNavigationEvents();
  bindChainEvents();
  bindListEvents();
  renderAnalysis(state.analysis);
  updateEngineStatus();
}

function bindUploadEvents() {
  elements.selectFileButton.addEventListener("click", (event) => {
    event.stopPropagation();
    elements.pdfInput.click();
  });

  elements.dropzone.addEventListener("click", (event) => {
    if (!event.target.closest("button")) {
      elements.pdfInput.click();
    }
  });

  elements.pdfInput.addEventListener("change", () => {
    const files = [...elements.pdfInput.files];
    if (files.length > 0) {
      queuePdfFiles(files);
      elements.pdfInput.value = "";
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
    const files = [...event.dataTransfer.files];
    if (files.length > 0) {
      queuePdfFiles(files);
    }
  });

  elements.startAnalysisButton.addEventListener("click", () => {
    if (state.pendingFiles.length === 0 || state.isUploading) {
      return;
    }
    elements.startAnalysisButton.disabled = true;
    handlePdfFiles([...state.pendingFiles]);
  });

  elements.fileQueueList.addEventListener("click", (event) => {
    const removeButton = event.target.closest("[data-remove-queued-file]");
    if (!removeButton || state.isUploading) {
      return;
    }
    const index = Number(removeButton.dataset.removeQueuedFile);
    state.pendingFiles.splice(index, 1);
    renderFileQueue();
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
    state.pendingFiles = [];
    state.sourceFiles = [];
    clearPdfDocumentCache();
    state.analysisMode = "sample";
    renderFileQueue();
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

function bindReviewAndExportEvents() {
  document.addEventListener("click", (event) => {
    const reviewButton = event.target.closest("[data-review-evidence]");
    if (reviewButton) {
      event.preventDefault();
      applyReviewStatus(
        reviewButton.dataset.reviewEvidence,
        reviewButton.dataset.reviewStatus
      );
      return;
    }

    const sourceButton = event.target.closest("[data-open-source-id]");
    if (sourceButton) {
      event.preventDefault();
      openSourceViewer(sourceButton.dataset.openSourceId);
    }
  });

  elements.openExportButton.addEventListener("click", () => {
    if (!state.analysis?.elements?.length) {
      showToast("当前没有可导出的审查结果");
      return;
    }
    elements.exportDialog.showModal();
  });

  elements.closeExportDialogButton.addEventListener("click", () => {
    elements.exportDialog.close();
  });

  elements.exportDialog.addEventListener("click", (event) => {
    if (event.target === elements.exportDialog) {
      elements.exportDialog.close();
    }
  });

  elements.exportJsonButton.addEventListener("click", () => {
    exportAnalysis("json");
  });

  elements.exportCsvButton.addEventListener("click", () => {
    exportAnalysis("csv");
  });

  elements.openMethodologyButton.addEventListener("click", () => {
    window.open("./docs/analysis-quality.md", "_blank", "noopener,noreferrer");
  });
}

function bindTriageAndPresentationEvents() {
  elements.triageBudgetInput.addEventListener("input", (event) => {
    state.triageBudget = Number(event.target.value);
    elements.triageBudgetOutput.textContent = String(state.triageBudget);
    renderTriage(state.analysis);
  });

  for (const button of elements.riskModeButtons) {
    button.addEventListener("click", () => {
      state.triageRiskMode = button.dataset.riskMode || "expected";
      elements.riskModeButtons.forEach((candidate) => {
        candidate.classList.toggle(
          "is-active",
          candidate.dataset.riskMode === state.triageRiskMode
        );
      });
      renderTriage(state.analysis);
    });
  }

  elements.openAiDisclosureButton.addEventListener("click", () => {
    elements.aiDisclosureDialog.showModal();
  });
  elements.closeAiDisclosureButton.addEventListener("click", () => {
    elements.aiDisclosureDialog.close();
  });
  elements.aiDisclosureDialog.addEventListener("click", (event) => {
    if (event.target === elements.aiDisclosureDialog) {
      elements.aiDisclosureDialog.close();
    }
  });
  elements.copyAiDisclosureButton.addEventListener("click", async () => {
    await copyText(aiDisclosureSummary());
    showToast("AI 工具披露摘要已复制");
  });

  elements.startFinalsDemoButton.addEventListener("click", startFinalsDemo);
  elements.presenterPrevButton.addEventListener("click", () => {
    showPresenterStep(state.presenterStep - 1);
  });
  elements.presenterNextButton.addEventListener("click", () => {
    if (state.presenterStep >= presenterSteps.length - 1) {
      exitPresenter();
      return;
    }
    showPresenterStep(state.presenterStep + 1);
  });
  elements.exitPresenterButton.addEventListener("click", exitPresenter);
}

const presenterSteps = [
  {
    title: "业务问题与决策目标",
    target: "#workbench",
    copy:
      "ESG 分析人员不缺报告，缺的是在有限复核时间内判断哪些证据链最值得先查。系统把非结构化披露转成可追溯证据任务。",
    action: "指出上传入口、浏览器本地处理和“复核时间有限”的业务约束。"
  },
  {
    title: "从文本到证据链",
    target: "#chain-section",
    copy:
      "当前结果来自内置样例 PDF 的实际运行。系统按承诺、行动、绩效建立证据链，C/A/P 断点只是待核线索，不直接给企业定性。",
    action: "切换完整、C、A、P 筛选，指出一条完整链路和一条断裂链路。"
  },
  {
    title: "原文追溯与人工复核",
    target: "#commitment-section",
    copy:
      "每条结果保留原文、报告年份和页码。人工可查看原文高亮，并标记确认、存疑或排除。",
    action: "打开一条“查看原文”，说明扫描页和复杂表格仍需人工核对。"
  },
  {
    title: "运筹模型：复核组合优化",
    target: "#triage-section",
    copy:
      "决策变量是任务是否进入复核队列，目标是在时间预算内最大化风险覆盖，约束是人工分钟数不能超预算。",
    action: "把预算从 90 分钟调到 60 分钟，指出优化队列会自动调整。"
  },
  {
    title: "基准对比与敏感性",
    target: ".triage-analysis-grid",
    copy:
      "同一预算下，将精确 0/1 背包解与文档顺序、低置信度优先和风险贪心比较，并展示预算变化下的覆盖曲线。",
    action: "指出优化方案相对最优基准提升的百分点，以及预算增加后的边际收益。"
  },
  {
    title: "可信度、AI 与边界",
    target: "#quality-section",
    copy:
      "14/14 是防退化回归，不等于真实总体准确率。AI 只提供语义建议，失败自动回退，最终由人工确认。",
    action: "打开 AI 工具使用说明，说明工具版本、输入范围、人工复核和风险控制。"
  },
  {
    title: "审计导出与落地",
    target: "#open-export-button",
    copy:
      "结果可导出 JSON/CSV，包含原文、页码、关联关系、复核状态和 AI 建议，便于 ESG 底稿或审阅系统接入。",
    action: "点击右上角导出结果，说明本地部署与私有化模型路径。"
  }
];

async function startFinalsDemo() {
  if (state.builtInDemoLoading) return;
  state.builtInDemoLoading = true;
  elements.startFinalsDemoButton.disabled = true;
  elements.startFinalsDemoButton.textContent = "正在加载演示报告…";

  try {
    const response = await fetch("./samples/climate-report-sample.pdf");
    if (!response.ok) {
      throw new Error("内置演示报告读取失败");
    }
    const blob = await response.blob();
    const file = new File([blob], "climate-report-sample.pdf", {
      type: "application/pdf",
      lastModified: Date.now()
    });
    state.pendingFiles = [file];
    renderFileQueue();
    await handlePdfFiles([file]);
    elements.dataModeBadge.textContent =
      state.analysisMode === "ai_enhanced"
        ? "内置样例 · AI 实际运行"
        : "内置样例 · 实际运行";
  } catch (error) {
    state.analysis = sampleAnalysis;
    state.analysisMode = "sample";
    renderAnalysis(sampleAnalysis);
    showToast(`${error.message}，已切换到内置结果演示`);
  } finally {
    state.builtInDemoLoading = false;
    elements.startFinalsDemoButton.disabled = false;
    elements.startFinalsDemoButton.textContent = "5 分钟评审演示";
  }

  showPresenterStep(0);
}

function showPresenterStep(index) {
  const boundedIndex = Math.min(
    presenterSteps.length - 1,
    Math.max(0, Number(index) || 0)
  );
  state.presenterStep = boundedIndex;
  const step = presenterSteps[boundedIndex];
  elements.presenterGuide.hidden = false;
  elements.presenterStepLabel.textContent = `${String(
    boundedIndex + 1
  ).padStart(2, "0")} / ${String(presenterSteps.length).padStart(2, "0")}`;
  elements.presenterTitle.textContent = step.title;
  elements.presenterCopy.textContent = step.copy;
  elements.presenterAction.textContent = step.action;
  elements.presenterProgressBar.style.width = `${
    ((boundedIndex + 1) / presenterSteps.length) * 100
  }%`;
  elements.presenterPrevButton.disabled = boundedIndex === 0;
  elements.presenterNextButton.textContent =
    boundedIndex === presenterSteps.length - 1 ? "结束演示" : "下一步";

  const target = document.querySelector(step.target);
  if (target) {
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function exitPresenter() {
  elements.presenterGuide.hidden = true;
  state.presenterStep = 0;
  showToast("已退出评审演示模式");
}

function aiDisclosureSummary() {
  return [
    "AI 工具使用说明 v1.0",
    "文本抽取：PDF.js 6.5.438，浏览器本地处理文字层，不上传原始 PDF。",
    "规则分析：证据链规则分析器 v0.5，生成候选、关联和 C/A/P 断点。",
    "大模型复核：可选 OpenAI 兼容接口；当前公网默认未启用外部大模型。",
    "人工复核：AI 建议不直接定性，所有候选支持确认、存疑、排除并进入审计导出。",
    "风险控制：接口失败自动回退规则；保留原文、页码、分析模式与复核记录。"
  ].join("\n");
}

function renderTriage(analysis) {
  const portfolio = buildReviewPortfolio(analysis, {
    budget: state.triageBudget,
    riskMode: state.triageRiskMode
  });
  state.triagePortfolio = portfolio;

  if (portfolio.tasks.length === 0) {
    elements.triageMetrics.innerHTML = "";
    elements.baselineComparison.innerHTML =
      '<p class="triage-empty">当前没有可分配的证据任务。</p>';
    elements.triageSensitivity.innerHTML = "";
    elements.triagePriorityList.innerHTML =
      '<p class="triage-empty">上传报告并生成证据链后，系统将给出复核优化队列。</p>';
    elements.triageRobustness.textContent = "等待证据任务";
    return;
  }

  const bestBaseline = portfolio.baselines.reduce(
    (best, baseline) =>
      baseline.coverage > best.coverage ? baseline : best,
    portfolio.baselines[0]
  );
  const coverageLift = Math.max(
    0,
    (portfolio.optimized.coverage - bestBaseline.coverage) * 100
  );

  elements.triageMetrics.innerHTML = [
    metricCard(
      `${Math.round(portfolio.optimized.selectedCount)}`,
      "建议复核任务",
      `预算 ${portfolio.optimized.budget} 分钟`
    ),
    metricCard(
      formatPercent(portfolio.optimized.coverage),
      "预计风险覆盖",
      `相对最优基准 +${coverageLift.toFixed(1)} pp`
    ),
    metricCard(
      formatPercent(portfolio.optimized.highRiskCoverage),
      "高风险任务覆盖",
      `利用预算 ${formatPercent(portfolio.optimized.utilization)}`
    ),
    metricCard(
      `${portfolio.optimized.effort} 分钟`,
      "实际人工投入",
      `剩余 ${portfolio.optimized.budget - portfolio.optimized.effort} 分钟`
    )
  ].join("");

  const rows = [
    ...portfolio.baselines,
    { ...portfolio.optimized, label: "优化组合", strategy: "optimized" }
  ];
  elements.baselineComparison.innerHTML = rows
    .map(
      (entry) => `
        <div class="baseline-row${
          entry.strategy === "optimized" ? " is-optimized" : ""
        }">
          <strong>${escapeHtml(entry.label)}</strong>
          <span class="baseline-track"><i style="width:${Math.round(
            entry.coverage * 100
          )}%"></i></span>
          <b>${Math.round(entry.coverage * 100)}%</b>
        </div>
      `
    )
    .join("");

  elements.triageSensitivity.innerHTML = portfolio.sensitivity
    .map(
      (entry) => `
        <div class="sensitivity-column">
          <div class="sensitivity-bars" title="优化 ${Math.round(
            entry.optimizedCoverage * 100
          )}% / 基准 ${Math.round(entry.baselineCoverage * 100)}%">
            <i style="height:${Math.max(
              3,
              Math.round(entry.baselineCoverage * 72)
            )}px"></i>
            <i class="is-optimized" style="height:${Math.max(
              3,
              Math.round(entry.optimizedCoverage * 72)
            )}px"></i>
          </div>
          <small>${entry.budget} 分</small>
        </div>
      `
    )
    .join("");

  elements.triagePriorityList.innerHTML = portfolio.optimized.selected
    .slice(0, 8)
    .map(
      (task, index) => `
        <div class="priority-item">
          <span class="priority-rank">${String(index + 1).padStart(2, "0")}</span>
          <div class="priority-copy">
            <strong>${escapeHtml(task.sourceId)} · ${escapeHtml(task.title)}</strong>
            <small>${escapeHtml(
              task.sourceType === "breakpoint"
                ? `${task.type} 类断点`
                : `${task.type} 证据核验`
            )} · ${escapeHtml(task.reviewStatus)}</small>
          </div>
          <span class="priority-risk"><strong>${Math.round(
            (task.riskScore / 1.2) * 100
          )}</strong>风险指数</span>
          <span class="priority-time"><strong>${task.effort}</strong>分钟</span>
        </div>
      `
    )
    .join("");

  elements.triageRobustness.textContent =
    `${portfolio.robustness.scenarioCount} 次权重扰动 · 平均选择重合 ` +
    `${formatPercent(portfolio.robustness.averageOverlap)} · 最差覆盖 ` +
    `${formatPercent(portfolio.robustness.minimumCoverage)}`;
}

function metricCard(value, label, note) {
  return `
    <article class="triage-metric">
      <strong>${escapeHtml(value)}</strong>
      <span>${escapeHtml(label)}</span>
      <small>${escapeHtml(note)}</small>
    </article>
  `;
}

function applyReviewStatus(evidenceId, status) {
  const element = state.analysis.elements.find(
    (candidate) => candidate.id === evidenceId
  );
  const breakpoint = state.analysis.breakpoints.find(
    (candidate) => candidate.id === evidenceId
  );
  const target = element || breakpoint;

  if (!target || !["已确认", "存疑", "已排除"].includes(status)) {
    return;
  }

  target.review_status = status;
  target.reviewed_at = new Date().toISOString();
  target.review_source = "人工复核";
  state.analysis.review_updated_at = target.reviewed_at;

  renderAnalysis(state.analysis);
  showToast(`${evidenceId} 已标记为“${status}”`);
}

function reviewStatusMeta(status) {
  if (status === "已确认" || status === "已核") {
    return { label: "已确认", className: "is-confirmed" };
  }
  if (status === "已排除") {
    return { label: "已排除", className: "is-rejected" };
  }
  if (status === "存疑") {
    return { label: "存疑", className: "is-doubtful" };
  }
  return { label: "待复核", className: "is-pending" };
}

function reviewTools(evidenceId, status, { canOpenSource = true } = {}) {
  const meta = reviewStatusMeta(status);
  return `
    <div class="evidence-tools">
      <button
        class="evidence-tool-button"
        type="button"
        data-open-source-id="${escapeHtml(evidenceId)}"
        ${canOpenSource ? "" : "disabled title=\"演示数据没有对应 PDF 原文\""}
      >
        查看原文
      </button>
      <button
        class="evidence-tool-button${
          meta.className === "is-confirmed" ? " is-confirmed" : ""
        }"
        type="button"
        data-review-evidence="${escapeHtml(evidenceId)}"
        data-review-status="已确认"
      >
        确认
      </button>
      <button
        class="evidence-tool-button"
        type="button"
        data-review-evidence="${escapeHtml(evidenceId)}"
        data-review-status="存疑"
      >
        存疑
      </button>
      <button
        class="evidence-tool-button${
          meta.className === "is-rejected" ? " is-rejected" : ""
        }"
        type="button"
        data-review-evidence="${escapeHtml(evidenceId)}"
        data-review-status="已排除"
      >
        排除
      </button>
      <span class="review-status ${meta.className}">${meta.label}</span>
    </div>
  `;
}

function aiReviewNote(target) {
  if (!target?.ai_suggestion) {
    return "";
  }
  const confidence =
    Number.isFinite(Number(target.ai_confidence)) &&
    target.ai_confidence !== null
      ? ` · ${formatPercent(target.ai_confidence)}`
      : "";
  const rationale = target.ai_rationale
    ? `：${escapeHtml(target.ai_rationale)}`
    : "";
  return `
    <p class="ai-review-note">
      <strong>AI 建议 ${escapeHtml(target.ai_suggestion)}${confidence}</strong>${rationale}
    </p>
  `;
}

function exportAnalysis(format) {
  const payload = buildAuditExport();
  const stamp = new Date().toISOString().slice(0, 10);
  const baseName = `climate-evidence-audit-${stamp}`;

  if (format === "json") {
    downloadBlob(
      JSON.stringify(payload, null, 2),
      `${baseName}.json`,
      "application/json;charset=utf-8"
    );
  } else {
    downloadBlob(
      toAuditCsv(payload),
      `${baseName}.csv`,
      "text/csv;charset=utf-8"
    );
  }

  elements.exportDialog.close();
  showToast(`${format.toUpperCase()} 审查结果已生成`);
}

function buildAuditExport() {
  const counts = {
    commitments: 0,
    actions: 0,
    performances: 0,
    breakpoints: state.analysis.breakpoints.length
  };
  for (const element of state.analysis.elements) {
    if (element.element_type === "commitment") counts.commitments += 1;
    if (element.element_type === "action") counts.actions += 1;
    if (element.element_type === "performance") counts.performances += 1;
  }
  const triage =
    state.triagePortfolio ||
    buildReviewPortfolio(state.analysis, {
      budget: state.triageBudget,
      riskMode: state.triageRiskMode
    });

  return {
    schema_version: "1.1",
    breakpoint_scheme: "CAP",
    export_type: "climate_evidence_audit",
    generated_at: new Date().toISOString(),
    analysis_mode: state.analysisMode,
    analysis_engine: state.analysis.analysis_engine || "rule_preview",
    ai_review: state.analysis.ai_review || null,
    company: state.analysis.company || null,
    counts,
    review_portfolio: {
      budget_minutes: triage.budget,
      risk_mode: triage.riskMode,
      optimized: {
        selected_count: triage.optimized.selectedCount,
        effort_minutes: triage.optimized.effort,
        coverage: triage.optimized.coverage,
        high_risk_coverage: triage.optimized.highRiskCoverage,
        objective_value: triage.optimized.objectiveValue
      },
      baselines: triage.baselines.map((baseline) => ({
        strategy: baseline.strategy,
        label: baseline.label,
        selected_count: baseline.selectedCount,
        effort_minutes: baseline.effort,
        coverage: baseline.coverage
      })),
      selected_tasks: triage.optimized.selected,
      sensitivity: triage.sensitivity,
      robustness: triage.robustness
    },
    elements: state.analysis.elements.map((element) => ({
      ...element,
      review_status: reviewStatusMeta(element.review_status).label
    })),
    breakpoints: state.analysis.breakpoints.map((breakpoint) => ({
      ...breakpoint,
      review_status: reviewStatusMeta(breakpoint.review_status).label
    }))
  };
}

function toAuditCsv(payload) {
  const headers = [
    "记录类型",
    "编号",
    "要素类型",
    "标题或内容",
    "原文",
    "报告年份",
    "页码",
    "关联承诺",
    "关联行动",
    "规则匹配度",
    "复核状态",
    "复核时间",
    "AI建议",
    "AI理由"
  ];
  const rows = [];

  for (const element of payload.elements) {
    rows.push([
      "要素",
      element.id,
      element.element_type,
      element.content || "",
      element.source_quote || "",
      element.report_year ?? "",
      element.page ?? "",
      element.commitment_id || "",
      element.action_id || "",
      element.confidence ?? "",
      element.review_status || "",
      element.reviewed_at || "",
      element.ai_suggestion || "",
      element.ai_rationale || ""
    ]);
  }

  for (const breakpoint of payload.breakpoints) {
    rows.push([
      "断点",
      breakpoint.id,
      breakpoint.type,
      breakpoint.title || "",
      breakpoint.description || "",
      "",
      "",
      breakpoint.commitment_id || "",
      "",
      "",
      breakpoint.review_status || "",
      breakpoint.reviewed_at || "",
      breakpoint.ai_suggestion || "",
      breakpoint.ai_rationale || ""
    ]);
  }

  return `\uFEFF${[headers, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n")}`;
}

function csvCell(value) {
  const text = String(value ?? "").replace(/\r?\n/g, " ");
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadBlob(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function bindSourceViewerEvents() {
  elements.closeSourceDialogButton.addEventListener("click", () =>
    elements.sourceDialog.close()
  );
  elements.sourceDialog.addEventListener("click", (event) => {
    if (event.target === elements.sourceDialog) {
      elements.sourceDialog.close();
    }
  });
  elements.sourcePrevPage.addEventListener("click", () => {
    if (!state.sourceViewer) return;
    renderSourcePage(state.sourceViewer.page - 1);
  });
  elements.sourceNextPage.addEventListener("click", () => {
    if (!state.sourceViewer) return;
    renderSourcePage(state.sourceViewer.page + 1);
  });
}

async function openSourceViewer(evidenceId) {
  const element =
    state.analysis.elements.find((candidate) => candidate.id === evidenceId) ||
    findEvidenceForBreakpoint(evidenceId);

  if (!element) {
    showToast("没有找到对应证据");
    return;
  }
  if (state.sourceFiles.length === 0) {
    showToast("演示数据没有对应 PDF；上传报告后可直接定位原文");
    return;
  }

  const sourceDocument = element.source_document || {};
  const fileIndex = Number.isInteger(sourceDocument.index)
    ? sourceDocument.index
    : state.sourceFiles.findIndex(
        (file) => file.name === sourceDocument.name
      );
  const file = state.sourceFiles[fileIndex] || state.sourceFiles[0];

  if (!file) {
    showToast("原始 PDF 文件已不在当前会话中，请重新上传");
    return;
  }

  state.sourceViewer = {
    file,
    fileIndex: fileIndex >= 0 ? fileIndex : 0,
    document: null,
    page: Math.max(1, Number(element.page) || 1),
    quote: element.source_quote || element.content || "",
    evidence: element,
    totalPages: 0
  };

  elements.sourceDialogTitle.textContent = `${element.id} · 原文核验`;
  elements.sourceQuote.textContent = `“${state.sourceViewer.quote}”`;
  elements.sourceEvidenceMeta.innerHTML = `
    <div><dt>要素类型</dt><dd>${escapeHtml(element.element_type)}</dd></div>
    <div><dt>报告年份</dt><dd>${escapeHtml(String(element.report_year || "待确认"))}</dd></div>
    <div><dt>原文页码</dt><dd>p.${escapeHtml(String(element.page || "待确认"))}</dd></div>
    <div><dt>复核状态</dt><dd>${reviewStatusMeta(element.review_status).label}</dd></div>
  `;
  elements.sourceDialogMeta.textContent = sourceDocument.name || file.name;
  elements.sourceDialog.showModal();
  await renderSourcePage(state.sourceViewer.page);
}

function findEvidenceForBreakpoint(breakpointId) {
  const breakpoint = state.analysis.breakpoints.find(
    (candidate) => candidate.id === breakpointId
  );
  if (!breakpoint) return null;
  const ids = breakpoint.evidence_ids || [];
  return (
    state.analysis.elements.find((element) => ids.includes(element.id)) || null
  );
}

async function getSourcePdfDocument(fileIndex) {
  if (state.pdfDocumentCache.has(fileIndex)) {
    return state.pdfDocumentCache.get(fileIndex);
  }
  if (!window.pdfjsLib) {
    throw new Error("PDF.js 未加载");
  }

  const file = state.sourceFiles[fileIndex];
  if (!file) {
    throw new Error("原始 PDF 文件不存在");
  }

  const loadingTask = window.pdfjsLib.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    isEvalSupported: false,
    disableFontFace: true
  });
  const document = await loadingTask.promise;
  state.pdfDocumentCache.set(fileIndex, { loadingTask, document });
  return state.pdfDocumentCache.get(fileIndex);
}

async function renderSourcePage(requestedPage) {
  if (!state.sourceViewer) return;

  const cached = await getSourcePdfDocument(state.sourceViewer.fileIndex);
  state.sourceViewer.document = cached.document;
  state.sourceViewer.totalPages = cached.document.numPages;
  const pageNumber = Math.min(
    Math.max(1, Number(requestedPage) || 1),
    cached.document.numPages
  );
  state.sourceViewer.page = pageNumber;

  elements.sourceLoading.hidden = false;
  elements.sourceLoading.textContent = `正在渲染第 ${pageNumber} 页…`;
  elements.sourcePageIndicator.textContent = `${pageNumber} / ${cached.document.numPages}`;
  elements.sourcePrevPage.disabled = pageNumber <= 1;
  elements.sourceNextPage.disabled = pageNumber >= cached.document.numPages;

  try {
    const page = await cached.document.getPage(pageNumber);
    const baseViewport = page.getViewport({ scale: 1 });
    const availableWidth = Math.max(
      320,
      elements.sourceCanvasShell.clientWidth - 44
    );
    const scale = Math.min(1.7, availableWidth / baseViewport.width);
    const viewport = page.getViewport({ scale });
    const outputScale = Math.min(2, window.devicePixelRatio || 1);
    const canvas = elements.sourcePdfCanvas;
    const context = canvas.getContext("2d", { alpha: false });

    canvas.width = Math.floor(viewport.width * outputScale);
    canvas.height = Math.floor(viewport.height * outputScale);
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;
    context.setTransform(outputScale, 0, 0, outputScale, 0, 0);

    await page.render({
      canvasContext: context,
      viewport
    }).promise;

    const textContent = await page.getTextContent();
    const rects = findQuoteRectangles(
      textContent.items,
      viewport,
      state.sourceViewer.quote
    );
    elements.sourceHighlightLayer.style.width = `${viewport.width}px`;
    elements.sourceHighlightLayer.style.height = `${viewport.height}px`;
    elements.sourceHighlightLayer.innerHTML = rects
      .map(
        (rect) => `
          <span class="source-highlight" style="
            left:${rect.left}px;
            top:${rect.top}px;
            width:${rect.width}px;
            height:${rect.height}px;
          "></span>
        `
      )
      .join("");
    page.cleanup();
  } catch (error) {
    elements.sourceHighlightLayer.innerHTML = "";
    showToast(error.message || "原文渲染失败");
  } finally {
    elements.sourceLoading.hidden = true;
  }
}

function findQuoteRectangles(items, viewport, quote) {
  if (!window.pdfjsLib?.Util?.transform || !quote) {
    return [];
  }

  const chars = [];
  for (const item of items) {
    if (!item?.str || !item.transform) continue;
    const transformed = window.pdfjsLib.Util.transform(
      viewport.transform,
      item.transform
    );
    const height = Math.max(7, Math.hypot(transformed[2], transformed[3]) * 1.2);
    const width = Math.max(1, (Number(item.width) || 0) * viewport.scale);
    const text = String(item.str);
    const charWidth = width / Math.max(1, text.length);

    for (let index = 0; index < text.length; index += 1) {
      const character = normalizeHighlightText(text[index]);
      if (!character) continue;
      chars.push({
        character,
        x: transformed[4] + index * charWidth,
        y: transformed[5] - height,
        width: charWidth,
        height
      });
    }
  }

  const pageText = chars.map((char) => char.character).join("");
  const target = normalizeHighlightText(quote);
  const start = pageText.indexOf(target);
  if (start < 0) {
    return fallbackQuoteRectangles(items, viewport, quote);
  }

  const matched = chars.slice(start, start + target.length);
  const lines = [];
  for (const char of matched) {
    let line = lines.find((candidate) => Math.abs(candidate.y - char.y) < 5);
    if (!line) {
      line = {
        x: char.x,
        y: char.y,
        right: char.x + char.width,
        height: char.height
      };
      lines.push(line);
    } else {
      line.x = Math.min(line.x, char.x);
      line.right = Math.max(line.right, char.x + char.width);
      line.height = Math.max(line.height, char.height);
    }
  }

  return lines.map((line) => ({
    left: roundCss(Math.max(0, line.x - 1.5)),
    top: roundCss(Math.max(0, line.y - 1)),
    width: roundCss(Math.min(viewport.width - line.x, line.right - line.x + 3)),
    height: roundCss(line.height + 2)
  }));
}

function fallbackQuoteRectangles(items, viewport, quote) {
  const normalizedQuote = normalizeHighlightText(quote);
  const matches = [];
  for (const item of items) {
    const text = normalizeHighlightText(item?.str || "");
    if (text.length < 2 || !normalizedQuote.includes(text)) continue;
    const transformed = window.pdfjsLib.Util.transform(
      viewport.transform,
      item.transform
    );
    const height = Math.max(8, Math.hypot(transformed[2], transformed[3]) * 1.2);
    matches.push({
      left: roundCss(transformed[4]),
      top: roundCss(transformed[5] - height),
      width: roundCss((Number(item.width) || 0) * viewport.scale + 2),
      height: roundCss(height + 2)
    });
  }
  return matches;
}

function normalizeHighlightText(value) {
  return String(value || "")
    .replace(/\s+/g, "")
    .replace(/[“”"'‘’]/g, "");
}

function roundCss(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function bindAiSettingsEvents() {
  elements.openAiSettingsButton.addEventListener("click", () => {
    fillAiSettingsForm();
    elements.aiDialog.showModal();
  });
  elements.closeAiDialogButton.addEventListener("click", () => {
    elements.aiDialog.close();
  });
  elements.aiDialog.addEventListener("click", (event) => {
    if (event.target === elements.aiDialog) {
      elements.aiDialog.close();
    }
  });
  elements.aiSettingsForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const settings = {
      enabled: elements.aiEnabledInput.checked,
      endpoint: elements.aiEndpointInput.value.trim(),
      model: elements.aiModelInput.value.trim(),
      apiKey: elements.aiKeyInput.value.trim()
    };
    if (settings.enabled && (!settings.endpoint || !settings.model)) {
      showToast("启用 AI 语义复核前，请填写接口地址和模型名称");
      return;
    }
    state.aiSettings = settings;
    persistAiSettings();
    updateEngineStatus();
    elements.aiDialog.close();
    showToast(settings.enabled ? "AI 语义复核已启用" : "分析设置已保存");
  });
  elements.clearAiSettingsButton.addEventListener("click", () => {
    state.aiSettings = null;
    try {
      sessionStorage.removeItem("climate-evidence-ai-settings");
    } catch {
      // Session storage can be unavailable in privacy-restricted contexts.
    }
    fillAiSettingsForm();
    updateEngineStatus();
    showToast("AI 配置已清除，继续使用规则引擎");
  });
}

function loadAiSettings() {
  try {
    const stored = sessionStorage.getItem("climate-evidence-ai-settings");
    state.aiSettings = stored ? JSON.parse(stored) : null;
  } catch {
    state.aiSettings = null;
  }
}

function persistAiSettings() {
  try {
    if (state.aiSettings?.enabled) {
      sessionStorage.setItem(
        "climate-evidence-ai-settings",
        JSON.stringify(state.aiSettings)
      );
    } else {
      sessionStorage.removeItem("climate-evidence-ai-settings");
    }
  } catch {
    showToast("当前浏览器无法保存 AI 配置");
  }
}

function fillAiSettingsForm() {
  const settings = state.aiSettings || {
    enabled: false,
    endpoint: "",
    model: "",
    apiKey: ""
  };
  elements.aiEnabledInput.checked = Boolean(settings.enabled);
  elements.aiEndpointInput.value = settings.endpoint || "";
  elements.aiModelInput.value = settings.model || "";
  elements.aiKeyInput.value = settings.apiKey || "";
}

function updateEngineStatus() {
  const aiEnabled = Boolean(
    state.aiSettings?.enabled &&
      state.aiSettings.endpoint &&
      state.aiSettings.model
  );
  elements.qualityEngineStatus.textContent = aiEnabled
    ? "规则基线 + AI 语义复核"
    : "规则基线 · 可接入 AI 增强";
  elements.openAiSettingsButton.title = aiEnabled
    ? "AI 语义复核已配置"
    : "配置 AI 语义复核";
}

function isAiReviewEnabled() {
  return Boolean(
    state.aiSettings?.enabled &&
      state.aiSettings.endpoint &&
      state.aiSettings.model
  );
}

async function enhanceAnalysisWithAi(analysis) {
  const candidates = [
    ...(analysis.elements || []).map((element) => ({
      id: element.id,
      kind: "element",
      element_type: element.element_type,
      content: element.content,
      source_quote: element.source_quote,
      report_year: element.report_year,
      page: element.page,
      existing_review: reviewStatusMeta(element.review_status).label
    })),
    ...(analysis.breakpoints || []).map((breakpoint) => ({
      id: breakpoint.id,
      kind: "breakpoint",
      element_type: breakpoint.type,
      content: `${breakpoint.title}：${breakpoint.description}`,
      source_quote: "",
      report_year: "",
      page: "",
      existing_review: reviewStatusMeta(breakpoint.review_status).label
    }))
  ];

  if (candidates.length === 0) {
    return;
  }

  const reviews = [];
  for (let index = 0; index < candidates.length; index += 24) {
    const batch = candidates.slice(index, index + 24);
    const batchReviews = await requestAiReviewBatch(batch);
    reviews.push(...batchReviews);
  }

  const reviewMap = new Map(reviews.map((review) => [review.id, review]));
  for (const element of analysis.elements || []) {
    applyAiReview(element, reviewMap.get(element.id));
  }
  for (const breakpoint of analysis.breakpoints || []) {
    applyAiReview(breakpoint, reviewMap.get(breakpoint.id));
  }
}

async function requestAiReviewBatch(batch) {
  const systemPrompt = [
    "你是上市公司可持续报告的证据链复核助手。",
    "你会收到规则引擎生成的候选要素或断点。",
    "请逐条判断其是否属于气候承诺、已实施行动、已发生量化绩效或合理断点线索。",
    "只能复核给定 ID，不得臆造新 ID，不得改写原文。",
    "suggestion 只能是“确认”“存疑”“排除”之一。",
    "rationale 控制在 60 个中文字符内，说明判断依据。",
    "只返回 JSON，格式为：",
    '{"reviews":[{"id":"C-01","suggestion":"确认","confidence":0.88,"rationale":"包含明确截止年份与量化指标"}]}'
  ].join("\n");
  const userPrompt = JSON.stringify(
    {
      task: "climate_evidence_semantic_review",
      candidates: batch
    },
    null,
    2
  );

  const response = await fetchAiChat([
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ]);
  const content = extractAiMessageContent(response);
  const parsed = parseJsonResponse(content);
  const reviews = Array.isArray(parsed.reviews)
    ? parsed.reviews
    : Array.isArray(parsed.elements)
      ? parsed.elements
      : [];

  return reviews
    .map((review) => ({
      id: String(review.id || ""),
      suggestion: normalizeAiSuggestion(
        review.suggestion || review.review_status || review.status
      ),
      confidence: normalizeAiConfidence(review.confidence),
      rationale: String(
        review.rationale || review.reason || review.notes || ""
      ).slice(0, 160)
    }))
    .filter((review) => review.id && review.suggestion);
}

async function fetchAiChat(messages) {
  const endpoint = String(state.aiSettings.endpoint || "").trim();
  let parsedEndpoint;
  try {
    parsedEndpoint = new URL(endpoint);
  } catch {
    throw new Error("AI 接口地址格式不正确");
  }
  if (!["http:", "https:"].includes(parsedEndpoint.protocol)) {
    throw new Error("AI 接口必须使用 HTTP 或 HTTPS");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  const headers = { "Content-Type": "application/json" };
  if (state.aiSettings.apiKey) {
    headers.Authorization = `Bearer ${state.aiSettings.apiKey}`;
  }

  try {
    const response = await fetch(parsedEndpoint.href, {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model: state.aiSettings.model,
        temperature: 0,
        messages
      })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(
        `AI 接口返回 ${response.status}${detail ? `：${detail.slice(0, 120)}` : ""}`
      );
    }
    return await response.json();
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("AI 接口请求超时");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function extractAiMessageContent(response) {
  const content =
    response?.choices?.[0]?.message?.content ??
    response?.output_text ??
    response?.response ??
    response?.content;
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => part?.text || part?.content || "")
      .join("\n");
  }
  throw new Error("AI 接口没有返回可解析的文本");
}

function parseJsonResponse(content) {
  const trimmed = String(content || "")
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("AI 返回结果不是有效 JSON");
  }
}

function normalizeAiSuggestion(value) {
  const text = String(value || "").trim().toLowerCase();
  if (["确认", "已确认", "confirm", "confirmed", "accept", "accepted"].includes(text)) {
    return "确认";
  }
  if (["排除", "已排除", "reject", "rejected", "exclude", "excluded"].includes(text)) {
    return "排除";
  }
  if (["存疑", "待核", "review", "doubtful", "uncertain"].includes(text)) {
    return "存疑";
  }
  return "";
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function normalizeAiConfidence(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const normalized = number > 1 && number <= 100 ? number / 100 : number;
  return clampNumber(normalized, 0, 1, null);
}

function applyAiReview(target, review) {
  if (!target || !review) return;
  target.ai_suggestion = review.suggestion;
  target.ai_confidence = review.confidence;
  target.ai_rationale = review.rationale;
  target.analysis_engine = "rule_plus_ai";
}

function clearPdfDocumentCache() {
  for (const cached of state.pdfDocumentCache.values()) {
    cached.loadingTask?.destroy?.().catch?.(() => {});
  }
  state.pdfDocumentCache.clear();
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

function queuePdfFiles(fileList) {
  if (state.isUploading) {
    showToast("当前已有报告正在分析，请等待完成");
    return;
  }

  const incoming = [...fileList];
  const validFiles = [];
  let rejectedCount = 0;

  for (const file of incoming) {
    if (
      !file.name.toLowerCase().endsWith(".pdf") ||
      file.size > MAX_PDF_MB * 1024 * 1024
    ) {
      rejectedCount += 1;
      continue;
    }
    validFiles.push(file);
  }

  const existingKeys = new Set(
    state.pendingFiles.map((file) => queuedFileKey(file))
  );
  const newFiles = validFiles.filter((file) => {
    const key = queuedFileKey(file);
    if (existingKeys.has(key)) {
      return false;
    }
    existingKeys.add(key);
    return true;
  });

  state.pendingFiles.push(...newFiles);
  renderFileQueue();

  if (newFiles.length === 0) {
    showToast(
      rejectedCount > 0
        ? "文件格式不符合要求或超过 200 MB"
        : "这些文件已在待分析列表中"
    );
    return;
  }

  elements.fileProgress.hidden = false;
  elements.fileProgress.classList.remove("is-complete");
  elements.clearFileButton.disabled = false;
  elements.toggleTextButton.disabled = true;
  elements.dataModeBadge.textContent = "待分析";
  elements.analysisStatusLabel.textContent = `已选择 ${state.pendingFiles.length} 份报告`;
  elements.progressMessage.textContent =
    "可以继续拖入补充报告；确认文件列表后点击“开始分析”。";
  setProgressStep("upload", "active");
  setProgressStep("extract", null);
  setProgressStep("clean", null);
  setProgressStep("recognize", null);
  showToast(
    rejectedCount > 0
      ? `已加入 ${newFiles.length} 份，跳过 ${rejectedCount} 个无效文件`
      : `已加入 ${newFiles.length} 份报告`
  );
}

function renderFileQueue() {
  const files = state.pendingFiles;
  if (files.length === 0) {
    elements.fileQueueList.innerHTML = "";
    elements.startAnalysisButton.disabled = true;
    elements.startAnalysisButton.textContent = "开始分析";
    if (!state.isUploading) {
      elements.fileProgress.hidden = true;
    }
    return;
  }

  const totalBytes = files.reduce((total, file) => total + file.size, 0);
  elements.currentFileName.textContent =
    files.length === 1 ? "1 份 PDF 报告" : `${files.length} 份可持续报告`;
  elements.currentFileSize.textContent =
    files.length === 1
      ? formatFileSize(totalBytes)
      : `${files.length} 份 · ${formatFileSize(totalBytes)}`;
  elements.fileQueueList.innerHTML = files
    .map(
      (file, index) => `
        <div class="queue-file-item">
          <strong title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</strong>
          <small>${escapeHtml(formatFileSize(file.size))}</small>
          <button
            type="button"
            data-remove-queued-file="${index}"
            aria-label="从待分析列表移除 ${escapeHtml(file.name)}"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m6 6 12 12M18 6 6 18"></path>
            </svg>
          </button>
        </div>
      `
    )
    .join("");
  elements.startAnalysisButton.disabled = state.isUploading;
  elements.startAnalysisButton.textContent = state.isUploading
    ? "正在分析…"
    : `开始分析 ${files.length} 份报告`;
}

function queuedFileKey(file) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

async function handlePdfFiles(fileList) {
  if (state.isUploading) {
    showToast("当前已有文件正在处理");
    return;
  }

  const files = [...fileList];
  if (files.length === 0) {
    return;
  }

  if (files.some((file) => !file.name.toLowerCase().endsWith(".pdf"))) {
    showToast("请选择 PDF 格式的可持续报告");
    elements.pdfInput.value = "";
    return;
  }

  const oversizedFile = files.find(
    (file) => file.size > MAX_PDF_MB * 1024 * 1024
  );
  if (oversizedFile) {
    showToast(`文件超过 ${MAX_PDF_MB} MB，请压缩后再试`);
    elements.pdfInput.value = "";
    return;
  }

  const totalBytes = files.reduce((total, file) => total + file.size, 0);
  state.isUploading = true;
  state.sourceFiles = [...files];
  clearPdfDocumentCache();
  renderFileQueue();
  elements.currentFileName.textContent =
    files.length === 1 ? files[0].name : `${files.length} 份可持续报告`;
  elements.currentFileSize.textContent =
    files.length === 1
      ? formatFileSize(totalBytes)
      : `${files.length} 份 · ${formatFileSize(totalBytes)}`;
  elements.fileProgress.hidden = false;
  elements.fileProgress.classList.remove("is-complete");
  elements.dataModeBadge.textContent = "抽取中";
  elements.clearFileButton.disabled = true;
  elements.toggleTextButton.disabled = true;
  elements.analysisStatusLabel.textContent = "正在本地分析…";
  setProgressStep("extract", "active");
  elements.progressMessage.textContent = "正在读取 PDF 页面与文本层…";

  try {
    const payloads = [];

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const prefix =
        files.length > 1 ? `[${index + 1}/${files.length}] ${file.name}` : file.name;
      elements.currentFileName.textContent = prefix;
      elements.progressMessage.textContent =
        files.length > 1
          ? `正在读取第 ${index + 1}/${files.length} 份报告：${file.name}`
          : "正在浏览器本地读取 PDF 文本层…";

      const payload = await extractPdfInBrowser(file, {
        onProgress: ({ current_page, total_pages }) => {
          if (
            current_page === 1 ||
            current_page === total_pages ||
            current_page % 20 === 0
          ) {
            elements.progressMessage.textContent =
              files.length > 1
                ? `第 ${index + 1}/${files.length} 份 · ${file.name} · 已读取 ${current_page}/${total_pages} 页`
                : `已读取 ${current_page}/${total_pages} 页`;
          }
        }
      });
      payloads.push(payload);
    }

    elements.currentFileName.textContent =
      files.length === 1 ? files[0].name : `${files.length} 份可持续报告`;
    elements.progressMessage.textContent =
      files.length > 1
        ? "全部报告抽取完成，正在合并多年度证据并建立跨年度关联…"
        : "文本抽取完成，正在本地识别气候要素…";

    const combinedPayload =
      payloads.length === 1 ? payloads[0] : combineExtractions(payloads);
    combinedPayload.analysis =
      payloads.length === 1
        ? analyzeDocument(payloads[0], { multi_document: false })
        : analyzeDocuments(payloads, { multi_document: true });
    combinedPayload.analysis.analysis_engine = "rule_preview";
    state.analysisMode = "rule";

    if (isAiReviewEnabled()) {
      elements.progressMessage.textContent =
        "规则候选已生成，正在调用 AI 进行语义复核…";
      try {
        await enhanceAnalysisWithAi(combinedPayload.analysis);
        combinedPayload.analysis.analysis_engine = "rule_plus_ai";
        combinedPayload.analysis.ai_review = {
          enabled: true,
          model: state.aiSettings.model,
          reviewed_at: new Date().toISOString()
        };
        state.analysisMode = "ai_enhanced";
      } catch (aiError) {
        combinedPayload.analysis.ai_review = {
          enabled: false,
          error: aiError.message || "AI 语义复核失败",
          reviewed_at: new Date().toISOString()
        };
        combinedPayload.analysis.analysis_engine = "rule_preview";
        state.analysisMode = "rule_fallback";
        showToast("AI 语义复核失败，已自动回退到规则分析");
      }
    }
    commitExtraction(combinedPayload);
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
    renderFileQueue();
  }
}

function combineExtractions(payloads) {
  const documentCount = payloads.length;
  const pages = payloads.flatMap((payload, documentIndex) =>
    (payload.pages || []).map((page) => ({
      ...page,
      document_index: documentIndex,
      document_name: payload.file?.name || `报告 ${documentIndex + 1}`
    }))
  );
  const removedLines = payloads.flatMap((payload, documentIndex) =>
    (payload.debug?.removed_repeated_lines || []).map((entry) => ({
      ...entry,
      document_name:
        payload.file?.name || `报告 ${documentIndex + 1}`
    }))
  );
  const warnings = payloads.flatMap((payload, documentIndex) =>
    (payload.debug?.warnings || []).map(
      (warning) =>
        `${payload.file?.name || `报告 ${documentIndex + 1}`}：${warning}`
    )
  );
  const totalBytes = payloads.reduce(
    (total, payload) => total + (payload.file?.size_bytes || 0),
    0
  );

  return {
    ok: true,
    file: {
      name: `${documentCount} 份可持续报告`,
      size_bytes: totalBytes
    },
    stats: {
      page_count: payloads.reduce(
        (total, payload) => total + (payload.stats?.page_count || 0),
        0
      ),
      empty_page_count: payloads.reduce(
        (total, payload) => total + (payload.stats?.empty_page_count || 0),
        0
      ),
      text_item_count: payloads.reduce(
        (total, payload) => total + (payload.stats?.text_item_count || 0),
        0
      ),
      raw_character_count: payloads.reduce(
        (total, payload) => total + (payload.stats?.raw_character_count || 0),
        0
      ),
      cleaned_character_count: payloads.reduce(
        (total, payload) =>
          total + (payload.stats?.cleaned_character_count || 0),
        0
      ),
      removed_line_count: payloads.reduce(
        (total, payload) => total + (payload.stats?.removed_line_count || 0),
        0
      ),
      elapsed_ms: payloads.reduce(
        (total, payload) => total + (payload.stats?.elapsed_ms || 0),
        0
      ),
      document_count: documentCount
    },
    extracted_text: payloads
      .map(
        (payload, index) =>
          `【报告 ${index + 1}：${payload.file?.name || `报告 ${index + 1}`}】\n${
            payload.extracted_text || ""
          }`
      )
      .join("\n\n"),
    cleaned_text: payloads
      .map(
        (payload, index) =>
          `【报告 ${index + 1}：${payload.file?.name || `报告 ${index + 1}`}】\n${
            payload.cleaned_text || ""
          }`
      )
      .join("\n\n"),
    pages,
    documents: payloads.map((payload, index) => ({
      index,
      name: payload.file?.name || `报告 ${index + 1}`,
      page_count: payload.stats?.page_count || 0,
      cleaned_character_count:
        payload.stats?.cleaned_character_count || 0,
      elapsed_ms: payload.stats?.elapsed_ms || 0
    })),
    debug: {
      engine: "PDF.js 多文档浏览器本地抽取",
      removed_repeated_lines: removedLines,
      warnings
    }
  };
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
  const documentCount =
    analysis.report_context?.document_count ||
    payload.stats?.document_count ||
    1;
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
      `已分析 ${documentCount} 份报告、共抽取 ${payload.stats.page_count} 页，但未找到满足规则的气候要素。请检查下方文本；扫描版 PDF 还需 OCR。`;
    setProgressStep("recognize", "complete");
    renderInsightPanel(analysis);
    clearElementSections(
      "未识别到气候要素",
      "请确认报告是否包含可抽取的文字层，并检查原文是否明确写出年份、指标或已实施措施。"
    );
    updateSummary({ commitments: 0, actions: 0, performances: 0, breakpoints: 0 });
    showToast("文本抽取完成，但未识别到三类气候要素");
  } else {
    elements.dataModeBadge.textContent =
      state.analysisMode === "ai_enhanced"
        ? documentCount > 1
          ? `AI 复核 · ${documentCount} 份`
          : "AI 语义复核"
        : documentCount > 1
          ? `合并分析 · ${documentCount} 份`
          : "规则分析";
    elements.analysisStatusLabel.textContent =
      state.analysisMode === "ai_enhanced"
        ? "分析完成 · AI 语义复核已附加"
        : state.analysisMode === "rule_fallback"
          ? "分析完成 · AI 复核失败，已回退规则"
        : documentCount > 1
          ? `分析完成 · 已合并 ${documentCount} 份报告`
          : "分析完成 · 已生成证据链";
    elements.progressMessage.textContent =
      counts.commitments === 0
        ? `已分析 ${documentCount} 份报告、共 ${payload.stats.page_count} 页：未识别到“量化指标 + 截止年份”的有效承诺；另检出 ${counts.actions} 条行动和 ${counts.performances} 项绩效候选。该结果不能解释为企业没有目标，需人工复核。`
        : `已分析 ${documentCount} 份报告、共 ${payload.stats.page_count} 页：${counts.commitments} 条承诺、${counts.actions} 条行动、${counts.performances} 项绩效。`;
    setProgressStep("recognize", "complete");
    renderAnalysis(analysis);
    showToast(
      `${documentCount} 份报告分析完成：识别 ${
        counts.commitments + counts.actions + counts.performances
      } 条要素`
    );
  }

  elements.summaryFootnoteText.textContent =
    state.analysisMode === "ai_enhanced"
      ? `当前结果由规则候选与 AI 语义复核共同生成；AI 建议不会自动替代人工结论，分类、归并与断点仍需复核。`
      : state.analysisMode === "rule_fallback"
        ? `AI 语义复核未完成，当前已自动回退到本地规则结果。失败原因：${
            analysis.ai_review?.error || "接口不可用"
          }`
      : documentCount > 1
        ? `当前结果合并了 ${documentCount} 份本地分析报告；跨年度关联由报告年份和语义相似度生成，分类、归并与断点均需人工复核。`
        : "当前结果由本地规则分析器生成，用于检查页面和证据链流程；分类、关联和断点均需人工复核。";
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
  const entries = [
    [stats.page_count, "PDF 页数"],
    [formatInteger(stats.cleaned_character_count), "清洗后字符"],
    [formatInteger(stats.text_item_count), "文本片段"],
    [stats.removed_line_count, "剔除重复行"],
    [prepareElapsedTime(stats.elapsed_ms), "抽取耗时"]
  ];
  if (stats.document_count > 1) {
    entries.unshift([stats.document_count, "报告份数"]);
  }

  elements.extractionStats.innerHTML = entries
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
        `<li>${entry.document_name ? `${escapeHtml(entry.document_name)} · ` : ""}第 ${
          entry.page
        } 页 · ${escapeHtml(entry.reason)}：${escapeHtml(entry.line)}</li>`
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
        .map(
          (page) =>
            `【${
              page.document_name ? `${page.document_name} · ` : ""
            }第 ${page.page_number} 页】\n${page.text}`
        )
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
  const withDocumentPageLabels = safeText.replace(
    /【([^】\n]{1,180}? · 第\s*\d+\s*页)】/g,
    '<span class="page-label">$1</span>'
  );
  const withPageLabels = withDocumentPageLabels.replace(
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
  renderTriage(analysis);
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
  const breakpointCounts = { C: 0, A: 0, P: 0 };
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
      <small>C · 承诺无跟进</small>
      <strong>${padCount(breakpointCounts.C)}</strong>
      <p>需跨后续年度报告持续确认</p>
    </article>
    <article class="logic-result-card">
      <small>A / P · 证据链断裂</small>
      <strong>${padCount(breakpointCounts.A + breakpointCounts.P)}</strong>
      <p>A ${breakpointCounts.A} 条行动缺结果，P ${breakpointCounts.P} 条绩效缺支撑</p>
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
    C: chains.filter((chain) => chain.type === "C").length,
    A: chains.filter((chain) => chain.type === "A").length,
    P: chains.filter((chain) => chain.type === "P").length
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
        <div><dt>复核状态</dt><dd>${reviewStatusMeta(element.review_status).label}</dd></div>
        <div><dt>链路判定</dt><dd>${escapeHtml(chainStatusText)}</dd></div>
      </dl>
      ${reviewTools(element.id, element.review_status, {
        canOpenSource: state.sourceFiles.length > 0
      })}
      ${aiReviewNote(element)}
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
          ${aiReviewNote(commitment)}
          ${reviewTools(commitment.id, commitment.review_status, {
            canOpenSource: state.sourceFiles.length > 0
          })}
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
              <span class="outline-badge">${reviewStatusMeta(action.review_status).label}</span>
            </div>
            <h3>${escapeHtml(action.content)}</h3>
            <p>原文定位：p.${escapeHtml(String(action.page))} · 规则匹配度 ${formatPercent(
              action.confidence
            )}</p>
            ${aiReviewNote(action)}
          </div>
          ${reviewTools(action.id, action.review_status, {
            canOpenSource: state.sourceFiles.length > 0
          })}
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
          ${aiReviewNote(performance)}
          <div class="performance-footer">
            <span>${escapeHtml(String(performance.report_year))} · p.${escapeHtml(
              String(performance.page)
            )}</span>
            <span class="link-chip">${escapeHtml(
              performance.commitment_id || "无归属"
            )}</span>
          </div>
          ${reviewTools(performance.id, performance.review_status, {
            canOpenSource: state.sourceFiles.length > 0
          })}
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
    C: "承诺无跟进",
    A: "行动缺结果",
    P: "绩效缺支撑"
  };

  elements.breakpointList.innerHTML = breakpoints
    .map(
      (breakpoint) => `
        <article class="breakpoint-card breakpoint-${escapeHtml(
          breakpoint.type.toLowerCase()
        )}" data-evidence-id="${escapeHtml(breakpoint.id)}">
          <div class="breakpoint-code">${escapeHtml(breakpoint.type)}</div>
          <div class="breakpoint-content">
            <div class="breakpoint-top">
              <span class="element-id">${escapeHtml(breakpoint.id)} · ${
                labels[breakpoint.type] || "证据断点"
              }</span>
              <span class="status-pill status-review">${reviewStatusMeta(
                breakpoint.review_status
              ).label}</span>
            </div>
            <h3>${escapeHtml(breakpoint.title)}</h3>
            <p>${escapeHtml(breakpoint.description)}</p>
            ${aiReviewNote(breakpoint)}
          </div>
          <div class="breakpoint-proof">
            <small>${breakpoint.commitment_id ? `关联 ${escapeHtml(breakpoint.commitment_id)} · ` : ""}缺失证据</small>
            <div class="missing-tags">
              ${breakpoint.missing
                .map((item) => `<span>${escapeHtml(item)}</span>`)
                .join("")}
            </div>
          </div>
          ${reviewTools(breakpoint.id, breakpoint.review_status, {
            canOpenSource: state.sourceFiles.length > 0
          })}
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
  const normalizedStatus = normalizeChainStatus(chainStatus);
  if (normalizedStatus === "complete") {
    return { className: "status-complete", label: "链路完整" };
  }
  if (normalizedStatus === "commitment_gap") {
    return { className: "status-warning", label: "C · 承诺无跟进" };
  }
  if (normalizedStatus === "performance_gap") {
    return { className: "status-warning", label: "P · 绩效缺支撑" };
  }
  return { className: "status-warning", label: "A · 行动缺结果" };
}

function normalizeAnalysis(input) {
  if (!input) {
    return {
      elements: [],
      breakpoints: []
    };
  }

  const usesLegacyBreakpointTypes =
    input.breakpoint_scheme !== "CAP" &&
    (input.schema_version === "1.0" ||
      (input.breakpoints || []).some((breakpoint) =>
        ["A", "B", "C"].includes(breakpoint.type)
      ));
  const legacyTypeMap = { A: "C", B: "A", C: "P" };
  const elements = (input.elements || []).map((element) => {
    if (element.element_type === "commitment") {
      const target = element.normalized_target || {};
      return {
        ...element,
        review_status: element.review_status || "待核",
        metric: element.metric || target.metric || "气候相关指标",
        target_value: element.target_value || target.target_value || "原文目标",
        due_year: element.due_year || target.due_year || "待确认",
        baseline_year:
          element.baseline_year || target.baseline_year || "未单列",
        linked_actions: element.linked_actions || [],
        linked_performances: element.linked_performances || [],
        chain_status: normalizeChainStatus(
          element.chain_status || "needs_review"
        )
      };
    }

    if (element.element_type === "action") {
      return {
        ...element,
        review_status: element.review_status || "待核",
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
      review_status: element.review_status || "待核",
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
    schema_version: "1.1",
    breakpoint_scheme: "CAP",
    elements,
    breakpoints: (input.breakpoints || []).map((breakpoint) => ({
      ...breakpoint,
      type: usesLegacyBreakpointTypes
        ? legacyTypeMap[breakpoint.type] || breakpoint.type
        : breakpoint.type,
      review_status: breakpoint.review_status || "待核",
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
  state.pendingFiles = [];
  state.sourceFiles = [];
  clearPdfDocumentCache();
  state.analysisMode = "sample";
  renderFileQueue();
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
