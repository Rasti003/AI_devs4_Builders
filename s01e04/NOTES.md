# s01e04 – Jak działa agent (notatki)

## Rdzeń - pętla ReAct

```
THINK → ACT → OBSERVE → THINK → ACT → ...
```

Nie ma tu żadnej magii. To zwykła pętla `for` która:
1. Pyta LLM co zrobić
2. Wykonuje to co LLM powiedział
3. Zwraca wynik do LLM
4. Powtarza

```typescript
for (let i = 0; i < MAX_ITERATIONS; i++) {
  const response = await callOpenRouter(messages, TOOLS)  // THINK

  if (response.toolCalls.length > 0) {
    // ACT + OBSERVE
    executeTools() → addResultToMessages() → continue
  }
}
```

---

## Historia wiadomości - to jest serce agenta

Każda iteracja **dokłada** wiadomości do tablicy `messages`. LLM widzi **cały kontekst** od początku:

```
[system]     - instrukcja co robić
[user]       - "nadaj przesyłkę"
[assistant]  - "chcę pobrać index.md"                         ← LLM
[tool]       - "...treść dokumentu..."                         ← my
[assistant]  - "chcę pobrać wagony.md"                        ← LLM
[tool]       - "...treść..."                                   ← my
[assistant]  - "chcę wysłać deklarację"                       ← LLM
[tool]       - '{"code":-980,"message":"wrong format"}'        ← serwer odrzucił
[assistant]  - "pobiorę załącznik E"                          ← LLM SAM NAPRAWIŁ BŁĄD
[tool]       - "...wzór deklaracji..."
[assistant]  - "wysyłam poprawnie"
[tool]       - '{"code":0,"message":"{FLG:WISDOM}"}'          ✅
```

LLM nie "pamięta" - on po prostu **czyta całą historię** przy każdym wywołaniu
i na jej podstawie decyduje co dalej.

---

## Narzędzia (tools) - jak LLM "wywołuje" funkcje

LLM **nie wywołuje** funkcji bezpośrednio. Działa tak:

**1. My opisujemy narzędzia w JSON Schema:**
```typescript
{
  name: "fetch_document",
  description: "Pobiera dokument MD z URL",
  parameters: {
    type: "object",
    properties: { url: { type: "string" } },
    required: ["url"]
  }
}
```

**2. LLM odpowiada strukturą zamiast tekstem:**
```json
{
  "tool_calls": [{
    "id": "call_abc123",
    "function": {
      "name": "fetch_document",
      "arguments": "{\"url\": \"https://hub.ag3nts.org/dane/doc/index.md\"}"
    }
  }]
}
```

**3. My interpretujemy i wywołujemy prawdziwą funkcję:**
```typescript
if (toolCall.name === "fetch_document") {
  const result = await fetchDocument(url)  // prawdziwy HTTP fetch
  messages.push({ role: "tool", content: result })
}
```

---

## Self-healing - dlaczego agent naprawia błędy

To nie jest żadna specjalna logika. Gdy serwer zwrócił:
```
{"code": -980, "message": "Declaration does not contain required template"}
```

Ten string trafił jako wiadomość `tool` do historii. LLM przeczytał go
w kolejnej iteracji i po prostu... zrozumiał że format jest zły i sam wpadł
na pomysł żeby pobrać `zalacznik-E.md`.

**Jedyne co my zrobiliśmy** - przekazaliśmy wynik z powrotem do LLM.
Reszta to jego reasoning.

---

## Struktura plików

```
src/
  index.ts                ← pętla ReAct + system prompt + definicje tools
  openrouter_client.ts    ← HTTP do OpenRouter, konwersja formatu wiadomości
  tools/
    fetch_document.ts     ← node-fetch do pobierania URL
    submit_answer.ts      ← POST do /verify z deklaracją
```

Każdy plik robi jedną rzecz. Agent to dosłownie ~100 linii logiki.

---

## Model

OpenRouter → `openai/gpt-4.1-mini`
Zmień w `openrouter_client.ts` → stała `MODEL`.
