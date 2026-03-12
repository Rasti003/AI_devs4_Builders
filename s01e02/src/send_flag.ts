/**
 * Wysyła na /verify flagę (np. z zagadki „data urodzenia to także jest flaga”).
 * body: { apikey, task, answer } – task i answer konfigurowalne.
 *
 * Użycie:
 *   node dist/send_flag.js <flaga>              → task: "anomaly", answer: "<flaga>"
 *   node dist/send_flag.js <task> <flaga>        → task: "<task>", answer: "<flaga>"
 *
 * Przykłady (Adam Flagowski, ur. 1986-04-26):
 *   node dist/send_flag.js 19860426
 *   node dist/send_flag.js 26041986
 *   node dist/send_flag.js anomaly 19860426
 *   node dist/send_flag.js riddle 26.04.1986
 */
import dotenv from 'dotenv';
import { resolve } from 'node:path';

dotenv.config();
dotenv.config({ path: resolve(process.cwd(), '..', '.env') });
dotenv.config({ path: resolve(process.cwd(), '..', '..', '.env') });

const apikey = process.env.AIDEVS_KEY?.trim();
if (!apikey) {
  console.error('Brak AIDEVS_KEY w .env');
  process.exit(1);
}

const args = process.argv.slice(2);
let task = 'anomaly';
let answer: string;

if (args.length === 0) {
  console.error('Użycie: node dist/send_flag.js <flaga>');
  console.error('   lub: node dist/send_flag.js <task> <flaga>');
  console.error('Przykład: node dist/send_flag.js 19860426');
  process.exit(1);
}

if (args.length === 1) {
  answer = args[0];
} else {
  task = args[0];
  answer = args[1];
}

async function main() {
  const body = { apikey, task, answer };
  console.log('POST https://hub.ag3nts.org/verify');
  console.log('Body:', JSON.stringify(body, null, 2));

  const res = await fetch('https://hub.ag3nts.org/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body)
  });

  const data = await res.json().catch(() => ({}));
  console.log('Status:', res.status);
  console.log('Odpowiedź:', JSON.stringify(data, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
