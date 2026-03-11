# AI_DEVS4 S1E2 – findhim (TypeScript)

## Uruchomienie (wersja agentowa)

1. Zainstaluj zależności w katalogu zadania:

```bash
cd s01e02
npm install
```

2. W katalogu głównym repo (`s1e2`) ustaw w `.env`:

```env
AIDEVS_KEY=twoj_klucz_z_platformy
OPENROUTER_API_KEY=sk-or-...
```

3. Uruchom agenta (Function Calling, OpenRouter). Na koniec wynik jest wysyłany na `/verify`:

```bash
cd s01e02
npm run agent:run
```

Agent używa narzędzi: lista podejrzanych, lista elektrowni, współrzędne elektrowni z LLM (geokodowanie bez hardkodowania), lokalizacje osób z API, poziom dostępu, odległość Haversine.

---

**Skrypty pomocnicze:** `step1` – lista elektrowni; `step2` – lokalizacje osoby; `step3` – access level; `openrouter:test` – test połączenia z OpenRouter.

