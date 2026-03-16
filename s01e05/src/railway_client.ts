import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

const HUB_URL = "https://hub.ag3nts.org/verify";
const TASK = "railway";
const APIKEY = process.env.AIDEVS_KEY!;

if (!APIKEY) {
  throw new Error("Brak zmiennej środowiskowej AIDEVS_KEY");
}

/**
 * Wywołuje akcję na Railway API.
 * Każde żądanie to POST na /verify z body: { apikey, task, answer: { action, ...params } }
 */
export async function callRailwayApi(
  action: string,
  params: Record<string, string> = {}
): Promise<unknown> {
  const body = {
    apikey: APIKEY,
    task: TASK,
    answer: {
      action,
      ...params,
    },
  };

  // Małe opóźnienie prewencyjne — taniej zapłacić 3s z góry niż 30s kary za rate limit
  await new Promise((res) => setTimeout(res, 3000));

  console.log(`[railway] → action="${action}"`, params);

  // Retry przy rate limit (429/503) — czekamy tyle ile serwer każe
  for (let attempt = 1; attempt <= 5; attempt++) {
    const response = await fetch(HUB_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (response.status === 429 || response.status === 503) {
      const json: any = await response.json().catch(() => ({}));
      const retryAfter = (json?.retry_after ?? 10) as number;
      console.log(`[railway] ${response.status}, czekam ${retryAfter}s (próba ${attempt}/5)...`);
      await new Promise((res) => setTimeout(res, retryAfter * 1000));
      continue;
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Railway API HTTP error ${response.status}: ${text}`);
    }

    const json = await response.json();
    console.log(`[railway] ← `, JSON.stringify(json));
    return json;
  }

  throw new Error("Railway API: przekroczono limit prób (rate limit)");
}
