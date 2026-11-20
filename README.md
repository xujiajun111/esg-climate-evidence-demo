# 气候证据链审查 Demo

面向可持续报告的气候“承诺—行动—绩效”证据链审查 Demo。当前版本完成 PDF 文本抽取、本地规则分析和四区证据链展示；大模型 API 尚未接入。

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
- 使用 PDF.js 逐页抽取文本层；
- 对多栏报告进行坐标感知的阅读顺序重建，减少相邻栏和表格片段粘连；
- 基础清洗页码、重复页眉和重复页脚；
- 查看清洗文本 / 分页原文、字符数、空页和诊断信息；
- 复制或下载抽取后的 TXT；
- 上传后自动识别承诺、行动、绩效，并生成 A/B/C 断点候选；
- 使用证据链图谱按“承诺 → 行动 → 绩效”查看关联关系、完整率和年度分布；
- 支持按完整度、A/B/C 断点和报告年份聚焦证据，点击节点查看原文并联动高亮下方卡片；
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

当前规则分析器包含 9 个自动化回归案例，覆盖完整链路、A/B/C 断点、口号排除、未来计划排除、碳管理行动、同句多标签和数值提取。

```powershell
npm run test:analyzer
```

准确率边界与后续优化见 [docs/analysis-quality.md](./docs/analysis-quality.md)。

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
