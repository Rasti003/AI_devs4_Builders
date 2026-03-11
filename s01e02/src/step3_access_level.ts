import { loadSuspects, getAccessLevel } from './findhim_tools.js';

async function main() {
  // Możemy opcjonalnie podać dane z CLI:
  // npm run step3 -- Adam Kowalski 1975
  const [, , cliName, cliSurname, cliYear] = process.argv;

  let person = { name: '', surname: '', birthYear: 0 };
  if (cliName && cliSurname && cliYear) {
    const birthYear = Number.parseInt(cliYear, 10);
    if (Number.isNaN(birthYear)) {
      throw new Error(`Niepoprawny rok urodzenia z CLI: ${cliYear}`);
    }
    person = { name: cliName, surname: cliSurname, birthYear };
  } else {
    const suspects = await loadSuspects();
    if (!suspects.length) {
      throw new Error('Brak podejrzanych w answer_final.json.');
    }
    const first = suspects[0];
    person = { name: first.name, surname: first.surname, birthYear: first.born };
  }

  console.log(
    `Sprawdzam poziom dostępu dla: ${person.name} ${person.surname}, ur. ${person.birthYear}`
  );

  const accessLevel = await getAccessLevel(person);

  console.log('Odpowiedź /api/accesslevel:');
  console.log(JSON.stringify({ accessLevel }, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});

