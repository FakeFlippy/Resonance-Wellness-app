"""
HRV Pipeline — Phase 5: Peak Detection
=======================================
Detects heartbeat peaks in the filtered waveform. Uses the filtered_10hz
column by default. Writes a peaks CSV and graph.

Usage:
    python scripts/detect_peaks.py [data/raw_filtered_capture.csv] [--column filtered_10hz]

Input:
    data/raw_filtered_capture.csv (Phase 2 output)

Output:
    data/detected_peaks.csv
    graphs/10_peaks_on_filtered.png

IMPORTANT: Run analyze_raw_vs_filtered.py and visually inspect graphs first.
Do not run this script if the filtered waveform did not show clean pulse bumps.
"""

import sys
import os
import argparse
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from scipy.signal import find_peaks

# ── Configuration ──────────────────────────────────────────────────────────────

DEFAULT_COLUMN      = "filtered_10hz"
MIN_PEAK_DIST_MS    = 300.0     # Reject any two peaks closer than this (ms)
MIN_PEAK_PROM_FRAC  = 0.10      # Min prominence as fraction of amplitude range
WARMUP_SAMPLES     = 200        # Skip first ~2 s (filter cold-start ramp)
MIN_PEAK_HEIGHT_ABS = None      # Set to a fixed ADC value if needed
MAX_PEAK_DIST_MS    = 2000.0    # Warn if gap between peaks exceeds this (ms)


# ── Helpers ────────────────────────────────────────────────────────────────────

def load_csv(filepath: str) -> pd.DataFrame:
    rows, header = [], None
    with open(filepath, encoding="utf-8-sig") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"): continue
            if line.upper() in ("START_CAPTURE", "END_CAPTURE"): continue
            if header is None and not line[0].isdigit() and line[0] != "-":
                header = [c.strip() for c in line.split(",")]
                continue
            rows.append(line)
    df = pd.DataFrame([r.split(",") for r in rows], columns=header)
    return df.apply(pd.to_numeric, errors="coerce").dropna()


def infer_fs(df: pd.DataFrame) -> float:
    dt = np.diff(df["time_us"].values[:500])
    dt = dt[(dt > 0) & (dt < 1e7)]
    return 1e6 / np.median(dt) if len(dt) > 0 else 100.0


# ── Peak detection ─────────────────────────────────────────────────────────────

def detect_peaks(signal: np.ndarray, fs: float, column_name: str) -> dict:
    warmup = min(WARMUP_SAMPLES, len(signal) // 4)
    steady = signal[warmup:]
    amplitude_range = steady.max() - steady.min()
    prominence = max(MIN_PEAK_PROM_FRAC * amplitude_range, 10)
    min_dist_samples = int(MIN_PEAK_DIST_MS * fs / 1000.0)

    kwargs = dict(
        distance=max(min_dist_samples, 1),
        prominence=prominence,
    )
    if MIN_PEAK_HEIGHT_ABS is not None:
        kwargs["height"] = MIN_PEAK_HEIGHT_ABS

    peaks_steady, props = find_peaks(steady, **kwargs)
    peaks = peaks_steady + warmup

    return {
        "peaks":          peaks,
        "prominences":    props.get("prominences", np.array([])),
        "amplitude_range": amplitude_range,
        "prominence_used": prominence,
        "min_dist_samples": min_dist_samples,
    }


# ── Output ─────────────────────────────────────────────────────────────────────

def save_peaks_csv(peaks_idx, t_s, signal, base_dir, src_stem):
    out_path = os.path.join(base_dir, "data", f"{src_stem}_detected_peaks.csv")
    os.makedirs(os.path.dirname(out_path), exist_ok=True)

    rows = []
    for i, idx in enumerate(peaks_idx):
        rows.append({
            "peak_index":   i,
            "sample_index": int(idx),
            "peak_time_s":  round(float(t_s[idx]), 6),
            "peak_value":   float(signal[idx]),
        })
    df = pd.DataFrame(rows)
    df.to_csv(out_path, index=False)
    print(f"  Peaks CSV: {out_path}")
    return out_path


def plot_peaks(t_s, signal, peaks_idx, column_name, out_dir, duration_zoom=10.0):
    fig, axes = plt.subplots(2, 1, figsize=(13, 7), sharex=False)

    # Full view
    axes[0].plot(t_s, signal, color="#2a7ae2", lw=0.8, label=column_name)
    axes[0].scatter(t_s[peaks_idx], signal[peaks_idx],
                    color="red", s=25, zorder=5, label=f"Peaks (n={len(peaks_idx)})")
    axes[0].set_ylabel("ADC value")
    axes[0].set_title(f"Peak Detection — {column_name} (full recording)")
    axes[0].legend(fontsize=8, loc="upper right")
    axes[0].grid(True, alpha=0.3)

    # Zoom view — first 10 s
    mask = t_s <= (t_s[0] + duration_zoom)
    peaks_zoom = peaks_idx[t_s[peaks_idx] <= (t_s[0] + duration_zoom)]
    axes[1].plot(t_s[mask], signal[mask], color="#2a7ae2", lw=1.0, label=column_name)
    axes[1].scatter(t_s[peaks_zoom], signal[peaks_zoom],
                    color="red", s=40, zorder=5, label=f"Peaks (n={len(peaks_zoom)})")
    axes[1].set_xlabel("Time (s)")
    axes[1].set_ylabel("ADC value")
    axes[1].set_title(f"Peak Detection — first {duration_zoom:.0f} s (zoom)")
    axes[1].legend(fontsize=8, loc="upper right")
    axes[1].grid(True, alpha=0.3)

    plt.tight_layout()
    out_path = os.path.join(out_dir, "10_peaks_on_filtered.png")
    os.makedirs(out_dir, exist_ok=True)
    fig.savefig(out_path, dpi=150, bbox_inches="tight")
    plt.close(fig)
    print(f"  Graph: {out_path}")


# ── Quality check ──────────────────────────────────────────────────────────────

def print_peak_summary(peaks_idx, t_s, result):
    n = len(peaks_idx)
    print(f"\n  Peaks detected   : {n}")
    if n < 2:
        print("  WARNING: fewer than 2 peaks found. IBI extraction not possible.")
        print("  Check: sensor placement, filter column used, min_dist_ms setting.")
        return

    intervals_ms = np.diff(t_s[peaks_idx]) * 1000.0
    bpms         = 60000.0 / intervals_ms

    print(f"  IBI range (ms)   : {intervals_ms.min():.0f} – {intervals_ms.max():.0f}")
    print(f"  IBI mean (ms)    : {intervals_ms.mean():.0f}")
    print(f"  BPM range        : {bpms.min():.0f} – {bpms.max():.0f}")
    print(f"  BPM mean         : {bpms.mean():.0f}")
    print(f"  Prominence used  : {result['prominence_used']:.1f}  (out of range {result['amplitude_range']:.0f})")
    print(f"  Min dist (samp)  : {result['min_dist_samples']}")

    suspicious = np.sum((intervals_ms < 300) | (intervals_ms > MAX_PEAK_DIST_MS))
    if suspicious:
        print(f"\n  WARNING: {suspicious}/{len(intervals_ms)} intervals outside physiological range.")
        print("  This may indicate false peaks or missed beats. Inspect graph carefully.")
    else:
        print("  All intervals within physiological range (300–2000 ms).")

    print(f"\n  Next step: python scripts/extract_ibi.py data/<stem>_detected_peaks.csv")


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="HRV Pipeline Phase 5: Peak Detection")
    parser.add_argument("csv", nargs="?", default=None, help="Path to raw_filtered_capture.csv")
    parser.add_argument("--column", default=DEFAULT_COLUMN,
                        help=f"Column to use for peak detection (default: {DEFAULT_COLUMN})")
    args = parser.parse_args()

    script_dir = os.path.dirname(os.path.abspath(__file__))
    base_dir   = os.path.dirname(script_dir)

    csv_path = args.csv or os.path.join(base_dir, "data", "raw_filtered_capture.csv")
    if not os.path.exists(csv_path):
        print(f"Error: file not found: {csv_path}")
        sys.exit(1)

    print(f"\nLoading: {csv_path}")
    df = load_csv(csv_path)

    if args.column not in df.columns:
        print(f"Error: column '{args.column}' not found. Available: {list(df.columns)}")
        sys.exit(1)

    fs     = infer_fs(df)
    t_s    = df["time_us"].values / 1e6
    signal = df[args.column].values.astype(float)

    print(f"  Rows: {len(df)}  |  Sample rate: {fs:.1f} Hz  |  Duration: {t_s[-1]-t_s[0]:.1f} s")
    print(f"  Using column: {args.column}")

    result    = detect_peaks(signal, fs, args.column)
    peaks_idx = result["peaks"]

    stem     = os.path.splitext(os.path.basename(csv_path))[0]
    out_dir  = os.path.join(base_dir, "graphs")

    save_peaks_csv(peaks_idx, t_s, signal, base_dir, stem)
    plot_peaks(t_s, signal, peaks_idx, args.column, out_dir)
    print_peak_summary(peaks_idx, t_s, result)


if __name__ == "__main__":
    main()
