# 免费部署：GitHub Pages

当前 Demo 已改为纯浏览器静态版：PDF 文本抽取与规则分析都在朋友的浏览器中完成，不需要服务器、数据库或支付信息。

## 访问地址

部署成功后地址为：

```text
https://xujiajun111.github.io/esg-climate-evidence-demo/
```

朋友不需要 GitHub 账号，也不需要安装软件或运行本地服务，直接打开该网址即可。

## 自动部署原理

```text
代码推送到 GitHub main 分支
        ↓
GitHub Actions 构建 dist/
        ↓
自动发布到 GitHub Pages
        ↓
朋友打开公开网址
```

工作流文件：`.github/workflows/pages.yml`

## 首次启用

仓库所有者只需完成一次：

1. 打开仓库 `Settings > Pages`。
2. 将 Source 设置为 **GitHub Actions**。
3. 在 Actions 页面等待 `Deploy static demo to GitHub Pages` 完成。

也可以在已登录 GitHub CLI 的电脑执行：

```powershell
gh api --method POST repos/xujiajun111/esg-climate-evidence-demo/pages `
  -f build_type=workflow
```

## 更新网站

```powershell
git add .
git commit -m "Update demo"
git push
```

推送后 GitHub Actions 会自动更新网站。

## 重要限制

- GitHub Pages 在国内的访问速度可能不稳定，部分网络可能需要 VPN；
- PDF 只在访问者浏览器中处理，不会上传到服务器；
- 文件上限提高到 200 MB，但超大 PDF 仍受访问者电脑内存和浏览器性能影响；
- 页面第一次打开需要加载约 1.4 MB 的 PDF.js 组件；
- 扫描图片型 PDF 没有文字层，仍需后续接入 OCR；
- 当前识别使用本地规则，不是大模型 API。

如果国内访问不稳定，后续可将同一个 `dist/` 静态包直接部署到国内对象存储或云服务器，无需修改业务代码。
