import express from "express";
import multer from "multer";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { analyzeDocument } from "./public/analyzer.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "0.0.0.0";
const uploadWindowMs = 10 * 60 * 1000;
const uploadsPerWindow = Number(process.env.UPLOAD_LIMIT || 20);
const uploadBuckets = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of uploadBuckets.entries()) {
    if (bucket.resetAt <= now) {
      uploadBuckets.delete(key);
    }
  }
}, 15 * 60 * 1000).unref();

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use((request, response, next) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()"
  );
  response.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
  );
  next();
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 30 * 1024 * 1024,
    files: 1
  },
  fileFilter: (_request, file, callback) => {
    const isPdf =
      file.mimetype === "application/pdf" ||
      path.extname(file.originalname).toLowerCase() === ".pdf";
    callback(isPdf ? null : new Error("仅支持 PDF 文件"), isPdf);
  }
});

app.use(express.json({ limit: "2mb" }));
app.use(
  express.static(path.join(__dirname, "public"), {
    etag: true,
    maxAge: process.env.NODE_ENV === "production" ? "1h" : 0
  })
);
app.use("/docs", express.static(path.join(__dirname, "docs")));

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    service: "esg-evidence-demo",
    schema_version: "1.0",
    extraction_engine: "PDF.js",
    analysis_engine: "rule_preview",
    uptime_seconds: Math.round(process.uptime())
  });
});

app.get("/api/schema", (_request, response) => {
  response.sendFile(path.join(__dirname, "docs", "ai-output.schema.json"));
});

app.get("/api/example-output", (_request, response) => {
  response.sendFile(path.join(__dirname, "docs", "ai-output.example.json"));
});

app.post(
  "/api/extract",
  enforceUploadRateLimit,
  upload.single("pdf"),
  async (request, response) => {
  if (!request.file) {
    return response.status(400).json({
      ok: false,
      error: "请选择需要抽取的 PDF 文件。"
    });
  }

  const startedAt = performance.now();
  let document;
  let loadingTask;

  try {
    const bytes = new Uint8Array(request.file.buffer);
    loadingTask = getDocument({
      data: bytes,
      useWorkerFetch: false,
      isEvalSupported: false,
      disableFontFace: true,
      verbosity: 0
    });
    document = await loadingTask.promise;

    const pages = [];
    let textItemCount = 0;

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const lines = reconstructLines(content.items);
      textItemCount += content.items.length;
      pages.push({
        page_number: pageNumber,
        text: lines.join("\n").trim(),
        width: Math.round(page.getViewport({ scale: 1 }).width),
        height: Math.round(page.getViewport({ scale: 1 }).height)
      });
      page.cleanup();
    }

    const cleaned = cleanPages(pages);
    const elapsedMs = Math.round(performance.now() - startedAt);
    const cleanedText = cleaned.pages
      .map((page) => `【第 ${page.page_number} 页】\n${page.clean_text}`)
      .join("\n\n");
    const extraction = {
      file: {
        name: request.file.originalname,
        size_bytes: request.file.size
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
        engine: "PDF.js",
        removed_repeated_lines: cleaned.removed_lines,
        warnings: cleaned.warnings
      }
    };
    const analysis = analyzeDocument(extraction, {
      multi_document: false
    });

    return response.json({
      ok: true,
      ...extraction,
      analysis
    });
  } catch (error) {
    console.error("PDF extraction failed:", error);
    return response.status(422).json({
      ok: false,
      error:
        error?.name === "PasswordException"
          ? "该 PDF 已加密，当前 Demo 暂不支持解密。"
          : "PDF 文本抽取失败，请检查文件是否损坏或由扫描图片构成。",
      detail: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  } finally {
    if (loadingTask) {
      try {
        await loadingTask.destroy();
      } catch (cleanupError) {
        console.warn("PDF cleanup warning:", cleanupError.message);
      }
    }
  }
  }
);

app.use((error, _request, response, _next) => {
  if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
    return response.status(413).json({
      ok: false,
      error: "文件超过 30 MB，请上传体积更小的报告。"
    });
  }

  return response.status(400).json({
    ok: false,
    error: error.message || "请求处理失败。"
  });
});

const server = app.listen(port, host, () => {
  console.log(`气候证据链 Demo 已启动：http://${host}:${port}`);
});

server.requestTimeout = 120000;
server.headersTimeout = 125000;

function shutdown(signal) {
  console.log(`收到 ${signal}，正在关闭服务…`);
  server.close((error) => {
    if (error) {
      console.error("服务关闭失败：", error);
      process.exit(1);
    }
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

function enforceUploadRateLimit(request, response, next) {
  const now = Date.now();
  const key = request.ip || request.socket.remoteAddress || "unknown";
  const existing = uploadBuckets.get(key);
  const bucket =
    !existing || existing.resetAt <= now
      ? { count: 0, resetAt: now + uploadWindowMs }
      : existing;

  if (bucket.count >= uploadsPerWindow) {
    const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
    response.setHeader("Retry-After", String(retryAfter));
    return response.status(429).json({
      ok: false,
      error: `上传过于频繁，请 ${Math.ceil(retryAfter / 60)} 分钟后再试。`
    });
  }

  bucket.count += 1;
  uploadBuckets.set(key, bucket);
  next();
}

function reconstructLines(items) {
  const itemLines = [];

  for (const item of items) {
    if (typeof item.str !== "string" || !item.transform) {
      continue;
    }

    const x = item.transform[4];
    const y = item.transform[5];
    const fontSize = Math.hypot(item.transform[2], item.transform[3]) || 10;
    let line = itemLines.find((candidate) => Math.abs(candidate.y - y) < 2.5);

    if (!line) {
      line = { y, items: [] };
      itemLines.push(line);
    }

    line.items.push({
      x,
      width: Number(item.width) || 0,
      text: item.str,
      fontSize
    });
  }

  const lines = itemLines
    .sort((first, second) => second.y - first.y)
    .map((line) => joinLineItems(line.items))
    .map((line) => normalizeInlineSpacing(line))
    .filter(Boolean);

  const mergedLines = [];
  for (const line of lines) {
    const previousIndex = mergedLines.length - 1;
    const isStandalonePunctuation =
      /^[，。；：、！？）】》]+$/.test(line) && previousIndex >= 0;

    if (isStandalonePunctuation) {
      mergedLines[previousIndex] += line;
    } else {
      mergedLines.push(line);
    }
  }

  return mergedLines;
}

function joinLineItems(items) {
  const sorted = [...items].sort((first, second) => first.x - second.x);
  let output = "";
  let endX = null;
  let previousCharacter = "";
  let lastFontSize = 10;

  for (const item of sorted) {
    const firstCharacter = item.text.trim().charAt(0);
    const gap = endX === null ? 0 : item.x - endX;
    const looksLikeWordGap =
      gap > Math.max(2.5, Math.min(lastFontSize * 0.55, 7)) &&
      /[A-Za-z0-9]$/.test(previousCharacter) &&
      /^[A-Za-z0-9(]/.test(firstCharacter);

    if (output && looksLikeWordGap) {
      output += " ";
    }

    output += item.text;
    endX = item.x + item.width;
    const visibleCharacters = item.text.replace(/\s/g, "");
    if (visibleCharacters) {
      previousCharacter = visibleCharacters.at(-1);
    }
    lastFontSize = item.fontSize;
  }

  return output;
}

function normalizeInlineSpacing(line) {
  return line
    .replace(/\u0000/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([，。；：、！？）】》])/g, "$1")
    .replace(/([（【《])\s+/g, "$1")
    .trim();
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
  const repeatedHeaders = new Set(
    [...firstLines.entries()]
      .filter(([line, count]) => count >= threshold && line.length <= 60)
      .map(([line]) => line)
  );
  const repeatedFooters = new Set(
    [...lastLines.entries()]
      .filter(([line, count]) => count >= threshold && line.length <= 60)
      .map(([line]) => line)
  );
  const repeatedHeaderPrefixes = new Set(
    [...firstLinePrefixes.entries()]
      .filter(([line, count]) => count >= threshold && line.length <= 60)
      .map(([line]) => line)
  );
  const repeatedFooterPrefixes = new Set(
    [...lastLinePrefixes.entries()]
      .filter(([line, count]) => count >= threshold && line.length <= 60)
      .map(([line]) => line)
  );

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

function addLineFrequency(frequencies, rawLine) {
  const line = rawLine.trim().replace(/\s+/g, " ");
  if (!line) {
    return;
  }
  frequencies.set(line, (frequencies.get(line) || 0) + 1);
}

function addStrippedSuffixFrequency(frequencies, rawLine, mode) {
  const line = rawLine.trim().replace(/\s+/g, " ");
  const stripped = stripPageNumber(line, mode);
  if (!stripped || stripped === line || stripped.length < 2) {
    return;
  }
  frequencies.set(stripped, (frequencies.get(stripped) || 0) + 1);
}

function stripPageNumber(line, mode) {
  if (mode === "prefix") {
    return line.replace(/^(page\s*)?\d{1,4}\s*[|·-]?\s+/i, "").trim();
  }
  return line.replace(/\s*[|·-]?\s*(第?\s*\d{1,4}\s*页?|page\s*\d{1,4})$/i, "").trim();
}
