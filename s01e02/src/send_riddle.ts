/**
 * Wysyła na /verify dokładnie tak samo jak findhim:
 * body: { apikey, task: "findhim", answer: { name, surname, accessLevel, powerPlant } }
 * Użycie: node dist/send_riddle.js <name> <surname> <accessLevel> <powerPlant>
 * np. node dist/send_riddle.js Wojciech Bielik 7 PWR2758PL
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
if (args.length < 4) {
  console.error('Użycie: node dist/send_riddle.js <name> <surname> <accessLevel> <powerPlant>');
  console.error('np. node dist/send_riddle.js Wojciech Bielik 7 PWR2758PL');
  process.exit(1);
}

const [name, surname, accessLevelStr, powerPlant] = args;
const accessLevel = parseInt(accessLevelStr, 10);
if (Number.isNaN(accessLevel)) {
  console.error('accessLevel musi być liczbą');
  process.exit(1);
}

const answer = { name, surname, accessLevel, powerPlant };

async function main() {
  const body = { apikey, task: 'findhim', answer };
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
