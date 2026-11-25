# 气候证据链审查 Demo

面向可持续报告的气候“承诺—行动—绩效”证据链审查 Demo。当前版本完成 PDF
文本抽取、本地规则分析、四区证据链展示、原文页码定位、人工复核与审计结果导出，
并提供可选的 OpenAI 兼容 AI 语义复核接口。

## 启动

需要 Node.js 20 或以上版本。

也可以直接双击 `start-demo.bat`。脚本会在缺少依赖时自动安装，并打开浏览器。

```powershell
cd "C:\Users\linxx\Documents\Codex\2026-11-10\z\outputs\esg-evidence-demo"
npm install
npm start
```

浏览器打开 `http://localhost:4173`。

可直接用 `samples/climate-report-sample.pdf` 测试上传。该文件是 3 页合成样例，包含 3 类要素的示例原文以及重复页眉页脚。

## 当前功能

- 拖拽或选择 PDF，浏览器本地分析上限为 200 MB；
- 一次可选择多份年度报告，合并为跨年度证据链并统一编号；
- 多次拖入或选择会追加到同一文件队列，确认份数后统一点击开始分析；
- 使用 PDF.js 逐页抽取文本层；
- 对多栏报告进行坐标感知的阅读顺序重建，减少相邻栏和表格片段粘连；
- 基础清洗页码、重复页眉和重复页脚；
- 查看清洗文本 / 分页原文、字符数、空页和诊断信息；
- 复制或下载抽取后的 TXT；
- 上传后自动识别承诺、行动、绩效，并生成 A/B/C 断点候选；
- 使用证据链图谱按“承诺 → 行动 → 绩效”查看关联关系、完整率和年度分布；
- 支持按完整度、A/B/C 断点和报告年份聚焦证据，点击节点查看原文并联动高亮下方卡片；
- 点击“查看原文”可在页面内渲染 PDF 对应页，并高亮可定位的原句；
- 支持将要素和断点标记为“已确认 / 存疑 / 已排除”；
- 支持导出包含复核状态、来源页码和 AI 建议的 JSON / CSV 审计结果；
- 可在“分析设置”中配置 OpenAI 兼容接口，对规则候选执行 AI 语义复核；
- 新增有限复核时间下的证据任务 0/1 背包优化、基准方案对比、预算敏感性和鲁棒性分析；
- 新增“5 分钟评审演示”引导模式，可自动加载内置 PDF 并逐步展示核心环节；
- 新增 AI 工具使用说明、模型卡和决赛演示脚本；
- 大量真实报告候选会先折叠展示，可手动展开全部行动和绩效；
- 载入演示数据，对比完整案例与断点案例的页面布局；
- 明确区分“演示数据”和“规则分析”，所有结果标记待人工复核；
- 查看固定 AI JSON Schema。

PDF 上传成功后自动运行本地规则分析。规则分析适合演示流程和检查文本抽取质量，不等同于大模型语义识别；结果会标明“规则分析”并保留原文页码。

如果上传后提示“未识别到气候要素”，先检查文本调试台是否有正文。扫描图片型 PDF 没有文字层，后续需要接入 OCR。

## 让朋友公网访问

当前已提供纯浏览器静态版本，PDF 抽取和规则分析都在访问者本地完成。免费部署到 GitHub Pages，不需要服务器或银行卡。

公网地址：

```text
https://xujiajun111.github.io/esg-climate-evidence-demo/
```

详细说明见 [DEPLOY.md](./DEPLOY.md)。GitHub Pages 在国内的访问速度可能不稳定，这是免费静态方案的主要限制。

## 分析准确性与回归测试

当前规则分析器包含 14 个自动化回归案例，覆盖完整链路、A/B/C 断点、
口号排除、未来计划排除、外部政策目标、碳管理行动、同句多标签、表格片段和数值提取。

```powershell
npm run test:analyzer
```

准确率边界与后续优化见 [docs/analysis-quality.md](./docs/analysis-quality.md)。

## AI 语义复核

默认情况下，公网静态版使用浏览器本地规则引擎，不依赖后端或 API Key。
在“分析设置”中可填写 OpenAI 兼容的 Chat Completions 地址、模型与 API Key，
对规则候选执行语义复核：

- AI 只接收候选要素、必要原文片段及页码，不接收完整 PDF；
- AI 建议不会自动替代人工结论，结果仍标记为待复核；
- 请求失败、跨域被拒绝或返回格式错误时，自动回退到规则分析；
- API Key 只保存在当前标签页的 `sessionStorage`，关闭会话后不会保留。

详细说明见 [docs/ai-integration.md](./docs/ai-integration.md)。正式比赛环境建议把
AI 请求放到服务端代理中，避免在浏览器暴露长期密钥。

## 决赛材料

- [AI 工具使用说明](./docs/ai-disclosure.md)
- [证据复核组合优化模型](./docs/review-portfolio-model.md)
- [5 分钟决赛演示脚本](./docs/finals-demo-script.md)

## 目录

```text
esg-evidence-demo/
├─ public/                 前端页面、样式和演示数据渲染
├─ docs/
│  ├─ ai-output.schema.json
│  ├─ ai-output.example.json
│  └─ 罗梦婷对齐说明.md
├─ samples/
│  └─ climate-report-sample.pdf
├─ server.js               PDF 上传、抽取与清洗 API
├─ start-demo.bat          Windows 一键启动
└─ package.json
```

## API

- `GET /api/health`：服务状态；
- `GET /api/schema`：固定 AI 输出 JSON Schema；
- `GET /api/example-output`：示例输出；
- `POST /api/extract`：`multipart/form-data`，文件字段名为 `pdf`；返回抽取文本、清洗结果和规则分析。

## 下一阶段接入点

`public/app.js` 中的 `renderAnalysis(analysis)` 已按数据结构渲染四区。AI 服务返回符合 Schema 的结果后，将结果传给它即可。断点仍应带 `review_status: "待核"`，前端展示为人工复核线索。
