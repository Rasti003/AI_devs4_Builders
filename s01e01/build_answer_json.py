import csv
import json
from typing import Any, Dict, List, Optional

INPUT_FILE = "people_tagged.csv"
OUTPUT_FILE = "answer.json"

API_KEY = "tutaj-twój-klucz-api"  # podmień na swój prawdziwy klucz do zadania
TASK_NAME = "people"


def parse_birth_year(birth_str: str) -> Optional[int]:
    s = (birth_str or "").strip()
    if not s:
        return None

    # najprostszy przypadek: YYYY-MM-DD lub zaczynające się od roku
    if len(s) >= 4 and s[:4].isdigit():
        return int(s[:4])

    return None


def build_answer() -> Dict[str, Any]:
    answer_rows: List[Dict[str, Any]] = []

    with open(INPUT_FILE, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)

        for row in reader:
            raw_tags = (row.get("tags", "") or "").strip()
            tags = [t for t in raw_tags.split(";") if t]

            # interesują nas tylko osoby z tagiem "transport"
            if "transport" not in tags:
                continue

            birth_year = parse_birth_year(row.get("birthDate", ""))
            if birth_year is None:
                continue

            answer_rows.append(
                {
                    "name": row.get("name", ""),
                    "surname": row.get("surname", ""),
                    "gender": row.get("gender", ""),
                    "born": birth_year,
                    "city": row.get("birthPlace", ""),
                    "tags": tags,
                }
            )

    return {
        "apikey": API_KEY,
        "task": TASK_NAME,
        "answer": answer_rows,
    }


def main() -> None:
    payload = build_answer()

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f_out:
        json.dump(payload, f_out, ensure_ascii=False, indent=2)

    print(json.dumps(payload, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

