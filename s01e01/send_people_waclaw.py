import csv
import json
from typing import Any, Dict, List

import requests

from send_people_answer import COURSE_API_KEY, TASK_NAME, VERIFY_URL, parse_birth_year

INPUT_FILE = "people_tagged.csv"


def load_waclaw() -> List[Dict[str, Any]]:
    people: List[Dict[str, Any]] = []

    with open(INPUT_FILE, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)

        for row in reader:
            if row.get("name") != "Wacław" or row.get("surname") != "Jasiński":
                continue

            birth_year = parse_birth_year(row.get("birthDate", ""))
            if birth_year is None:
                continue

            raw_tags = (row.get("tags", "") or "").strip()
            tags = [t for t in raw_tags.replace(",", ";").split(";") if t]

            people.append(
                {
                    "name": row.get("name", ""),
                    "surname": row.get("surname", ""),
                    "gender": row.get("gender", ""),
                    "born": birth_year,
                    "city": row.get("birthPlace", ""),
                    "tags": tags,
                }
            )

    return people


def send_to_verify(payload: Dict[str, Any]) -> None:
    headers = {"Content-Type": "application/json"}
    response = requests.post(VERIFY_URL, headers=headers, json=payload, timeout=60)

    print("Status:", response.status_code)
    try:
        print("Odpowiedź JSON:", json.dumps(response.json(), ensure_ascii=False, indent=2))
    except Exception:
        print("Odpowiedź tekstowa:", response.text)


def main() -> None:
    people = load_waclaw()
    print(f"Liczba osób w odpowiedzi (powinien być tylko Wacław): {len(people)}")

    payload = {
        "apikey": COURSE_API_KEY,
        "task": TASK_NAME,
        "answer": people,
    }

    print("Payload, który wysyłamy:")
    print(json.dumps(payload, ensure_ascii=False, indent=2))

    if COURSE_API_KEY == "tutaj-twój-klucz-api":
        print("UWAGA: najpierw ustaw prawdziwy COURSE_API_KEY w send_people_answer.py.")
        return

    send_to_verify(payload)


if __name__ == "__main__":
    main()

