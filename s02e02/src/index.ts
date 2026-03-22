import dotenv from "dotenv";
import path from "path";
import { callLLM, Message, ToolDefinition, ToolCall } from "./openrouter";
import { downloadImage } from "./tools/download_image";
import { compareBoardsAndGetRotations } from "./tools/analyze_board";
import { rotateCells } from "./tools/rotate_cells";

dotenv.config({ path: path.join(__dirname, "../../.env") });

const APIKEY = process.env.AIDEVS_KEY!;
const CURRENT_BOARD_URL = `https://hub.ag3nts.org/data/${APIKEY}/electricity.png`;
const TARGET_BOARD_URL = "https://hub.ag3nts.org/i/solved_electricity.png";

const MAIN_MODEL = "anthropic/claude-sonnet-4-5";
const MAX_ITERATIONS = 15;

const TOOLS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "download_image",
      description: "Pobiera obrazek PNG z URL i zapisuje lokalnie. Zwraca ścieżkę do pliku.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL obrazka" },
          filename: { type: "string", description: "Nazwa pliku lokalnego (np. current.png)" },
        },
        required: ["url", "filename"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "compare_boards",
      description: "Porównuje dwa obrazki plansz i zwraca mapę: ile obrotów (0-3) potrzebuje każde z 9 pól. Obroty są zgodne z ruchem wskazówek zegara (90° każdy).",
      parameters: {
        type: "object",
        properties: {
          currentImagePath: { type: "string", description: "Ścieżka do aktualnej planszy" },
          targetImagePath: { type: "string", description: "Ścieżka do docelowej planszy" },
        },
        required: ["currentImagePath", "targetImagePath"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "rotate_cells",
      description: "Wysyła obroty do API. Każde pole w liście = jeden obrót 90° w prawo. Powtórz pole tyle razy ile obrotów potrzebuje. Zwraca odpowiedź API (może zawierać flagę {FLG:...}).",
      parameters: {
        type: "object",
        properties: {
          rotations: {
            type: "array",
            items: { type: "string" },
            description: "Lista pól do obrotu np. ['2x3', '2x3', '1x1'] — każde wystąpienie = 1 obrót",
          },
        },
        required: ["rotations"],
      },
    },
  },
];

const SYSTEM_PROMPT = `Jesteś agentem rozwiązującym puzzle elektryczne 3x3.

Cel: dopasować aktualną planszę do planszy docelowej przez obroty pól.

Masz do dyspozycji narzędzia:
- download_image: pobierz PNG z URL
- compare_boards: porównaj aktualną i docelową planszę — dostaniesz mapę ile obrotów potrzebuje każde pole
- rotate_cells: wyślij listę obrotów do API (każde powtórzenie pola = jeden obrót 90° w prawo)

URL obecnej planszy: ${CURRENT_BOARD_URL}
URL docelowej planszy: ${TARGET_BOARD_URL}

Plan działania:
1. Pobierz oba obrazki (download_image)
2. Porównaj je (compare_boards) — dostaniesz {"1x1": 0, "1x2": 2, ...}
3. Zbuduj listę obrotów: pole z wartością N powtarzasz N razy w liście
4. Wyślij obroty (rotate_cells) — szukaj {FLG:...} w odpowiedzi
5. Jeśli brak flagi, pobierz nowy obrazek aktualnej planszy i sprawdź ponownie

Jeśli compare_boards zwróci same zera — plansza jest już poprawna, spróbuj wysłać pusty obrót lub pobierz świeży obrazek i sprawdź ponownie.`;

async function executeTool(name: string, args: Record<string, unknown>): Promise<string> {
  if (name === "download_image") {
    const filePath = await downloadImage(args.url as string, args.filename as string);
    return JSON.stringify({ filePath });
  }

  if (name === "compare_boards") {
    const rotations = await compareBoardsAndGetRotations(
      args.currentImagePath as string,
      args.targetImagePath as string
    );
    return JSON.stringify(rotations);
  }

  if (name === "rotate_cells") {
    const result = await rotateCells(APIKEY, args.rotations as string[]);
    return JSON.stringify(result);
  }

  throw new Error(`Nieznane narzędzie: ${name}`);
}

async function run() {
  console.log("=== Agent Puzzle Elektryczne ===\n");

  const messages: Message[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: "Rozwiąż puzzle elektryczne i znajdź flagę." },
  ];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    console.log(`\n--- Iteracja ${i + 1} ---`);

    const response = await callLLM(MAIN_MODEL, messages, TOOLS);
    messages.push(response);

    // Print agent's message
    if (response.content) {
      const text = typeof response.content === "string"
        ? response.content
        : (response.content as { type: string; text?: string }[]).map(p => p.text).join("");
      if (text) console.log(`\n[Agent myśli]: ${text}`);
    }
    if (response.tool_calls) {
      for (const tc of response.tool_calls as ToolCall[]) {
        console.log(`[Agent wywołuje]: ${tc.function.name}(${tc.function.arguments})`);
      }
    }

    if (!response.tool_calls || response.tool_calls.length === 0) {
      console.log("\n[Agent] Odpowiedź końcowa:");
      console.log(typeof response.content === "string" ? response.content : JSON.stringify(response.content));
      break;
    }

    for (const toolCall of response.tool_calls as ToolCall[]) {
      const { name, arguments: argsStr } = toolCall.function;
      const args = JSON.parse(argsStr) as Record<string, unknown>;

      console.log(`\n[Tool] ${name}(${JSON.stringify(args)})`);

      const result = await executeTool(name, args);
      console.log(`[Tool] Wynik: ${result.slice(0, 300)}${result.length > 300 ? "..." : ""}`);

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
}

run().catch(console.error);
