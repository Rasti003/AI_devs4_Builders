# DEVS4 Terminal Dashboard

Dashboard w stylu cyberpunk/postapo do uruchamiania lekcji s01e01–s01e04 (i kolejnych). Lista katalogów, uruchomienie wybranej lekcji i stream outputu w czasie rzeczywistym do terminala w przeglądarce.

## Uruchomienie

**Produkcja (po zbudowaniu):**
```bash
cd dashboard
npm install
npm run build
npm start
```
Otwórz http://localhost:3847

**Development (serwer + Vite z proxy):**
```bash
cd dashboard
npm install
cd client && npm install && cd ..
npm run dev
```
Uruchamia serwer API (port 3847) i Vite (port 5174). Otwórz http://localhost:5174 – Vite proxy’uje `/api` i `/ws` na serwer.

## Konfiguracja

- `dashboard/.env` – opcjonalnie `PORT=3847`, `ROOT_DIR=..` (katalog nad dashboardem, np. repo s1e2).
- `dashboard/lessons.json` – manifest lekcji (id, label, cwd, command, args, longRunning). Dodanie nowej lekcji = nowy wpis.

## Technologie

- **Backend:** Node.js, Express (TS), WebSocket (ws), spawn procesów.
- **Frontend:** React 18, Vite, xterm.js (+ fit addon), CSS (neon/ciemny motyw).
