<p align="center">
  <img src="public/owl-logo.png" alt="Owl logo" width="88" />
</p>

<h1 align="center">Owl</h1>

<p align="center">
  <a href="README.md">English</a> | <a href="README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <img alt="version" src="https://img.shields.io/badge/version-0.1.0-0f172a" />
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-16-black?logo=nextdotjs" />
  <img alt="React" src="https://img.shields.io/badge/React-19-149eca?logo=react&logoColor=white" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-6-3178c6?logo=typescript&logoColor=white" />
  <img alt="LangGraph" src="https://img.shields.io/badge/LangGraph-ready-1f6feb" />
  <img alt="local first" src="https://img.shields.io/badge/local--first-MVP-16a34a" />
</p>

Owl 是一个本地运行的面试分析工作台。它把 JD、候选人简历和补充材料转化为可验证的面试准备材料，帮助面试官快速完成简历阅读、证据定位、项目深挖、追问设计和详细报告沉淀。

**让简历分析，变成高质量面试。**

![Owl 产品截图](public/03-candidate-a-question-drawer.png)

## Demo

演示视频展示了从 JD 工作区、候选人列表、简历标注、面试问题抽屉到详细报告的核心流程。

![Owl 产品演示](public/owl-demo.gif)

## 核心能力

- 管理一个岗位下的 JD 和候选人材料。
- 自动解析简历，并支持中英文审阅。
- 在简历原文上标注关键证据。
- 生成面试主问题、追问和好回答参考。
- 汇总 JD 匹配、风险点和问题库，形成详细报告。
- 本地运行，材料和分析结果保存在自己的电脑上。

## 产品工作流

```text
创建或进入 JD 工作区
  ↓
上传 / 粘贴 JD
  ↓
添加候选人材料
  ↓
解析并确认文本
  ↓
执行分析任务
  ↓
查看简历标注和面试问题
  ↓
进入详细报告
```

## 本地启动

先安装依赖：

```bash
bun install
# npm install
# pnpm install
```

配置模型环境变量：

```bash
cp .env.example .env.local
```

然后在 `.env.local` 中填写 `JD_ANALYSIS_API_KEY`。默认配置使用 DeepSeek，可以在 [DeepSeek API Keys](https://platform.deepseek.com/api_keys) 创建 API Key；也可以按 `.env.example` 中的 OpenRouter 示例切换到其他 OpenAI-compatible 供应商。

启动开发服务：

```bash
bun dev
# npm run dev
# pnpm dev
```

打开浏览器访问：

```text
http://localhost:3000
```

## 技术栈

- Next.js App Router
- React
- TypeScript
- LangGraph / LangChain Core
- pdfjs-dist
- mammoth
- zod

分析流程被拆成多个可恢复节点，包括 JD 分析、简历语言识别、简历版式提取、翻译审阅、证据标注、问题树生成和报告数据生成。

## 项目结构

```text
app/                         Next.js App Router 页面和 API
components/                  产品 UI 组件
lib/analysis/                LangGraph 分析流程、节点和 schema
lib/extraction/              PDF / DOCX / 文本解析
lib/persistence/             本地数据读写
lib/tasks/                   后台分析任务状态
lib/report/                  报告数据组装
docs/                        PRD 和技术文档
public/                      Logo、截图和演示视频
```

## 相关文档

- [Owl PRD](docs/Owl_PRD.md)
- [Owl 技术文档](docs/Owl_技术文档.md)
