import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.join(__dirname, '../../.env') });

const APIKEY = process.env.AIDEVS_KEY!;
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY!;
const SHELL_URL = 'https://hub.ag3nts.org/api/shell';
const VERIFY_URL = 'https://hub.ag3nts.org/verify';
const MODEL = 'anthropic/claude-sonnet-4-6';

const FORBIDDEN_PATHS = ['/etc', '/root', '/proc'];

// ─── Shell API ────────────────────────────────────────────────────────────────

async function shell(cmd: string): Promise<{ code: number; data?: any; message?: string; ban?: any }> {
  console.log(`\n$ ${cmd}`);
  const res = await fetch(SHELL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apikey: APIKEY, cmd }),
  });
  const json = await res.json() as any;
  console.log(JSON.stringify(json));

  if (json.ban) {
    const wait = (json.ban.ttl_seconds || json.ban.seconds_left || 30) * 1000 + 2000;
    console.log(`[BAN] Waiting ${wait / 1000}s...`);
    await new Promise(r => setTimeout(r, wait));
  }
  return json;
}

// ─── LLM ─────────────────────────────────────────────────────────────────────

async function llm(system: string, user: string): Promise<string> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  const json = await res.json() as any;
  return json.choices[0].message.content as string;
}

// ─── FAZA 1: Eksploracja (read-only) ─────────────────────────────────────────

async function phase1_explore(): Promise<string> {
  console.log('\n═══ FAZA 1: EKSPLORACJA ═══');
  const notes: string[] = [];
  const visited = new Set<string>();
  const forbidden = new Set<string>(FORBIDDEN_PATHS);

  async function getGitignore(dir: string): Promise<string[]> {
    const r = await shell(`cat ${dir}/.gitignore`);
    if (r.code === 150 && typeof r.data === 'string') {
      return r.data.split('\n').map((l: string) => l.trim()).filter(Boolean);
    }
    return [];
  }

  async function explore(dir: string) {
    if (visited.has(dir)) return;
    visited.add(dir);

    if (FORBIDDEN_PATHS.some(f => dir.startsWith(f))) {
      notes.push(`[SKIP] ${dir} — forbidden path`);
      return;
    }

    const gitignored = await getGitignore(dir);
    const forbiddenInDir = gitignored.map(g => path.posix.join(dir, g));
    forbiddenInDir.forEach(f => forbidden.add(f.replace(/\/$/, '')));

    const r = await shell(`ls ${dir}`);
    if (r.code !== 120) {
      notes.push(`[ls ${dir}] code=${r.code} ${r.message}`);
      return;
    }

    const entries: string[] = r.data || [];
    notes.push(`\n[DIR] ${dir}\n${entries.join(', ')}`);

    for (const entry of entries) {
      const fullPath = path.posix.join(dir, entry.replace(/\/$/, ''));

      // Skip forbidden
      if (forbidden.has(fullPath) || FORBIDDEN_PATHS.some(f => fullPath.startsWith(f + '/'))) {
        notes.push(`[SKIP] ${fullPath} — gitignore/forbidden`);
        continue;
      }

      if (entry.endsWith('/')) {
        await explore(fullPath);
      } else if (!entry.startsWith('.git')) {
        // Read file (skip binary .bin)
        if (entry.endsWith('.bin')) {
          notes.push(`[BIN] ${fullPath} — skipping binary`);
          continue;
        }
        const fc = await shell(`cat ${fullPath}`);
        if (fc.code === 150) {
          notes.push(`\n[FILE] ${fullPath}\n${fc.data}`);
        } else if (fc.ban) {
          notes.push(`[BAN-READ] ${fullPath} — caused ban, skipping`);
          forbidden.add(fullPath);
        } else {
          notes.push(`[FILE-ERR] ${fullPath} code=${fc.code} ${fc.message}`);
        }
      }
    }
  }

  // Start from root-level dirs (skip forbidden)
  const root = await shell('ls /');
  const rootDirs: string[] = (root.data || []);
  notes.push(`[ROOT] ${rootDirs.join(', ')}`);

  for (const entry of rootDirs) {
    const fullPath = '/' + entry.replace(/\/$/, '');
    if (!FORBIDDEN_PATHS.includes(fullPath)) {
      await explore(fullPath);
    }
  }

  return notes.join('\n');
}

// ─── FAZA 2: Plan ────────────────────────────────────────────────────────────

async function phase2_plan(explorationNotes: string): Promise<string[]> {
  console.log('\n═══ FAZA 2: PLANOWANIE ═══');

  const system = `Jesteś ekspertem od systemów Linux i firmware.
Twoim zadaniem jest przeanalizować zebrane informacje o wirtualnej maszynie i ułożyć MINIMALNY plan kroków do uruchomienia /opt/firmware/cooler/cooler.bin.

Zasady:
- Nie wolno dotykać: /etc, /root, /proc, .env, storage.cfg, logs/ (gitignore)
- Możliwe komendy: ls, cat, find, editline <file> <line> <content>, rm <file>, reboot
- Hasło do binarki jest gdzieś w systemie
- settings.ini wymaga zmian (cooling enabled=false, test_mode enabled=true, SAFETY_CHECK zakomentowany)
- cooler-is-blocked.lock blokuje uruchomienie — prawdopodobnie trzeba usunąć
- Po uruchomieniu binarki pojawi się kod ECCS-xxx...

Zwróć TYLKO numerowaną listę kroków w formacie JSON array of strings, np.:
["krok1", "krok2", ...]

Każdy krok to konkretna komenda shell lub akcja.`;

  const response = await llm(system, `Zebrane informacje:\n${explorationNotes}`);
  console.log('\nPlan LLM:\n', response);

  // Parse JSON array from response
  const match = response.match(/\[[\s\S]*\]/);
  if (!match) return ['cat /opt/firmware/cooler/cooler-is-blocked.lock', 'rm /opt/firmware/cooler/cooler-is-blocked.lock'];
  try {
    return JSON.parse(match[0]) as string[];
  } catch {
    return [];
  }
}

// ─── FAZA 3: Wykonanie ───────────────────────────────────────────────────────

async function phase3_execute(plan: string[]): Promise<string | null> {
  console.log('\n═══ FAZA 3: WYKONANIE ═══');
  const bannedSteps: Set<number> = new Set();

  for (let i = 0; i < plan.length; i++) {
    if (bannedSteps.has(i)) {
      console.log(`[SKIP] Krok ${i + 1} pominięty (poprzednio ban)`);
      continue;
    }

    const step = plan[i];
    console.log(`\n[KROK ${i + 1}/${plan.length}] ${step}`);

    const r = await shell(step);

    if (r.ban) {
      console.log(`[BAN] Krok ${i + 1} wywołał ban — adnotacja, pomijam`);
      bannedSteps.add(i);
      continue;
    }

    // Look for ECCS code in response
    const text = JSON.stringify(r);
    const eccsMatch = text.match(/ECCS-[a-zA-Z0-9]+/);
    if (eccsMatch) {
      console.log(`\n✓ Znaleziono kod: ${eccsMatch[0]}`);
      return eccsMatch[0];
    }
  }

  return null;
}

// ─── Submission ──────────────────────────────────────────────────────────────

async function submit(code: string) {
  console.log(`\n[SUBMIT] ${code}`);
  const r = await fetch(VERIFY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apikey: APIKEY, task: 'firmware', answer: { confirmation: code } }),
  });
  const json = await r.json();
  console.log('Wynik:', JSON.stringify(json));
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const notes = await phase1_explore();
  console.log('\n═══ NOTATKI Z EKSPLORACJI ═══\n', notes);

  const plan = await phase2_plan(notes);
  console.log('\n═══ PLAN ═══\n', plan);

  const code = await phase3_execute(plan);

  if (code) {
    await submit(code);
  } else {
    console.log('\n[!] Nie znaleziono kodu ECCS. Sprawdź logi i dostosuj plan.');
  }
}

main().catch(console.error);
