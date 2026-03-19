import dotenv from "dotenv";
import path from "path";
import { downloadCsv, submitPrompt, resetBudget } from "./hub_client";
import { parseCsv, Item } from "./csv_parser";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const APIKEY = process.env.AIDEVS_KEY;
if (!APIKEY) {
  throw new Error("Brak AIDEVS_KEY w .env");
}

// Prompt klasyfikujący — musi zmieścić się w ~100 tokenach łącznie z danymi towaru.
// Strategia: reaktor/nuclear = NEU (pre-approved), broń/komunikacja = DNG, reszta = NEU.
// "unauthorized comms" obejmuje radio chassis (run1 poprawnie klasyfikowało jako DNG).
// Szacunek: szablon ~35 tokenów + dane towaru ~50 tokenów = poniżej 100.
const PROMPT_TEMPLATE = `Classify as DNG or NEU. Reactor fuel, nuclear cassettes, uranium=NEU (pre-approved). Weapons, explosives, unauthorized comms=DNG. Other=NEU.
Item {id}: {description}
Answer:`;

function buildPrompt(item: Item): string {
  return PROMPT_TEMPLATE.replace("{id}", item.id).replace(
    "{description}",
    item.description
  );
}

function estimateTokens(text: string): number {
  // Przybliżenie: ~4 znaki na token (dla angielskiego)
  return Math.ceil(text.length / 4);
}

async function run() {
  console.log("=== Zadanie: categorize ===\n");

  // Pobierz świeżą listę towarów
  console.log("Pobieranie CSV...");
  const rawCsv = await downloadCsv(APIKEY!);
  console.log("Surowy CSV:\n", rawCsv, "\n");

  const items = parseCsv(rawCsv);
  console.log(`Sparsowano ${items.length} towarów:\n`);
  items.forEach((item) => {
    const prompt = buildPrompt(item);
    const tokens = estimateTokens(prompt);
    console.log(`  [${item.id}] ${item.description}`);
    console.log(`         prompt ~${tokens} tokenów`);
  });
  console.log();

  // Sprawdź czy jakiś prompt jest za długi
  const tooLong = items.filter((item) => estimateTokens(buildPrompt(item)) > 95);
  if (tooLong.length > 0) {
    console.warn("UWAGA: następujące towary mogą przekroczyć limit tokenów:");
    tooLong.forEach((item) =>
      console.warn(`  [${item.id}] ~${estimateTokens(buildPrompt(item))} tokenów`)
    );
    console.warn();
  }

  // Wyślij prompt dla każdego towaru
  let flag: string | null = null;

  for (const item of items) {
    const prompt = buildPrompt(item);
    console.log(`Wysyłam [${item.id}]...`);

    try {
      const result = await submitPrompt(APIKEY!, prompt);
      console.log(`  → code: ${result.code}, message: ${result.message}`);

      // Wykryj flagę
      const flagMatch = result.message.match(/\{FLG:[^}]+\}/);
      if (flagMatch) {
        flag = flagMatch[0];
        console.log(`\n🚂 FLAGA ZNALEZIONA: ${flag}\n`);
      }
    } catch (err) {
      console.error(`  ✗ Błąd dla [${item.id}]:`, err);
    }
  }

  if (flag) {
    console.log(`\n=== WYNIK ===\n${flag}`);
  } else {
    console.log("\nNie znaleziono flagi — sprawdź błędy klasyfikacji powyżej.");
    console.log("Aby zresetować budżet, uruchom: npm run reset");
  }
}

run().catch((err) => {
  console.error("Błąd krytyczny:", err);
  process.exit(1);
});
