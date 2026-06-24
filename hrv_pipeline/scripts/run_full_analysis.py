"""
HRV Pipeline — Full Session Analysis (One-Shot)
================================================
Runs the complete HRV pipeline in a single script:
  1. Load & validate filtered CSV
  2. Detect heartbeat peaks (prominence-based)
  3. Extract inter-beat intervals (IBI)
  4. Detect & correct artifacts (Kubios-inspired)
  5. Compute HRV time-domain metrics (SDNN, RMSSD)
  6. Interpolate IBI → uniform 4 Hz grid
  7. Compute Welch PSD with VLF / LF / HF band integration
  8. Generate 6 publication-style graphs + print summary

Usage:
    python scripts/run_full_analysis.py data/session2_3min_unpaced.csv [--name "Session 2"]

Output (graphs/ folder):
    <stem>_peaks.png            — full waveform + peak markers + 15s zoom
    <stem>_tachogram.png        — IBI tachogram + BPM over time
    <stem>_ibi_interpolated.png — corrected beats + cubic interpolation curve
    <stem>_psd.png              — Welch PSD with VLF/LF/HF shading
    <stem>_poincare.png         — Poincaré plot with SD1/SD2 ellipse
    <stem>_band_power.png       — bar chart + LF/HF pie

Dependencies:
    pip install numpy pandas matplotlib scipy
"""

import sys
import os
import argparse
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.patches import Ellipse
from scipy.signal import find_peaks, welch, detrend
from scipy.interpolate import interp1d

# ── Configuration ───────────────────────────────────────────────────────────────

PEAK_COLUMN        = "filtered_10hz"
MIN_PEAK_DIST_MS   = 300.0
MIN_PEAK_PROM_FRAC = 0.10
WARMUP_SAMPLES     = 200

IBI_DEVIATION_THRESH = 0.25
ROLLING_WIN          = 7
ECTOPIC_SHORT_FRAC   = 0.80
ECTOPIC_LONG_FRAC    = 1.20

INTERP_FS     = 4.0     # Hz — IBI resampling rate for PSD
WELCH_SEG_S   = 60.0    # seconds per Welch segment (4× overlap)
WELCH_OVERLAP = 0.75    # 75 % overlap between segments

VLF_BAND  = (0.003, 0.04)
LF_BAND   = (0.04,  0.15)
HF_BAND   = (0.15,  0.40)

BAND_COLORS = {
    "VLF": "#e8b84b",
    "LF":  "#2a7ae2",
    "HF":  "#27a86e",
}

STYLE = dict(dpi=150, bbox_inches="tight")
plt.rcParams.update({
    "font.size": 10,
    "axes.titlesize": 11,
    "axes.labelsize": 10,
    "figure.facecolor": "white",
    "axes.facecolor": "#f8f9fa",
    "grid.color": "#dddddd",
    "grid.linewidth": 0.7,
})


# ── CSV loading ─────────────────────────────────────────────────────────────────

def load_csv(filepath: str) -> pd.DataFrame:
    rows, header = [], None
    with open(filepath, encoding="utf-8-sig") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if line.upper() in ("START_CAPTURE", "END_CAPTURE"):
                continue
            if header is None and not (line[0].isdigit() or line[0] == "-"):
                header = [c.strip() for c in line.split(",")]
                continue
            rows.append(line)
    if header is None or not rows:
        raise ValueError(f"Could not parse CSV: {filepath}")
    df = pd.DataFrame([r.split(",") for r in rows], columns=header)
    return df.apply(pd.to_numeric, errors="coerce").dropna()


def infer_fs(df: pd.DataFrame) -> float:
    dt = np.diff(df["time_us"].values[:500])
    dt = dt[(dt > 0) & (dt < 1_000_000)]
    return round(1e6 / np.median(dt)) if len(dt) > 0 else 100.0


# ── Peak detection ──────────────────────────────────────────────────────────────

def detect_peaks_fn(signal: np.ndarray, fs: float) -> np.ndarray:
    warmup   = min(WARMUP_SAMPLES, len(signal) // 4)
    steady   = signal[warmup:]
    amp_rng  = steady.max() - steady.min()
    prom     = max(MIN_PEAK_PROM_FRAC * amp_rng, 10.0)
    min_dist = max(int(MIN_PEAK_DIST_MS * fs / 1000.0), 1)
    peaks_s, _ = find_peaks(steady, distance=min_dist, prominence=prom)
    return peaks_s + warmup


# ── IBI extraction ──────────────────────────────────────────────────────────────

def extract_ibi(peaks_idx: np.ndarray, t_s: np.ndarray):
    ibi_ms = np.diff(t_s[peaks_idx]) * 1000.0
    beat_t = t_s[peaks_idx[1:]]
    return ibi_ms, beat_t


# ── Artifact correction ─────────────────────────────────────────────────────────

def correct_artifacts(ibi_ms: np.ndarray):
    n          = len(ibi_ms)
    ibi_series = pd.Series(ibi_ms)
    rolling_med = (ibi_series
                   .rolling(ROLLING_WIN, center=True, min_periods=3)
                   .median()
                   .values)

    flags = ["ok"] * n

    for i in range(n):
        med = rolling_med[i]
        if np.isnan(med) or med <= 0:
            continue
        if abs(ibi_ms[i] - med) / med > IBI_DEVIATION_THRESH:
            flags[i] = "artifact"

    for i in range(n - 1):
        med = rolling_med[i]
        if np.isnan(med) or med <= 0:
            continue
        if (ibi_ms[i]     < ECTOPIC_SHORT_FRAC * med and
                ibi_ms[i + 1] > ECTOPIC_LONG_FRAC  * med):
            flags[i] = flags[i + 1] = "artifact"

    flags = np.array(flags)
    corrected = ibi_ms.copy().astype(float)
    bad_idx   = np.where(flags == "artifact")[0]

    if len(bad_idx) > 0:
        valid_idx = np.where(flags != "artifact")[0]
        valid_ibi = ibi_ms[flags != "artifact"]
        if len(valid_idx) >= 2:
            corrected[bad_idx] = np.interp(bad_idx, valid_idx, valid_ibi)

    return corrected, flags, rolling_med


# ── HRV time-domain metrics ─────────────────────────────────────────────────────

def hrv_time_domain(ibi_corrected: np.ndarray) -> dict:
    diffs = np.diff(ibi_corrected)
    sd1 = np.std((np.roll(ibi_corrected, -1)[:-1] - ibi_corrected[:-1]) / np.sqrt(2))
    sd2 = np.std((np.roll(ibi_corrected, -1)[:-1] + ibi_corrected[:-1]) / np.sqrt(2))
    return dict(
        n         = len(ibi_corrected),
        mean_ibi  = ibi_corrected.mean(),
        mean_bpm  = 60000.0 / ibi_corrected.mean(),
        sdnn      = ibi_corrected.std(ddof=1),
        rmssd     = np.sqrt(np.mean(diffs ** 2)),
        pnn50     = 100.0 * np.mean(np.abs(diffs) > 50.0),
        sd1       = sd1,
        sd2       = sd2,
    )


# ── PSD (Welch) ─────────────────────────────────────────────────────────────────

def compute_psd(ibi_corrected: np.ndarray, beat_t: np.ndarray):
    t_uniform = np.arange(beat_t[0], beat_t[-1], 1.0 / INTERP_FS)
    fn        = interp1d(beat_t, ibi_corrected, kind="cubic", fill_value="extrapolate")
    ibi_interp = fn(t_uniform)

    ibi_dt = detrend(ibi_interp - ibi_interp.mean())

    nperseg  = min(int(WELCH_SEG_S * INTERP_FS), len(ibi_dt) // 2)
    noverlap = int(nperseg * WELCH_OVERLAP)
    f, psd   = welch(ibi_dt, fs=INTERP_FS, nperseg=nperseg,
                     noverlap=noverlap, window="hann")
    return f, psd, t_uniform, ibi_interp


def band_power(f: np.ndarray, psd: np.ndarray, fmin: float, fmax: float) -> float:
    idx = (f >= fmin) & (f <= fmax)
    if idx.sum() < 2:
        return 0.0
    return float(np.trapezoid(psd[idx], f[idx]))


# ── Plot 1 — Waveform & peaks ───────────────────────────────────────────────────

def plot_waveform_peaks(t_s, signal, peaks_idx, out_dir, stem, label):
    fig, axes = plt.subplots(2, 1, figsize=(14, 7), sharex=False)

    axes[0].plot(t_s, signal, color="#2a7ae2", lw=0.5, label=PEAK_COLUMN, rasterized=True)
    axes[0].scatter(t_s[peaks_idx], signal[peaks_idx],
                    color="#e74c3c", s=12, zorder=5,
                    label=f"Peaks  (n = {len(peaks_idx)})")
    axes[0].set_ylabel("ADC value")
    axes[0].set_title(f"{label} — Peak Detection  ({t_s[-1]-t_s[0]:.0f} s full recording)")
    axes[0].legend(fontsize=8, loc="upper right")
    axes[0].grid(True)

    zoom_end  = t_s[0] + 15.0
    mask      = t_s <= zoom_end
    pz        = peaks_idx[t_s[peaks_idx] <= zoom_end]
    axes[1].plot(t_s[mask], signal[mask], color="#2a7ae2", lw=1.1, label=PEAK_COLUMN)
    axes[1].scatter(t_s[pz], signal[pz],
                    color="#e74c3c", s=40, zorder=5,
                    label=f"Peaks  (n = {len(pz)} in 15 s)")
    axes[1].set_xlabel("Time (s)")
    axes[1].set_ylabel("ADC value")
    axes[1].set_title("First 15 s — zoom")
    axes[1].legend(fontsize=8, loc="upper right")
    axes[1].grid(True)

    plt.tight_layout()
    path = os.path.join(out_dir, f"{stem}_peaks.png")
    fig.savefig(path, **STYLE)
    plt.close(fig)
    return path


# ── Plot 2 — IBI tachogram ──────────────────────────────────────────────────────

def plot_tachogram(ibi_ms, beat_t, flags, rolling_med, out_dir, stem, label):
    bad = flags == "artifact"
    bpm = 60000.0 / ibi_ms

    fig, axes = plt.subplots(2, 1, figsize=(14, 7), sharex=True)

    axes[0].plot(beat_t, ibi_ms, color="#2a7ae2", lw=0.9, label="IBI (ms)")
    axes[0].plot(beat_t, rolling_med, color="#e8b84b", lw=1.3, ls="--",
                 label=f"Rolling median (win={ROLLING_WIN})")
    if bad.any():
        axes[0].scatter(beat_t[bad], ibi_ms[bad],
                        color="#e74c3c", s=50, zorder=6, marker="x",
                        label=f"Artifact  (n = {bad.sum()})", linewidths=2)
    axes[0].axhline(1000, color="#888888", lw=0.8, ls=":", label="1 000 ms = 60 BPM")
    axes[0].set_ylabel("IBI (ms)")
    axes[0].set_title(f"{label} — IBI Tachogram")
    axes[0].legend(fontsize=8, loc="upper right")
    axes[0].grid(True)

    axes[1].plot(beat_t, bpm, color="#27a86e", lw=0.9, label="BPM")
    axes[1].set_xlabel("Time (s)")
    axes[1].set_ylabel("BPM")
    axes[1].set_title("Instantaneous Heart Rate")
    axes[1].legend(fontsize=8)
    axes[1].grid(True)

    plt.tight_layout()
    path = os.path.join(out_dir, f"{stem}_tachogram.png")
    fig.savefig(path, **STYLE)
    plt.close(fig)
    return path


# ── Plot 3 — IBI interpolated (for PSD transparency) ───────────────────────────

def plot_ibi_interpolated(t_uniform, ibi_interp, beat_t, ibi_corrected, out_dir, stem, label):
    fig, ax = plt.subplots(figsize=(14, 4))
    ax.plot(beat_t, ibi_corrected, "o", color="#888888", ms=3, alpha=0.55,
            label="Corrected beats")
    ax.plot(t_uniform, ibi_interp, color="#2a7ae2", lw=0.9,
            label=f"Cubic interp @ {INTERP_FS:.0f} Hz (Welch input)")
    ax.set_xlabel("Time (s)")
    ax.set_ylabel("IBI (ms)")
    ax.set_title(f"{label} — Corrected IBI series + uniform interpolation")
    ax.legend(fontsize=9)
    ax.grid(True)
    plt.tight_layout()
    path = os.path.join(out_dir, f"{stem}_ibi_interpolated.png")
    fig.savefig(path, **STYLE)
    plt.close(fig)
    return path


# ── Plot 4 — PSD ────────────────────────────────────────────────────────────────

def plot_psd(f, psd, vlf_p, lf_p, hf_p, out_dir, stem, label):
    lf_hf = lf_p / hf_p if hf_p > 0 else float("nan")
    total = vlf_p + lf_p + hf_p

    fig, ax = plt.subplots(figsize=(12, 6))
    ax.semilogy(f, psd, color="#333333", lw=1.2, zorder=5, label="PSD (Welch)")

    for (fmin, fmax), bname, color in [
        (VLF_BAND, "VLF", BAND_COLORS["VLF"]),
        (LF_BAND,  "LF",  BAND_COLORS["LF"]),
        (HF_BAND,  "HF",  BAND_COLORS["HF"]),
    ]:
        idx = (f >= fmin) & (f <= fmax)
        ax.fill_between(f[idx], psd[idx], alpha=0.40, color=color,
                        label=f"{bname}  ({fmin}–{fmax} Hz)  {band_power(f, psd, fmin, fmax):.0f} ms²")

    ax.axvline(0.10, color="#e74c3c", lw=1.5, ls="--", zorder=6,
               label="0.10 Hz  (autonomic resonance)")

    ax.set_xlabel("Frequency (Hz)")
    ax.set_ylabel("Power spectral density  (ms² / Hz)")
    ax.set_xlim(0.003, 0.40)
    ax.set_title(
        f"{label} — HRV Power Spectral Density\n"
        f"VLF = {vlf_p:.0f}  |  LF = {lf_p:.0f}  |  HF = {hf_p:.0f}  ms²     "
        f"LF/HF = {lf_hf:.2f}     Total = {total:.0f} ms²"
    )
    ax.legend(fontsize=9, loc="upper right")
    ax.grid(True, which="both")
    plt.tight_layout()
    path = os.path.join(out_dir, f"{stem}_psd.png")
    fig.savefig(path, **STYLE)
    plt.close(fig)
    return path


# ── Plot 5 — Poincaré plot ──────────────────────────────────────────────────────

def plot_poincare(ibi_corrected, out_dir, stem, label, metrics):
    x  = ibi_corrected[:-1]
    y  = ibi_corrected[1:]
    sd1 = metrics["sd1"]
    sd2 = metrics["sd2"]
    mu  = ibi_corrected.mean()

    fig, ax = plt.subplots(figsize=(7, 7))
    ax.scatter(x, y, alpha=0.35, s=14, color="#2a7ae2", zorder=3, label="IBI[n] vs IBI[n+1]")

    lo = min(x.min(), y.min()) * 0.995
    hi = max(x.max(), y.max()) * 1.005
    ax.plot([lo, hi], [lo, hi], "k--", lw=1, alpha=0.4, label="Identity line")

    ellipse = Ellipse(
        xy=(mu, mu), width=2 * sd2, height=2 * sd1,
        angle=-45, edgecolor="#e74c3c", fc="none", lw=1.8,
        label=f"SD1 = {sd1:.1f} ms  |  SD2 = {sd2:.1f} ms",
    )
    ax.add_patch(ellipse)

    ax.set_xlabel("IBI[n]  (ms)")
    ax.set_ylabel("IBI[n+1]  (ms)")
    ax.set_title(
        f"{label} — Poincaré Plot\n"
        f"SD1 = {sd1:.1f} ms (short-term / RMSSD proxy)    "
        f"SD2 = {sd2:.1f} ms (long-term / SDNN proxy)\n"
        f"RMSSD = {metrics['rmssd']:.1f} ms    SDNN = {metrics['sdnn']:.1f} ms"
    )
    ax.legend(fontsize=9, loc="lower right")
    ax.grid(True)
    ax.set_aspect("equal")
    plt.tight_layout()
    path = os.path.join(out_dir, f"{stem}_poincare.png")
    fig.savefig(path, **STYLE)
    plt.close(fig)
    return path


# ── Plot 6 — Band power + LF/HF pie ────────────────────────────────────────────

def plot_band_power(vlf_p, lf_p, hf_p, out_dir, stem, label):
    lf_hf = lf_p / hf_p if hf_p > 0 else float("nan")
    total = vlf_p + lf_p + hf_p

    if lf_hf > 2.0:
        state = "Sympathetic dominant"
        state_color = "#e74c3c"
    elif lf_hf < 1.0:
        state = "Parasympathetic dominant"
        state_color = "#27a86e"
    else:
        state = "Balanced autonomic tone"
        state_color = "#2a7ae2"

    fig, axes = plt.subplots(1, 2, figsize=(12, 5))

    bands  = ["VLF\n(0.003–0.04 Hz)", "LF\n(0.04–0.15 Hz)", "HF\n(0.15–0.40 Hz)"]
    powers = [vlf_p, lf_p, hf_p]
    colors = [BAND_COLORS["VLF"], BAND_COLORS["LF"], BAND_COLORS["HF"]]
    bars   = axes[0].bar(bands, powers, color=colors, edgecolor="white", linewidth=1.5)
    for bar, val in zip(bars, powers):
        axes[0].text(
            bar.get_x() + bar.get_width() / 2,
            bar.get_height() + max(powers) * 0.02,
            f"{val:.0f} ms²", ha="center", va="bottom", fontsize=10, fontweight="bold",
        )
    axes[0].set_ylabel("Power  (ms²)")
    axes[0].set_title(f"{label}\nHRV Band Power")
    axes[0].grid(True, axis="y")
    axes[0].set_facecolor("#f8f9fa")

    lf_frac = lf_p / (lf_p + hf_p) * 100 if (lf_p + hf_p) > 0 else 50
    hf_frac = 100.0 - lf_frac
    wedge_props = dict(edgecolor="white", linewidth=2)
    axes[1].pie(
        [lf_frac, hf_frac],
        labels=[f"LF  {lf_frac:.1f}%", f"HF  {hf_frac:.1f}%"],
        colors=[BAND_COLORS["LF"], BAND_COLORS["HF"]],
        startangle=90,
        wedgeprops=wedge_props,
        textprops={"fontsize": 11},
    )
    axes[1].set_title(
        f"LF / HF Balance\nRatio = {lf_hf:.2f}\n",
        fontsize=11,
    )
    axes[1].text(
        0, -1.35, state,
        ha="center", fontsize=12, fontweight="bold", color=state_color,
        transform=axes[1].transData,
    )

    plt.tight_layout()
    path = os.path.join(out_dir, f"{stem}_band_power.png")
    fig.savefig(path, **STYLE)
    plt.close(fig)
    return path


# ── Main ─────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="HRV Full Session Analysis — runs entire pipeline in one step"
    )
    parser.add_argument(
        "csv", nargs="?", default=None,
        help="Path to raw filtered CSV (default: data/session2_3min_unpaced.csv)",
    )
    parser.add_argument(
        "--name", default=None,
        help="Human-readable session label for graph titles",
    )
    args = parser.parse_args()

    script_dir = os.path.dirname(os.path.abspath(__file__))
    base_dir   = os.path.dirname(script_dir)
    out_dir    = os.path.join(base_dir, "graphs")
    os.makedirs(out_dir, exist_ok=True)

    csv_path = args.csv or os.path.join(base_dir, "data", "session2_3min_unpaced.csv")
    if not os.path.exists(csv_path):
        print(f"\nError: file not found: {csv_path}")
        print("Save your pasted CSV to that path, then re-run this script.")
        sys.exit(1)

    stem  = os.path.splitext(os.path.basename(csv_path))[0]
    label = args.name or stem.replace("_", " ").title()

    sep = "=" * 62

    # ── 1. Load ──
    print(f"\n{sep}")
    print(f"  HRV Full Session Analysis")
    print(f"  {label}")
    print(sep)
    print("\n[1/7] Loading CSV …")
    df = load_csv(csv_path)
    fs = infer_fs(df)
    t_s = df["time_us"].values / 1e6

    if PEAK_COLUMN not in df.columns:
        print(f"Error: column '{PEAK_COLUMN}' not found. Available: {list(df.columns)}")
        sys.exit(1)

    signal   = df[PEAK_COLUMN].values.astype(float)
    duration = t_s[-1] - t_s[0]
    print(f"  Rows      : {len(df):,}")
    print(f"  Sample fs : {fs:.0f} Hz")
    print(f"  Duration  : {duration:.1f} s  ({duration/60:.2f} min)")

    if duration < 120:
        print("  ⚠  WARNING: session < 2 min — PSD frequency bands unreliable")

    # ── 2. Peak detection ──
    print("\n[2/7] Detecting peaks …")
    peaks_idx = detect_peaks_fn(signal, fs)
    print(f"  Peaks found : {len(peaks_idx)}")

    # ── 3. IBI ──
    print("\n[3/7] Extracting IBI …")
    ibi_ms, beat_t = extract_ibi(peaks_idx, t_s)
    mean_bpm_raw   = (60000.0 / ibi_ms).mean()
    print(f"  Beats       : {len(ibi_ms)}")
    print(f"  Mean BPM    : {mean_bpm_raw:.1f}")
    print(f"  IBI range   : {ibi_ms.min():.0f} – {ibi_ms.max():.0f} ms")

    # ── 4. Artifact correction ──
    print("\n[4/7] Correcting artifacts …")
    ibi_corrected, flags, rolling_med = correct_artifacts(ibi_ms)
    n_bad = int((flags == "artifact").sum())
    pct   = 100.0 * n_bad / len(ibi_ms)
    print(f"  Artifacts   : {n_bad} / {len(ibi_ms)}  ({pct:.1f}%)")
    if pct > 15:
        print("  ⚠  >15 % artifacts — PSD results should be treated cautiously")

    # ── 5. Time-domain HRV ──
    print("\n[5/7] Computing HRV metrics …")
    m = hrv_time_domain(ibi_corrected)
    print(f"  Mean IBI    : {m['mean_ibi']:.0f} ms")
    print(f"  Mean BPM    : {m['mean_bpm']:.1f}")
    print(f"  SDNN        : {m['sdnn']:.1f} ms")
    print(f"  RMSSD       : {m['rmssd']:.1f} ms")
    print(f"  pNN50       : {m['pnn50']:.1f} %")
    print(f"  SD1 / SD2   : {m['sd1']:.1f} / {m['sd2']:.1f} ms")

    # ── 6. PSD ──
    print("\n[6/7] Computing PSD (Welch) …")
    f, psd, t_uniform, ibi_interp = compute_psd(ibi_corrected, beat_t)
    vlf_p = band_power(f, psd, *VLF_BAND)
    lf_p  = band_power(f, psd, *LF_BAND)
    hf_p  = band_power(f, psd, *HF_BAND)
    total = vlf_p + lf_p + hf_p
    lf_hf = lf_p / hf_p if hf_p > 0 else float("nan")

    print(f"  VLF         : {vlf_p:.0f} ms²")
    print(f"  LF          : {lf_p:.0f} ms²")
    print(f"  HF          : {hf_p:.0f} ms²")
    print(f"  Total       : {total:.0f} ms²")
    print(f"  LF/HF ratio : {lf_hf:.2f}")

    # ── 7. Graphs ──
    print("\n[7/7] Generating graphs …")
    paths = [
        plot_waveform_peaks(t_s, signal, peaks_idx, out_dir, stem, label),
        plot_tachogram(ibi_ms, beat_t, flags, rolling_med, out_dir, stem, label),
        plot_ibi_interpolated(t_uniform, ibi_interp, beat_t, ibi_corrected, out_dir, stem, label),
        plot_psd(f, psd, vlf_p, lf_p, hf_p, out_dir, stem, label),
        plot_poincare(ibi_corrected, out_dir, stem, label, m),
        plot_band_power(vlf_p, lf_p, hf_p, out_dir, stem, label),
    ]
    for p in paths:
        print(f"  ✓  {os.path.basename(p)}")

    # ── Summary ──
    if lf_hf > 2.0:
        autonomic = "Sympathetic dominant"
    elif lf_hf < 1.0:
        autonomic = "Parasympathetic dominant (resting / relaxed)"
    else:
        autonomic = "Balanced autonomic tone"

    print(f"\n{sep}")
    print("  HRV SUMMARY")
    print(sep)
    print(f"  Session          : {label}")
    print(f"  Duration         : {duration:.0f} s  ({duration/60:.1f} min)")
    print(f"  Beats analyzed   : {m['n']}")
    print(f"  Artifact rate    : {pct:.1f} %")
    print()
    print("  TIME DOMAIN")
    print(f"    Mean BPM       : {m['mean_bpm']:.1f}")
    print(f"    SDNN           : {m['sdnn']:.1f} ms  (overall variability)")
    print(f"    RMSSD          : {m['rmssd']:.1f} ms  (short-term / parasympathetic)")
    print(f"    pNN50          : {m['pnn50']:.1f} %")
    print(f"    SD1            : {m['sd1']:.1f} ms")
    print(f"    SD2            : {m['sd2']:.1f} ms")
    print()
    print("  FREQUENCY DOMAIN  (Welch PSD, 4 Hz interpolation)")
    print(f"    VLF  (≤0.04 Hz): {vlf_p:.0f} ms²")
    print(f"    LF   (0.04–0.15 Hz): {lf_p:.0f} ms²  ({100*lf_p/total:.0f} % of total)")
    print(f"    HF   (0.15–0.40 Hz): {hf_p:.0f} ms²  ({100*hf_p/total:.0f} % of total)")
    print(f"    Total power    : {total:.0f} ms²")
    print(f"    LF/HF ratio    : {lf_hf:.2f}  →  {autonomic}")
    print(sep)
    print()


if __name__ == "__main__":
    main()
