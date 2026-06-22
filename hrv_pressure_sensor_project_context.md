# HRV / IBI Pressure-Sensor Biofeedback Project Context

_Last updated: 2026-06-08_

## 1. Project Goal

Build a small wearable pressure-sensor device that can collect pulse-related data, extract **inter-beat intervals (IBIs)**, and eventually support **HRV / PSD analysis** and a mobile biofeedback application.

This project is part of an intervention studying **oscillatory synchrony for relief of vasomotor symptoms** using two modalities: **paced breathing** and **ear vibration**.

### 1.1 Intervention Overview

**Vibratory Stimulation (Vsb Protocol):**
- A handheld 7000 RPM vibrator device is applied to the **concha cavum of the ear**.
- 7000 RPM ≈ **115 Hz** vibratory output.
- Individual units are screened; acceptable output range is **100–135 Hz**.
- The device is pressed against **Point Marvelous** (an auricular point) using a metallic tip.
- Goal: entrains oscillatory neural/physiological synchrony to modulate autonomic tone.

**Paced Breathing:**
- Simultaneously or separately, the user performs guided breathing at **0.1 Hz** (6 breaths per minute).
- The combination of vibration + breathing targets resonance phenomena in the autonomic nervous system.

The intended long-term flow is:

```text
Pressure pulse signal
→ analog signal conditioning
→ nRF52840 ADC sampling
→ filtering + peak detection
→ IBI series
→ HRV / PSD analysis
→ mobile app visualization + guided breathing
```

The main physiological target is not just heart rate, but **accurate timing between beats**. The IBI sequence can then be used to compute HRV metrics and power spectral density (PSD), especially around the **0.1 Hz resonance/guided breathing region**.

---

## 2. Current Development Stage

### What has been successfully tested

- The board was detected as a serial device on **COM3**.
- Arduino IDE upload works.
- Serial Monitor / Serial Plotter output works.
- The ADC can read from analog pin **A0**.
- A 20-second CSV capture was successfully produced.
- The device is capable of sampling near **500 Hz**, which is appropriate for pulse timing experiments.

### Current limitation

The signal is currently dominated by:

- slow pressure drift,
- finger pressure changes,
- mechanical movement,
- possible sensor/tubing settling,
- occasional saturation-like events.

The acquisition system is alive, but clean heartbeat peaks suitable for reliable IBI extraction are not yet consistently obvious.

---

## 3. Current Hardware Overview

Based on the provided device photos and schematic, the prototype appears to contain the following main sections.

### 3.1 Pressure sensor / tubing assembly

Purpose:

- Converts physical pulse pressure changes into an electrical signal.
- The clear tube routes pressure changes to the sensor housing.

Likely issue:

- Extremely sensitive to finger placement, finger pressure, tubing movement, and mechanical preload.
- If the user presses too hard or shifts slightly, the signal baseline can move dramatically.

Recommended improvements:

- Use a thumb ring, thumb clip, or sleeve to apply consistent pressure.
- Minimize tubing length if possible.
- Mechanically isolate the tube from motion.
- Add a consistent preload mechanism so the user does not manually vary pressure.
- Consider measuring preload/wearing pressure separately in future revisions.

---

### 3.2 Analog front-end / amplifier board

Purpose:

- Amplifies the pressure sensor signal.
- Filters unwanted frequencies.
- Conditions the signal before it reaches the ADC.

From the schematic, the analog chain appears to include:

```text
Pressure sensor bridge
→ instrumentation amplifier
→ low-pass filtering
→ AC coupling
→ final amplifier stage
→ microcontroller ADC input
```

Important schematic notes:

- The schematic includes an **INA317 instrumentation amplifier** stage.
- The schematic includes an analog **low-pass filter** section.
- The schematic includes **AC coupling**.
- The final amplifier is labeled as approximately **G = 100**.
- There are test points labeled for signal and 0 V input.

Potential issue:

- If the gain is too high, the signal may saturate or clip.
- If the AC coupling / baseline behavior is not tuned well, slow pressure drift may still dominate.
- If the analog low-pass filter is too weak, high-frequency noise may enter the ADC.
- If the mechanical signal is too large, no amount of digital filtering will fully fix it.

Recommended improvements:

- Confirm missing resistor/capacitor values on the updated amplifier board.
- Verify the final amplifier gain.
- Check for clipping/saturation at the ADC input.
- Test output at each test point with an oscilloscope.
- Tune analog gain so normal pulse activity stays well within ADC range.
- Consider designing for a mid-scale ADC baseline with headroom above and below.

---

### 3.3 Seeed XIAO nRF52840

Purpose:

- Reads analog signal on **A0**.
- Runs the signal processing code.
- Can communicate over USB now and BLE later.
- Can be powered by battery in a wearable version.

Current use:

```text
A0 analog input
500 Hz sampling
USB serial output
Arduino IDE firmware
```

Recommended use now:

- Continue using USB Serial for debugging.
- Save raw CSV captures first.
- Confirm signal quality and IBI accuracy before relying on BLE.

Recommended future use:

- Use BLE for mobile app communication.
- Compute IBIs on-device if possible.
- Send `IBI_ms`, `BPM`, and signal quality metrics instead of sending all raw samples continuously.

---

### 3.4 Power system

Current:

- USB-powered during testing.

Future:

- Wearable version could use a small LiPo battery.
- Coin cell may be possible only after power optimization.

Recommendation:

- Use small rechargeable LiPo for the first wearable prototype.
- Consider coin cell only after:
  - BLE duty cycle is reduced,
  - raw streaming is minimized,
  - on-device IBI extraction works,
  - current draw is measured.

Reason:

- Coin cells are compact but limited in current.
- BLE bursts and ADC sampling can cause voltage drops.
- LiPo is easier and more reliable for prototyping.

---

### 3.5 Vibratory Stimulation Device (Vsb Protocol)

Purpose:

- Delivers 100–135 Hz mechanical vibration to the auricular concha cavum at Point Marvelous.
- Intended to entrain oscillatory synchrony alongside paced breathing.

Device specs:

- Handheld unit with a metallic tip for precise point contact.
- Motor rated at approximately 7000 RPM ≈ 117 Hz.
- Each unit is individually screened; accepted if fundamental frequency ≥ 100 Hz and ≤ 135 Hz.
- Operated by pressing the tip against the ear during the intervention session.

Validation needs:

- Verify actual vibratory output frequency of each device unit.
- Confirm frequency stays within 100–135 Hz acceptance band.
- Monitor for harmonic content or irregular vibration patterns.
- Ensure consistent contact pressure during measurement.

Recommended validation method:

- Use a small piezoelectric vibration sensor or MEMS accelerometer held against the vibrator tip.
- Sample the sensor output with the nRF52840/XIAO ADC at ≥ 2000 Hz.
- Capture 2–5 seconds of data.
- Perform FFT in Python/MATLAB to identify peak frequency.
- Flag units outside the 100–135 Hz range.

Arduino test approach:

```text
Vibrator tip
→ piezo disc / accelerometer
→ analog front-end (optional)
→ nRF52840 ADC (A0)
→ 2000 Hz sampling
→ CSV serial output
→ Python FFT analysis
→ frequency acceptance check
```

---

## 4. Current Firmware Context

There are multiple firmware directions.

### 4.1 Basic data logging sketch

Purpose:

- Collect raw ADC values.
- Print `time_us,raw`.
- Use for CSV capture and Python/MATLAB analysis.

Recommended first-stage use:

```text
Raw capture
→ save CSV
→ analyze offline
→ determine whether pulse morphology is present
```

This is the safest approach because it avoids hiding problems behind aggressive real-time filtering.

---

### 4.2 HRV_GPAI_test4 firmware

The provided `HRV_GPAI_test4` code describes:

- nRF52840 pressure signal processing.
- Sample rate: **500 Hz**.
- ADC resolution: **14-bit**.
- Filters:
  - 200 Hz low-pass filter,
  - 10 Hz 2-pole Butterworth low-pass filter.
- IBI detection logic.
- Double-peak prevention.
- Human-rate filtering.
- Dynamic refractory period based on prior IBI.

Conceptual pipeline:

```text
raw analog sample
→ 200 Hz low-pass filter
→ 10 Hz Butterworth low-pass filter
→ adaptive threshold
→ refractory period / double peak prevention
→ IBI + BPM printout
```

Important note:

This is closer to a real-time beat detector, but it should only be trusted after confirming that the raw pressure waveform contains stable beat features.

---

### 4.3 BLE firmware direction

A separate BLE-oriented sketch uses:

- `ArduinoBLE`
- custom BLE service UUID,
- BPM characteristic,
- IBI characteristic,
- device name similar to `HRV_nRF52840`.

Suggested BLE payloads:

Minimum:

```json
{
  "ibi_ms": 842,
  "bpm": 71
}
```

Better:

```json
{
  "timestamp_ms": 123456,
  "ibi_ms": 842,
  "bpm": 71,
  "signal_quality": 0.86,
  "raw_peak": 482,
  "artifact_flag": false
}
```

Optional debug mode:

```json
{
  "timestamp_ms": 123456,
  "raw": 438,
  "filtered": 421
}
```

Recommended design:

- Use raw streaming only for debugging.
- Use IBI/BPM/quality streaming for the mobile app.
- Keep BLE bandwidth low.
- Save phone battery and device battery.

---

## 5. Signal Processing Plan

### 5.1 Raw signal collection

Collect:

- 20 seconds at rest,
- 60 seconds at rest,
- 2–5 minutes for HRV/PSD testing,
- guided breathing test at 0.1 Hz,
- motion artifact test.

Minimum useful CSV format:

```csv
time_us,raw
0,442
2000,444
4000,441
```

Better CSV format later:

```csv
time_us,raw,filtered,pulse,peak_detected,ibi_ms,bpm,artifact_flag
```

---

### 5.2 Filtering approach

Recommended offline Python/MATLAB pipeline:

```text
raw ADC
→ remove obvious saturation/artifact periods
→ low-pass filter around 10–15 Hz
→ optional high-pass / baseline removal
→ peak candidate detection
→ refractory period filtering
→ IBI list
→ artifact rejection
→ PSD
```

Possible filters:

- Low-pass at **10–15 Hz** for pulse waveform.
- High-pass / detrending to remove slow finger pressure drift.
- Band-pass tuned around expected heart activity if needed.
- Moving average or exponential smoothing for visualization only.

Important warning:

Heavy smoothing can make the waveform look cleaner but can also distort peak timing. For IBI, timing accuracy matters more than visual smoothness.

---

### 5.3 Peak detection

Possible methods:

1. Simple threshold crossing.
2. Adaptive thresholding.
3. Refractory period after beat detection.
4. Peak prominence detection.
5. Pan-Tompkins-inspired derivative/squaring/integration.
6. Morphological feature detection:
   - local maxima,
   - maximum slope,
   - onset,
   - systolic peak.

Recommended initial approach:

```text
filtered signal
→ find local maxima
→ require minimum distance between peaks
→ require peak prominence
→ reject physiologically impossible IBIs
```

Example physiological constraints:

```text
Minimum IBI: ~250–300 ms
Maximum IBI: ~1500–2000 ms
```

These correspond roughly to the very broad human heart-rate range used in early testing.

---

### 5.4 IBI extraction

IBI is computed from peak times:

```text
IBI_n = peak_time_n - peak_time_(n-1)
```

Example:

```text
Peak 1: 1.240 s
Peak 2: 2.075 s
IBI = 0.835 s = 835 ms
BPM = 60000 / 835 = 71.9 BPM
```

The mobile app should eventually treat the IBI sequence as the main data product, not the raw ADC waveform.

---

### 5.5 PSD / HRV analysis

Once IBIs are extracted:

1. Clean artifact IBIs.
2. Convert IBI list into a time series.
3. Interpolate/resample IBI sequence if using FFT/Welch PSD.
4. Compute PSD.
5. Track power near **0.1 Hz** during guided breathing.

Conceptual flow:

```text
peak times
→ IBI list
→ clean IBI list
→ interpolate to uniform timebase
→ Welch PSD or FFT
→ plot frequency vs power
→ inspect 0.1 Hz band
```

Kubios is optional. Python/MATLAB can implement the full pipeline.

Recommended role for Kubios:

- Use as a reference/validation tool after reliable IBI extraction.
- Not required for raw data development.
- Kubios usually expects clean beat interval data, not noisy raw pressure ADC.

---

## 6. Python / MATLAB Analysis Plan

### 6.1 Python goals

Python can be used to:

- plot raw signal,
- zoom into regions,
- filter signal,
- detect peaks,
- calculate IBIs,
- plot IBI over time,
- compute PSD,
- export graphs for reports,
- compare versions of firmware.

Suggested Python libraries:

```text
pandas
numpy
matplotlib
scipy.signal
```

### 6.2 MATLAB goals

MATLAB can be used similarly:

- signal filtering,
- peak detection,
- PSD,
- spectrogram-like plots,
- validation against Python output.

### 6.3 Recommended graphs

For development:

1. Raw ADC vs time.
2. Filtered signal vs time.
3. Raw + filtered overlay.
4. Detected peaks over signal.
5. IBI vs time.
6. Histogram of IBIs.
7. PSD of IBI signal.
8. Signal quality / artifact flags over time.

For app concept:

1. Live heart rate.
2. Live IBI trend.
3. Breathing pacer.
4. HRV/resonance score.
5. Signal quality indicator.
6. Session summary.

---

## 7. Mobile Application Context

### 7.1 App purpose

The app should translate the device’s physiological data into useful feedback for the user.

Primary app goal:

```text
Help the user understand and train their physiological regulation using pulse-derived IBI/HRV data.
```

Possible product framing:

```text
A biofeedback app that uses a thumb-worn pressure pulse sensor to guide breathing and show stress/recovery-related physiological changes in real time.
```

Avoid strong medical claims at this stage.

Use wellness / biofeedback language:

- stress regulation,
- recovery,
- breathing training,
- nervous system awareness,
- focus/calm sessions.

---

### 7.2 MVP app features

#### Device connection

- Scan for BLE device.
- Connect to `HRV_nRF52840` or similar.
- Subscribe to IBI/BPM characteristic.
- Show connection status.

#### Live data screen

Display:

- BPM,
- latest IBI,
- signal quality,
- connected/disconnected status,
- live pulse graph if debug mode is enabled.

#### Guided breathing screen

- Breathing pacer at **0.1 Hz**.
- 6 breaths per minute.
- Expanding/contracting visual circle.
- Optional vibration/haptic cues.

#### Session summary

Show:

- average BPM,
- average IBI,
- IBI variability,
- rejected artifact count,
- PSD / resonance power estimate,
- session duration.

---

### 7.3 App data model

Suggested app-side data objects:

```ts
type RawSample = {
  timestampMs: number;
  raw: number;
  filtered?: number;
};

type BeatEvent = {
  timestampMs: number;
  ibiMs: number;
  bpm: number;
  signalQuality?: number;
  artifactFlag?: boolean;
};

type Session = {
  id: string;
  startTime: string;
  endTime?: string;
  samples?: RawSample[];
  beats: BeatEvent[];
  notes?: string;
};
```

For initial app development, it may be better to use simulated BLE data or CSV replay before depending entirely on the hardware.

---

### 7.4 BLE architecture

Suggested BLE service:

```text
Device name: HRV_nRF52840
Service: custom HRV service UUID
Characteristic 1: BPM
Characteristic 2: IBI
Characteristic 3: Signal quality
Characteristic 4: Optional raw/debug stream
```

Recommended BLE strategy:

- Start by sending IBI/BPM only.
- Add raw streaming as a debug mode.
- Avoid high-rate raw streaming for the normal app.
- If raw data must be streamed, reduce rate or packetize multiple samples.

---

## 8. Miniaturization Plan

Current prototype is large because it uses:

- copper board,
- separate analog board,
- wired sensor/tube assembly,
- USB cable,
- exposed prototype wiring.

### Phase 1: Stabilize

- Keep current prototype.
- Fix mechanical movement.
- Confirm clean pulse detection.
- Tune filters.

### Phase 2: Battery + BLE

- Switch from USB to battery.
- Use BLE data transfer.
- Compare USB-powered vs battery-powered noise.

### Phase 3: Thumb wearable

Possible form factors:

- thumb ring,
- thumb sleeve,
- Velcro thumb strap,
- glove insert,
- sensor pad taped to thumb.

Suggested design:

```text
Thumb pressure sensor
→ short local analog connection
→ nRF52840 board
→ small LiPo
→ BLE to phone
```

### Phase 4: Custom PCB

Long-term:

- integrate analog front-end,
- use surface-mount components,
- reduce wiring,
- smaller battery connector,
- smaller enclosure,
- possible flexible PCB.

---

## 9. Known Risks

### Signal quality risk

The device may collect pressure changes but not cleanly isolate heartbeat peaks.

Mitigation:

- better sensor placement,
- better mechanical preload,
- better analog gain/filtering,
- add signal quality scoring,
- test multiple users/fingers.

### Motion artifact risk

Motion can dominate pulse signal.

Mitigation:

- add accelerometer,
- use artifact rejection,
- reject segments with sudden baseline shifts,
- use strap/ring stabilization.

### Saturation risk

ADC or amplifier may saturate.

Mitigation:

- reduce gain,
- check test points,
- add headroom,
- detect clipped segments in software.

### BLE timing risk

If the app relies on phone-side timestamps, BLE latency/jitter can corrupt IBI timing.

Mitigation:

- detect peaks on the microcontroller,
- timestamp beats on-device,
- send IBI values rather than relying on phone receive time.

### HRV validity risk

HRV is sensitive to preprocessing choices.

Mitigation:

- document filtering choices,
- document artifact rejection,
- compare Python/MATLAB results,
- optionally validate against Kubios later.

---

## 10. Questions to Confirm With John / Team

### Hardware

1. What exact pressure sensor model is used in the orange housing?
2. Is the sensor output bridge-based?
3. What are the missing component values on the updated amplifier board?
4. What is the intended final amplifier gain?
5. What is the intended ADC voltage range?
6. Does the analog output center around a midpoint voltage or swing around ground?
7. Where exactly should the sensor contact the body: thumb pad, fingertip, wrist, or another location?
8. How much pressure/preload should be applied?

### Firmware

1. Which Arduino sketch is considered the current best version?
2. Should we use timer-driven or interrupt-driven sampling?
3. Should firmware output raw samples, filtered samples, IBI events, or all three?
4. Should the microcontroller compute IBIs before BLE transmission?
5. What BLE library should be standardized: ArduinoBLE, Adafruit Bluefruit, or Seeed/nRF52 stack?

### Analysis

1. Should Python or MATLAB be the main analysis environment?
2. What is the expected validation standard?
3. Are we comparing against ECG, commercial pulse sensor, or manual pulse?
4. How long should recordings be for PSD?
5. Are we primarily interested in resting HRV, guided breathing resonance, stress response, or all of these?

### Mobile app

1. Should the app be iOS-only, Android-only, or cross-platform?
2. Should the app initially use live BLE or CSV replay?
3. What should the first MVP screen show?
4. Should the app store sessions locally?
5. Should the app include guided breathing and vibration cues in the first version?

---

## 11. Recommended Immediate Next Steps

### Step 1: Repeat clean data collection

Collect 3–5 trials:

```text
20 sec still finger
60 sec still finger
60 sec guided breathing
20 sec intentional movement
```

### Step 2: Offline Python analysis

Create plots:

- raw signal,
- filtered signal,
- detected peaks,
- IBI list,
- PSD after IBI extraction.

### Step 3: Compare filter settings

Test:

- raw,
- 10 Hz LPF,
- 15 Hz LPF,
- baseline removal,
- bandpass if needed.

### Step 4: Validate IBI

Compare detected BPM with:

- manual pulse,
- smartwatch,
- pulse oximeter,
- ECG if available.

### Step 5: BLE prototype

Once IBI detection is credible:

- send BPM + IBI over BLE,
- build simple mobile screen,
- add live connection and session recording.

---

## 12. Mobile App Build Prompt Context

When translating this into an app-building prompt, include:

```text
We are building a BLE-connected HRV biofeedback mobile app for a custom nRF52840-based pressure pulse sensor. The device collects pressure-derived pulse data, detects beat timing, and sends IBI/BPM data over BLE. The app should connect to the device, display live BPM and IBI, show signal quality, provide guided breathing at 0.1 Hz / 6 breaths per minute, record sessions, and later support HRV/PSD graphs.
```

Initial MVP:

```text
1. BLE scan/connect screen.
2. Live BPM + latest IBI display.
3. Simple live graph.
4. Guided breathing animation.
5. Session recording and export.
6. CSV import/replay mode for testing before live BLE is stable.
```

---

## 13. Key Meeting Takeaway

The prototype can acquire analog pressure data at 500 Hz, and there is existing firmware for filtering, thresholding, IBI detection, and BLE transmission. However, the main engineering challenge is not the app yet; it is confirming that the pressure signal can reliably produce accurate heartbeat timing. The next best step is to stabilize the sensor mechanically, analyze longer recordings in Python/MATLAB, tune the filters and peak detection, then transmit confirmed IBI/BPM values to the app over BLE.
