# AI_DEVS4 S1E2 – findhim (TypeScript)

## Uruchomienie (krok 1 – lista elektrowni i kody)

1) Zainstaluj zależności:

```bash
npm install
```

2) Dodaj plik `.env` w katalogu projektu:

```env
AIDEVS_KEY=twoj_klucz_z_platformy
```

Możesz skopiować `.env.example` → `.env`.

3) Odpal krok 1:

```bash
npm run step1
```

Skrypt pobierze:
`https://hub.ag3nts.org/data/<AIDEVS_KEY>/findhim_locations.json`
i wypisze listę w formacie `CODE: NAME`.

## Co robi skrypt `src/step1_locations.ts` (w skrócie)

- Bierze klucz z `process.env.AIDEVS_KEY` (czyli z `.env`).
- Składa URL do pliku JSON.
- Pobiera JSON przez `fetch`.
- Waliduje strukturę danych przez `zod`, żeby od razu wykryć, że API zwróciło coś innego niż oczekujemy.

