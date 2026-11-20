import { reconstructTextLines } from "./text-layout.js";

const pdfjsLib = window.pdfjsLib;

if (!pdfjsLib) {
  throw new Error("PDF.js 未加载，请刷新页面后重试。");
}

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "./vendor/pdf.worker.min.js",
  import.meta.url
).href;

export async function extractPdfInBrowser(file, options = {}) {
  const startedAt = performance.now();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjsLib.getDocument({
    data: bytes,
    isEvalSupported: false,
    disableFontFace: true
  });
  const document = await loadingTask.promise;
  const pages = [];
  let textItemCount = 0;

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const viewport = page.getViewport({ scale: 1 });
      const lines = reconstructTextLines(content.items, viewport.width);
      textItemCount += content.items.length;
      pages.push({
        page_number: pageNumber,
        text: lines.join("\n").trim(),
        width: Math.round(viewport.width),
        height: Math.round(viewport.height)
      });
      options.onProgress?.({
        current_page: pageNumber,
        total_pages: document.numPages,
        file_name: file.name
      });
      page.cleanup();
    }

    const cleaned = cleanPages(pages);
    const elapsedMs = Math.round(performance.now() - startedAt);
    const cleanedText = cleaned.pages
      .map((page) => `【第 ${page.page_number} 页】\n${page.clean_text}`)
      .join("\n\n");

    return {
      ok: true,
      file: {
        name: file.name,
        size_bytes: file.size
      },
      stats: {
        page_count: pages.length,
        empty_page_count: cleaned.empty_page_count,
        text_item_count: textItemCount,
        raw_character_count: pages.reduce(
          (total, page) => total + page.text.length,
          0
        ),
        cleaned_character_count: cleaned.pages.reduce(
          (total, page) => total + page.clean_text.length,
          0
        ),
        removed_line_count: cleaned.removed_lines.length,
        elapsed_ms: elapsedMs
      },
      extracted_text: pages
        .map((page) => `【第 ${page.page_number} 页】\n${page.text}`)
        .join("\n\n"),
      cleaned_text: cleanedText,
      pages: cleaned.pages,
      debug: {
        engine: "PDF.js 3.11（浏览器本地）",
        removed_repeated_lines: cleaned.removed_lines,
        warnings: cleaned.warnings
      }
    };
  } finally {
    await loadingTask.destroy();
  }
}

function cleanPages(pages) {
  const firstLines = new Map();
  const lastLines = new Map();
  const firstLinePrefixes = new Map();
  const lastLinePrefixes = new Map();

  for (const page of pages) {
    const lines = page.text.split(/\r?\n/).filter(Boolean);
    for (const line of lines.slice(0, 3)) {
      addLineFrequency(firstLines, line);
      addStrippedSuffixFrequency(firstLinePrefixes, line, "suffix");
    }
    for (const line of lines.slice(-3)) {
      addLineFrequency(lastLines, line);
      addStrippedSuffixFrequency(lastLinePrefixes, line, "suffix");
      addStrippedSuffixFrequency(lastLinePrefixes, line, "prefix");
    }
  }

  const threshold = Math.max(3, Math.ceil(pages.length * 0.5));
  const repeatedHeaders = repeatedLineSet(firstLines, threshold);
  const repeatedFooters = repeatedLineSet(lastLines, threshold);
  const repeatedHeaderPrefixes = repeatedLineSet(firstLinePrefixes, threshold);
  const repeatedFooterPrefixes = repeatedLineSet(lastLinePrefixes, threshold);
  const removedLines = [];

  const cleanedPages = pages.map((page) => {
    const lines = page.text.split(/\r?\n/).filter(Boolean);
    const cleanedLines = lines.filter((line, index) => {
      const isTop = index < 3 && repeatedHeaders.has(line);
      const isBottom = index >= lines.length - 3 && repeatedFooters.has(line);
      const isTopWithPageNumber =
        index < 3 &&
        repeatedHeaderPrefixes.has(stripPageNumber(line, "suffix"));
      const isBottomWithPageNumber =
        index >= lines.length - 3 &&
        (repeatedFooterPrefixes.has(stripPageNumber(line, "suffix")) ||
          repeatedFooterPrefixes.has(stripPageNumber(line, "prefix")));
      const isPageNumber =
        (index < 2 || index >= lines.length - 2) &&
        /^(第?\s*\d{1,4}\s*页?|page\s*\d{1,4}|\d{1,4}\s*\/\s*\d{1,4})$/i.test(
          line.trim()
        );

      if (
        isTop ||
        isBottom ||
        isTopWithPageNumber ||
        isBottomWithPageNumber ||
        isPageNumber
      ) {
        removedLines.push({
          page: page.page_number,
          line,
          reason: isPageNumber
            ? "页码"
            : isTop || isTopWithPageNumber
              ? "重复页眉"
              : "重复页脚"
        });
        return false;
      }
      return true;
    });

    return {
      ...page,
      clean_text: cleanedLines.join("\n").trim()
    };
  });

  const emptyPageCount = cleanedPages.filter(
    (page) => page.clean_text.length === 0
  ).length;
  const warnings = [];
  if (emptyPageCount > 0) {
    warnings.push(
      `${emptyPageCount} 页未抽取到正文文本，可能为扫描页或图表页。`
    );
  }
  if (pages.length > 0 && cleanedPages.every((page) => !page.clean_text)) {
    warnings.push("全文未抽取到正文，建议后续接入 OCR。");
  }

  return {
    pages: cleanedPages,
    removed_lines: removedLines,
    empty_page_count: emptyPageCount,
    warnings
  };
}

function repeatedLineSet(frequencies, threshold) {
  return new Set(
    [...frequencies.entries()]
      .filter(([line, count]) => count >= threshold && line.length <= 60)
      .map(([line]) => line)
  );
}

function addLineFrequency(frequencies, rawLine) {
  const line = rawLine.trim().replace(/\s+/g, " ");
  if (line) {
    frequencies.set(line, (frequencies.get(line) || 0) + 1);
  }
}

function addStrippedSuffixFrequency(frequencies, rawLine, mode) {
  const line = rawLine.trim().replace(/\s+/g, " ");
  const stripped = stripPageNumber(line, mode);
  if (stripped && stripped !== line && stripped.length >= 2) {
    frequencies.set(stripped, (frequencies.get(stripped) || 0) + 1);
  }
}

function stripPageNumber(line, mode) {
  if (mode === "prefix") {
    return line.replace(/^(page\s*)?\d{1,4}\s*[|·-]?\s+/i, "").trim();
  }
  return line
    .replace(/\s*[|·-]?\s*(第?\s*\d{1,4}\s*页?|page\s*\d{1,4})$/i, "")
    .trim();
}
