import fetch from "node-fetch";

const HUB_VERIFY = "https://hub.ag3nts.org/verify";

export interface HubResult {
  code: number;
  message: string;
}

export async function downloadCsv(apikey: string): Promise<string> {
  const url = `https://hub.ag3nts.org/data/${apikey}/categorize.csv`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Błąd pobierania CSV: ${res.status} ${res.statusText}`);
  }
  return res.text();
}

export async function submitPrompt(
  apikey: string,
  prompt: string
): Promise<HubResult> {
  const payload = {
    apikey,
    task: "categorize",
    answer: { prompt },
  };

  const res = await fetch(HUB_VERIFY, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  return res.json() as Promise<HubResult>;
}

export async function resetBudget(apikey: string): Promise<HubResult> {
  const payload = {
    apikey,
    task: "categorize",
    answer: { prompt: "reset" },
  };

  const res = await fetch(HUB_VERIFY, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  return res.json() as Promise<HubResult>;
}
