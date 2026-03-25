import * as dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config({ path: '../.env' });

const API_URL = 'https://hub.ag3nts.org/api/zmail';
const API_KEY = process.env.AIDEVS_KEY!;

async function zmailRequest(body: object) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apikey: API_KEY, ...body }),
  });
  return res.json();
}

async function main() {
  // Pobierz rowID 0 z załącznikiem
  const r0 = await zmailRequest({ action: 'getMessages', ids: 0 }) as any;
  const attachment = r0.items?.[0]?.attachment?.[0];
  console.log('Załącznik:', attachment?.filename);

  // Zdekoduj base64 → zip → odczytaj zawartość
  const base64Data = attachment?.data?.replace('data:application/zip;base64,', '') ?? '';
  const zipBuffer = Buffer.from(base64Data, 'base64');

  // ZIP Store (bez kompresji): znajdź nazwę pliku i treść ręcznie
  // Local file header: 30 bajtów + filename_len + extra_len
  const fileNameLen = zipBuffer.readUInt16LE(26);
  const extraFieldLen = zipBuffer.readUInt16LE(28);
  const compressedSize = zipBuffer.readUInt32LE(18);
  const contentStart = 30 + fileNameLen + extraFieldLen;

  const fileName = zipBuffer.slice(30, 30 + fileNameLen).toString('utf8');
  const content = zipBuffer.slice(contentStart, contentStart + compressedSize).toString('utf8');

  console.log('Plik w zip:', fileName);
  console.log('Treść:', content);

  // Odszyfruj GADERYPOLUKI
  const pairs = 'GADERYPOLUKI';
  function decipher(text: string): string {
    return text.split('').map(c => {
      const upper = c.toUpperCase();
      const idx = pairs.indexOf(upper);
      if (idx === -1) return c;
      const partner = idx % 2 === 0 ? pairs[idx + 1] : pairs[idx - 1];
      return c === upper ? partner : partner.toLowerCase();
    }).join('');
  }

  console.log('Po odszyfrowaniu GADERYPOLUKI:', decipher(content));
}

main().catch(console.error);
