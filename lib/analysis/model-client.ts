import type { z } from "zod";

const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-v4-flash";
const DEFAULT_TIMEOUT_MS = 1_800_000;
const RETRYABLE_STATUS = new Set([502, 503, 504]);

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
    delta?: {
      content?: string | null;
    };
    text?: string;
    finish_reason?: string | null;
  }>;
};

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

function jsonFromModelText(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced ?? text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end < start) {
    throw new Error("Model response did not contain JSON.");
  }
  return JSON.parse(candidate.slice(start, end + 1)) as unknown;
}

function readCompletionContent(text: string) {
  const chunks: string[] = [];

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) {
      continue;
    }

    const payload = trimmed.slice("data:".length).trim();
    if (!payload || payload === "[DONE]") {
      continue;
    }

    try {
      const data = JSON.parse(payload) as ChatCompletionResponse;
      const choice = data.choices?.[0];
      const content = choice?.delta?.content ?? choice?.message?.content ?? choice?.text ?? "";
      if (content) {
        chunks.push(content);
      }
    } catch {
      // Ignore malformed SSE housekeeping lines.
    }
  }

  if (chunks.length) {
    return chunks.join("");
  }

  const data = JSON.parse(text) as ChatCompletionResponse;
  const choice = data.choices?.[0];
  return choice?.message?.content ?? choice?.delta?.content ?? choice?.text ?? "";
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readPositiveNumberEnv(name: string, fallback?: number) {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number.`);
  }

  return value;
}

async function requestCompletionText(
  messages: ChatMessage[],
  options: { jsonMode?: boolean } = {},
) {
  const baseUrl = process.env.JD_ANALYSIS_BASE_URL ?? DEFAULT_BASE_URL;
  const model = process.env.JD_ANALYSIS_MODEL ?? DEFAULT_MODEL;
  const apiKey = process.env.JD_ANALYSIS_API_KEY;
  const maxTokens = readPositiveNumberEnv("JD_ANALYSIS_MAX_TOKENS");
  const timeoutMs = readPositiveNumberEnv("JD_ANALYSIS_TIMEOUT_MS", DEFAULT_TIMEOUT_MS) ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    if (!baseUrl || !model || !apiKey) {
      throw new Error(
        "Missing analysis provider config. Please set JD_ANALYSIS_BASE_URL, JD_ANALYSIS_MODEL, and JD_ANALYSIS_API_KEY.",
      );
    }

    const headers: Record<string, string> = {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    };
    if (process.env.JD_ANALYSIS_HTTP_REFERER) {
      headers["HTTP-Referer"] = process.env.JD_ANALYSIS_HTTP_REFERER;
    }
    if (process.env.JD_ANALYSIS_APP_TITLE) {
      headers["X-Title"] = process.env.JD_ANALYSIS_APP_TITLE;
    }

    const body = JSON.stringify({
      model,
      temperature: 0.1,
      ...(maxTokens ? { max_tokens: maxTokens } : {}),
      ...(options.jsonMode ? { response_format: { type: "json_object" } } : {}),
      stream: false,
      messages,
    });

    let response: Response | null = null;
    let responseText = "";
    try {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
          method: "POST",
          headers,
          body,
          signal: controller.signal,
        });
        responseText = await response.text();
        if (response.ok || !RETRYABLE_STATUS.has(response.status)) {
          break;
        }
        await wait(500 * (attempt + 1));
      }
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(`Analysis request timed out after ${Math.round(timeoutMs / 1000)} seconds.`);
      }
      throw error;
    }

    if (!response?.ok) {
      const detail = responseText.trim().slice(0, 240);
      throw new Error(
        `Analysis request failed: ${response?.status ?? "unknown"}${detail ? ` - ${detail}` : ""}`,
      );
    }

    const content = readCompletionContent(responseText);
    if (!content) {
      throw new Error("Analysis response was empty.");
    }

    const finishReason = (() => {
      try {
        const data = JSON.parse(responseText) as ChatCompletionResponse;
        return data.choices?.[0]?.finish_reason ?? "";
      } catch {
        return "";
      }
    })();

    if (finishReason === "length") {
      throw new Error(
        maxTokens
          ? `Analysis response exceeded JD_ANALYSIS_MAX_TOKENS=${maxTokens}. Increase JD_ANALYSIS_MAX_TOKENS or use a shorter input.`
          : "Analysis response exceeded the model output limit. Use a shorter input or split large files before analysis.",
      );
    }

    return content;
  } finally {
    clearTimeout(timeout);
  }
}

async function repairJsonCompletion(brokenJson: string, error: unknown) {
  const clipped = brokenJson.length > 60_000 ? brokenJson.slice(0, 60_000) : brokenJson;
  return requestCompletionText([
    {
      role: "system",
      content:
        "你是 JSON 修复器。只返回修复后的合法 JSON object，不要 markdown，不要解释，不要新增无法从原文推断的信息。",
    },
    {
      role: "user",
      content: [
        "下面内容应当是 JSON object，但解析失败。请修复语法错误，保持字段和内容，返回合法 JSON object。",
        `解析错误：${error instanceof Error ? error.message : String(error)}`,
        "",
        clipped,
      ].join("\n"),
    },
  ], { jsonMode: true });
}

export async function requestJsonCompletion<T>(
  messages: ChatMessage[],
  schema: z.ZodType<T>,
): Promise<T> {
  const content = await requestCompletionText(messages, { jsonMode: true });

  try {
    return schema.parse(jsonFromModelText(content));
  } catch (error) {
    try {
      const repaired = await repairJsonCompletion(content, error);
      return schema.parse(jsonFromModelText(repaired));
    } catch {
      const regenerated = await requestCompletionText([
        ...messages,
        {
          role: "user",
          content:
            "上一版返回不是合法 JSON 或不符合 schema。请重新生成更短、更保守的合法 JSON object：数组最多 8 项，字符串保持简洁，不要 markdown，不要解释。",
        },
      ], { jsonMode: true });
      return schema.parse(jsonFromModelText(regenerated));
    }
  }
}

export async function requestMarkdownCompletion(messages: ChatMessage[]): Promise<string> {
  const content = await requestCompletionText(messages);
  const cleaned = content
    .replace(/^```(?:markdown|md)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  if (!cleaned) {
    throw new Error("Markdown analysis response was empty.");
  }

  return cleaned;
}
