"""
HRV Pipeline — Phase 3: Raw vs Filtered Signal Analysis
========================================================
Reads Phase 1 or Phase 2 CSV and generates comparison graphs.
Also re-applies the same Arduino filters in Python for cross-validation.

Usage:
    python scripts/analyze_raw_vs_filtered.py [data/raw_filtered_capture.csv]

Input:
    data/raw_filtered_capture.csv  (Phase 2: 5 columns)
    data/raw_capture.csv           (Phase 1: 2 columns, raw only)

Output:
    graphs/01_raw_signal.png
    graphs/02_raw_vs_200hz.png
    graphs/03_raw_vs_10hz.png
    graphs/04_raw_vs_15hz.png
    graphs/05_all_filters_overlay.png
    graphs/06_zoomed_5s.png
    graphs/07_python_validation.png   (Python-recomputed filters vs Arduino output)

Console:
    Summary stats, quality assessment, next-step recommendation.

Dependencies:
    pip install numpy pandas matplotlib scipy
"""

import sys
import os
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
from scipy.signal import lfilter, filtfilt, butter

# ── Configuration ──────────────────────────────────────────────────────────────

ADC_BITS       = 14
ADC_MAX        = 2**ADC_BITS - 1          # 16383
ADC_MID        = ADC_MAX // 2             # 8191
EXPECTED_FS    = 100.0                     # Phase 2 output rate (Hz)
ZOOM_DURATION  = 5.0                       # seconds for zoom plot

# Arduino filter coefficients (must match phase2_raw_filtered.ino exactly)
F1_ALPHA = 0.715
F2_B = np.array([0.00362168, 0.00724336, 0.00362168])
F2_A = np.array([1.0, -1.82269493, 0.83718165])
F3_B = np.array([0.00820646, 0.01641291, 0.00820646])
F3_A = np.array([1.0, -1.72377617, 0.75619879])

# Quality thresholds
CLIP_THRESH     = 0.98   # fraction of ADC_MAX to consider clipped
DRIFT_WINDOW_S  = 5.0    # window for drift estimate
JUMP_THRESHOLD  = 500    # raw ADC units — sudden jump flag


# ── Data loading ───────────────────────────────────────────────────────────────

def load_csv(filepath: str) -> pd.DataFrame:
    """Load CSV, skip comment lines starting with '#', auto-detect columns."""
    rows = []
    header = None
    with open(filepath, "r", encoding="utf-8-sig") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if line.upper().startswith("START_CAPTURE") or line.upper().startswith("END_CAPTURE"):
                continue
            if header is None and not line[0].isdigit() and not line[0] == '-':
                header = [c.strip() for c in line.split(",")]
                continue
            rows.append(line)

    if not rows:
        raise ValueError(f"No data rows found in {filepath}")

    data = pd.DataFrame([r.split(",") for r in rows], columns=header)
    data = data.apply(pd.to_numeric, errors="coerce").dropna()
    data.columns = [c.strip() for c in data.columns]
    return data


def infer_sample_rate(df: pd.DataFrame) -> float:
    """Estimate sample rate from time_us column."""
    dt = np.diff(df["time_us"].values[:200])
    dt = dt[(dt > 0) & (dt < 1e7)]
    if len(dt) == 0:
        return EXPECTED_FS
    median_dt_us = np.median(dt)
    return 1e6 / median_dt_us


# ── Arduino filter re-implementation (Python) ─────────────────────────────────

def apply_f1_python(raw: np.ndarray) -> np.ndarray:
    """1-pole IIR, causal — matches Arduino applyF1()."""
    return lfilter([F1_ALPHA], [1.0, -(1.0 - F1_ALPHA)], raw.astype(float))


def apply_f2_python(f1_out: np.ndarray) -> np.ndarray:
    """2-pole Butterworth 10 Hz, causal — matches Arduino applyF2()."""
    return lfilter(F2_B, F2_A, f1_out)


def apply_f3_python(f1_out: np.ndarray) -> np.ndarray:
    """2-pole Butterworth 15 Hz, causal — matches Arduino applyF3()."""
    return lfilter(F3_B, F3_A, f1_out)


def apply_scipy_butter(signal: np.ndarray, fs: float, fc: float, order: int = 2) -> np.ndarray:
    """Zero-phase Butterworth using filtfilt (reference only, not matched to Arduino)."""
    nyq = fs / 2.0
    b, a = butter(order, fc / nyq, btype="low")
    return filtfilt(b, a, signal)


# ── Quality assessment ─────────────────────────────────────────────────────────

def assess_quality(df: pd.DataFrame, fs: float) -> dict:
    raw = df["raw"].values.astype(float)
    n = len(raw)

    # Clipping
    n_clipped_high = np.sum(raw >= CLIP_THRESH * ADC_MAX)
    n_clipped_low  = np.sum(raw <= (1 - CLIP_THRESH) * ADC_MAX)
    clip_pct = 100.0 * (n_clipped_high + n_clipped_low) / n

    # Baseline drift: slope of rolling mean
    win = int(DRIFT_WINDOW_S * fs)
    roll_mean = pd.Series(raw).rolling(win, center=True, min_periods=1).mean().values
    drift_range = roll_mean.max() - roll_mean.min()

    # Sudden jumps
    jumps = np.sum(np.abs(np.diff(raw)) > JUMP_THRESHOLD)

    # Signal centering
    raw_mean = np.mean(raw)
    center_offset = abs(raw_mean - ADC_MID)

    # Simple quality verdict
    issues = []
    if clip_pct > 1.0:     issues.append(f"clipping {clip_pct:.1f}%")
    if drift_range > 2000: issues.append(f"drift range {drift_range:.0f} ADC units")
    if jumps > 5:          issues.append(f"{jumps} sudden jumps")
    if center_offset > 3000: issues.append(f"signal offset from mid by {center_offset:.0f} ADC")

    verdict = "GOOD" if not issues else ("MARGINAL" if len(issues) == 1 else "POOR")

    return {
        "n_samples":     n,
        "duration_s":    n / fs,
        "fs_hz":         fs,
        "raw_min":       float(raw.min()),
        "raw_max":       float(raw.max()),
        "raw_mean":      float(raw_mean),
        "raw_std":       float(raw.std()),
        "clip_pct":      clip_pct,
        "drift_range":   drift_range,
        "jumps":         jumps,
        "center_offset": center_offset,
        "issues":        issues,
        "verdict":       verdict,
    }


def print_summary(q: dict, df: pd.DataFrame) -> None:
    print("\n" + "=" * 60)
    print("SIGNAL SUMMARY")
    print("=" * 60)
    print(f"  Duration      : {q['duration_s']:.1f} s")
    print(f"  Samples       : {q['n_samples']}")
    print(f"  Sample rate   : {q['fs_hz']:.1f} Hz (estimated)")
    print(f"  Columns       : {list(df.columns)}")
    print(f"  ADC range     : {ADC_MAX} (14-bit)")
    print()
    print("  Raw signal:")
    print(f"    Min         : {q['raw_min']:.0f}")
    print(f"    Max         : {q['raw_max']:.0f}")
    print(f"    Mean        : {q['raw_mean']:.0f}  (expected ~{ADC_MID})")
    print(f"    Std dev     : {q['raw_std']:.0f}")
    print(f"    Clip events : {q['clip_pct']:.2f}%")
    print(f"    Drift range : {q['drift_range']:.0f} ADC units")
    print(f"    Jump events : {q['jumps']}")

    if "filtered_10hz" in df.columns:
        f10 = df["filtered_10hz"].values
        print()
        print("  Filtered 10 Hz:")
        print(f"    Min         : {f10.min():.0f}")
        print(f"    Max         : {f10.max():.0f}")
        print(f"    Range       : {f10.max() - f10.min():.0f}")

    print()
    print(f"  Quality issues: {q['issues'] if q['issues'] else 'none'}")
    print(f"  QUALITY VERDICT: {q['verdict']}")
    print()

    if q["verdict"] == "POOR":
        print("  WARNING: Signal quality is POOR.")
        print("  Do not proceed to Phase 5 (peak detection).")
        print("  Check sensor placement, gain settings, and motion artifacts.")
    elif q["verdict"] == "MARGINAL":
        print("  CAUTION: Signal quality is MARGINAL.")
        print("  Inspect graphs carefully before peak detection.")
    else:
        print("  Signal quality looks acceptable. Review graphs before peak detection.")
    print("=" * 60 + "\n")


# ── Plotting ───────────────────────────────────────────────────────────────────

COLORS = {
    "raw":           "#555555",
    "f200hz":        "#e07b39",
    "f10hz":         "#2a7ae2",
    "f15hz":         "#27a86e",
    "python_f10hz":  "#e22a4f",
}


def time_axis(df: pd.DataFrame) -> np.ndarray:
    return df["time_us"].values / 1e6   # seconds


def save_fig(fig: plt.Figure, path: str) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    fig.savefig(path, dpi=150, bbox_inches="tight")
    plt.close(fig)
    print(f"  Saved: {path}")


def plot_raw(t, df, out_dir):
    fig, ax = plt.subplots(figsize=(12, 4))
    ax.plot(t, df["raw"].values, color=COLORS["raw"], lw=0.6, label="Raw ADC")
    ax.axhline(ADC_MID, color="gray", lw=0.8, ls="--", label=f"ADC midpoint ({ADC_MID})")
    ax.set_title("Phase 1/2 — Raw ADC Signal")
    ax.set_xlabel("Time (s)")
    ax.set_ylabel("ADC value (14-bit)")
    ax.legend(loc="upper right", fontsize=8)
    ax.grid(True, alpha=0.3)
    save_fig(fig, os.path.join(out_dir, "01_raw_signal.png"))


def plot_raw_vs(t, raw, filtered, label, color, filename, out_dir):
    fig, axes = plt.subplots(2, 1, figsize=(12, 6), sharex=True)
    axes[0].plot(t, raw,      color=COLORS["raw"],  lw=0.5, alpha=0.7, label="Raw")
    axes[0].plot(t, filtered, color=color,           lw=1.0, label=label)
    axes[0].set_ylabel("ADC value")
    axes[0].legend(loc="upper right", fontsize=8)
    axes[0].grid(True, alpha=0.3)
    axes[0].set_title(f"Raw vs {label}")

    axes[1].plot(t, filtered, color=color, lw=1.0, label=label)
    axes[1].set_xlabel("Time (s)")
    axes[1].set_ylabel("Filtered ADC")
    axes[1].legend(loc="upper right", fontsize=8)
    axes[1].grid(True, alpha=0.3)
    axes[1].set_title(f"{label} — isolated view")

    plt.tight_layout()
    save_fig(fig, os.path.join(out_dir, filename))


def plot_all_overlay(t, df, out_dir):
    has_f = "filtered_10hz" in df.columns
    fig, ax = plt.subplots(figsize=(13, 5))
    ax.plot(t, df["raw"].values,          color=COLORS["raw"],   lw=0.4, alpha=0.5, label="Raw")
    if "filtered_200hz" in df.columns:
        ax.plot(t, df["filtered_200hz"].values, color=COLORS["f200hz"], lw=0.8, alpha=0.7, label="200 Hz LPF (~100 Hz)")
    if has_f:
        ax.plot(t, df["filtered_10hz"].values,  color=COLORS["f10hz"],  lw=1.2, label="10 Hz Butterworth")
        ax.plot(t, df["filtered_15hz"].values,  color=COLORS["f15hz"],  lw=1.2, ls="--", label="15 Hz Butterworth")
    ax.set_title("All Filter Stages Overlay")
    ax.set_xlabel("Time (s)")
    ax.set_ylabel("ADC value (14-bit)")
    ax.legend(loc="upper right", fontsize=8)
    ax.grid(True, alpha=0.3)
    save_fig(fig, os.path.join(out_dir, "05_all_filters_overlay.png"))


def plot_zoom(t, df, duration_s, out_dir):
    mask = t <= (t[0] + duration_s)
    t_z   = t[mask]
    raw_z = df["raw"].values[mask]

    cols  = [c for c in ["filtered_200hz", "filtered_10hz", "filtered_15hz"] if c in df.columns]
    nrows = 1 + (1 if cols else 0)
    fig, axes = plt.subplots(nrows, 1, figsize=(12, 4 * nrows), sharex=True)
    if nrows == 1:
        axes = [axes]

    axes[0].plot(t_z, raw_z, color=COLORS["raw"], lw=0.8, label="Raw")
    axes[0].set_ylabel("ADC value")
    axes[0].set_title(f"First {duration_s:.0f} s — Raw")
    axes[0].grid(True, alpha=0.3)
    axes[0].legend(fontsize=8)

    if cols:
        for col, color_key in zip(cols, ["f200hz", "f10hz", "f15hz"]):
            axes[1].plot(t_z, df[col].values[mask], color=COLORS[color_key], lw=1.1, label=col)
        axes[1].set_xlabel("Time (s)")
        axes[1].set_ylabel("Filtered ADC")
        axes[1].set_title(f"First {duration_s:.0f} s — Filtered")
        axes[1].grid(True, alpha=0.3)
        axes[1].legend(fontsize=8)

    plt.tight_layout()
    save_fig(fig, os.path.join(out_dir, "06_zoomed_5s.png"))


def plot_python_validation(t, df, out_dir):
    """Re-apply the Arduino filters in Python and compare to Arduino output."""
    raw = df["raw"].values.astype(float)

    py_f1  = apply_f1_python(raw)
    py_f2  = apply_f2_python(py_f1)
    py_f3  = apply_f3_python(py_f1)

    fig, axes = plt.subplots(2, 1, figsize=(12, 7), sharex=True)

    if "filtered_10hz" in df.columns:
        ard_f2 = df["filtered_10hz"].values.astype(float)
        diff   = py_f2 - ard_f2
        axes[0].plot(t, ard_f2, color=COLORS["f10hz"], lw=1.0, alpha=0.8, label="Arduino 10 Hz output")
        axes[0].plot(t, py_f2,  color=COLORS["python_f10hz"], lw=1.0, ls="--", alpha=0.9, label="Python re-applied 10 Hz")
        axes[0].set_ylabel("ADC value")
        axes[0].set_title("Filter Validation: Arduino vs Python (10 Hz Butterworth)")
        axes[0].legend(fontsize=8)
        axes[0].grid(True, alpha=0.3)

        axes[1].plot(t, diff, color="purple", lw=0.8, label="Difference (Python - Arduino)")
        axes[1].axhline(0, color="gray", lw=0.8)
        axes[1].set_xlabel("Time (s)")
        axes[1].set_ylabel("Difference (ADC units)")
        axes[1].set_title("Residual: Python vs Arduino 10 Hz filter")
        axes[1].legend(fontsize=8)
        axes[1].grid(True, alpha=0.3)

        max_diff = np.max(np.abs(diff[50:]))  # skip initial transient
        print(f"  Filter validation: max |Python - Arduino| = {max_diff:.2f} ADC units (after 50-sample warmup)")
        if max_diff < 5:
            print("  Filter implementation: MATCH (difference negligible)")
        else:
            print("  Filter implementation: MISMATCH — check coefficient rounding")
    else:
        axes[0].plot(t, py_f2, color=COLORS["f10hz"], lw=1.0, label="Python 10 Hz (no Arduino col to compare)")
        axes[0].set_title("Python-only 10 Hz filter (Phase 1 input — no Arduino filter columns)")
        axes[0].legend(fontsize=8)
        axes[0].grid(True, alpha=0.3)
        axes[1].set_visible(False)

    plt.tight_layout()
    save_fig(fig, os.path.join(out_dir, "07_python_validation.png"))


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    base_dir   = os.path.dirname(script_dir)

    if len(sys.argv) >= 2:
        csv_path = sys.argv[1]
    else:
        csv_path = os.path.join(base_dir, "data", "raw_filtered_capture.csv")

    if not os.path.exists(csv_path):
        print(f"Error: file not found: {csv_path}")
        sys.exit(1)

    out_dir = os.path.join(base_dir, "graphs")
    os.makedirs(out_dir, exist_ok=True)

    print(f"\nLoading: {csv_path}")
    df = load_csv(csv_path)
    print(f"  Rows: {len(df)}  |  Columns: {list(df.columns)}")

    fs = infer_sample_rate(df)
    t  = time_axis(df)
    q  = assess_quality(df, fs)

    print_summary(q, df)

    print("Generating plots...")
    plot_raw(t, df, out_dir)

    if "filtered_200hz" in df.columns:
        plot_raw_vs(t, df["raw"].values, df["filtered_200hz"].values,
                    "200 Hz LPF (~100 Hz)", COLORS["f200hz"],
                    "02_raw_vs_200hz.png", out_dir)
    if "filtered_10hz" in df.columns:
        plot_raw_vs(t, df["raw"].values, df["filtered_10hz"].values,
                    "10 Hz Butterworth", COLORS["f10hz"],
                    "03_raw_vs_10hz.png", out_dir)
    if "filtered_15hz" in df.columns:
        plot_raw_vs(t, df["raw"].values, df["filtered_15hz"].values,
                    "15 Hz Butterworth", COLORS["f15hz"],
                    "04_raw_vs_15hz.png", out_dir)

    plot_all_overlay(t, df, out_dir)
    plot_zoom(t, df, ZOOM_DURATION, out_dir)
    plot_python_validation(t, df, out_dir)

    print(f"\nAll graphs saved to: {out_dir}/")
    print("\nNext steps:")
    if q["verdict"] == "POOR":
        print("  [!] Quality POOR — fix sensor/analog issues before peak detection.")
    else:
        print("  1. Open graphs/06_zoomed_5s.png and inspect for visible pulse bumps.")
        print("  2. If clean peaks are visible, proceed to Phase 5:")
        print(f"     python scripts/detect_peaks.py {csv_path}")


if __name__ == "__main__":
    main()
