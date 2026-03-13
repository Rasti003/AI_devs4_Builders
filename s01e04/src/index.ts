/**
 * s01e04 – Agent SPK
 *
 * Agent korzysta z pętli ReAct (Reason → Act → Observe) i narzędzi:
 *  - fetch_document    : pobiera dokument MD z URL
 *  - submit_declaration: wysyła deklarację do /verify
 */

import dotenv from "dotenv";
import {
  callOpenRouter,
  type Message,
  type ToolDefinition,
} from "./openrouter_client";
import { fetchDocument } from "./tools/fetch_document";
import { submitDeclaration } from "./tools/submit_answer";

dotenv.config();

// ── Definicje narzędzi przekazywanych do LLM ─────────────────────────────────

const TOOLS: ToolDefinition[] = [
  {
    name: "fetch_document",
    description:
      "Pobiera dokument tekstowy (Markdown) z podanego URL. Użyj do pobrania dokumentacji SPK.",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "Pełny URL dokumentu do pobrania",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "submit_declaration",
    description:
      "Wysyła gotową deklarację transportową do centrali SPK. Użyj tylko gdy deklaracja jest w pełni wypełniona i gotowa.",
    parameters: {
      type: "object",
      properties: {
        declaration: {
          type: "string",
          description:
            "Pełny tekst deklaracji, sformatowany dokładnie według wzoru z dokumentacji (Załącznik E).",
        },
      },
      required: ["declaration"],
    },
  },
];

// ── Prompt systemowy ──────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Jesteś agentem operującym w Systemie Przesyłek Konduktorskich (SPK).
Twoim zadaniem jest przygotowanie i wysłanie poprawnie wypełnionej deklaracji transportowej.

Dane przesyłki:
- Nadawca (identyfikator): 450202122
- Punkt nadawczy: Gdańsk
- Punkt docelowy: Żarnowiec
- Waga: 2800 kg
- Budżet: 0 PP (przesyłka ma być darmowa lub finansowana przez System)
- Zawartość: kasety z paliwem do reaktora
- Uwagi specjalne: BRAK – nie dodawaj żadnych uwag specjalnych

Działaj krok po kroku:
1. Pobierz dokumentację SPK: https://hub.ag3nts.org/dane/doc/index.md
2. Pobierz zasady dotyczące wagonów: https://hub.ag3nts.org/dane/doc/dodatkowe-wagony.md
3. Na podstawie dokumentacji dobierz odpowiednią kategorię, kod trasy i oblicz WDP
4. Wypełnij deklarację DOKŁADNIE według wzoru z Załącznika E dokumentacji
5. Wyślij deklarację narzędziem submit_declaration

Ważne zasady:
- Kategoria musi być dobrana tak, by koszt był 0 PP
- Trasa do Żarnowca jest wyłączona z użytku (Dyrektywa 7.7), ale dokumentacja wskazuje wyjątki dla określonych kategorii przesyłek
- Kod trasy Gdańsk-Żarnowiec to X-01
- WDP to liczba DODATKOWYCH wagonów ponad bazowe 2 (każdy wagon = 500 kg, baza = 1000 kg)
- Pole UWAGI SPECJALNE zostaw puste (żaden tekst)
- Data dzisiejsza w formacie YYYY-MM-DD`;

// ── Pętla agenta (ReAct) ──────────────────────────────────────────────────────

async function runAgent(): Promise<void> {
  const messages: Message[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: "Wykonaj zadanie – nadaj przesyłkę." },
  ];

  console.log("=== Agent SPK START ===\n");

  const MAX_ITERATIONS = 10;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    console.log(`--- Iteracja ${i + 1} ---`);

    const response = await callOpenRouter(messages, TOOLS);

    // Agent wywołuje narzędzia
    if (response.toolCalls.length > 0) {
      // Zapisz wiadomość asystenta z tool_calls do historii
      messages.push({
        role: "assistant",
        content: response.content ?? "",
        toolCalls: response.toolCalls,
      });

      for (const toolCall of response.toolCalls) {
        console.log(`[TOOL] ${toolCall.name}`, toolCall.arguments);

        let toolResult: string;

        try {
          if (toolCall.name === "fetch_document") {
            const url = toolCall.arguments.url as string;
            const doc = await fetchDocument(url);
            toolResult = doc.slice(0, 8000); // limit kontekstu
            console.log(`[OK] Pobrano ${doc.length} znaków z ${url}`);
          } else if (toolCall.name === "submit_declaration") {
            const declaration = toolCall.arguments.declaration as string;
            console.log("\n[DEKLARACJA]\n" + declaration + "\n");
            const result = await submitDeclaration(declaration);
            toolResult = JSON.stringify(result);
            console.log("[SUBMIT RESULT]", result);

            if (result.code === 0) {
              console.log("\n✅ SUKCES! Flaga:", result.message);
              return;
            } else {
              console.log(`[BŁĄD SERWERA] ${result.message}`);
            }
          } else {
            toolResult = `Nieznane narzędzie: ${toolCall.name}`;
          }
        } catch (err) {
          toolResult = `Błąd: ${(err as Error).message}`;
          console.error("[TOOL ERROR]", toolResult);
        }

        messages.push({
          role: "tool",
          toolCallId: toolCall.id,
          content: toolResult!,
        });
      }

      continue;
    }

    // Agent odpowiedział tylko tekstem (bez tool_calls)
    if (response.content) {
      console.log("[AGENT]", response.content);
      messages.push({ role: "assistant", content: response.content });
      messages.push({
        role: "user",
        content:
          "Czy deklaracja została już wysłana? Jeśli nie, wyślij ją teraz narzędziem submit_declaration.",
      });
    }
  }

  console.error("❌ Agent nie ukończył zadania w limicie iteracji.");
  process.exit(1);
}

runAgent().catch((err) => {
  console.error("Krytyczny błąd agenta:", err);
  process.exit(1);
});
