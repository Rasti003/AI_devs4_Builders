import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

// ── Typy ──────────────────────────────────────────────────────────────────

export type Role = "system" | "user" | "assistant" | "tool";

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, string>;
}

export type Message =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: ToolCall[] }
  | { role: "tool"; toolCallId: string; content: string };

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface LLMResponse {
  content: string;
  toolCalls: ToolCall[];
}

// ── Konfiguracja providerów ────────────────────────────────────────────────

// Zmień LLM_PROVIDER na "local" żeby używać lokalnego modelu (np. Ollama)
const LLM_PROVIDER = (process.env.LLM_PROVIDER ?? "openrouter") as
  | "openrouter"
  | "local";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const LOCAL_URL = process.env.LOCAL_LLM_URL ?? "http://localhost:11434/v1/chat/completions";

const OPENROUTER_MODEL = "openai/gpt-4.1-mini";
const LOCAL_MODEL = process.env.LOCAL_LLM_MODEL ?? "qwen2.5:7b";

function getConfig(): { url: string; model: string; apiKey: string | undefined } {
  if (LLM_PROVIDER === "local") {
    return { url: LOCAL_URL, model: LOCAL_MODEL, apiKey: undefined };
  }
  return {
    url: OPENROUTER_URL,
    model: OPENROUTER_MODEL,
    apiKey: process.env.OPENROUTER_API_KEY,
  };
}

// ── Konwersja wiadomości do formatu OpenAI-compatible ──────────────────────

function toApiMessages(messages: Message[]): unknown[] {
  return messages.map((msg) => {
    if (msg.role === "system" || msg.role === "user") {
      return { role: msg.role, content: msg.content };
    }
    if (msg.role === "assistant") {
      const out: Record<string, unknown> = {
        role: "assistant",
        content: msg.content,
      };
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        out.tool_calls = msg.toolCalls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.arguments),
          },
        }));
      }
      return out;
    }
    if (msg.role === "tool") {
      return {
        role: "tool",
        tool_call_id: msg.toolCallId,
        content: msg.content,
      };
    }
  });
}

// ── Główna funkcja wywołania LLM ───────────────────────────────────────────

export async function callLLM(
  messages: Message[],
  tools?: ToolDefinition[]
): Promise<LLMResponse> {
  const { url, model, apiKey } = getConfig();

  const body: Record<string, unknown> = {
    model,
    messages: toApiMessages(messages),
  };

  if (tools && tools.length > 0) {
    body.tools = tools.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
    body.tool_choice = "auto";
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
    headers["HTTP-Referer"] = "https://aidevs.pl";
    headers["X-Title"] = "AIDevs4-S01E05";
  }

  console.log(`[llm] provider=${LLM_PROVIDER} model=${model}`);

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`LLM HTTP error ${response.status}: ${text}`);
  }

  const json: any = await response.json();
  const message = json.choices?.[0]?.message;
  const content: string = message?.content ?? "";
  const toolCalls: ToolCall[] =
    message?.tool_calls?.map((tc: any) => ({
      id: tc.id,
      name: tc.function?.name,
      arguments: safeParseArgs(tc.function?.arguments),
    })) ?? [];

  return { content, toolCalls };
}

function safeParseArgs(args: unknown): Record<string, string> {
  if (typeof args === "string") {
    try {
      return JSON.parse(args);
    } catch {
      return {};
    }
  }
  if (typeof args === "object" && args !== null) {
    return args as Record<string, string>;
  }
  return {};
}
