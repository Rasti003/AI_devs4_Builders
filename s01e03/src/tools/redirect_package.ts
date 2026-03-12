import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

export interface RedirectResult {
  packageId: string;
  destination: string;
  code: string;
  accepted: boolean;
  confirmation?: string;
  message: string;
  raw: unknown;
}

const PACKAGES_API_URL = "https://hub.ag3nts.org/api/packages";
const PACKAGES_API_KEY = process.env.AIDEVS_KEY;

export async function redirectPackage(
  packageId: string,
  destination: string,
  code: string
): Promise<RedirectResult> {
  if (!PACKAGES_API_KEY) {
    throw new Error(
      "Brak klucza AIDEVS_KEY w .env – nie mogę wywołać API paczek."
    );
  }

  const body = {
    apikey: PACKAGES_API_KEY,
    action: "redirect",
    packageid: packageId,
    destination,
    code,
  };

  console.log(
    "[tool redirect_package] request",
    JSON.stringify({ packageId, destination, code: "***" }, null, 2)
  );

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
    "[tool redirect_package] response",
    JSON.stringify({ packageId, apiResponse: json }, null, 2)
  );

  const confirmation = json.confirmation ?? undefined;
  const accepted = json.confirmation != null || json.ok === true;

  return {
    packageId,
    destination,
    code,
    accepted,
    confirmation,
    message:
      confirmation != null
        ? `Przekierowanie zarejestrowane. Kod potwierdzenia: ${confirmation}. Proszę przekazać ten kod operatorowi.`
        : json.message ?? "Przekierowanie wykonane.",
    raw: json,
  };
}
