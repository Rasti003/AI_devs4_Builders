import { loadPowerPlants } from './findhim_tools.js';

async function main() {
  const locations = await loadPowerPlants();

  console.log(`Pobrano ${locations.length} elektrowni:`);
  for (const loc of locations) {
    console.log(`- ${loc.code}: ${loc.name}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});

