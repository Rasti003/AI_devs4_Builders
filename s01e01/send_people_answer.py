import csv
import json
from typing import Any, Dict, List, Optional

import requests

INPUT_FILE = "people_tagged.csv"
OUTPUT_FILE = "answer_final.json"
VERIFY_URL = "https://hub.ag3nts.org/verify"

# Podmień tę wartość na swój klucz API do zadania AI_DEVS4
COURSE_API_KEY = "f47b940e-ad00-48fa-a22c-932d51eb4760"
TASK_NAME = "people"


def parse_birth_year(birth_str: str) -> Optional[int]:
    s = (birth_str or "").strip()
    if len(s) >= 4 and s[:4].isdigit():
        return int(s[:4])
    return None


def load_transport_people() -> List[Dict[str, Any]]:
    people: List[Dict[str, Any]] = []

    with open(INPUT_FILE, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)

        for row in reader:
            raw_tags = (row.get("tags", "") or "").strip()
            tags = [t for t in raw_tags.replace(",", ";").split(";") if t]

            # Dodatkowa heurystyka: część osób ewidentnie związanych z
            # logistyką/transportem mogła nie dostać tagu "transport" od LLM.
            # Jeśli w opisie pracy pojawia się fraza o przepływie towarów,
            # dodajemy brakujący tag "transport".
            job_desc = (row.get("job", "") or "").lower()
            if "przepływem towarów" in job_desc or "przepływ towarów" in job_desc:
                if "transport" not in tags:
                    tags.append("transport")

            if "transport" not in tags:
                continue

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
                    "tags": tags,
                }
            )

    return people


def build_payload(people: List[Dict[str, Any]]) -> Dict[str, Any]:
    return {
        "apikey": COURSE_API_KEY,
        "task": TASK_NAME,
        "answer": people,
    }


def send_to_verify(payload: Dict[str, Any]) -> None:
    headers = {"Content-Type": "application/json"}
    response = requests.post(VERIFY_URL, headers=headers, json=payload, timeout=60)

    print("Status:", response.status_code)
    try:
        print("Odpowiedź JSON:", json.dumps(response.json(), ensure_ascii=False, indent=2))
    except Exception:
        print("Odpowiedź tekstowa:", response.text)


def main() -> None:
    people = load_transport_people()
    print(f"Wybrano osób z tagiem 'transport': {len(people)}")

    payload = build_payload(people)

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f_out:
        json.dump(payload, f_out, ensure_ascii=False, indent=2)

    print(f"Zapisano payload do pliku {OUTPUT_FILE}")

    if COURSE_API_KEY == "tutaj-twój-klucz-api":
        print(
            "UWAGA: Podmień wartość COURSE_API_KEY na swój prawdziwy klucz API "
            "z panelu AI_DEVS4 przed wysłaniem do verify."
        )
    else:
        send_to_verify(payload)


if __name__ == "__main__":
    main()

