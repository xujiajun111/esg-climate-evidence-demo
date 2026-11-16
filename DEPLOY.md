# 公网部署与朋友访问

## 推荐方案

使用 **GitHub + Render**：

```text
GitHub 保存代码
      ↓ 自动构建
Render 运行 Node 网站
      ↓
朋友打开 *.onrender.com 地址
```

GitHub Pages 不能直接承载当前 Demo，因为 PDF 上传、文本抽取和规则分析都需要 Node 后端。GitHub 是代码仓库和自动部署触发器，不是运行这个网站的地方。

## 一、把代码放进 GitHub

在 `esg-evidence-demo` 目录执行：

```powershell
git init
git add .
git config user.name "你的名字"
git config user.email "你的邮箱"
git commit -m "Prepare ESG evidence demo for deployment"
git branch -M main
git remote add origin https://github.com/你的用户名/你的仓库名.git
git push -u origin main
```

`node_modules` 已通过 `.gitignore` 排除，不需要上传。

如果不想使用命令行，也可以在 GitHub Desktop 中选择 **Add existing repository**，选中 `esg-evidence-demo` 文件夹，然后点击 **Publish repository**。

## 二、在 Render 部署

1. 注册或登录 [Render](https://render.com/)。
2. 选择 **New > Blueprint**。
3. 连接刚才创建的 GitHub 仓库。
4. Render 会读取根目录的 `render.yaml`，确认后创建服务。
5. 构建完成后，Render 会提供一个类似 `https://esg-climate-evidence-demo.onrender.com` 的地址。
6. 将地址发给朋友，手机和电脑浏览器均可访问。

部署后可用以下地址检查服务：

```text
https://你的服务地址/api/health
```

## 三、免费版和真正常驻的区别

Render 免费 Web Service 闲置约 15 分钟后会休眠。朋友再次打开时，需要等待约 30 到 90 秒冷启动。

真正 24 小时不休眠的选项：

- Render 付费实例，最省事；
- Railway、Fly.io 等支持常驻的云平台；
- 阿里云、腾讯云等国内云服务器，访问速度更稳定，但有月费和运维成本。

“让朋友试用”阶段建议先用 Render 免费版。确认界面、上传和规则分析稳定后，再升级常驻实例或绑定自己的域名。

## 四、当前部署的安全边界

- PDF 只保存在服务内存中，分析完即释放，不落盘；
- 单个文件最大 30 MB；
- 每个 IP 在 10 分钟内最多上传 20 次；
- 配置了基础安全响应头；
- Demo 没有账号登录，拿到链接的人都能使用；
- 不要上传包含未公开财务、客户或个人信息且无权公开的报告。

如果之后需要仅限项目成员访问，应增加访问码、账号登录或私有部署，不要直接公开链接。

## 五、后续更新

代码推送到 GitHub 的 `main` 分支后，Render 会自动重新部署。日常流程：

```powershell
git add .
git commit -m "Update demo"
git push
```

如果服务无法打开，依次检查：

1. `/api/health` 是否返回 `ok: true`；
2. Render 部署日志是否有错误；
3. GitHub 仓库是否缺少 `package-lock.json`；
4. 服务是否仍在免费版的冷启动过程中。
