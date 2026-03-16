import dotenv from "dotenv";
import { callLLM, type Message } from "./llm_client";
import { TOOL_DEFINITIONS, executeTool } from "./tools";

dotenv.config();

// ── System prompt ──────────────────────────────────────────────────────────
//
// Tłumaczenie dla zrozumienia:
// Agent dostaje cel: aktywować trasę X-01.
// Nie zna dokumentacji API — musi zacząć od wywołania "help".
// Następnie sam dobiera kolejne kroki na podstawie wyników.

const SYSTEM_PROMPT = `Jesteś agentem zarządzającym siecią kolejową.
Twoim zadaniem jest aktywowanie trasy X-01 (ustawienie jej statusu na RTOPEN).

Znasz już dokumentację API. Przepływ aktywacji trasy to dokładnie 3 kroki:
1. reconfigure(route) — włącz tryb edycji
2. set_status(route, "RTOPEN") — ustaw status na aktywny
3. save(route) — zapisz i wyjdź z trybu edycji

NIE wywołuj help ani get_status — to zbędne wywołania które spowalniają wykonanie.
Wykonaj te 3 kroki dla trasy X-01, a gdy skończysz zakończ komunikatem "DONE: trasa X-01 aktywna".`;

// ── Pętla agenta (ReAct: Reason → Act → Observe) ─────────────────────────

function printMessage(role: string, content: string): void {
  const labels: Record<string, string> = {
    system:    "🔧 SYSTEM   ",
    user:      "👤 USER     ",
    assistant: "🤖 ASSISTANT",
    tool:      "🔩 TOOL     ",
  };
  const label = labels[role] ?? role.toUpperCase();
  const divider = "─".repeat(60);
  console.log(`\n${divider}`);
  console.log(`${label}`);
  console.log(divider);
  console.log(content);
}

async function runAgent(): Promise<void> {
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log(  "║              Agent Railway START                        ║");
  console.log(  "╚══════════════════════════════════════════════════════════╝");

  const messages: Message[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: "Aktywuj trasę X-01." },
  ];

  // Wyświetl wiadomości startowe
  printMessage("system", SYSTEM_PROMPT);
  printMessage("user", "Aktywuj trasę X-01.");

  const MAX_STEPS = 10; // zabezpieczenie przed nieskończoną pętlą

  for (let step = 1; step <= MAX_STEPS; step++) {
    console.log(`\n\n${"═".repeat(60)}`);
    console.log(`  KROK ${step}`);
    console.log(`${"═".repeat(60)}`);

    // REASON: LLM decyduje co zrobić
    const response = await callLLM(messages, TOOL_DEFINITIONS);

    // Brak wywołań narzędzi = LLM skończył (odpowiedź końcowa)
    if (!response.toolCalls || response.toolCalls.length === 0) {
      printMessage("assistant", response.content);
      break;
    }

    // Pokaż co asystent "myśli" (treść tekstowa) oraz jakie tools wywołuje
    const toolSummary = response.toolCalls
      .map((tc) => `  → ${tc.name}(${JSON.stringify(tc.arguments)})`)
      .join("\n");
    const assistantDisplay = [
      response.content ? response.content : "(brak komentarza)",
      "",
      "Wywołuję narzędzia:",
      toolSummary,
    ].join("\n");
    printMessage("assistant", assistantDisplay);

    // Zapisz wiadomość asystenta (z tool_calls) do historii
    messages.push({
      role: "assistant",
      content: response.content,
      toolCalls: response.toolCalls,
    });

    // ACT + OBSERVE: wykonaj każde narzędzie i zapisz wynik
    for (const toolCall of response.toolCalls) {
      const toolResult = await executeTool(toolCall.name, toolCall.arguments);

      printMessage("tool", `[${toolCall.name}] ${toolResult}`);

      // Wynik trafia do historii jako wiadomość roli "tool"
      messages.push({
        role: "tool",
        toolCallId: toolCall.id,
        content: toolResult,
      });
    }
  }

  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log(  "║              Agent Railway KONIEC                       ║");
  console.log(  "╚══════════════════════════════════════════════════════════╝\n");
}

// ── Start ──────────────────────────────────────────────────────────────────

runAgent().catch((err) => {
  console.error("[fatal]", err);
  process.exit(1);
});
