"""
HRV Pipeline — Phase 7: Artifact / Ectopic / PVC Correction
=============================================================
Applies Kubios-inspired simple correction to the raw IBI series.

Rules:
  1. Rolling median window (7 beats) to estimate expected IBI.
  2. Flag IBI if |ibi - median| / median > DEVIATION_THRESH (25%).
  3. Also flag short-long pairs (suspected ectopic/PVC pattern).
  4. Correct flagged IBIs using linear interpolation from neighboring valid beats.
  5. NEVER replace a bad IBI with zero.

Usage:
    python scripts/correct_ibi_artifacts.py [data/<stem>_ibi_raw.csv]

Input:
    data/<stem>_ibi_raw.csv   (Phase 6 output)

Output:
    data/<stem>_ibi_corrected.csv
    graphs/30_ibi_raw_vs_corrected.png
    graphs/31_artifact_flags.png

This is a simple first-pass correction, not clinical validation.
Compare with Kubios output once ECG or validated reference is available.
"""

import sys
import os
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

# ── Configuration ──────────────────────────────────────────────────────────────

DEVIATION_THRESH    = 0.25   # Flag if >25% deviation from rolling median
ROLLING_WIN         = 7      # Rolling median window (beats)
ECTOPIC_SHORT_FRAC  = 0.80   # Short IBI < 80% of median => possible ectopic first beat
ECTOPIC_LONG_FRAC   = 1.20   # Followed by long IBI > 120% => compensatory pause


def load_ibi(filepath: str) -> pd.DataFrame:
    return pd.read_csv(filepath)


# ── Artifact detection ─────────────────────────────────────────────────────────

def detect_artifacts(ibi: np.ndarray) -> tuple:
    """
    Returns:
        flags        : str array, one per beat
        rolling_med  : float array of rolling medians
    """
    n   = len(ibi)
    ibi_series  = pd.Series(ibi)
    rolling_med = ibi_series.rolling(ROLLING_WIN, center=True, min_periods=3).median().values

    flags   = ["ok"] * n
    reasons = [""] * n

    for i in range(n):
        med = rolling_med[i]
        if np.isnan(med) or med <= 0:
            continue

        deviation = abs(ibi[i] - med) / med

        if deviation > DEVIATION_THRESH:
            flags[i]   = "artifact"
            reasons[i] = f"deviation_{deviation:.0%}_from_median"

    # Second pass: detect ectopic short-long pairs
    for i in range(n - 1):
        med = rolling_med[i]
        if np.isnan(med) or med <= 0:
            continue
        if ibi[i] < ECTOPIC_SHORT_FRAC * med and ibi[i + 1] > ECTOPIC_LONG_FRAC * med:
            if flags[i] == "ok":
                flags[i]   = "artifact"
                reasons[i] = "ectopic_short"
            if flags[i + 1] == "ok":
                flags[i + 1]   = "artifact"
                reasons[i + 1] = "ectopic_compensatory_pause"

    return np.array(flags), np.array(reasons), rolling_med


# ── Artifact correction ────────────────────────────────────────────────────────

def correct_artifacts(ibi: np.ndarray, flags: np.ndarray) -> np.ndarray:
    """
    Corrects flagged IBIs using linear interpolation from nearest valid neighbors.
    Never inserts zero. Handles consecutive artifact runs.
    """
    corrected = ibi.copy().astype(float)
    n         = len(ibi)
    bad_idx   = np.where(flags == "artifact")[0]

    if len(bad_idx) == 0:
        return corrected

    # Build valid index/value arrays for interpolation
    valid_mask  = flags != "artifact"
    valid_idx   = np.where(valid_mask)[0]
    valid_ibi   = ibi[valid_mask]

    if len(valid_idx) < 2:
        # Cannot interpolate with fewer than 2 valid points — fall back to median
        fallback = np.median(ibi[valid_mask]) if len(valid_mask) > 0 else np.mean(ibi)
        for i in bad_idx:
            corrected[i] = fallback
        return corrected

    # Linear interpolation at bad positions
    corrected[bad_idx] = np.interp(bad_idx, valid_idx, valid_ibi)
    return corrected


# ── Output ─────────────────────────────────────────────────────────────────────

def build_output_df(raw_df: pd.DataFrame, ibi: np.ndarray, flags: np.ndarray,
                    reasons: np.ndarray, corrected: np.ndarray) -> pd.DataFrame:
    bpm_corrected = np.where(corrected > 0, 60000.0 / corrected, np.nan)
    return pd.DataFrame({
        "beat_index":       raw_df["beat_index"].values,
        "peak_time_s":      raw_df["peak_time_s"].values,
        "ibi_raw_ms":       np.round(ibi, 2),
        "ibi_corrected_ms": np.round(corrected, 2),
        "bpm_corrected":    np.round(bpm_corrected, 2),
        "artifact_flag":    flags,
        "artifact_reason":  reasons,
    })


def save_corrected_csv(df: pd.DataFrame, base_dir: str, stem: str) -> str:
    out_path = os.path.join(base_dir, "data", f"{stem}_ibi_corrected.csv")
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    df.to_csv(out_path, index=False)
    print(f"  Corrected CSV: {out_path}")
    return out_path


def plot_raw_vs_corrected(df: pd.DataFrame, out_dir: str) -> None:
    t        = df["peak_time_s"].values
    raw_ibi  = df["ibi_raw_ms"].values
    corr_ibi = df["ibi_corrected_ms"].values
    bad_mask = df["artifact_flag"] == "artifact"

    fig, axes = plt.subplots(2, 1, figsize=(13, 7), sharex=True)

    axes[0].plot(t, raw_ibi,  color="#555555", lw=0.9, alpha=0.6, label="IBI raw")
    axes[0].plot(t, corr_ibi, color="#2a7ae2", lw=1.2, label="IBI corrected")
    axes[0].scatter(t[bad_mask.values], raw_ibi[bad_mask.values],
                    color="red", s=30, zorder=5, label="Artifact (raw)")
    axes[0].set_ylabel("IBI (ms)")
    axes[0].set_title("IBI: Raw vs Corrected")
    axes[0].legend(fontsize=8)
    axes[0].grid(True, alpha=0.3)

    diff = corr_ibi - raw_ibi
    axes[1].bar(t[bad_mask.values], diff[bad_mask.values],
                width=np.diff(t).mean() * 0.8 if len(t) > 1 else 1.0,
                color="red", alpha=0.7, label="Correction magnitude (ms)")
    axes[1].axhline(0, color="gray", lw=0.8)
    axes[1].set_xlabel("Time (s)")
    axes[1].set_ylabel("Correction (ms)")
    axes[1].set_title("Correction Applied per Beat (positive = IBI increased by interpolation)")
    axes[1].legend(fontsize=8)
    axes[1].grid(True, alpha=0.3)

    plt.tight_layout()
    out_path = os.path.join(out_dir, "30_ibi_raw_vs_corrected.png")
    os.makedirs(out_dir, exist_ok=True)
    fig.savefig(out_path, dpi=150, bbox_inches="tight")
    plt.close(fig)
    print(f"  Graph: {out_path}")


def plot_artifact_flags(df: pd.DataFrame, out_dir: str) -> None:
    t        = df["peak_time_s"].values
    bad_mask = df["artifact_flag"] == "artifact"
    ibi      = df["ibi_raw_ms"].values

    fig, ax = plt.subplots(figsize=(13, 4))
    ax.plot(t, ibi, color="#aaaaaa", lw=0.8, zorder=1, label="IBI raw")
    ax.scatter(t[bad_mask.values], ibi[bad_mask.values],
               color="red", s=40, zorder=5, label="Artifact", marker="x")
    ax.scatter(t[~bad_mask.values], ibi[~bad_mask.values],
               color="#2a7ae2", s=10, zorder=4, alpha=0.5, label="Valid beat")
    ax.set_xlabel("Time (s)")
    ax.set_ylabel("IBI (ms)")
    ax.set_title(f"Artifact Flags — {bad_mask.sum()} / {len(df)} beats flagged "
                 f"({100*bad_mask.mean():.1f}%)")
    ax.legend(fontsize=8)
    ax.grid(True, alpha=0.3)

    plt.tight_layout()
    out_path = os.path.join(out_dir, "31_artifact_flags.png")
    fig.savefig(out_path, dpi=150, bbox_inches="tight")
    plt.close(fig)
    print(f"  Graph: {out_path}")


def print_correction_summary(df: pd.DataFrame) -> None:
    n_total   = len(df)
    n_bad     = (df["artifact_flag"] == "artifact").sum()
    pct       = 100.0 * n_bad / n_total if n_total > 0 else 0
    corr_ibi  = df["ibi_corrected_ms"].values
    zero_count = np.sum(corr_ibi <= 0)

    print(f"\n  Beats total      : {n_total}")
    print(f"  Artifacts flagged: {n_bad} ({pct:.1f}%)")
    print(f"  Zero IBIs in corrected: {zero_count}  (must be 0)")

    if zero_count > 0:
        print("  ERROR: Corrected series contains zero IBIs. Check interpolation.")

    if pct > 15:
        print("\n  WARNING: >15% artifacts. Session data quality is suspect for PSD analysis.")
        print("  Consider repeating the recording with better sensor placement.")
    elif pct > 5:
        print("\n  CAUTION: 5–15% artifacts corrected. PSD analysis valid but note this.")
    else:
        print("\n  Artifact rate acceptable. Proceed to Phase 8 (PSD).")

    print(f"\n  Corrected IBI stats:")
    print(f"    Mean (ms): {corr_ibi.mean():.0f}")
    print(f"    Std  (ms): {corr_ibi.std():.0f}")
    print(f"    Min  (ms): {corr_ibi.min():.0f}")
    print(f"    Max  (ms): {corr_ibi.max():.0f}")
    print(f"\n  Next step: python scripts/compute_psd.py data/<stem>_ibi_corrected.csv")


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    base_dir   = os.path.dirname(script_dir)

    csv_path = sys.argv[1] if len(sys.argv) >= 2 else os.path.join(base_dir, "data", "ibi_raw.csv")

    if not os.path.exists(csv_path):
        print(f"Error: file not found: {csv_path}")
        sys.exit(1)

    print(f"\nLoading raw IBI: {csv_path}")
    raw_df = load_ibi(csv_path)
    ibi    = raw_df["ibi_ms"].values.astype(float)
    print(f"  Beats loaded: {len(ibi)}")

    flags, reasons, rolling_med = detect_artifacts(ibi)
    corrected                   = correct_artifacts(ibi, flags)

    out_df = build_output_df(raw_df, ibi, flags, reasons, corrected)

    stem    = os.path.splitext(os.path.basename(csv_path))[0].replace("_ibi_raw", "")
    out_dir = os.path.join(base_dir, "graphs")

    save_corrected_csv(out_df, base_dir, stem)
    plot_raw_vs_corrected(out_df, out_dir)
    plot_artifact_flags(out_df, out_dir)
    print_correction_summary(out_df)


if __name__ == "__main__":
    main()
