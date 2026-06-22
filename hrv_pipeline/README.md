# HRV Signal Processing Pipeline

_Project started: 2026-06-21 | Board: Seeed XIAO nRF52840_

---

## Project Overview

This pipeline processes pressure-sensor pulse waveform data collected from a custom nRF52840-based device. The goal is to move step-by-step from raw ADC samples through filtering, peak detection, IBI extraction, artifact correction, and PSD/HRV analysis — eventually feeding a guided-breathing mobile app over BLE.

**The pipeline is strictly sequential. Do not skip phases.**

---

## Intervention Context

This work supports the **Vsb (Vibratory Stimulation + Breathing) Protocol** for relief of vasomotor symptoms via oscillatory synchrony.

Two modalities are combined:
- **Paced Breathing** at 0.1 Hz (6 breaths/min) — targets resonance in autonomic nervous system.
- **Ear Vibration (Vsb Device)** — handheld 7000 RPM (~115 Hz) unit pressed against the concha cavum of the ear at Point Marvelous. Acceptable unit range: 100–135 Hz.

Physiological data from the pressure sensor provides IBI/HRV feedback to evaluate whether the combination of paced breathing and vibration achieves measurable autonomic modulation.

---

## Hardware Setup

| Component | Detail |
|---|---|
| Microcontroller | Seeed XIAO nRF52840 |
| ADC pin | A0 |
| ADC resolution | 14-bit (0–16383) |
| Signal center | ~7000–8000 ADC units at rest |
| Baud rate | 115200 |
| Connection | USB Serial |
| Sensor | Pressure-based pulse sensor (analog) |

**Known signal issues:**
- Sensitive to finger pressure and movement.
- Do not trust IBI detection until filtered waveform is validated visually.
- Saturation/drift expected with large pressure changes.

---

## Software Requirements

```bash
pip install numpy pandas matplotlib scipy
```

Python 3.8+ required.

---

## Directory Structure

```
hrv_pipeline/
  README.md                      <- This file
  arduino/
    phase1_raw_capture/
      phase1_raw_capture.ino     <- Phase 1: raw 500 Hz capture
    phase2_raw_filtered/
      phase2_raw_filtered.ino    <- Phase 2: raw + 3 filters, 100 Hz output
  scripts/
    analyze_raw_vs_filtered.py   <- Phase 3: graphs raw vs filtered
    detect_peaks.py              <- Phase 5: peak detection
    extract_ibi.py               <- Phase 6: IBI extraction
    correct_ibi_artifacts.py     <- Phase 7: artifact/ectopic correction
    compute_psd.py               <- Phase 8: PSD/HRV analysis
  data/
    raw_capture.csv              <- Phase 1 output (created by user)
    raw_filtered_capture.csv     <- Phase 2 output (created by user)
    detected_peaks.csv           <- Phase 5 output
    ibi_raw.csv                  <- Phase 6 output
    ibi_corrected.csv            <- Phase 7 output
    psd_values.csv               <- Phase 8 output (optional)
  graphs/
    01_raw_signal.png
    02_raw_vs_200hz.png
    03_raw_vs_10hz.png
    04_raw_vs_15hz.png
    05_all_filters_overlay.png
    06_zoomed_5s.png
    10_peaks_on_filtered.png
    20_ibi_vs_time.png
    30_ibi_raw_vs_corrected.png
    31_artifact_flags.png
    40_ibi_time_series.png
    41_ibi_psd.png
```

---

## Phase 1 — Arduino Raw Data Capture `[IMPLEMENTED]`

### What was implemented

Arduino sketch `phase1_raw_capture.ino` that samples A0 at **500 Hz** with **14-bit resolution** and outputs timestamped CSV to Serial. Triggered by user command. Supports 20-second, 60-second, and 3-minute runs.

### How to run it

1. Open `arduino/phase1_raw_capture/phase1_raw_capture.ino` in Arduino IDE.
2. Board: **Seeed XIAO nRF52840**.
3. Port: **USB Serial Device (e.g., COM8)**.
4. Upload sketch (Ctrl+U). If upload fails, double-tap RESET to enter bootloader.
5. Open **Serial Monitor** at **115200 baud**.
6. Send a command:
   - `1` → 20-second capture
   - `2` → 60-second capture
   - `3` → 3-minute capture
   - `x` → stop early
7. Wait for `END_CAPTURE`.
8. **Copy everything between `START_CAPTURE` and `END_CAPTURE`** (including the `time_us,raw` header line).
9. Save it as `data/raw_capture.csv`.

### Input

None — collects live from sensor.

### Output

`data/raw_capture.csv` — format:

```
time_us,raw
0,7842
2000,7845
4000,7839
...
```

### What this tells us

- Whether the ADC is reading signal at all.
- Whether the signal is centered near the expected midpoint (~7000–8000).
- Whether there is visible motion artifact or baseline drift.
- Raw signal amplitude range.

### Current observations

_Fill in after first capture._

### Known limitations

- No filtering applied.
- Movement artifact dominates the raw signal.
- Phase 1 alone cannot be used for IBI detection.

### Next step

Run Phase 2 to add filtering, then Phase 3 to graph raw vs filtered.

---

## Phase 2 — Arduino Raw + Filtered Capture `[IMPLEMENTED]`

### What was implemented

Arduino sketch `phase2_raw_filtered.ino` that samples at **500 Hz internally** but outputs every 5th sample (**100 Hz effective output**) with 4 columns: raw plus three filter stages.

**Why 100 Hz output instead of 500 Hz:**
The 10 Hz and 15 Hz low-pass filtered signals contain no meaningful signal energy above ~20 Hz. Outputting every 5th sample (100 Hz) satisfies Nyquist by a factor of 5. The filters themselves still run at the full 500 Hz rate for correct frequency response.

### Filter Descriptions

| Column | Filter | Description |
|---|---|---|
| `raw` | None | Raw 14-bit ADC value |
| `filtered_200hz` | 1-pole IIR LPF, α=0.715 | First-stage anti-aliasing / high-frequency rejection. Removes noise above ~100 Hz. Coefficient matches the existing project reference firmware. |
| `filtered_10hz` | 2-pole Butterworth LPF, Fc=10 Hz, Fs=500 Hz | Removes motion artifact and slow drift. Passes pulse waveform shape. **Primary filter for peak detection.** |
| `filtered_15hz` | 2-pole Butterworth LPF, Fc=15 Hz, Fs=500 Hz | Slightly less aggressive than 10 Hz. Compare waveform detail vs. 10 Hz. |

### How to run it

Same steps as Phase 1 but use `phase2_raw_filtered.ino`.
Save output as `data/raw_filtered_capture.csv`.

### Output

`data/raw_filtered_capture.csv` — format:

```
time_us,raw,filtered_200hz,filtered_10hz,filtered_15hz
0,7842,7842,7842,7842
10000,7847,7844,7843,7843
...
```

### Why no IBI detection yet

IBI detection depends on finding clean, consistent beat peaks. If the filtered waveform still shows:
- Excessive baseline drift
- Irregular amplitude
- Merged double-peaks
- Motion artifact bursts

...then IBI values would be meaningless or worse, misleading. We must **visually confirm** the filtered waveform looks like a real pulse trace before trusting any peak detector output.

### Known limitations

- Filtered values are output as integers (cast from float). Sub-LSB precision lost but acceptable for visualization.
- 200 Hz label on Filter 1 is approximate; actual cutoff is ~100 Hz based on coefficient (matches reference firmware).

---

## Phase 3 — Python Raw vs Filtered Analysis `[IMPLEMENTED]`

### What was implemented

Python script `scripts/analyze_raw_vs_filtered.py` that reads the Phase 2 CSV and generates 6 comparison graphs. Also re-applies the Arduino filters in Python using the same coefficients for cross-validation.

### How to run it

```bash
cd hrv_pipeline
python scripts/analyze_raw_vs_filtered.py data/raw_filtered_capture.csv
```

If no filename given, defaults to `data/raw_filtered_capture.csv`.

### Input

`data/raw_filtered_capture.csv` (Phase 2 output, 5-column format)

Also works with Phase 1 `data/raw_capture.csv` (2-column format, only plots raw).

### Output graphs

| Graph | Filename | Purpose |
|---|---|---|
| Raw signal | `graphs/01_raw_signal.png` | Baseline view. Is the signal alive? Is it centered? Any obvious clipping? |
| Raw vs 200 Hz filter | `graphs/02_raw_vs_200hz.png` | How much high-frequency noise does the first stage remove? |
| Raw vs 10 Hz filter | `graphs/03_raw_vs_10hz.png` | Primary pulse waveform view. Can you see heartbeat bumps? |
| Raw vs 15 Hz filter | `graphs/04_raw_vs_15hz.png` | Slightly sharper version of the pulse. Compare with 10 Hz. |
| All filters overlay | `graphs/05_all_filters_overlay.png` | Full comparison of all 4 traces at once. |
| 5-second zoom | `graphs/06_zoomed_5s.png` | Zoomed window to see waveform morphology. |

### What a good result looks like

- Raw signal: noisy but shows periodic oscillation at ~1 Hz.
- After 10 Hz LPF: smooth wave with clear repeating peaks at roughly heart rate intervals.
- Peak amplitudes relatively consistent (within ±30% of mean).
- No extended flat sections (saturation).
- No sudden baseline jumps (motion artifact).

### What a bad result looks like

- Raw signal: flat, saturated (stuck at 0 or 16383), or pure noise.
- After 10 Hz LPF: no visible periodic structure.
- Large drift baseline that swamps the pulse signal.
- Motion bursts that create false large peaks.

### Current observations

_Fill in after first run._

### Known limitations

- Python filters use `scipy.signal.lfilter` (causal, same as Arduino). A zero-phase `filtfilt` comparison is included for reference only — do not use filtfilt for real-time hardware comparison.
- If the signal shows no pulse after 10 Hz filtering, the problem is mechanical/analog, not software.

---

## Phase 4 — Waveform Quality Assessment `[PLANNED]`

Will add to `analyze_raw_vs_filtered.py`. Outputs console quality report before attempting peak detection.

Metrics:
- Baseline drift estimate (slope of moving mean).
- Signal amplitude range after filtering.
- Saturation/clipping detection (ADC at 0 or 16383 for N consecutive samples).
- Sudden motion jump detection (absolute delta > threshold).
- Effective noise floor estimate.
- Quality verdict: GOOD / MARGINAL / POOR.

**Rule: Do not proceed to Phase 5 (peak detection) if quality is POOR.**

---

## Phase 5 — Peak Detection `[IMPLEMENTED AS SCRIPT]`

### How to run it

```bash
python scripts/detect_peaks.py data/raw_filtered_capture.csv
```

### Output

- `graphs/10_peaks_on_filtered.png` — filtered signal with detected peaks marked.
- `data/detected_peaks.csv` — format: `peak_index,peak_time_s,peak_value`

### Notes

- Uses `filtered_10hz` column by default. Can be changed via `--column` argument.
- Parameters: minimum distance 250 ms, minimum prominence 10% of signal range.
- Not all detected peaks are valid heartbeats — visual inspection required.

---

## Phase 6 — IBI Extraction `[IMPLEMENTED AS SCRIPT]`

### How to run it

```bash
python scripts/extract_ibi.py data/detected_peaks.csv
```

### Output

- `data/ibi_raw.csv` — format: `beat_index,peak_time_s,ibi_ms,bpm,valid`
- `graphs/20_ibi_vs_time.png`

### Validity flags

| Flag | Condition |
|---|---|
| `suspicious_short` | IBI < 400 ms (>150 BPM) |
| `suspicious_long` | IBI > 1500 ms (<40 BPM) |
| `sudden_change` | >30% change from rolling median |
| `ok` | No flag raised |

---

## Phase 7 — Artifact / Ectopic / PVC Correction `[IMPLEMENTED AS SCRIPT]`

### What is implemented

Kubios-inspired simple correction:
1. Rolling median window (7 IBIs) to estimate expected IBI.
2. Flag any IBI that deviates >25% from rolling median.
3. Also flag short-long pairs (possible ectopic/bigeminy pattern).
4. **Corrected value uses linear interpolation from nearest valid neighbors — never zero.**

### How to run it

```bash
python scripts/correct_ibi_artifacts.py data/ibi_raw.csv
```

### Output

- `data/ibi_corrected.csv` — format: `beat_index,peak_time_s,ibi_raw_ms,ibi_corrected_ms,bpm_corrected,artifact_flag,artifact_reason`
- `graphs/30_ibi_raw_vs_corrected.png`
- `graphs/31_artifact_flags.png`

### Important notes

- This is a **simple first-pass correction**, not clinical validation.
- Ectopic beats and PVCs exist in real physiological data. Ignoring them inflates HRV metrics.
- Do not replace bad beats with zero — this creates false HRV spikes.
- If >15% of beats are flagged as artifacts, the session data quality is suspect.

---

## Phase 8 — PSD / HRV Analysis `[IMPLEMENTED AS SCRIPT]`

### What is implemented

Welch PSD on the cleaned, resampled IBI time series. Annotated frequency bands.

### How to run it

```bash
python scripts/compute_psd.py data/ibi_corrected.csv
```

### Output

- `graphs/40_ibi_time_series.png` — IBI vs time (tachogram).
- `graphs/41_ibi_psd.png` — Power Spectral Density with VLF/LF/HF band shading and 0.1 Hz marker.
- `data/psd_values.csv` (optional).

### Frequency bands

| Band | Range | Meaning |
|---|---|---|
| VLF | <0.04 Hz | Very Low Frequency: slow thermoregulation, hormonal |
| LF | 0.04–0.15 Hz | Low Frequency: baroreflex, sympathetic + parasympathetic mix |
| **0.1 Hz** | **~0.1 Hz** | **Resonance frequency: target for guided 6 breaths/min breathing** |
| HF | 0.15–0.4 Hz | High Frequency: respiratory sinus arrhythmia, parasympathetic |
| LF/HF ratio | — | Autonomic balance indicator (use cautiously) |

### PSD validity warning

PSD is only meaningful if:
- IBI extraction was reliable (Phase 5-6 passed visual check).
- Session was ≥ 3 minutes (shorter sessions lack LF resolution).
- Artifact correction was applied (Phase 7 passed).

Do not interpret PSD from a session with poor waveform quality.

---

## Phase 9 — 3-Minute Run Workflow `[PLANNED]`

### Standard Protocol

```bash
# 1. Collect 3-minute CSV from Arduino Serial Monitor
#    Save as: data/session_001_raw_filtered.csv

# 2. Analyze raw vs filtered
python scripts/analyze_raw_vs_filtered.py data/session_001_raw_filtered.csv

# 3. Inspect graphs/05_all_filters_overlay.png before continuing

# 4. Detect peaks
python scripts/detect_peaks.py data/session_001_raw_filtered.csv

# 5. Extract raw IBI
python scripts/extract_ibi.py data/session_001_detected_peaks.csv

# 6. Correct artifacts
python scripts/correct_ibi_artifacts.py data/session_001_ibi_raw.csv

# 7. Compute PSD
python scripts/compute_psd.py data/session_001_ibi_corrected.csv

# 8. Update Testing Log below with observations
```

---

## Phase 10 — BLE / Mobile App Roadmap `[PLANNING ONLY]`

Do not build the app until Phase 8 is validated on real 3-minute recordings.

### BLE payload (final firmware target)

```json
{
  "timestamp_ms": 123456,
  "ibi_ms": 842,
  "bpm": 71,
  "signal_quality": 0.86,
  "artifact_flag": false
}
```

### App screens

1. BLE scan / connect screen.
2. Live BPM + IBI display.
3. Signal quality indicator.
4. Guided breathing pacer at 0.1 Hz.
5. Session recording and export.
6. PSD/HRV summary graph (post-session).

### App rules

- Never display BPM from raw ADC alone.
- Use validated IBI values with signal-quality flags.
- Guided breathing pacer runs independently of data quality.
- If BLE signal drops, show "Reconnecting..." and preserve session data.

---

## Graph Catalog

| # | Filename | Script | Input | Good result | Bad result |
|---|---|---|---|---|---|
| 01 | `01_raw_signal.png` | analyze_raw_vs_filtered.py | Phase 2 CSV | Noisy but periodic ~1 Hz oscillation, centered ~7000–8000 | Flat line, stuck at 0/16383, pure white noise |
| 02 | `02_raw_vs_200hz.png` | analyze_raw_vs_filtered.py | Phase 2 CSV | 200 Hz output is smoother but still noisy | No difference (filter not working) |
| 03 | `03_raw_vs_10hz.png` | analyze_raw_vs_filtered.py | Phase 2 CSV | Clean repeating bumps at heart rate | Flat, no bumps, or chaotic |
| 04 | `04_raw_vs_15hz.png` | analyze_raw_vs_filtered.py | Phase 2 CSV | Slightly sharper bumps than 10 Hz | Same as bad 10 Hz result |
| 05 | `05_all_filters_overlay.png` | analyze_raw_vs_filtered.py | Phase 2 CSV | Progressive smoothing from raw → 200 Hz → 10 Hz | All traces identical or all flat |
| 06 | `06_zoomed_5s.png` | analyze_raw_vs_filtered.py | Phase 2 CSV | 4–6 distinct peaks visible in 5-second window | Irregular, missing, or merged peaks |
| 10 | `10_peaks_on_filtered.png` | detect_peaks.py | Phase 2 CSV | Peaks marked exactly at tops of beats | Missed beats or false positives on noise |
| 20 | `20_ibi_vs_time.png` | extract_ibi.py | peaks CSV | Smooth IBI around 700–1000 ms ±variability | Wild swings, zeros, or impossible values |
| 30 | `30_ibi_raw_vs_corrected.png` | correct_ibi_artifacts.py | ibi_raw.csv | Corrected closely follows raw, outliers interpolated | Many corrected points, clustered corrections |
| 31 | `31_artifact_flags.png` | correct_ibi_artifacts.py | ibi_raw.csv | Sparse flags, random distribution | >15% flagged, or flags in long runs (bad data) |
| 40 | `40_ibi_time_series.png` | compute_psd.py | ibi_corrected.csv | Smooth tachogram with visible low-frequency oscillation | Jagged, all same value, or missing data |
| 41 | `41_ibi_psd.png` | compute_psd.py | ibi_corrected.csv | Peak near 0.1 Hz during guided breathing | Flat PSD, no 0.1 Hz peak, or dominant HF only |

---

## Decision Log

| Date | Decision | Reason |
|---|---|---|
| 2026-06-21 | Do not trust IBI detection until filtered waveform is validated | Meeting decision: filter first, peaks second |
| 2026-06-21 | Use 500 Hz internal, 100 Hz output for Phase 2 | Serial bandwidth limit at 115200 baud with 5 columns |
| 2026-06-21 | Do not replace artifact IBIs with zero | Zeroes create false HRV spikes; use interpolation instead |
| 2026-06-21 | Filter 1 coefficient 0.715 kept from reference firmware | Matches existing validated code, actual cutoff ~100 Hz |
| 2026-06-21 | 2-pole Butterworth at 10 Hz and 15 Hz | Matches reference firmware; flat passband, gentle rolloff |
| 2026-06-21 | Do not build mobile app until Phase 8 is validated | Signal quality unknown; app would display meaningless numbers |

---

## Testing Log

_Append new entries after each session._

```
Date:
Session file:
Duration:
Capture phase (1 or 2):
Signal quality observation:
Filtered waveform: visible pulse bumps? (yes/no/partial)
Peaks detected: count, missed beats?
IBI range observed: min / max / mean
Artifacts flagged: N / total beats (%)
PSD peak frequency:
Notes:
```

---

## Open Questions

1. What is the exact model of the pressure sensor in the housing?
2. Does the analog board saturate under normal finger pressure? (check ADC max values in raw captures)
3. Should the 10 Hz or 15 Hz filtered column be the primary input for peak detection?
4. Is the 200 Hz label on Filter 1 intentional or a naming convention? (actual cutoff ~100 Hz based on coefficient)
5. What is the minimum session length needed for reliable LF PSD? (3 min planned, but shorter may be needed for initial testing)
6. Will PSD change measurably between baseline and guided breathing + Vsb stimulation?
7. What reference device (ECG, pulse oximeter, commercial HRV) will be used to validate IBI accuracy?
