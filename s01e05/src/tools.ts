import { callRailwayApi } from "./railway_client";
import type { ToolDefinition } from "./llm_client";

// ── Implementacje narzędzi ──────────────────────────────────────────────────

/** Pobiera dokumentację API — zawsze dobry pierwszy krok */
export async function toolHelp(): Promise<string> {
  const result = await callRailwayApi("help");
  return JSON.stringify(result);
}

/** Sprawdza aktualny status trasy */
export async function toolGetStatus(route: string): Promise<string> {
  const result = await callRailwayApi("getstatus", { route });
  return JSON.stringify(result);
}

/** Włącza tryb edycji trasy (wymagany przed setstatus) */
export async function toolReconfigure(route: string): Promise<string> {
  const result = await callRailwayApi("reconfigure", { route });
  return JSON.stringify(result);
}

/** Ustawia status trasy (RTOPEN = otwarta / RTCLOSE = zamknięta) */
export async function toolSetStatus(
  route: string,
  value: "RTOPEN" | "RTCLOSE"
): Promise<string> {
  const result = await callRailwayApi("setstatus", { route, value });
  return JSON.stringify(result);
}

/** Zapisuje zmiany i wychodzi z trybu edycji */
export async function toolSave(route: string): Promise<string> {
  const result = await callRailwayApi("save", { route });
  return JSON.stringify(result);
}

// ── Definicje tools dla LLM (JSON Schema) ─────────────────────────────────

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "help",
    description:
      "Pobiera dokumentację Railway API — listę dostępnych akcji i parametrów.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "get_status",
    description: "Sprawdza aktualny status podanej trasy kolejowej.",
    parameters: {
      type: "object",
      properties: {
        route: {
          type: "string",
          description: "Nazwa trasy, np. 'X-01'",
        },
      },
      required: ["route"],
    },
  },
  {
    name: "reconfigure",
    description:
      "Włącza tryb rekonfiguracji dla podanej trasy. Wymagane przed zmianą statusu.",
    parameters: {
      type: "object",
      properties: {
        route: {
          type: "string",
          description: "Nazwa trasy, np. 'X-01'",
        },
      },
      required: ["route"],
    },
  },
  {
    name: "set_status",
    description:
      "Ustawia status trasy. Wartość RTOPEN = otwarta (aktywna), RTCLOSE = zamknięta. Trasa musi być najpierw w trybie reconfigure.",
    parameters: {
      type: "object",
      properties: {
        route: {
          type: "string",
          description: "Nazwa trasy, np. 'X-01'",
        },
        value: {
          type: "string",
          enum: ["RTOPEN", "RTCLOSE"],
          description: "RTOPEN = aktywna, RTCLOSE = nieaktywna",
        },
      },
      required: ["route", "value"],
    },
  },
  {
    name: "save",
    description:
      "Zapisuje zmiany i wychodzi z trybu rekonfiguracji dla podanej trasy.",
    parameters: {
      type: "object",
      properties: {
        route: {
          type: "string",
          description: "Nazwa trasy, np. 'X-01'",
        },
      },
      required: ["route"],
    },
  },
];

// ── Dispatcher: nazwa tool → wywołanie funkcji ─────────────────────────────

export async function executeTool(
  name: string,
  args: Record<string, string>
): Promise<string> {
  switch (name) {
    case "help":
      return toolHelp();
    case "get_status":
      return toolGetStatus(args.route);
    case "reconfigure":
      return toolReconfigure(args.route);
    case "set_status":
      return toolSetStatus(args.route, args.value as "RTOPEN" | "RTCLOSE");
    case "save":
      return toolSave(args.route);
    default:
      return JSON.stringify({ error: `Nieznany tool: ${name}` });
  }
}
