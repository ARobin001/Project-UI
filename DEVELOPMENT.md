# 明德AI 中文界面原型

这是基于产品报告制作的界面设计与交互演示。没有接入真实组织权限、文件处理、AI生成或知识检索服务。所有示例资料及证据均为演示数据。

## 开发与构建

使用现有隔离工作区，不需要创建 Git worktree。

在 `/workspace/Project-UI` 中运行：

```bash
npm ci --cache /workspace/.npm-cache --no-audit --no-fund
npm run dev -- --port 5173
```

生产构建：

```bash
npm run build
```

需要 Node.js 20.19+ 或 22.12+，当前云环境为 Node.js 24。运行时无需密钥。安装依赖使用 `registry.npmjs.org`，保留 TLS 与锁文件完整性检查。

## 页面

- `/knowledge`：知识中心、类型筛选、搜索、收藏、新建知识库。
- `/knowledge/spaces/org`：机构知识库、分类、资料筛选、双状态、批量整理。
- `/knowledge/spaces/org/assets/education-v3`：资料详情，支持深链接与六个页签。
- `/knowledge/spaces/org/organize`：AI整理中心。
- `/chat?asset=education-v3`：单份资料范围的示例问答与来源定位。

新建知识库、收藏和添加的示例资料使用浏览器本地存储。示例整理任务只在当前标签页内模拟；关闭或刷新页面不会保留运行进程。添加资料仅生成本地记录，不向服务器发送文件，也不会自动标为可检索。这些记录不可提问，原文显示明确空态。下载生成明确标记的示例文本，不代表原始文件。

证据提取方式和核验状态独立。只有包含核验人和核验时间的记录可以显示“已核验”。现有示例没有完整核验记录，统一显示“待核验”。历史规则的未知页码不生成猜测位置或高亮；可靠位置的示例支持证据与原文分栏。未实现的审核、发布、版本比较与回滚没有产品入口。

浏览器验证覆盖：知识库类型与关系组合筛选、排序、收藏、资料双状态筛选、独立批量选择、资料详情深链接、证据定位、提问范围、引用返回对话、滚动与焦点恢复、搜索空态和窄屏布局。原型通过这些验证不代表真实后端能力已完成。

云环境已提供 Python Playwright 和 Chromium。开发服务运行后执行：

```bash
python3 scripts/check-ui.py --base-url http://127.0.0.1:5173
```

脚本使用独立浏览器上下文，不修改示例源数据。其他机器需自行安装这些浏览器验证工具；运行与构建界面仅需 Node.js。

## 图像设计稿

GPT图像模型生成的初版效果图保存在 `designs/knowledge-ui`。新版实际界面截图及状态示例位于 `designs/knowledge-ui/v2`，来自当前可运行原型。视觉与交互规范见 `designs/knowledge-ui/DESIGN-SYSTEM.md`。所有截图和引文仍使用演示数据。
