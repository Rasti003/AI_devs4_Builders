import fetch from "node-fetch";

const BASE_URL = "https://openrouter.ai/api/v1/chat/completions";

export interface Message {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: object;
  };
}

export async function callLLM(
  model: string,
  messages: Message[],
  tools?: ToolDefinition[],
  options?: { max_tokens?: number; temperature?: number }
): Promise<Message> {
  const body: Record<string, unknown> = {
    model,
    messages,
    max_tokens: options?.max_tokens ?? 4096,
    temperature: options?.temperature ?? 0.2,
  };
  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = "auto";
  }

  const res = await fetch(BASE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenRouter error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as { choices: { message: Message }[] };
  return data.choices[0].message;
}
