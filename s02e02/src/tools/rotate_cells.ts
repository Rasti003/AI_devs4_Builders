import fetch from "node-fetch";

const HUB_VERIFY = "https://hub.ag3nts.org/verify";

export interface RotateResult {
  code: number;
  message: string;
  flag?: string;
}

export async function rotateCells(
  apikey: string,
  rotations: string[]
): Promise<RotateResult> {
  console.log(`[rotate_cells] Wysyłam ${rotations.length} obrotów: ${rotations.join(", ")}`);

  let lastResult: RotateResult = { code: 0, message: "" };

  for (const cell of rotations) {
    const payload = {
      apikey,
      task: "electricity",
      answer: { rotate: cell },
    };

    const res = await fetch(HUB_VERIFY, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    lastResult = (await res.json()) as RotateResult;
    console.log(`[rotate_cells] Obrót ${cell} → ${JSON.stringify(lastResult)}`);

    // Check for flag in message
    const flagMatch = lastResult.message?.match(/\{FLG:[^}]+\}/);
    if (flagMatch) {
      lastResult.flag = flagMatch[0];
      console.log(`[rotate_cells] FLAGA ZNALEZIONA: ${lastResult.flag}`);
      return lastResult;
    }
  }

  return lastResult;
}
