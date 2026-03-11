import {
  loadSuspects,
  loadPowerPlantsWithCoordinates,
  getAccessLevel,
  sendResultToVerify,
  type VerifyAnswer
} from './findhim_tools.js';
import { findGlobalClosestPair } from './findhim_logic.js';

async function main() {
  const suspects = await loadSuspects();
  const plants = await loadPowerPlantsWithCoordinates();

  const result = await findGlobalClosestPair(suspects, plants);

  console.log('Najbliższa para podejrzany–elektrownia:');
  console.log(
    `  ${result.suspect.name} ${result.suspect.surname} – ${result.plant.name} (${result.plant.code}), dystans ≈ ${result.distanceKm.toFixed(2)} km`
  );

  const accessLevel = await getAccessLevel({
    name: result.suspect.name,
    surname: result.suspect.surname,
    birthYear: result.suspect.born
  });

  const answer: VerifyAnswer = {
    name: result.suspect.name,
    surname: result.suspect.surname,
    accessLevel,
    powerPlant: result.plant.code
  };

  console.log('Odpowiedź do /verify:', JSON.stringify(answer, null, 2));

  const send = process.argv.includes('--send');
  if (send) {
    const { ok, body } = await sendResultToVerify(answer);
    console.log(ok ? 'Wysłano na /verify OK.' : 'Błąd /verify:', body);
  } else {
    console.log('Aby wysłać na /verify, uruchom: npm run step4 -- --send');
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
