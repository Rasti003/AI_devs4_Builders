# Kluczowe rzeczy o agentach AI

## 1. Agent = LLM + pętla + narzędzia

To nie jest żaden framework ani magia.
Agent to po prostu:
- LLM który **decyduje** co zrobić
- Pętla która **wykonuje** jego decyzje
- Historia która **pamięta** co się stało

---

## 2. LLM nie wykonuje kodu - on MÓWI co chce zrobić

LLM zwraca JSON z nazwą funkcji i argumentami.
**Ty** wywołujesz prawdziwą funkcję i oddajesz wynik.

```
LLM: "chcę fetch_document(url=X)"
Ty:  fetch(X) → wynik
LLM: czyta wynik → decyduje co dalej
```

---

## 3. Historia wiadomości = pamięć agenta

LLM nie ma pamięci między wywołaniami.
Jedyną "pamięcią" jest tablica `messages` którą mu przekazujesz.

**Zasada:** im więcej kontekstu w historii, tym lepsze decyzje.
**Pułapka:** zbyt długa historia = przekroczenie limitu tokenów.

---

## 4. Feedback z narzędzi = samocząca się pętla

Jeśli narzędzie zwróci błąd i wrzucisz go do historii,
LLM **sam spróbuje to naprawić** w następnej iteracji.

Nie musisz pisać logiki obsługi błędów - wystarczy
przekazać błąd z powrotem do LLM.

---

## 5. System prompt = osobowość i cel agenta

System prompt to najważniejsza rzecz którą piszesz.
Określa:
- Co agent ma zrobić
- Jakie ma ograniczenia
- W jakiej kolejności ma działać

Im precyzyjniejszy prompt, tym mniej iteracji marnuje.

---

## 6. Narzędzia muszą mieć dobre opisy

LLM wybiera narzędzie **tylko na podstawie jego opisu**.
Jeśli opis jest mglisty - LLM użyje złego narzędzia lub nie użyje żadnego.

```
ZLE:  "pobiera dane"
OK:   "Pobiera dokument Markdown z podanego URL i zwraca jego treść jako tekst"
```

---

## 7. MAX_ITERATIONS to zabezpieczenie przed pętlą nieskończoną

Agent może się zapętlić (np. ciągle pobierać ten sam dokument).
Zawsze ustaw limit iteracji. Typowo: 10-15.

---

## 8. Typy wiadomości w OpenRouter/OpenAI

| Rola | Kto pisze | Co zawiera |
|---|---|---|
| `system` | Ty | Instrukcja dla agenta |
| `user` | Ty | Zadanie / nudge |
| `assistant` | LLM | Odpowiedź lub tool_calls |
| `tool` | Ty | Wynik wykonania narzędzia |

Kolejność i format muszą być dokładne - inaczej API zwróci błąd.

---

## 9. ReAct to wzorzec, nie biblioteka

**Re**ason + **Act** = myśl, działaj, obserwuj, powtarzaj.

Nie potrzebujesz LangChain ani innych frameworków.
100 linii TypeScript wystarczy do zbudowania działającego agenta.

---

## 10. Gdzie agent jest słaby

- **Długie dokumenty** - trzeba przycinać do limitu tokenów
- **Obrazki** - LLM nie widzi PNG, trzeba zamieniać na tekst
- **Niedeterminizm** - ten sam prompt może dać różne wyniki
- **Koszt** - każda iteracja = osobne wywołanie API = koszt
