import fs from "fs";
import { callLLM } from "../openrouter";

const VISION_MODEL = "google/gemini-3-flash-preview";

export type RotationsMap = Record<string, number>; // e.g. {"1x2": 2, "3x1": 1}

const COMPARE_PROMPT = `You are analyzing two electrical cable puzzle boards (3x3 grids).

The FIRST image is the CURRENT state of the board.
The SECOND image is the TARGET/SOLVED state.

Your task: for each cell, determine how many 90-degree CLOCKWISE rotations are needed to make the current cell match the target cell.

Rules:
- Each rotation turns the cable piece 90 degrees clockwise
- Possible values: 0, 1, 2, or 3 rotations
- If a cell already matches: 0 rotations
- Grid: rows 1-3 (top to bottom), columns 1-3 (left to right). Cell format: "AxB"

Return ONLY a JSON object like this (include ALL 9 cells, even if 0 rotations):
{
  "1x1": 0,
  "1x2": 1,
  "1x3": 3,
  "2x1": 0,
  "2x2": 2,
  "2x3": 1,
  "3x1": 0,
  "3x2": 3,
  "3x3": 0
}

No explanation. Only the JSON object.`;

export async function compareBoardsAndGetRotations(
  currentImagePath: string,
  targetImagePath: string
): Promise<RotationsMap> {
  const currentBuffer = fs.readFileSync(currentImagePath);
  const targetBuffer = fs.readFileSync(targetImagePath);

  const currentBase64 = `data:image/png;base64,${currentBuffer.toString("base64")}`;
  const targetBase64 = `data:image/png;base64,${targetBuffer.toString("base64")}`;

  console.log(`[analyze_board] Porównuję plansze...`);

  const response = await callLLM(
    VISION_MODEL,
    [
      {
        role: "user",
        content: [
          { type: "text", text: COMPARE_PROMPT },
          { type: "text", text: "CURRENT board (image 1):" },
          { type: "image_url", image_url: { url: currentBase64 } },
          { type: "text", text: "TARGET board (image 2):" },
          { type: "image_url", image_url: { url: targetBase64 } },
        ],
      },
    ],
    undefined,
    { max_tokens: 500, temperature: 0 }
  );

  const text = typeof response.content === "string"
    ? response.content
    : (response.content as { type: string; text?: string }[])
        .filter((p) => p.type === "text")
        .map((p) => p.text)
        .join("");

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`Nie udało się wyodrębnić JSON: ${text}`);
  }

  const rotations = JSON.parse(jsonMatch[0]) as RotationsMap;
  console.log(`[analyze_board] Potrzebne obroty:`);
  for (const [cell, count] of Object.entries(rotations)) {
    if (count > 0) console.log(`  ${cell}: ${count}x`);
  }
  return rotations;
}
