import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

export type Role = "system" | "user" | "assistant" | "tool";

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

// Wewnętrzna reprezentacja wiadomości dla pętli agenta
export type Message =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: ToolCall[] }
  | { role: "tool"; toolCallId: string; content: string };

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface OpenRouterResponse {
  content: string;
  toolCalls: ToolCall[];
}

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

if (!OPENROUTER_API_KEY) {
  console.warn("[openrouter_client] Brak zmiennej środowiskowej OPENROUTER_API_KEY.");
}

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "openai/gpt-4.1-mini";

/** Konwertuje nasze wiadomości na format wymagany przez OpenRouter API */
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

export async function callOpenRouter(
  messages: Message[],
  tools?: ToolDefinition[]
): Promise<OpenRouterResponse> {
  const body: Record<string, unknown> = {
    model: MODEL,
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

  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "HTTP-Referer": "https://aidevs.pl",
      "X-Title": "AIDevs4-S01E04",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `OpenRouter HTTP error ${response.status}: ${response.statusText} - ${text}`
    );
  }

  const json: any = await response.json();
  const choice = json.choices?.[0];
  const message = choice?.message;
  const content: string = message?.content ?? "";
  const toolCalls: ToolCall[] =
    message?.tool_calls?.map((tc: any) => ({
      id: tc.id,
      name: tc.function?.name,
      arguments: safeParseArgs(tc.function?.arguments),
    })) ?? [];

  return { content, toolCalls };
}

function safeParseArgs(args: unknown): Record<string, unknown> {
  if (typeof args === "string") {
    try {
      return JSON.parse(args);
    } catch {
      return {};
    }
  }
  if (typeof args === "object" && args !== null) {
    return args as Record<string, unknown>;
  }
  return {};
}
