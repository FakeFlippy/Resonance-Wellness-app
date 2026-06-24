"""
Save clipboard content to a CSV file.

Usage (Windows PowerShell):
    python scripts/save_from_clipboard.py data/session2_3min_unpaced.csv

Copy the raw CSV text (START_CAPTURE … last data row) to your clipboard
first, then run this script.
"""

import sys
import os
import subprocess


def get_clipboard_windows() -> str:
    result = subprocess.run(
        ["powershell", "-command", "Get-Clipboard"],
        capture_output=True, text=True, encoding="utf-8",
    )
    return result.stdout


def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    base_dir   = os.path.dirname(script_dir)

    if len(sys.argv) >= 2:
        out_path = sys.argv[1]
    else:
        out_path = os.path.join(base_dir, "data", "session_import.csv")

    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)

    print(f"Reading clipboard …")
    data = get_clipboard_windows()

    if not data.strip():
        print("Error: clipboard is empty. Copy the CSV text first, then re-run.")
        sys.exit(1)

    with open(out_path, "w", encoding="utf-8") as f:
        f.write(data)

    lines = data.count("\n")
    print(f"Saved  {len(data):,} bytes  ({lines:,} lines)  →  {out_path}")
    print(f"\nNext step:")
    print(f"  python scripts/run_full_analysis.py {out_path}")


if __name__ == "__main__":
    main()
