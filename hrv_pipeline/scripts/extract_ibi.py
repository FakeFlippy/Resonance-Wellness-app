"""
HRV Pipeline — Phase 6: IBI Extraction
========================================
Reads detected_peaks.csv, computes inter-beat intervals (IBIs),
applies basic physiological plausibility checks, and saves results.

Usage:
    python scripts/extract_ibi.py [data/<stem>_detected_peaks.csv]

Input:
    data/<stem>_detected_peaks.csv   (Phase 5 output)

Output:
    data/<stem>_ibi_raw.csv
    graphs/20_ibi_vs_time.png

IBI = time difference between consecutive detected peaks, in milliseconds.
BPM = 60000 / IBI_ms.
"""

import sys
import os
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

# ── Validity bounds ────────────────────────────────────────────────────────────

IBI_MIN_MS          = 300.0    # < 300 ms => > 200 BPM — physiologically suspicious
IBI_MAX_MS          = 2000.0   # > 2000 ms => < 30 BPM — suspicious
IBI_CHANGE_THRESH   = 0.30     # >30% change from rolling median => sudden_change flag
ROLLING_WIN         = 7        # Beats in rolling median window


def load_peaks(filepath: str) -> pd.DataFrame:
    return pd.read_csv(filepath)


def extract_ibi(peaks: pd.DataFrame) -> pd.DataFrame:
    t = peaks["peak_time_s"].values

    if len(t) < 2:
        raise ValueError("Need at least 2 peaks to compute IBI.")

    ibi_ms = np.diff(t) * 1000.0
    bpm    = 60000.0 / ibi_ms
    n      = len(ibi_ms)

    # Beat index aligns with the second peak of each interval
    beat_idx  = np.arange(1, n + 1)
    peak_time = t[1:]   # time of the beat that ended the interval

    # Rolling median of IBI (centered window using pandas)
    ibi_series = pd.Series(ibi_ms)
    rolling_med = (ibi_series
                   .rolling(window=ROLLING_WIN, center=True, min_periods=3)
                   .median()
                   .values)

    # Assign validity flags
    flags = []
    for i, (ibi, med) in enumerate(zip(ibi_ms, rolling_med)):
        f = []
        if ibi < IBI_MIN_MS:
            f.append("suspicious_short")
        elif ibi > IBI_MAX_MS:
            f.append("suspicious_long")
        if not np.isnan(med) and med > 0:
            change = abs(ibi - med) / med
            if change > IBI_CHANGE_THRESH:
                f.append("sudden_change")
        flags.append("|".join(f) if f else "ok")

    df = pd.DataFrame({
        "beat_index":    beat_idx,
        "peak_time_s":   np.round(peak_time, 6),
        "ibi_ms":        np.round(ibi_ms, 2),
        "bpm":           np.round(bpm, 2),
        "rolling_med_ms": np.round(rolling_med, 2),
        "valid":         flags,
    })
    return df


def save_ibi_csv(df: pd.DataFrame, base_dir: str, stem: str) -> str:
    out_path = os.path.join(base_dir, "data", f"{stem}_ibi_raw.csv")
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    df.to_csv(out_path, index=False)
    print(f"  IBI CSV: {out_path}")
    return out_path


def plot_ibi(df: pd.DataFrame, out_dir: str) -> None:
    t   = df["peak_time_s"].values
    ibi = df["ibi_ms"].values
    bad = df["valid"] != "ok"

    fig, axes = plt.subplots(2, 1, figsize=(12, 7), sharex=True)

    axes[0].plot(t, ibi, color="#2a7ae2", lw=1.0, label="IBI (ms)")
    axes[0].scatter(t[bad.values], ibi[bad.values],
                    color="red", s=30, zorder=5, label="Flagged beat")
    if "rolling_med_ms" in df.columns:
        axes[0].plot(t, df["rolling_med_ms"].values,
                     color="orange", lw=1.2, ls="--", label="Rolling median")
    axes[0].axhline(1000, color="gray", lw=0.7, ls=":", label="1000 ms (60 BPM)")
    axes[0].set_ylabel("IBI (ms)")
    axes[0].set_title("IBI vs Time (tachogram)")
    axes[0].legend(fontsize=8)
    axes[0].grid(True, alpha=0.3)

    axes[1].plot(t, df["bpm"].values, color="#27a86e", lw=1.0, label="BPM")
    axes[1].set_xlabel("Time (s)")
    axes[1].set_ylabel("BPM")
    axes[1].set_title("Heart Rate (BPM) vs Time")
    axes[1].legend(fontsize=8)
    axes[1].grid(True, alpha=0.3)

    plt.tight_layout()
    out_path = os.path.join(out_dir, "20_ibi_vs_time.png")
    os.makedirs(out_dir, exist_ok=True)
    fig.savefig(out_path, dpi=150, bbox_inches="tight")
    plt.close(fig)
    print(f"  Graph: {out_path}")


def print_ibi_summary(df: pd.DataFrame) -> None:
    n      = len(df)
    ibi    = df["ibi_ms"].values
    flags  = df["valid"]
    n_bad  = (flags != "ok").sum()
    pct    = 100.0 * n_bad / n if n > 0 else 0.0

    print(f"\n  Beats extracted  : {n}")
    print(f"  IBI min (ms)     : {ibi.min():.0f}")
    print(f"  IBI max (ms)     : {ibi.max():.0f}")
    print(f"  IBI mean (ms)    : {ibi.mean():.0f}")
    print(f"  IBI std (ms)     : {ibi.std():.0f}")
    print(f"  Mean BPM         : {df['bpm'].mean():.1f}")
    print(f"  Flagged beats    : {n_bad} / {n}  ({pct:.1f}%)")

    if pct > 20:
        print("\n  WARNING: >20% of beats flagged. Data quality may be too poor for HRV.")
    elif pct > 10:
        print("\n  CAUTION: 10–20% beats flagged. Artifact correction (Phase 7) important.")
    else:
        print("\n  Flag rate is acceptable. Proceed to Phase 7 (artifact correction).")

    print(f"\n  Next step: python scripts/correct_ibi_artifacts.py data/<stem>_ibi_raw.csv")


def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    base_dir   = os.path.dirname(script_dir)

    csv_path = sys.argv[1] if len(sys.argv) >= 2 else os.path.join(base_dir, "data", "detected_peaks.csv")

    if not os.path.exists(csv_path):
        print(f"Error: file not found: {csv_path}")
        sys.exit(1)

    print(f"\nLoading peaks: {csv_path}")
    peaks = load_peaks(csv_path)
    print(f"  Peaks loaded: {len(peaks)}")

    df   = extract_ibi(peaks)
    stem = os.path.splitext(os.path.basename(csv_path))[0].replace("_detected_peaks", "")

    save_ibi_csv(df, base_dir, stem)
    plot_ibi(df, os.path.join(base_dir, "graphs"))
    print_ibi_summary(df)


if __name__ == "__main__":
    main()
