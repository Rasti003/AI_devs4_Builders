import fetch from "node-fetch";

/**
 * Pobiera dokument tekstowy (MD) z podanego URL.
 * Zwraca treść jako string.
 */
export async function fetchDocument(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText} - ${url}`);
  }
  return response.text();
}
