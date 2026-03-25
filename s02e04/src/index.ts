import dotenv from "dotenv";
import path from "path";
import fetch from "node-fetch";
import { callLLM, Message, ToolDefinition, ToolCall } from "./openrouter";

dotenv.config({ path: path.join(__dirname, "../../.env") });

const APIKEY = process.env.AIDEVS_KEY!;
const ZMAIL_URL = "https://hub.ag3nts.org/api/zmail";
const VERIFY_URL = "https://hub.ag3nts.org/verify";
const MODEL = "google/gemini-2.5-flash";
const MAX_ITERATIONS = 20;

// Stan zbieranych danych — trzymamy w pamięci przez całe uruchomienie
const found: { date: string | null; password: string | null; confirmation_code: string | null } = {
  date: null,
  password: null,
  confirmation_code: null,
};

async function zmailRequest(body: object) {
  const res = await fetch(ZMAIL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apikey: APIKEY, ...body }),
  });
  return res.json();
}

const TOOLS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "search_mail",
      description: "Wyszukuje maile w skrzynce. Wspiera operatory Gmail: from:, to:, subject:, OR, AND. Zwraca listę maili z metadanymi (bez treści). Użyj getMessages żeby pobrać pełną treść.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Zapytanie, np. 'from:proton.me' lub 'subject:hasło'" },
          page: { type: "number", description: "Numer strony (domyślnie 1)" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_messages",
      description: "Pobiera pełną treść wiadomości po rowID lub messageID. Możesz podać jeden ID lub tablicę.",
      parameters: {
        type: "object",
        properties: {
          ids: {
            description: "Jeden rowID (liczba), jeden messageID (32-znakowy hash) lub tablica ID",
            oneOf: [
              { type: "number" },
              { type: "string" },
              { type: "array", items: { oneOf: [{ type: "number" }, { type: "string" }] } },
            ],
          },
        },
        required: ["ids"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "submit_answer",
      description: "Wysyła zebrane dane do weryfikacji. Używaj tylko gdy masz wszystkie 3 wartości: date, password, confirmation_code.",
      parameters: {
        type: "object",
        properties: {
          date: { type: "string", description: "Data ataku w formacie YYYY-MM-DD" },
          password: { type: "string", description: "Hasło do systemu pracowniczego" },
          confirmation_code: { type: "string", description: "Kod SEC- (36 znaków łącznie)" },
        },
        required: ["date", "password", "confirmation_code"],
      },
    },
  },
];

async function executeTool(name: string, args: Record<string, unknown>): Promise<string> {
  if (name === "search_mail") {
    const result = await zmailRequest({
      action: "search",
      query: args.query,
      page: args.page ?? 1,
      perPage: 10,
    });
    return JSON.stringify(result);
  }

  if (name === "get_messages") {
    const result = await zmailRequest({
      action: "getMessages",
      ids: args.ids,
    });
    return JSON.stringify(result);
  }

  if (name === "submit_answer") {
    const code = args.confirmation_code as string;
    if (code.length !== 36) {
      return JSON.stringify({ ok: false, error: `Zły kod: ma ${code.length} znaków, powinien mieć 36. Znajdź poprawny kod zanim wyślesz.` });
    }

    found.date = args.date as string;
    found.password = args.password as string;
    found.confirmation_code = code;

    const res = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apikey: APIKEY,
        task: "mailbox",
        answer: {
          date: args.date,
          password: args.password,
          confirmation_code: args.confirmation_code,
        },
      }),
    });
    const data = await res.json();
    return JSON.stringify(data);
  }

  throw new Error(`Nieznane narzędzie: ${name}`);
}

const SYSTEM_PROMPT = `Jesteś agentem przeszukującym skrzynkę mailową operatora Systemu.

Cel: zebrać 3 informacje z maili i wysłać je do weryfikacji:
- date: data planowanego ataku na elektrownię (format YYYY-MM-DD)
- password: hasło do systemu pracowniczego
- confirmation_code: kod potwierdzenia w formacie SEC- + 32 znaki (36 znaków łącznie)

Co wiemy:
- Wiktor z ruchu oporu wysłał donos z domeny proton.me
- Mail Wiktora może zawierać datę ataku
- Hasło i kod mogą być w innych mailach na tej skrzynce

Strategia:
1. Zacznij od search_mail z query "from:proton.me" — znajdź maile od Wiktora
2. Pobierz pełną treść znalezionych maili przez get_messages
3. Dla brakujących informacji — szukaj dalej przez search_mail z innymi zapytaniami
4. Skrzynka jest aktywna — nowe maile mogą wpłynąć. Jeśli nie możesz czegoś znaleźć, spróbuj ponownie
5. Gdy masz wszystkie 3 wartości — wywołaj submit_answer

WAŻNE: Zawsze pobieraj pełną treść maila przez get_messages przed wyciąganiem wniosków — sama lista wyników nie zawiera treści.`;

async function run() {
  console.log("=== Agent Mailbox ===\n");

  const messages: Message[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: "Przeszukaj skrzynkę i znajdź: datę ataku na elektrownię, hasło do systemu pracowniczego oraz kod potwierdzenia SEC-. Wyślij odpowiedź gdy zbierzesz komplet." },
  ];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    console.log(`\n--- Iteracja ${i + 1} ---`);

    const response = await callLLM(MODEL, messages, TOOLS);
    messages.push(response);

    if (response.content) console.log(`[Agent myśli]: ${response.content}`);

    if (!response.tool_calls || response.tool_calls.length === 0) {
      console.log("[Agent] Zakończył bez wywołania narzędzi.");
      break;
    }

    for (const toolCall of response.tool_calls as ToolCall[]) {
      const { name, arguments: argsStr } = toolCall.function;
      const args = JSON.parse(argsStr) as Record<string, unknown>;

      console.log(`\n[Tool wywołanie] ${name}`);
      console.log(`[Tool args] ${JSON.stringify(args, null, 2)}`);
      const result = await executeTool(name, args);
      console.log(`[Tool wynik]\n${JSON.stringify(JSON.parse(result), null, 2)}`);

      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: result,
      });

      if (result.includes("FLG:")) {
        const flagMatch = result.match(/\{FLG:[^}]+\}/);
        if (flagMatch) {
          console.log(`\n*** FLAGA: ${flagMatch[0]} ***`);
          return;
        }
      }
    }
  }

  console.log("\nStan zebranych danych:", found);
}

run().catch(console.error);
