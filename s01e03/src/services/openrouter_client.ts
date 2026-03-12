import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

export type Role = "system" | "user" | "assistant" | "tool";

export interface Message {
  role: Role;
  content: string;
  name?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface OpenRouterResponse {
  content: string;
  toolCalls: ToolCall[];
}

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

if (!OPENROUTER_API_KEY) {
  // W treningowym środowisku wygodniej mieć wyraźny komunikat, jeśli brak klucza.
  console.warn(
    "[openrouter_client] Brak zmiennej środowiskowej OPENROUTER_API_KEY. Wywołania do OpenRouter zakończą się błędem."
  );
}

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "openai/gpt-4.1-mini"; // lekki, tani model do ćwiczeń

export async function callOpenRouter(
  messages: Message[],
  tools?: ToolDefinition[]
): Promise<OpenRouterResponse> {
  const body: any = {
    model: MODEL,
    messages,
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

  console.log(
    "[openrouter] request",
    JSON.stringify(
      {
        model: MODEL,
        messages,
        toolsProvided: !!tools && tools.length > 0,
      },
      null,
      2
    )
  );

  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "HTTP-Referer": "https://aidevs.pl", // przykładowe źródło
      "X-Title": "AIDEVS S01E03 MCP demo",
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

  console.log(
    "[openrouter] response",
    JSON.stringify(
      {
        contentPreview: content.slice(0, 200),
        toolCalls:
          message?.tool_calls?.map((tc: any) => ({
            id: tc.id,
            name: tc.function?.name,
          })) ?? [],
      },
      null,
      2
    )
  );

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

