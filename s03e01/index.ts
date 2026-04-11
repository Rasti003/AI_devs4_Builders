import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";
import { callLLM } from "./openrouter";

dotenv.config({ path: path.join(__dirname, "../.env") });

const APIKEY = process.env.AIDEVS_KEY!;
const SENSORS_DIR = path.join(__dirname, "sensors");
const BATCH_SIZE = 50;
const CONCURRENCY = 10;
const MODEL = "openai/gpt-4o-mini";

const SENSOR_FIELDS: Record<string, string[]> = {
  temperature: ["temperature_K"],
  pressure: ["pressure_bar"],
  water: ["water_level_meters"],
  voltage: ["voltage_supply_v"],
  humidity: ["humidity_percent"],
};

const ALL_FIELDS = ["temperature_K", "pressure_bar", "water_level_meters", "voltage_supply_v", "humidity_percent"];

const PHYSICAL_LIMITS: Record<string, [number, number]> = {
  temperature_K: [0, 2000],
  pressure_bar: [0, 500],
  water_level_meters: [0, 100],
  voltage_supply_v: [0, 500],
  humidity_percent: [0, 100],
};

// Zakresy statystyczne — wartości poza nimi to outliers (Typ B: OK notatka, złe dane)
const STAT_LIMITS: Record<string, [number, number]> = {
  temperature_K: [520, 900],
  pressure_bar: [59, 170],
  water_level_meters: [1, 18],
  voltage_supply_v: [222, 250],
  humidity_percent: [39, 85],
};


interface SensorData {
  sensor_type: string;
  timestamp: number;
  temperature_K: number;
  pressure_bar: number;
  water_level_meters: number;
  voltage_supply_v: number;
  humidity_percent: number;
  operator_notes: string;
}

function getExpectedFields(sensor_type: string): string[] {
  const types = sensor_type.split("/");
  const expected = new Set<string>();
  for (const t of types) {
    const fields = SENSOR_FIELDS[t];
    if (fields) fields.forEach(f => expected.add(f));
  }
  return Array.from(expected);
}

function checkProgrammatic(data: SensorData): string | null {
  const expectedFields = getExpectedFields(data.sensor_type);
  const unexpectedFields = ALL_FIELDS.filter(f => !expectedFields.includes(f));

  for (const f of expectedFields) {
    const val = data[f as keyof SensorData] as number;
    if (val === 0) {
      return `${f} powinno być niezerowe dla sensor_type="${data.sensor_type}", ale wynosi 0`;
    }
  }

  for (const f of unexpectedFields) {
    const val = data[f as keyof SensorData] as number;
    if (val !== 0) {
      return `${f} powinno być 0 dla sensor_type="${data.sensor_type}", ale wynosi ${val}`;
    }
  }

  for (const [field, [min, max]] of Object.entries(PHYSICAL_LIMITS)) {
    const val = data[field as keyof SensorData] as number;
    if (val !== 0 && (val < min || val > max)) {
      return `${field}=${val} wykracza poza fizyczny zakres [${min}, ${max}]`;
    }
  }

  for (const [field, [min, max]] of Object.entries(STAT_LIMITS)) {
    const val = data[field as keyof SensorData] as number;
    if (val !== 0 && (val < min || val > max)) {
      return `${field}=${val} jest outlierem statystycznym (zakres ${min}-${max})`;
    }
  }

  if (!data.operator_notes || data.operator_notes.trim() === "") {
    return "Brak notatki operatora";
  }

  return null;
}

async function checkNotesWithLLM(batch: Array<{ id: string; data: SensorData }>): Promise<string[]> {
  const items = batch.map(({ id, data }) => {
    const nonZeroFields = ALL_FIELDS
      .filter(f => (data[f as keyof SensorData] as number) !== 0)
      .map(f => `${f}=${data[f as keyof SensorData]}`)
      .join(", ");
    return `ID: ${id}\nsensor_type: ${data.sensor_type}\ndane: ${nonZeroFields}\nnotatka: "${data.operator_notes}"`;
  }).join("\n---\n");

  const prompt = `Sprawdź czy notatka operatora jest spójna z danymi sensora. Szukasz TYLKO:

TYP A — Dane normalne, notatka alarmuje o problemie/awarii/niestabilności.
Zakresy normalne: temperature_K: 500-1100, pressure_bar: 60-250, water_level_meters: 1-22, voltage_supply_v: 220-305, humidity_percent: 40-100
Jeśli dane są w normie ale notatka mówi o awarii/problemie → ANOMALIA.

TYP B — Notatka mówi OK/stable ale dane poza normą (podanymi zakresami powyżej).

Odpowiedź TYLKO JSON: {"anomalies": [{"id": "0001", "type": "A"}, ...]}
Jeśli brak: {"anomalies": []}

Dane:
${items}`;

  const response = await callLLM(MODEL, [
    { role: "system", content: "Zwracasz TYLKO JSON bez dodatkowego tekstu." },
    { role: "user", content: prompt },
  ]);

  const content = typeof response.content === "string" ? response.content : "";
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) return [];

  try {
    const parsed = JSON.parse(match[0]);
    const anomalies = parsed.anomalies || [];
    return anomalies.map((a: string | { id: string }) => typeof a === "string" ? a : a.id);
  } catch {
    return [];
  }
}

async function runLLMPass(allFiles: Array<{ id: string; data: SensorData }>): Promise<Set<string>> {
  const found = new Set<string>();
  const batches: Array<{ idx: number; batch: typeof allFiles }> = [];
  for (let i = 0; i < allFiles.length; i += BATCH_SIZE) {
    batches.push({ idx: Math.floor(i / BATCH_SIZE), batch: allFiles.slice(i, i + BATCH_SIZE) });
  }
  const total = batches.length;

  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const chunk = batches.slice(i, i + CONCURRENCY);
    const results = await Promise.all(chunk.map(async ({ idx, batch }) => {
      const ids = await checkNotesWithLLM(batch);
      process.stdout.write(`  [${idx + 1}/${total}] ${ids.length} anomalii  `);
      return ids;
    }));
    results.forEach(ids => ids.forEach(id => found.add(id)));
    console.log();
  }
  return found;
}

async function main() {
  console.log("=== Detekcja anomalii sensorów ===\n");

  const files = fs.readdirSync(SENSORS_DIR).filter(f => f.endsWith(".json")).sort();
  console.log(`Załadowano ${files.length} plików\n`);

  const anomalies = new Set<string>();
  const okFiles: Array<{ id: string; data: SensorData }> = [];

  // STEP 1: Programistyczna analiza
  console.log("STEP 1: Analiza programistyczna...");
  for (const file of files) {
    const id = file.replace(".json", "");
    const data: SensorData = JSON.parse(fs.readFileSync(path.join(SENSORS_DIR, file), "utf-8"));
    const issue = checkProgrammatic(data);
    if (issue) {
      console.log(`  [ANOMALIA] ${id}: ${issue}`);
      anomalies.add(id);
    } else {
      okFiles.push({ id, data });
    }
  }
  console.log(`\nStep 1: ${anomalies.size} anomalii, ${okFiles.length} do LLM\n`);

  // STEP 2: Pełne przejście LLM po wszystkich okFiles (bez filtra słów kluczowych)
  console.log(`STEP 2: Pełny LLM scan: ${okFiles.length} plików\n`);

  console.log("Przebieg 1:");
  const pass1 = await runLLMPass(okFiles);
  console.log(`\nPrzebieg 2:`);
  const pass2 = await runLLMPass(okFiles);
  console.log(`\nPrzebieg 3:`);
  const pass3 = await runLLMPass(okFiles);

  // Głosowanie większościowe: co najmniej 2 z 3 przebiegów musi zgodzić się
  const allIds = new Set([...pass1, ...pass2, ...pass3]);
  const majority = new Set<string>();
  for (const id of allIds) {
    const votes = (pass1.has(id) ? 1 : 0) + (pass2.has(id) ? 1 : 0) + (pass3.has(id) ? 1 : 0);
    if (votes >= 2) majority.add(id);
  }
  console.log(`\nPass1: ${pass1.size}, Pass2: ${pass2.size}, Pass3: ${pass3.size}, Majority(≥2): ${majority.size}`);
  majority.forEach(id => anomalies.add(id));

  console.log(`\nŁącznie anomalii: ${anomalies.size}`);
  fs.writeFileSync("anomalies.json", JSON.stringify(Array.from(anomalies).sort(), null, 2));

  const answer = { recheck: Array.from(anomalies).sort() };
  console.log("Próbka:", answer.recheck.slice(0, 10));

  const response = await fetch("https://hub.ag3nts.org/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apikey: APIKEY, task: "evaluation", answer }),
  });

  const result = await response.json() as any;
  console.log("\nOdpowiedź:", JSON.stringify(result, null, 2));
}

main().catch(console.error);
