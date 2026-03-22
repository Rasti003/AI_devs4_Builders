import fetch from "node-fetch";
import fs from "fs";
import path from "path";

const IMAGES_DIR = path.join(__dirname, "../../images");

export async function downloadImage(url: string, filename: string): Promise<string> {
  if (!fs.existsSync(IMAGES_DIR)) {
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
  }

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Błąd pobierania obrazu: ${res.status} ${res.statusText}`);
  }

  const filePath = path.join(IMAGES_DIR, filename);
  const buffer = await res.buffer();
  fs.writeFileSync(filePath, buffer);

  console.log(`[download_image] Pobrano: ${filename} (${buffer.length} bajtów)`);
  return filePath;
}
