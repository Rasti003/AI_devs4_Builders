export interface Item {
  id: string;
  description: string;
}

export function parseCsv(text: string): Item[] {
  const lines = text.trim().split("\n");
  // Pomiń nagłówek
  return lines
    .slice(1)
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      // Podziel po pierwszym przecinku — opis może zawierać przecinki
      const commaIndex = line.indexOf(",");
      const id = line.slice(0, commaIndex).trim().replace(/^"|"$/g, "");
      const description = line.slice(commaIndex + 1).trim().replace(/^"|"$/g, "");
      return { id, description };
    });
}
