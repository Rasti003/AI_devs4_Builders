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
  // Krok 1: co API w ogóle umie?
  console.log('=== HELP ===');
  const help = await zmailRequest({ action: 'help', page: 1 });
  console.log(JSON.stringify(help, null, 2));

  // Krok 2: pierwsza strona inboxa — jak wyglądają metadane?
  console.log('\n=== INBOX (page 1) ===');
  const inbox = await zmailRequest({ action: 'getInbox', page: 1 });
  console.log(JSON.stringify(inbox, null, 2));
}

main().catch(console.error);
