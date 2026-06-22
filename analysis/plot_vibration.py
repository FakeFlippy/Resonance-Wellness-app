"""
plot_vibration.py

Analyze vibrator output captured from Arduino vibration_validator.ino.
Reads a CSV of (time_us, raw_adc), plots the waveform, computes FFT,
identifies the peak frequency, and checks the 100–135 Hz acceptance band.

Usage:
    python plot_vibration.py path/to/vibration_capture.csv
    python plot_vibration.py          # uses default filename in same folder

Dependencies:
    pip install numpy matplotlib scipy pandas

Output:
    - Time-domain plot (PNG)
    - Frequency-domain FFT plot (PNG)
    - Console summary with peak frequency and pass/fail verdict
"""

import sys
import os
import numpy as np
import matplotlib.pyplot as plt
from scipy.fft import rfft, rfftfreq
import csv

# Configuration
DEFAULT_CSV = "vibration_capture.csv"
FREQ_MIN_HZ = 100.0
FREQ_MAX_HZ = 135.0
FFT_WINDOW_HZ = 10.0  # Hz around peak to integrate for power


def load_csv(filepath):
    """
    Load CSV produced by vibration_validator.ino.
    Handles optional START_CAPTURE / END_CAPTURE markers.
    Returns two numpy arrays: time_us, raw_adc.
    """
    times = []
    values = []

    with open(filepath, "r", newline="") as f:
        reader = csv.reader(f)
        for row in reader:
            if len(row) < 2:
                continue
            # Skip marker lines
            if row[0].strip().upper() in ("START_CAPTURE", "END_CAPTURE", "TIME_US"):
                continue
            try:
                t = float(row[0].strip())
                v = float(row[1].strip())
                times.append(t)
                values.append(v)
            except ValueError:
                continue

    if len(times) < 10:
        raise ValueError(f"Only {len(times)} valid samples found in {filepath}. "
                         "Make sure you copied the CSV block between START_CAPTURE and END_CAPTURE.")

    return np.array(times), np.array(values)


def compute_sample_rate(time_us):
    """Estimate effective sample rate from timestamp deltas."""
    dt_us = np.diff(time_us)
    # Reject outliers (e.g. timer wrap or Serial hiccups)
    median_dt = np.median(dt_us)
    valid_dt = dt_us[(dt_us > 0.5 * median_dt) & (dt_us < 2.0 * median_dt)]
    mean_dt = np.mean(valid_dt)
    fs = 1e6 / mean_dt  # Convert us to seconds
    return fs


def compute_fft(raw, fs):
    """Compute single-sided FFT magnitude spectrum."""
    n = len(raw)
    # Detrend and apply a window to reduce spectral leakage
    windowed = raw - np.mean(raw)
    windowed = windowed * np.hanning(n)
    yf = rfft(windowed)
    xf = rfftfreq(n, 1.0 / fs)
    magnitude = np.abs(yf)
    return xf, magnitude


def find_peak_frequency(xf, magnitude, search_min=20.0, search_max=500.0):
    """Find the dominant frequency within a sensible search band."""
    mask = (xf >= search_min) & (xf <= search_max)
    if not np.any(mask):
        return 0.0, 0.0

    search_xf = xf[mask]
    search_mag = magnitude[mask]
    peak_idx = np.argmax(search_mag)
    peak_freq = search_xf[peak_idx]
    peak_mag = search_mag[peak_idx]
    return peak_freq, peak_mag


def compute_band_power(xf, magnitude, center, width):
    """Integrate power in a narrow band around the peak."""
    mask = (xf >= center - width) & (xf <= center + width)
    if not np.any(mask):
        return 0.0
    return np.sum(magnitude[mask] ** 2)


def plot_time_domain(time_us, raw, out_path):
    """Plot raw ADC values vs time in milliseconds."""
    time_ms = time_us / 1000.0
    fig, ax = plt.subplots(figsize=(10, 4))
    ax.plot(time_ms, raw, color="steelblue", linewidth=0.8)
    ax.set_title("Vibration Time-Domain Signal")
    ax.set_xlabel("Time (ms)")
    ax.set_ylabel("Raw ADC (12-bit)")
    ax.set_xlim(time_ms[0], time_ms[-1])
    ax.grid(True, alpha=0.3)
    plt.tight_layout()
    plt.savefig(out_path, dpi=150)
    print(f"  Time-domain plot saved: {out_path}")
    plt.close(fig)


def plot_frequency_domain(xf, magnitude, peak_freq, out_path):
    """Plot FFT magnitude with peak annotated."""
    # Limit x-axis to 0–500 Hz for readability
    mask = xf <= 500
    plot_x = xf[mask]
    plot_mag = magnitude[mask]

    fig, ax = plt.subplots(figsize=(10, 4))
    ax.plot(plot_x, plot_mag, color="darkgreen", linewidth=0.9)

    # Shade acceptance band
    ax.axvspan(FREQ_MIN_HZ, FREQ_MAX_HZ, color="limegreen", alpha=0.15, label="Acceptance band (100–135 Hz)")

    # Annotate peak
    if peak_freq > 0:
        ax.axvline(peak_freq, color="red", linestyle="--", linewidth=1.2, label=f"Peak = {peak_freq:.1f} Hz")
        ax.scatter([peak_freq], [np.max(plot_mag)], color="red", zorder=5)

    ax.set_title("Frequency Spectrum (FFT)")
    ax.set_xlabel("Frequency (Hz)")
    ax.set_ylabel("Magnitude")
    ax.set_xlim(0, 500)
    ax.legend(loc="upper right")
    ax.grid(True, alpha=0.3)
    plt.tight_layout()
    plt.savefig(out_path, dpi=150)
    print(f"  Frequency plot saved: {out_path}")
    plt.close(fig)


def main():
    if len(sys.argv) >= 2:
        csv_path = sys.argv[1]
    else:
        script_dir = os.path.dirname(os.path.abspath(__file__))
        csv_path = os.path.join(script_dir, DEFAULT_CSV)

    if not os.path.exists(csv_path):
        print(f"Error: CSV file not found: {csv_path}")
        print(f"Usage: python {os.path.basename(__file__)} <path_to_csv>")
        sys.exit(1)

    print(f"Loading: {csv_path}")
    time_us, raw = load_csv(csv_path)
    n_samples = len(raw)
    print(f"  Samples loaded: {n_samples}")

    fs = compute_sample_rate(time_us)
    duration_s = (time_us[-1] - time_us[0]) / 1e6
    print(f"  Estimated sample rate: {fs:.1f} Hz")
    print(f"  Duration: {duration_s:.2f} s")

    xf, magnitude = compute_fft(raw, fs)
    peak_freq, peak_mag = find_peak_frequency(xf, magnitude)
    print(f"  Dominant peak frequency: {peak_freq:.2f} Hz")

    # Compute signal-to-band noise ratio around peak
    band_power = compute_band_power(xf, magnitude, peak_freq, FFT_WINDOW_HZ)
    total_power = np.sum(magnitude ** 2)
    snr = 10 * np.log10(band_power / (total_power - band_power + 1e-12))
    print(f"  Approximate SNR around peak: {snr:.1f} dB")

    # Pass/fail verdict
    in_band = FREQ_MIN_HZ <= peak_freq <= FREQ_MAX_HZ
    if in_band:
        print(f"\n  RESULT: PASS  ({peak_freq:.1f} Hz is within 100–135 Hz acceptance band)")
    else:
        print(f"\n  RESULT: FAIL  ({peak_freq:.1f} Hz is outside 100–135 Hz acceptance band)")

    # Determine output directory (same folder as CSV)
    out_dir = os.path.dirname(os.path.abspath(csv_path))
    if not out_dir:
        out_dir = "."

    base_name = os.path.splitext(os.path.basename(csv_path))[0]
    time_plot_path = os.path.join(out_dir, f"{base_name}_time.png")
    freq_plot_path = os.path.join(out_dir, f"{base_name}_fft.png")

    print("\nGenerating plots...")
    plot_time_domain(time_us, raw, time_plot_path)
    plot_frequency_domain(xf, magnitude, peak_freq, freq_plot_path)

    print("\nDone.")


if __name__ == "__main__":
    main()
