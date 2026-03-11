import csv
import json
import os
from typing import List

import requests

INPUT_FILE = "people_filtered_step1.csv"
OUTPUT_FILE = "people_tagged.csv"

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


def get_api_key() -> str:
    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        raise RuntimeError(
            "Brak zmiennej środowiskowej OPENROUTER_API_KEY. "
            "Ustaw ją na swój klucz z OpenRouter."
        )
    return api_key


def build_payload(job_description: str) -> dict:
    return {
        "model": MODEL_NAME,
        "response_format": {
            "type": "json_schema",
            "json_schema": {
                "name": "job_tagging_response",
                "schema": {
                    "type": "object",
                    "properties": {
                        "tags": {
                            "type": "array",
                            "items": {
                                "type": "string",
                                "enum": ALLOWED_TAGS,
                            },
                        }
                    },
                    "required": ["tags"],
                    "additionalProperties": False,
                },
                "strict": True,
            },
        },
        "messages": [
            {
                "role": "system",
                "content": (
                    "Jesteś asystentem, który przypisuje tagi do opisów pracy. "
                    "Zwracaj TYLKO poprawny JSON zgodny ze schematem. "
                    "Dostępne tagi to: "
                    + ", ".join(ALLOWED_TAGS)
                    + ". Wybierz wszystkie pasujące tagi, także wiele naraz."
                ),
            },
            {
                "role": "user",
                "content": (
                    "Na podstawie poniższego opisu stanowiska wybierz odpowiednie tagi "
                    "z podanej listy. Odpowiedz wyłącznie w formacie JSON.\n\n"
                    f"Opis stanowiska:\n{job_description}"
                ),
            },
        ],
    }


def call_openrouter(job_description: str) -> List[str]:
    api_key = get_api_key()

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    payload = build_payload(job_description)

    response = requests.post(OPENROUTER_API_URL, headers=headers, json=payload, timeout=60)
    response.raise_for_status()

    data = response.json()
    content = data["choices"][0]["message"]["content"]

    if isinstance(content, str):
        parsed = json.loads(content)
    else:
        parsed = content

    tags = parsed.get("tags", [])
    return [t for t in tags if t in ALLOWED_TAGS]


def main() -> None:
    with open(INPUT_FILE, newline="", encoding="utf-8") as f_in, open(
        OUTPUT_FILE, "w", newline="", encoding="utf-8"
    ) as f_out:
        reader = csv.DictReader(f_in)
        fieldnames = list(reader.fieldnames or []) + ["tags"]
        writer = csv.DictWriter(f_out, fieldnames=fieldnames)
        writer.writeheader()

        for row in reader:
            job_desc = row.get("job", "") or ""
            try:
                tags = call_openrouter(job_desc)
            except Exception as e:
                # W przypadku błędu zapisz pustą listę tagów i idź dalej
                print(f"Błąd przy tagowaniu: {row.get('name', '')} {row.get('surname', '')}: {e}")
                tags = []

            row["tags"] = ";".join(tags)
            writer.writerow(row)


if __name__ == "__main__":
    main()

