/**
 * Surowy POST do /api/location i /api/accesslevel – wypisuje pełną odpowiedź (status + body).
 * Użycie: node dist/check_api_raw.js location Name Surname
 *         node dist/check_api_raw.js accesslevel Name Surname BirthYear
 */
import dotenv from 'dotenv';
import { resolve } from 'node:path';

dotenv.config();
dotenv.config({ path: resolve(process.cwd(), '..', '.env') });
dotenv.config({ path: resolve(process.cwd(), '..', '..', '.env') });

const apikey = process.env.AIDEVS_KEY?.trim();
if (!apikey) {
  console.error('Brak AIDEVS_KEY');
  process.exit(1);
}

const [endpoint, name, surname, yearStr] = process.argv.slice(2);
if (!endpoint || !name || !surname) {
  console.error('Użycie: node dist/check_api_raw.js location Name Surname');
  console.error('        node dist/check_api_raw.js accesslevel Name Surname BirthYear');
  process.exit(1);
}

async function main() {
  const base = 'https://hub.ag3nts.org/api';
  if (endpoint === 'location') {
    const url = `${base}/location`;
    const body = { apikey, name, surname };
    console.log('POST', url, body);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    console.log('Status:', res.status);
    console.log('Body:', JSON.stringify(data, null, 2));
    return;
  }
  if (endpoint === 'accesslevel') {
    const birthYear = yearStr ? parseInt(yearStr, 10) : 1987;
    if (Number.isNaN(birthYear)) {
      console.error('Nieprawidłowy rok:', yearStr);
      process.exit(1);
    }
    const url = `${base}/accesslevel`;
    const body = { apikey, name, surname, birthYear: birthYear };
    console.log('POST', url, body);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    console.log('Status:', res.status);
    console.log('Body:', JSON.stringify(data, null, 2));
    return;
  }
  console.error('Endpoint musi być: location lub accesslevel');
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
