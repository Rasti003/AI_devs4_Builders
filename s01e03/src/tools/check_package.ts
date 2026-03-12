import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

export interface PackageStatus {
  packageId: string;
  status: string;
  location?: string;
  raw: unknown;
}

const PACKAGES_API_URL = "https://hub.ag3nts.org/api/packages";
const PACKAGES_API_KEY = process.env.AIDEVS_KEY;

export async function checkPackage(packageId: string): Promise<PackageStatus> {
  if (!PACKAGES_API_KEY) {
    throw new Error(
      "Brak klucza AIDEVS_KEY w .env – nie mogę wywołać API paczek."
    );
  }

  const body = {
    apikey: PACKAGES_API_KEY,
    action: "check",
    packageid: packageId,
  };

  const response = await fetch(PACKAGES_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Błąd API paczek ${response.status} ${response.statusText}: ${text}`
    );
  }

  const json: any = await response.json();
  console.log(
    "[tool check_package] response",
    JSON.stringify({ packageId, apiResponse: json }, null, 2)
  );

  return {
    packageId,
    status: json.status ?? "unknown",
    location: json.location,
    raw: json,
  };
}

