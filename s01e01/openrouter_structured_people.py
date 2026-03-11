import csv
import json
import os
from typing import Any, Dict, List, Optional

import requests

INPUT_FILE = "people_filtered_step1.csv"
OUTPUT_FILE = "answer_from_llm.json"

OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"
MODEL_NAME = "openai/gpt-4.1-mini"

ALLOWED_TAGS = [
    "IT",
    "transport",
    "edukacja",
    "medycyna",
    "praca z ludźmi",
    "praca z pojazdami",
    "praca fizyczna",
]

# To jest placeholder dokładnie jak w przykładzie z zadania.
# Po otrzymaniu JSON-a możesz ręcznie podmienić tę wartość na swój prawdziwy klucz.
COURSE_APIKEY_PLACEHOLDER = "tutaj-twój-klucz-api"


def get_openrouter_key() -> str:
    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        raise RuntimeError(
            "Brak zmiennej środowiskowej OPENROUTER_API_KEY. "
            "Ustaw ją na swój klucz z OpenRouter."
        )
    return api_key


def parse_birth_year(birth_str: str) -> Optional[int]:
    s = (birth_str or "").strip()
    if len(s) >= 4 and s[:4].isdigit():
        return int(s[:4])
    return None


def load_people() -> List[Dict[str, Any]]:
    people: List[Dict[str, Any]] = []

    with open(INPUT_FILE, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            birth_year = parse_birth_year(row.get("birthDate", ""))
            if birth_year is None:
                continue

            people.append(
                {
                    "name": row.get("name", ""),
                    "surname": row.get("surname", ""),
                    "gender": row.get("gender", ""),
                    "born": birth_year,
                    "city": row.get("birthPlace", ""),
                    "job": row.get("job", ""),
                }
            )

    return people


def build_payload(people: List[Dict[str, Any]]) -> Dict[str, Any]:
    people_json = json.dumps(people, ensure_ascii=False, indent=2)

    return {
        "model": MODEL_NAME,
        "response_format": {
            "type": "json_schema",
            "json_schema": {
                "name": "people_response",
                "schema": {
                    "type": "object",
                    "properties": {
                        "apikey": {"type": "string"},
                        "task": {"type": "string", "enum": ["people"]},
                        "answer": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "name": {"type": "string"},
                                    "surname": {"type": "string"},
                                    "gender": {"type": "string"},
                                    "born": {"type": "integer"},
                                    "city": {"type": "string"},
                                    "tags": {
                                        "type": "array",
                                        "items": {
                                            "type": "string",
                                            "enum": ALLOWED_TAGS,
                                        },
                                    },
                                },
                                "required": [
                                    "name",
                                    "surname",
                                    "gender",
                                    "born",
                                    "city",
                                    "tags",
                                ],
                                "additionalProperties": False,
                            },
                        },
                    },
                    "required": ["apikey", "task", "answer"],
                    "additionalProperties": False,
                },
                "strict": True,
            },
        },
        "messages": [
            {
                "role": "system",
                "content": (
                    "Jesteś asystentem, który taguje osoby na podstawie opisu ich pracy (pole 'job'). "
                    "Masz zwrócić DOKŁADNIE jeden obiekt JSON zgodny z dostarczonym schematem. "
                    "Dostępne tagi to: "
                    + ", ".join(ALLOWED_TAGS)
                    + ". Wybierz wszystkie pasujące tagi, także wiele naraz."
                ),
            },
            {
                "role": "user",
                "content": (
                    "Oto lista osób (już przefiltrowanych według płci, wieku i miasta):\n\n"
                    f"{people_json}\n\n"
                    "Dla każdej osoby na podstawie pola 'job' dobierz odpowiednie tagi "
                    "z listy: "
                    + ", ".join(ALLOWED_TAGS)
                    + ".\n"
                    "- Zwróć obiekt JSON o strukturze:\n"
                    '{ "apikey": "tutaj-twój-klucz-api", "task": "people", "answer": [ ... ] }.\n'
                    "- W polu 'apikey' wpisz DOKŁADNIE wartość: "
                    f'"{COURSE_APIKEY_PLACEHOLDER}".\n'
                    '- W polu "task" wpisz DOKŁADNIE: "people".\n'
                    "- W tablicy 'answer' umieść wszystkich ludzi z wejścia, dla każdego:\n"
                    '  { "name", "surname", "gender", "born", "city", "tags" }.\n'
                    "- Pola name, surname, gender, born, city mają odpowiadać dokładnie danym wejściowym.\n"
                    "- Pole 'tags' ma zawierać tylko tagi z dozwolonej listy.\n"
                    "- Nie dodawaj żadnych dodatkowych pól ani komentarzy."
                ),
            },
        ],
    }


def call_openrouter(people: List[Dict[str, Any]]) -> Dict[str, Any]:
    api_key = get_openrouter_key()
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    payload = build_payload(people)
    response = requests.post(
        OPENROUTER_API_URL, headers=headers, json=payload, timeout=120
    )
    response.raise_for_status()

    data = response.json()
    content = data["choices"][0]["message"]["content"]

    if isinstance(content, str):
        return json.loads(content)
    return content


def main() -> None:
    people = load_people()
    result = call_openrouter(people)

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f_out:
        json.dump(result, f_out, ensure_ascii=False, indent=2)

    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

