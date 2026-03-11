import csv
from datetime import datetime

INPUT_FILE = "people.csv"
OUTPUT_FILE = "people_filtered_step1.csv"
CURRENT_YEAR = 2026

GENDER_COL = "gender"
BIRTH_PLACE_COL = "birthPlace"
BIRTH_DATE_COL = "birthDate"


def parse_age(birth_str: str, current_year: int = CURRENT_YEAR) -> int | None:
    birth_str = birth_str.strip()
    if not birth_str:
        return None

    formats = ["%Y-%m-%d", "%d.%m.%Y", "%Y/%m/%d", "%d-%m-%Y"]
    for fmt in formats:
        try:
            d = datetime.strptime(birth_str, fmt).date()
            return current_year - d.year
        except ValueError:
            continue

    if birth_str.isdigit() and len(birth_str) == 4:
        return current_year - int(birth_str)

    return None


def is_male(value: str) -> bool:
    v = value.strip().lower()
    return v in {"m", "male", "mężczyzna", "mezczyzna"}


def is_grudziadz(value: str) -> bool:
    v = value.strip().lower()
    return v in {"grudziądz", "grudziadz"}


def main() -> None:
    with open(INPUT_FILE, newline="", encoding="utf-8") as f_in, open(
        OUTPUT_FILE, "w", newline="", encoding="utf-8"
    ) as f_out:
        reader = csv.DictReader(f_in)
        writer = csv.DictWriter(f_out, fieldnames=reader.fieldnames)
        writer.writeheader()

        for row in reader:
            if not is_male(row[GENDER_COL]):
                continue

            if not is_grudziadz(row[BIRTH_PLACE_COL]):
                continue

            age = parse_age(row[BIRTH_DATE_COL])
            if age is None:
                continue

            if 20 <= age <= 40:
                writer.writerow(row)


if __name__ == "__main__":
    main()

