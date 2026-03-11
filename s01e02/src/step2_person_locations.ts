import { loadSuspects, getLocationsForPerson } from './findhim_tools.js';

async function main() {
  // Pozwalamy podać imię i nazwisko z linii komend:
  // npm run step2 -- Adam Kowalski
  const [, , cliName, cliSurname] = process.argv;

  let person = { name: '', surname: '' };
  if (cliName && cliSurname) {
    person = { name: cliName, surname: cliSurname };
  } else {
    const suspects = await loadSuspects();
    if (!suspects.length) {
      throw new Error('Brak podejrzanych w answer_final.json.');
    }
    person = { name: suspects[0].name, surname: suspects[0].surname };
  }

  console.log(`Sprawdzam lokalizacje dla osoby: ${person.name} ${person.surname}`);

  const coords = await getLocationsForPerson(person);

  console.log('Odpowiedź /api/location (lista współrzędnych):');
  console.log(JSON.stringify(coords, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});

