# 书斋 Super Notes

以学习资料为依据、以主动输出为核心、支持自定义流程的学习系统。

- **需求依据**：[需求分析与实施路线图 v0.1](./需求分析与实施路线图-v0.1.md)
- **云服务与 AI 接口方案**：[云服务、跨端同步与 AI API 设置方案 v0.1](./云服务与跨端同步及AI接口方案-v0.1.md)
- **场景原型**：[以数学来举例](./以数学来举例.md)、[我想象中的样子是什么样的](./我想象中的样子是什么样的.md)
- **实施计划**：[实施计划书 v1.0](./实施计划书-v1.0.md)
- **开发进度**：[开发进度.md](./开发进度.md)

## 当前状态

第一版为 **GitHub Pages 纯静态站**：数据存在浏览器本地（IndexedDB），无需服务器即可使用。

**线上地址**：https://kankna.github.io/super-notes/

已实现（里程碑 M0–M9 全部完成）：

- **书架**：可视化书盒、封面色与样式自定义、悬停详情、悬停时其余书盒缩小、拖拽排序、拖入回收站并可撤销、搜索、减少动效
- **项目画布**：React Flow 图形化画布、章节/单元卡片、实线箭头=学习顺序 / 虚线=知识关联、疑点与待复测角标、"继续学习"定位
- **学习工作台**：三栏布局、七步流程（接收资料 → 先复习 → 弄懂它 → 去实践 → 说感悟 → 先探路 → 日后复测）、秒级计时、番茄钟、三态标记、疑点清单、费曼自述、检测题、预习清单、复测队列
- **AI**：OpenAI 兼容客户端（DeepSeek 等任意厂商）、五类任务分离、提示词版本化、输出字段与 LaTeX 校验、Mock 模式兜底、能力映射、用量统计
- **数据**：Markdown + LaTeX、原图对照校对、导出 ZIP（notes/assets/records/project.json/manifest.json）、导入恢复、离线队列与幂等键、冲突保留双方

## 本地运行

```bash
cd app
npm install
npm run dev      # 本地开发
npm test         # 27 个自动化用例（vitest + Testing Library）
node ../tools/e2e-chrome.mjs http://localhost:4173/   # 真实 Chrome 跑完整流程
```

## 部署

推送 `main` 分支后由 `.github/workflows/deploy.yml` 自动构建并发布到 GitHub Pages。

> 本机 `github.com:443` 被网络屏蔽，`git push` 走不通，改用 `node tools/push-via-api.mjs`（走 api.github.com 的 Git Data API，仓库内容与普通 push 一致）。
