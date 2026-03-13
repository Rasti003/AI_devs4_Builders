import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const HUB_URL = "https://hub.ag3nts.org/verify";
const API_KEY = process.env.AIDEVS_KEY;

export interface SubmitResult {
  code: number;
  message: string;
}

/**
 * Wysyła deklarację do centrali SPK (/verify).
 */
export async function submitDeclaration(
  declaration: string
): Promise<SubmitResult> {
  if (!API_KEY) {
    throw new Error("Brak zmiennej środowiskowej AIDEVS_API_KEY");
  }

  const payload = {
    apikey: API_KEY,
    task: "sendit",
    answer: { declaration },
  };

  const response = await fetch(HUB_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const json = (await response.json()) as SubmitResult;
  return json;
}
