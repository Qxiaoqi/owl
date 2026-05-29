# Owl 技术文档

## 1. 技术结论

Owl 新版本采用 Next.js localhost app，并引入 LangGraph 作为分析编排层。

明确决策：

1. 前端和后端路由都使用 Next.js。
2. 分析 workflow 使用 LangGraph 建模为可恢复状态机。
3. MVP 不引入 FastAPI。
4. MVP 不调用 archive 里的 Python CLI。
5. 用户不需要安装 Python。
6. PDF/DOCX 解析使用 Node 生态库。
7. 解析文本只是草稿，用户确认后的文本才是分析输入。
8. 长文本产物优先使用 Markdown，小型机器字段使用 JSON，避免一次性生成巨大严格 JSON。

选择原因：

Owl 的核心交互是上传、解析预览、编辑确认、按步骤分析、展示状态、保存 artifact 和渲染报告。这些都适合用 Next.js 单体完成。PDF 解析不是产品真相来源，可以通过 Node parser 和用户确认机制兜底，不值得为了 MVP 增加第二个后端 runtime。

引入 LangGraph 的原因不是为了 RAG，而是为了解决候选人分析中的长上下文和长输出稳定性问题。当前单次 completion 生成 `resume_analysis.json` 容易遇到输出截断、JSON 语法错误、后续步骤输入过大等问题。LangGraph 让分析流程变成多个小节点：每个节点只读必要文件、输出一个小 artifact、可单独重试，失败不污染整个候选人状态。

## 2. 总体架构

```text
Browser
  ↓
Next.js App Router UI
  ↓
Server Actions / Route Handlers
  ├── 文件上传
  ├── 材料解析
  ├── LangGraph 分析编排
  ├── JSON 校验
  ├── 本地持久化
  └── 报告数据生成
  ↓
Local Storage
  ├── SQLite 或文件 JSON
  ├── uploaded files
  └── analysis artifacts
```

MVP 是本地优先的单体应用。LangGraph 先以内嵌 TypeScript package 的方式运行在 Next.js Route Handler 中。后续如果出现长任务、批量候选人或多人协作，再考虑 worker、队列或独立服务。

## 3. 技术栈

```text
Runtime:
  Bun
  Next.js App Router
  TypeScript

UI:
  React
  Tailwind CSS
  shadcn/ui 或本地组件
  lucide-react

Parsing:
  pdf-parse 或 pdfjs-dist
  mammoth
  原生 TXT / Markdown 读取

Validation:
  zod

Workflow:
  @langchain/langgraph
  @langchain/core

LLM:
  OpenAI-compatible provider adapter
  DeepSeek / OpenRouter / 其他兼容 `/chat/completions` 的服务

Storage:
  SQLite + filesystem
  或 MVP 早期使用 .owl-data JSON 文件

Testing:
  Vitest
  Playwright
```

推荐：元数据用 SQLite，上传文件和大文本 artifact 放 filesystem。若追求最快 prototype，可以先用 `.owl-data/` 文件结构，后续再迁移 SQLite。

## 4. 项目目录

```text
owl/
  app/
    page.tsx
    workspaces/
      page.tsx
      [workspaceId]/
        page.tsx
        candidates/
          [candidateId]/
            page.tsx
            report/
              page.tsx
    api/
      upload/
        route.ts
      parse/
        route.ts
      analysis/
        run/
          route.ts
      report/
        route.ts
  components/
    workspace/
    materials/
    analysis/
    report/
    ui/
  lib/
    analysis/
      graph.ts
      state.ts
      nodes/
        analyze-jd.ts
        translate-resume.ts
        analyze-fit.ts
        extract-annotations.ts
        build-question-tree.ts
        build-report.ts
      prompts.ts
      runner.ts
      schemas.ts
      steps.ts
    extraction/
      docx.ts
      pdf.ts
      text.ts
      index.ts
    persistence/
      db.ts
      files.ts
      repositories.ts
    report/
      build-report-data.ts
    model/
      client.ts
      providers.ts
  docs/
    Owl_PRD.md
    Owl_技术文档.md
```

## 5. 本地数据结构

如果使用文件优先方案：

```text
.owl-data/
  workspaces/
    <workspaceId>/
      workspace.json
      jd/
        source/
        parsed.json
        confirmed.md
        analysis.json
      candidates/
        <candidateId>/
          candidate.json
          materials/
            resume/
              source.pdf
              source.json
              source_layout.json
              parsed.json
              confirmed.md
            paper/
              source/
              parsed.json
              confirmed.md
            notes/
              source/
              parsed.json
              confirmed.md
          analysis/
            resume_language.json
            resume_source_layout.json
            resume_translation_layout.json
            resume_translation.md
            resume_fit.json
            resume_annotations.json
            question_tree.json
          report-data.json
```

如果使用 SQLite，建议 SQLite 保存 workspace、candidate、material、analysis_run 的元数据，source 文件、parsed JSON、confirmed text 和 report-data 仍保存在 filesystem。

## 6. 核心实体

### 6.1 Workspace

```ts
type Workspace = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  jdId?: string;
};
```

### 6.2 Candidate

```ts
type Candidate = {
  id: string;
  workspaceId: string;
  displayName: string;
  createdAt: string;
  updatedAt: string;
};
```

### 6.3 Material

```ts
type MaterialKind = "jd" | "resume" | "paper" | "notes";

type Material = {
  id: string;
  workspaceId: string;
  candidateId?: string;
  kind: MaterialKind;
  sourceType: "upload" | "paste";
  fileName?: string;
  mimeType?: string;
  size?: number;
  sourcePath?: string;
  parsedPath?: string;
  confirmedPath?: string;
  status: "uploaded" | "parsed" | "confirmed" | "parse_failed" | "stale";
  createdAt: string;
  updatedAt: string;
};
```

### 6.4 ParsedMaterial

```ts
type ParsedMaterial = {
  source: string;
  type: "pdf" | "docx" | "txt" | "md" | "paste";
  text?: string;
  pages?: Array<{
    page: number;
    text: string;
  }>;
  paragraphs?: string[];
  parseWarnings?: string[];
};
```

## 7. Workflow

保留 archive 的分析意图，但改由 LangGraph 编排。第一阶段不引入 RAG，不分析论文全文，先把 JD + 简历 + 面试问题链路稳定跑通。

```text
parse_materials
analyze_jd
detect_resume_language
extract_resume_layout
translate_resume
evaluate_resume_translation
revise_resume_translation
finalize_resume_translation
translate_resume_layout
use_original_resume
analyze_resume_fit
extract_resume_annotations
build_question_tree
build_report_data
```

步骤依赖：

| Step | 输入 | 输出 |
| --- | --- | --- |
| analyze_jd | confirmed JD text | jd_analysis.json |
| detect_resume_language | confirmed resume text | resume_language.json |
| extract_resume_layout | source PDF / source_layout.json | resume_source_layout.json |
| translate_resume | confirmed resume text | resume_translation_draft.md |
| evaluate_resume_translation | confirmed resume text, resume_translation_draft.md | resume_translation_review.json |
| revise_resume_translation | confirmed resume text, resume_translation_draft.md, resume_translation_review.json | resume_translation_draft.md |
| finalize_resume_translation | resume_translation_draft.md, passed review | resume_translation.md |
| translate_resume_layout | resume_source_layout.json | resume_translation_layout.json |
| use_original_resume | confirmed resume text, resume_source_layout.json | resume_translation.md, resume_translation_layout.json |
| analyze_resume_fit | confirmed resume text, jd_analysis.json | resume_fit.json |
| extract_resume_annotations | confirmed resume text, jd_analysis.json, resume_fit.json | resume_annotations.json |
| build_question_tree | jd_analysis.json, resume_fit.json, resume_annotations.json | question_tree.json |
| build_report_data | 所有已校验 artifact | report-data.json |

每一步必须可独立执行、可重试、可显示错误。

### 7.1 为什么拆分 artifact

不要再用一个巨大的 `resume_analysis.json` 同时承载中文简历、JD fit、风险、证据、标注和问题树上下文。长文本和结构化字段要分开：

```text
analysis/
  jd_analysis.json
  resume_language.json
  resume_translation.md
  resume_fit.json
  resume_annotations.json
  question_tree.json
  report-data.json
```

设计原则：

1. 长文本输出用 Markdown，避免模型长 JSON 转义和截断问题。
2. JSON 只保存小型机器字段，例如评分、风险、标注、问题树。
3. 下游节点只读取必要 artifact，不读取上游完整长文本输出。
4. 每个 artifact 写入前必须校验；失败只标记当前节点，不覆盖已成功产物。
5. UI 聚合多个 artifact，而不是依赖单个大 JSON。

### 7.2 LangGraph 状态模型

```ts
type CandidateAnalysisState = {
  workspaceId: string;
  candidateId: string;
  requestedSteps: AnalysisNodeId[];
  currentStep?: AnalysisNodeId;
  status: "idle" | "running" | "completed" | "failed";
  inputs: {
    jdTextPath: string;
    resumeTextPath: string;
  };
  artifacts: {
    jdAnalysis?: string;
    resumeLanguage?: string;
    resumeTranslation?: string;
    resumeFit?: string;
    resumeAnnotations?: string;
    questionTree?: string;
    reportData?: string;
  };
  errors: Array<{
    step: AnalysisNodeId;
    message: string;
    retryable: boolean;
    at: string;
  }>;
};
```

`CandidateAnalysisState` 只保存路径和状态，不内联保存大文本。节点执行时按需从 filesystem 读取输入，输出落盘后把路径写回 state。

### 7.3 LangGraph 节点设计

```text
START
  ↓
ensure_jd_analysis
  ↓
translate_resume ─────────────┐
  ↓                            │
evaluate_resume_translation    │
  ├─ fail → revise_resume_translation ─┐
  │                                    │
  └─ pass → finalize_resume_translation
  ↓                            │
analyze_resume_fit             │
  ↓                            │
extract_resume_annotations     │
  ↓                            │
build_question_tree            │
  ↓                            │
build_report_data ◀────────────┘
  ↓
END
```

节点职责：

| Node | 职责 | 输出形态 |
| --- | --- | --- |
| ensure_jd_analysis | 若 JD 已分析则复用，否则生成 JD 能力模型 | 小 JSON |
| translate_resume | 生成结构化中文简历草稿 | Markdown |
| evaluate_resume_translation | 模型质检中文简历是否可展示 | 小 JSON |
| revise_resume_translation | 根据质检意见修订中文简历 | Markdown |
| finalize_resume_translation | 质检通过后保存最终中文简历 | Markdown |
| analyze_resume_fit | 生成 JD 匹配、优势、风险、gap | 小 JSON |
| extract_resume_annotations | 提取可高亮证据和问题标注 | 小 JSON |
| build_question_tree | 基于 fit 和 annotations 生成面试问题树 | 小 JSON |
| build_report_data | 聚合 artifact 为页面 view model | JSON |

### 7.4 失败和重试策略

1. 节点失败时写入 `candidate.json.status = "analysis failed"`，note 格式为 `{节点名}失败：{错误}`。
2. 已成功 artifact 不删除；重试时从失败节点继续。
3. JSON 节点支持 structured output、JSON extraction、repair pass 和一次短版重生成。
4. Markdown 节点不做 JSON repair，只做最小质量检查，例如非空、包含必要 heading。
5. 如果 provider 返回 length 截断错误，优先拆节点或拆 section，而不是简单提高 `max_tokens`。

### 7.5 非目标

第一阶段不做：

- RAG / embedding / vector database。
- 论文全文分析。
- 多候选人批量并行分析。
- 长期 memory。

这些能力可以后续加在 LangGraph 节点之后，例如 `summarize_material_chunks`、`retrieve_evidence`、`compare_candidates`。

## 8. Zod Schema

archive 里的 Pydantic schema 迁移为 Zod，作为模型输出的硬约束。

### 8.1 Shared Types

```ts
import { z } from "zod";

export const EvidenceSchema = z.object({
  source: z.string(),
  quote: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
});

export const AnnotationSchema = z.object({
  id: z.string(),
  source: z.string().default("resume"),
  targetText: z.string(),
  category: z.enum(["strength", "risk", "concept", "evidence"]).default("evidence"),
  title: z.string(),
  note: z.string().default(""),
  linkedQuestionIds: z.array(z.string()).default([]),
  evidence: z.array(EvidenceSchema).default([]),
});
```

### 8.2 JD Analysis

```ts
export const JdAnalysisSchema = z.object({
  title: z.string().nullable().optional(),
  summary: z.string().default(""),
  mustHaveSkills: z.array(z.string()).default([]),
  niceToHaveSkills: z.array(z.string()).default([]),
  competencyModel: z.array(z.record(z.string(), z.unknown())).default([]),
  interviewFocus: z.array(z.string()).default([]),
  evidence: z.array(EvidenceSchema).default([]),
});
```

### 8.3 Resume Translation

`resume_language.json` 在翻译前生成，用于判断是否需要翻译：

- 中文或中文主导简历：`shouldTranslate=false`，跳过翻译模型，直接把原文写入 `resume_translation.md` 和 `resume_translation_layout.json`。
- 英文主导简历：`shouldTranslate=true`，继续生成 Markdown 中文简历和坐标化中文简历。
- 边界情况先用本地字符比例判断，无法确定时再用小 JSON 模型分类。

`resume_translation.md` 是 Markdown artifact，不使用 Zod schema。它面向报告和搜索展示，允许较长内容，避免大 JSON 输出不稳定。

当原始简历是 PDF 时，主视图优先使用 layout artifact：

- `resume_source_layout.json`：PDF.js 提取的原文 block、页码、坐标和字号。
- `resume_translation_layout.json`：按原文 block 坐标生成的中文 block，用于右侧坐标化渲染和后续标注绑定。

坐标来自 PDF 解析，不由模型生成。模型只负责逐 block 翻译，保持 block id。

要求：

- 保留简历结构：姓名、联系方式、教育、论文/项目、技能、经历。
- 中文表达清晰，但不虚构。
- 可使用 Markdown heading 和 bullet。
- 不包含模型解释或系统提示。

### 8.4 Resume Fit

```ts
export const ResumeFitSchema = z.object({
  candidateName: z.string().nullable().optional(),
  contact: z.record(z.string(), z.unknown()).default({}),
  headline: z.string().default(""),
  strengths: z.array(z.union([z.record(z.string(), z.unknown()), z.string()])).default([]),
  risks: z.array(z.union([z.record(z.string(), z.unknown()), z.string()])).default([]),
  gaps: z.array(z.union([z.record(z.string(), z.unknown()), z.string()])).default([]),
  mustHaveMatches: z.array(z.record(z.string(), z.unknown())).default([]),
  jdFit: z.record(z.string(), z.unknown()).default({}),
  evidence: z.array(EvidenceSchema).default([]),
});
```

### 8.5 Resume Annotations

```ts
export const ResumeAnnotationsSchema = z.object({
  annotations: z.array(AnnotationSchema).default([]),
});
```

### 8.6 Paper Analysis

```ts
export const PaperAnalysisSchema = z.object({
  papers: z.array(z.record(z.string(), z.unknown())).default([]),
  annotations: z.array(AnnotationSchema).default([]),
});
```

`PaperAnalysisSchema` 保留为后续扩展，第一阶段不进入默认候选人分析链路。

### 8.7 Question Tree

```ts
export const InterviewQuestionSchema = z.object({
  id: z.string(),
  topic: z.string().default(""),
  source: z.string().default("resume"),
  linkedAnnotationIds: z.array(z.string()).default([]),
  question: z.string(),
  purpose: z.string().default(""),
  goodAnswer: z.string().default(""),
  weakAnswerSignals: z.array(z.string()).default([]),
  followUps: z.array(z.string()).default([]),
  evidence: z.array(z.string()).default([]),
});

export const QuestionTreeSchema = z.object({
  questions: z.array(InterviewQuestionSchema).default([]),
});
```

### 8.8 Interview Notes Review

```ts
export const InterviewNotesReviewSchema = z.object({
  summary: z.string().default(""),
  qa: z.array(z.record(z.string(), z.unknown())).default([]),
  risksUpdated: z.array(z.union([z.record(z.string(), z.unknown()), z.string()])).default([]),
  nextRoundQuestions: z.array(z.union([z.record(z.string(), z.unknown()), z.string()])).default([]),
});
```

## 9. 文件解析

### 9.1 Parser Interface

```ts
export type ExtractInput = {
  buffer: Buffer;
  fileName: string;
  mimeType?: string;
};

export type ExtractResult = ParsedMaterial;

export interface MaterialParser {
  supports(input: ExtractInput): boolean;
  parse(input: ExtractInput): Promise<ExtractResult>;
}
```

### 9.2 PDF

MVP 方案：

- 优先尝试 `pdf-parse`。
- 如果需要更细的页级控制，再评估 `pdfjs-dist`。

输出结构：

```json
{
  "source": "resume.pdf",
  "type": "pdf",
  "pages": [
    {
      "page": 1,
      "text": "..."
    }
  ],
  "parseWarnings": []
}
```

已知限制：

- 扫描 PDF 可能没有文本。
- 双栏论文阅读顺序可能错乱。
- 表格结构可能丢失。
- 复杂格式必须靠用户确认文本兜底。

### 9.3 DOCX

使用 `mammoth` 提取文本，尽量保留段落。

### 9.4 TXT / Markdown / Paste

直接按 UTF-8 文本处理。

## 10. API 设计

### 10.1 Upload

`POST /api/upload`

职责：

- 接收文件。
- 校验扩展名和大小。
- 保存源文件。
- 创建或更新 Material 记录。

### 10.2 Parse

`POST /api/parse`

职责：

- 加载上传文件或粘贴文本。
- 选择 parser。
- 保存 parsed result。
- 返回预览文本和 warning。

### 10.3 Confirm Text

`POST /api/materials/:id/confirm`

职责：

- 保存用户确认后的文本。
- 将 material 标记为 confirmed。
- 如果文本变化，标记下游 artifact 为 stale。

### 10.4 Tasks

`POST /api/tasks`

请求：

```json
{
  "type": "candidate_analysis",
  "workspaceId": "workspace_123",
  "candidateId": "candidate_123"
}
```

职责：

- 创建后台分析任务。
- 立即返回 `taskId`，不要求上传弹窗等待模型完成。
- 任务 runner 按类型调用 JD 解析或候选人 LangGraph。
- 持续写入任务状态，供任务列表轮询展示。

`GET /api/tasks`

职责：

- 返回任务列表。
- 顶部 header 的任务入口展示所有 JD 和候选人任务。
- 不按 workspace 拆分任务列表，避免用户在不同页面看到不同队列。

`POST /api/tasks/:taskId/retry`

职责：

- 失败任务重新进入 queued/running。
- 复用同一个任务 id，保留重试次数和最后错误。

任务数据保存在：

```text
.owl-data/tasks/<taskId>.json
```

```ts
type AnalysisTask = {
  id: string;
  type: "jd_analysis" | "candidate_analysis";
  status: "queued" | "running" | "succeeded" | "failed";
  workspaceId: string;
  candidateId?: string;
  title: string;
  currentStep?: string;
  message?: string;
  error?: string;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
};
```

### 10.5 Run Analysis

`POST /api/analysis/run`

请求：

```json
{
  "workspaceId": "workspace_123",
  "candidateId": "candidate_123",
  "step": "analyze_resume"
}
```

职责：

- 内部分析执行接口。
- 由任务 runner 调用，不作为上传弹窗的直接等待目标。
- 仍可用于开发调试单次分析。

### 10.6 Build Report

`POST /api/report`

职责：

- 读取已校验 artifact。
- 合并 report-data。
- 保存 `report-data.json`。
- 返回报告 view model。

## 11. Model Provider Layer

使用 provider adapter，避免业务逻辑绑定某个模型 SDK。

```ts
export type ModelRequest = {
  system: string;
  user: string;
  schemaName: string;
  schema: unknown;
};

export type ModelResponse = {
  json: unknown;
  rawText?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
};

export interface ModelProvider {
  generateJson(request: ModelRequest): Promise<ModelResponse>;
}
```

如果模型支持 structured output，优先使用 structured output。如果不支持，则使用 JSON extraction、Zod 校验和 repair pass。Markdown 节点不要求 structured output，只做内容质量检查。

## 12. LangGraph 实施方案

### 12.1 依赖

```bash
bun add @langchain/langgraph @langchain/core
```

第一阶段只使用 LangGraph 的状态图能力，不使用 LangChain model wrapper。模型调用继续走 `lib/analysis/model-client.ts`，保持 DeepSeek / OpenRouter / OpenAI-compatible provider adapter 不变。

### 12.2 文件结构

```text
lib/analysis/
  graph.ts              # 构建 CandidateAnalysisGraph
  state.ts              # StateAnnotation / types
  artifacts.ts          # artifact 路径、读写、校验
  nodes/
    ensure-jd-analysis.ts
    translate-resume.ts
    analyze-resume-fit.ts
    extract-resume-annotations.ts
    build-question-tree.ts
    build-report-data.ts
```

### 12.3 Route Handler 集成

`POST /api/tasks` 是用户提交入口。上传弹窗保存材料后创建任务并关闭，任务 runner 再调用 LangGraph。

`POST /api/analysis/run` 保留为内部执行接口，不再绑定上传弹窗生命周期。它不直接 switch step 调用模型，而是：

1. 从 request 读取 `workspaceId`、`candidateId`、`startAt?`。
2. 构造 `CandidateAnalysisState`。
3. 调用 graph。
4. 每个节点完成后写 artifact 和 `analysis-state.json`。
5. 返回当前状态；任务列表通过轮询 `GET /api/tasks` 展示进度。

```ts
const graph = createCandidateAnalysisGraph();
const result = await graph.invoke(initialState);
```

MVP 先用本地进程内异步执行和文件落盘。后续如需更稳定的长任务、批量候选人或多人协作，可以把 task runner 换成队列 worker，API 和 UI 不需要大改。

### 12.4 状态落盘

每次节点开始和结束都写：

```text
candidates/<candidateId>/analysis/analysis-state.json
```

示例：

```json
{
  "status": "running",
  "currentStep": "analyze_resume_fit",
  "completedSteps": ["ensure_jd_analysis", "translate_resume"],
  "artifacts": {
    "resumeTranslation": "analysis/resume_translation.md"
  },
  "errors": []
}
```

这允许：

- 刷新页面后恢复进度。
- 失败后从失败节点重试。
- UI 展示更准确的阶段状态。

### 12.5 节点输出策略

| Node | 模型输出 | 校验 |
| --- | --- | --- |
| translate_resume | Markdown | 基本 Markdown 结构校验 |
| evaluate_resume_translation | JSON | `ResumeTranslationReviewSchema` |
| revise_resume_translation | Markdown | 基本 Markdown 结构校验，最多修订一次 |
| analyze_resume_fit | JSON | `ResumeFitSchema` |
| extract_resume_annotations | JSON | `ResumeAnnotationsSchema` |
| build_question_tree | JSON | `QuestionTreeSchema` |
| build_report_data | 本地聚合，无模型 | TypeScript type + smoke check |

### 12.6 与现有实现的迁移关系

当前实现：

- `model-client.ts`
- `jd-parser.ts`
- `/api/analysis/run`
- `report-data builder`
- `lib/analysis/graph.ts`
- `lib/analysis/nodes/*`

落地策略：

1. 保留 `model-client.ts`。
2. 旧的候选人大 JSON 分析器已拆到 `nodes/*`，新分析不再生成 `resume_analysis.json`。
3. `/api/analysis/run` 调用 LangGraph graph。
4. 不保留旧 artifact 读取兼容，页面只读取新分片产物。
5. 简历详情 UI 读取 `resume_translation_layout.json`，报告页从多个小 artifact 聚合展示。

### 12.7 是否需要 RAG

第一阶段不需要 RAG。原因：

- JD + 简历输入量可控。
- 当前主要失败来自大 JSON 输出和后续步骤输入膨胀，不是检索不到相关片段。
- LangGraph 小节点 + artifact 落盘已经能解决大部分稳定性问题。

当恢复论文、项目材料和多轮 notes 分析时，再增加：

```text
summarize_material_chunks
merge_material_summaries
retrieve_evidence_for_question
```

这些节点可以接 LlamaIndex / Haystack / embedding store，但不是 MVP 前置条件。

## 13. Prompt 设计

每个 LangGraph 节点有独立 prompt。prompt 必须：

1. 明确角色是技术面试分析助手。
2. 要求所有判断围绕 JD。
3. 只放当前步骤需要的上下文。
4. 重要结论必须给证据。
5. 禁止评价岗位无关敏感属性。
6. JSON 节点输出严格 JSON；Markdown 节点输出纯 Markdown。
7. 不生成 HTML。

示例：

```text
Step: analyze_resume_fit
Inputs:
  - confirmed resume text
  - jd_analysis.json
Output:
  - ResumeFit JSON
Rules:
  - Compare against the JD analysis, not generic hiring criteria.
  - Add risks only when there is textual evidence or clear uncertainty.
  - Keep fields compact; detailed resume translation belongs to resume_translation.md.
```

## 14. Report Data Builder

`build-report-data.ts` 负责把多个 artifact 合并成稳定的报告数据。

输入：

- `jd_analysis.json`
- `resume_translation.md`
- `resume_fit.json`
- `resume_annotations.json`
- optional `question_tree.json`
- confirmed material text

输出：

```ts
type ReportData = {
  metadata: {
    generatedAt: string;
    mode: "localhost";
    workspaceId: string;
    candidateId: string;
  };
  jd: unknown;
  resumeTranslation?: string;
  resumeFit: unknown;
  resumeAnnotations: unknown[];
  questionTree: unknown;
  workspace: {
    confirmedResumeText?: string;
    annotations: unknown[];
  };
};
```

报告 React 组件只消费 `ReportData`，不直接消费零散模型输出。

## 15. UI 技术要求

应用打开后直接进入工作台，不做营销落地页。

关键页面：

1. Workspace 列表。
2. JD 设置页。
3. 候选人材料页。
4. 解析文本确认页。
5. 分析进度页。
6. 报告页。

报告 UI：

- 信息密度高但可读。
- 使用 tabs 或 segmented controls 区分报告模块。
- 风险等级可视化。
- 简历 / 论文文本支持 annotation highlight。
- 问题卡片支持复制。
- 支持打印样式。

## 16. 安全和隐私

MVP 要求：

1. 默认本地保存数据。
2. 不在 console 里打印完整简历、JD、论文文本。
3. 生产模式不保存完整 raw prompt，或提供开关。
4. 校验文件扩展名、MIME 和大小。
5. 不执行 shell 命令。
6. API key 放在 `.env.local`。
7. 用户点击分析前，不向模型 provider 发送材料。

## 17. 错误处理

需要处理的错误状态：

- 不支持的文件类型。
- PDF 解析为空。
- parser crash。
- 缺少 confirmed JD。
- 缺少 confirmed resume。
- 模型调用失败。
- 模型输出无法通过 Zod 校验。
- LangGraph 节点执行失败。
- 源文本修改导致下游 artifact stale。

恢复操作：

- 重新解析。
- 手动编辑或粘贴文本。
- 重试分析步骤。
- 重置下游 artifact。
- 查看校验错误。

## 18. 测试策略

Unit tests：

- parser selection
- TXT / Markdown parsing
- Zod validation
- report data builder
- LangGraph node dependency
- artifact path/state persistence

Integration tests：

- 上传并解析简历
- 确认文本
- 使用 mock model provider 跑分析
- 验证 `analysis-state.json` 和各节点 artifact
- 生成 report-data

E2E tests：

- 创建 workspace
- 添加 JD
- 添加候选人简历
- 确认文本
- 跑完整 mock workflow
- 打开报告

Manual QA：

- 文本型 PDF 简历
- DOCX 简历
- 双栏论文 PDF
- 空文本 / 扫描 PDF 待处理状态

## 19. 从 archive 迁移

保留：

- Workflow step names
- 分析 schema
- 报告模块
- annotation 模型
- question tree 结构
- JD-first 原则
- archive 报告 UI 的信息组织方式

不迁移：

- skill installer
- Typer CLI
- Python helper scripts
- Jinja2 renderer
- 强绑定 `.owl/` candidate 目录的使用方式

改造：

- Pydantic schema → Zod schema
- Jinja2 report template → React components
- CLI runner → Next.js analysis orchestrator
- Python extractor → Node parser adapters

## 20. 实施计划

### Phase 1：App Skeleton

- 创建 Next.js app。
- 加 Tailwind 和 UI primitives。
- 实现 workspace 和 candidate routes。
- 实现本地 persistence。

### Phase 2：Materials

- 上传和粘贴输入。
- PDF/DOCX/TXT/Markdown 解析。
- 解析文本预览和确认。

### Phase 3：Analysis

- Zod schemas。
- model provider adapter。
- 引入 `@langchain/langgraph` 和 `@langchain/core`。
- 实现 `CandidateAnalysisState` 和 `analysis-state.json`。
- 将候选人分析拆成 `translate_resume`、`analyze_resume_fit`、`extract_resume_annotations`、`build_question_tree`。
- `translate_resume` 输出 Markdown，其余节点输出小 JSON。
- artifact 保存和步骤状态。
- `/api/analysis/run` 改为调用 graph。

### Phase 4：Report

- report-data builder。
- 将 archive report UI 迁移为 React。
- risk board 和 question tree。
- 打印视图。
- UI 从多个 artifact 聚合展示，不依赖单个 `resume_analysis.json`。

### Phase 5：Optional Inputs

- paper analysis：先做 chunk summary，再进入综合分析。
- interview notes review。
- report export。
