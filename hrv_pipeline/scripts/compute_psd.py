"""
HRV Pipeline — Phase 8: PSD / HRV Analysis
============================================
Computes Power Spectral Density from the corrected IBI series.

Steps:
  1. Build cumulative time axis from corrected IBI values.
  2. Interpolate IBI series to a uniform 4 Hz grid (cubic spline).
  3. Detrend the resampled IBI series.
  4. Compute Welch PSD.
  5. Integrate VLF / LF / HF power bands.
  6. Annotate the 0.1 Hz resonance frequency.
  7. Save graphs and optional CSV.

Usage:
    python scripts/compute_psd.py [data/<stem>_ibi_corrected.csv]

Input:
    data/<stem>_ibi_corrected.csv   (Phase 7 output)

Output:
    graphs/40_ibi_time_series.png
    graphs/41_ibi_psd.png
    data/<stem>_psd_values.csv   (optional, frequency + power density)

WARNING: PSD is only meaningful if:
  - IBI extraction was reliable (Phase 5-6 validated visually)
  - Session is >= 3 minutes
  - Artifact correction was applied (Phase 7)
"""

import sys
import os
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from scipy.signal import welch
from scipy.interpolate import interp1d
from scipy.signal import detrend as scipy_detrend

# ── Frequency bands ────────────────────────────────────────────────────────────

BANDS = {
    "VLF": (0.000, 0.040),
    "LF":  (0.040, 0.150),
    "HF":  (0.150, 0.400),
}
RESONANCE_HZ   = 0.10   # Target guided breathing frequency
RESAMPLE_HZ    = 4.0    # Interpolation grid frequency (Hz)
WELCH_NPERSEG  = 256    # Welch segment length


# ── Helpers ────────────────────────────────────────────────────────────────────

def load_corrected(filepath: str) -> pd.DataFrame:
    return pd.read_csv(filepath)


def build_tachogram(df: pd.DataFrame):
    """Build cumulative time axis and IBI array from corrected IBI column."""
    ibi     = df["ibi_corrected_ms"].values.astype(float) / 1000.0   # convert to seconds
    t_beats = np.cumsum(ibi)                                           # time of each beat
    t_beats = np.insert(t_beats, 0, 0.0)                              # include t=0
    return t_beats[:-1], ibi    # time at start of each interval, IBI in seconds


def resample_ibi(t_beats: np.ndarray, ibi_s: np.ndarray, fs: float = RESAMPLE_HZ):
    """Cubic spline interpolation to uniform time grid."""
    t_end  = t_beats[-1] + ibi_s[-1]
    t_grid = np.arange(0, t_end, 1.0 / fs)

    interp_fn   = interp1d(t_beats, ibi_s, kind="cubic", bounds_error=False,
                            fill_value=(ibi_s[0], ibi_s[-1]))
    ibi_uniform = interp_fn(t_grid)
    return t_grid, ibi_uniform


def compute_welch(ibi_uniform: np.ndarray, fs: float):
    """Compute Welch PSD on detrended signal."""
    detrended = scipy_detrend(ibi_uniform)
    f, psd    = welch(detrended, fs=fs, nperseg=WELCH_NPERSEG, noverlap=WELCH_NPERSEG // 2)
    return f, psd


def band_power(f: np.ndarray, psd: np.ndarray, flo: float, fhi: float) -> float:
    mask = (f >= flo) & (f < fhi)
    df   = f[1] - f[0] if len(f) > 1 else 1.0
    return float(np.trapz(psd[mask], f[mask])) if mask.any() else 0.0


def compute_hrv_metrics(f: np.ndarray, psd: np.ndarray, ibi_s: np.ndarray) -> dict:
    ibi_ms = ibi_s * 1000.0
    vlf_p  = band_power(f, psd, *BANDS["VLF"])
    lf_p   = band_power(f, psd, *BANDS["LF"])
    hf_p   = band_power(f, psd, *BANDS["HF"])
    lf_hf  = lf_p / hf_p if hf_p > 0 else np.nan
    total  = vlf_p + lf_p + hf_p

    # Find peak frequency
    peak_idx = np.argmax(psd[(f >= 0.04) & (f <= 0.40)]) if np.any((f >= 0.04) & (f <= 0.40)) else 0
    f_search = f[(f >= 0.04) & (f <= 0.40)]
    peak_f   = f_search[peak_idx] if len(f_search) > 0 else np.nan

    return {
        "mean_ibi_ms":  float(ibi_ms.mean()),
        "sdnn_ms":      float(ibi_ms.std()),
        "rmssd_ms":     float(np.sqrt(np.mean(np.diff(ibi_ms) ** 2))),
        "vlf_power":    vlf_p,
        "lf_power":     lf_p,
        "hf_power":     hf_p,
        "lf_hf_ratio":  lf_hf,
        "total_power":  total,
        "lf_pct":       100.0 * lf_p / total if total > 0 else np.nan,
        "hf_pct":       100.0 * hf_p / total if total > 0 else np.nan,
        "peak_freq_hz": peak_f,
    }


# ── Plots ──────────────────────────────────────────────────────────────────────

def plot_tachogram(t_beats: np.ndarray, ibi_ms: np.ndarray, out_dir: str) -> None:
    fig, ax = plt.subplots(figsize=(13, 4))
    ax.plot(t_beats, ibi_ms, color="#2a7ae2", lw=1.0, label="IBI (corrected)")
    ax.axhline(np.mean(ibi_ms), color="orange", lw=1.0, ls="--", label=f"Mean {np.mean(ibi_ms):.0f} ms")
    ax.set_xlabel("Time (s)")
    ax.set_ylabel("IBI (ms)")
    ax.set_title("IBI Time Series (Tachogram) — Corrected")
    ax.legend(fontsize=8)
    ax.grid(True, alpha=0.3)
    plt.tight_layout()
    out_path = os.path.join(out_dir, "40_ibi_time_series.png")
    os.makedirs(out_dir, exist_ok=True)
    fig.savefig(out_path, dpi=150, bbox_inches="tight")
    plt.close(fig)
    print(f"  Graph: {out_path}")


def plot_psd(f: np.ndarray, psd: np.ndarray, metrics: dict, out_dir: str) -> None:
    fig, ax = plt.subplots(figsize=(12, 5))

    # Plot PSD in ms²/Hz (convert from s²/Hz)
    psd_ms2 = psd * 1e6

    ax.semilogy(f, psd_ms2, color="#333333", lw=1.2, label="PSD (ms²/Hz)")

    # Shade bands
    band_colors = {"VLF": "#d0e8ff", "LF": "#ffe0b2", "HF": "#d0ffd8"}
    band_labels = {
        "VLF": f"VLF  <0.04 Hz\n{metrics['vlf_power']*1e6:.2f} ms²/Hz",
        "LF":  f"LF  0.04–0.15 Hz\n{metrics['lf_power']*1e6:.2f} ms²/Hz\n{metrics['lf_pct']:.1f}%",
        "HF":  f"HF  0.15–0.4 Hz\n{metrics['hf_power']*1e6:.2f} ms²/Hz\n{metrics['hf_pct']:.1f}%",
    }
    for band, (flo, fhi) in BANDS.items():
        mask = (f >= flo) & (f < fhi)
        if mask.any():
            ax.fill_between(f[mask], psd_ms2[mask], alpha=0.4,
                            color=band_colors[band], label=band_labels[band])

    # 0.1 Hz resonance marker
    ax.axvline(RESONANCE_HZ, color="red", lw=1.5, ls="--",
               label=f"0.1 Hz resonance (6 breaths/min)")

    # Annotate peak if near 0.1 Hz
    if not np.isnan(metrics.get("peak_freq_hz", np.nan)):
        pk = metrics["peak_freq_hz"]
        ax.axvline(pk, color="purple", lw=1.0, ls=":",
                   label=f"Peak: {pk:.3f} Hz")

    ax.set_xlim(0, 0.45)
    ax.set_xlabel("Frequency (Hz)")
    ax.set_ylabel("PSD (ms²/Hz)")
    ax.set_title("Heart Rate Variability — Power Spectral Density (Welch)")
    ax.legend(fontsize=7, loc="upper right")
    ax.grid(True, alpha=0.3, which="both")
    plt.tight_layout()

    out_path = os.path.join(out_dir, "41_ibi_psd.png")
    fig.savefig(out_path, dpi=150, bbox_inches="tight")
    plt.close(fig)
    print(f"  Graph: {out_path}")


# ── Output ─────────────────────────────────────────────────────────────────────

def save_psd_csv(f: np.ndarray, psd: np.ndarray, base_dir: str, stem: str) -> None:
    out_path = os.path.join(base_dir, "data", f"{stem}_psd_values.csv")
    pd.DataFrame({"frequency_hz": np.round(f, 5),
                  "psd_s2_per_hz": psd}).to_csv(out_path, index=False)
    print(f"  PSD CSV: {out_path}")


def print_hrv_summary(metrics: dict, duration_s: float) -> None:
    print("\n" + "=" * 55)
    print("HRV METRICS SUMMARY")
    print("=" * 55)
    print(f"  Session duration    : {duration_s:.1f} s")
    print(f"  Mean IBI            : {metrics['mean_ibi_ms']:.0f} ms")
    print(f"  SDNN                : {metrics['sdnn_ms']:.1f} ms")
    print(f"  RMSSD               : {metrics['rmssd_ms']:.1f} ms")
    print()
    print(f"  VLF power (<0.04 Hz): {metrics['vlf_power']*1e6:.3f} ms²")
    print(f"  LF  power (0.04–0.15 Hz): {metrics['lf_power']*1e6:.3f} ms²  ({metrics['lf_pct']:.1f}%)")
    print(f"  HF  power (0.15–0.4 Hz): {metrics['hf_power']*1e6:.3f} ms²  ({metrics['hf_pct']:.1f}%)")
    print(f"  LF/HF ratio         : {metrics['lf_hf_ratio']:.2f}" if not np.isnan(metrics['lf_hf_ratio']) else "  LF/HF ratio         : N/A")
    print(f"  PSD peak frequency  : {metrics['peak_freq_hz']:.3f} Hz" if not np.isnan(metrics.get('peak_freq_hz', np.nan)) else "  PSD peak frequency  : N/A")
    print()

    near_resonance = (not np.isnan(metrics.get("peak_freq_hz", np.nan)) and
                      abs(metrics["peak_freq_hz"] - RESONANCE_HZ) < 0.03)
    if near_resonance:
        print(f"  PSD peak is near 0.1 Hz resonance — consistent with 6 breaths/min pacing.")
    else:
        print(f"  PSD peak is NOT near 0.1 Hz. Expected during guided breathing sessions.")

    if duration_s < 180:
        print(f"\n  WARNING: Session is {duration_s:.0f} s (< 3 min). LF band resolution may be insufficient.")
        print("  Use 3-minute sessions for reliable PSD interpretation.")
    print("=" * 55 + "\n")


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    base_dir   = os.path.dirname(script_dir)

    csv_path = sys.argv[1] if len(sys.argv) >= 2 else os.path.join(base_dir, "data", "ibi_corrected.csv")

    if not os.path.exists(csv_path):
        print(f"Error: file not found: {csv_path}")
        sys.exit(1)

    print(f"\nLoading corrected IBI: {csv_path}")
    df = load_corrected(csv_path)
    print(f"  Beats: {len(df)}")

    t_beats, ibi_s = build_tachogram(df)
    duration_s     = t_beats[-1] + ibi_s[-1]
    ibi_ms         = ibi_s * 1000.0

    t_grid, ibi_uniform = resample_ibi(t_beats, ibi_s, RESAMPLE_HZ)
    f, psd              = compute_welch(ibi_uniform, RESAMPLE_HZ)
    metrics             = compute_hrv_metrics(f, psd, ibi_s)

    stem    = os.path.splitext(os.path.basename(csv_path))[0].replace("_ibi_corrected", "")
    out_dir = os.path.join(base_dir, "graphs")

    plot_tachogram(t_beats, ibi_ms, out_dir)
    plot_psd(f, psd, metrics, out_dir)
    save_psd_csv(f, psd, base_dir, stem)
    print_hrv_summary(metrics, duration_s)


if __name__ == "__main__":
    main()
