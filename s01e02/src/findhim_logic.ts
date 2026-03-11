import type { Suspect, Coordinate } from './findhim_tools.js';
import type { PowerPlantWithCoordinates } from './findhim_tools.js';
import { getLocationsForPerson, haversineDistanceKm } from './findhim_tools.js';

export type { PowerPlantWithCoordinates };

export type ClosestPlantForSuspectResult = {
  suspect: Suspect;
  plant: PowerPlantWithCoordinates;
  distanceKm: number;
  personCoordinate: Coordinate;
};

export type GlobalClosestPairResult = {
  suspect: Suspect;
  plant: PowerPlantWithCoordinates;
  distanceKm: number;
  personCoordinate: Coordinate;
};

export async function findClosestPlantForSuspect(
  suspect: Suspect,
  plants: PowerPlantWithCoordinates[]
): Promise<ClosestPlantForSuspectResult> {
  if (!plants.length) {
    throw new Error('Brak elektrowni z współrzędnymi (lista plants jest pusta).');
  }

  const personCoords = await getLocationsForPerson({
    name: suspect.name,
    surname: suspect.surname
  });

  if (!personCoords.length) {
    throw new Error(
      `Brak współrzędnych z /api/location dla osoby ${suspect.name} ${suspect.surname}.`
    );
  }

  let best: ClosestPlantForSuspectResult | null = null;

  for (const coord of personCoords) {
    for (const plant of plants) {
      const d = haversineDistanceKm(coord, plant.coordinates);
      if (!Number.isFinite(d)) continue;

      if (!best || d < best.distanceKm) {
        best = {
          suspect,
          plant,
          distanceKm: d,
          personCoordinate: coord
        };
      }
    }
  }

  if (!best) {
    throw new Error(
      `Nie udało się wyznaczyć minimalnej odległości dla osoby ${suspect.name} ${suspect.surname}.`
    );
  }

  return best;
}

export async function findGlobalClosestPair(
  suspects: Suspect[],
  plants: PowerPlantWithCoordinates[]
): Promise<GlobalClosestPairResult> {
  if (!suspects.length) {
    throw new Error('Brak podejrzanych (lista suspects jest pusta).');
  }

  if (!plants.length) {
    throw new Error('Brak elektrowni z współrzędnymi (lista plants jest pusta).');
  }

  let globalBest: GlobalClosestPairResult | null = null;

  for (const suspect of suspects) {
    const bestForSuspect = await findClosestPlantForSuspect(suspect, plants);
    if (!globalBest || bestForSuspect.distanceKm < globalBest.distanceKm) {
      globalBest = bestForSuspect;
    }
  }

  if (!globalBest) {
    throw new Error('Nie udało się znaleźć globalnie najbliższej pary podejrzany–elektrownia.');
  }

  return globalBest;
}

