# Arduino Vibration Validator

Use these sketches to test and validate the handheld vibrator devices used in the Vsb protocol.

## vibration_validator.ino

**Purpose:** Measure the actual vibratory frequency output of each handheld device unit.

**Acceptance band:** 100–135 Hz (target ≈ 115 Hz from 7000 RPM).

### Hardware Setup

You need:
- Seeed XIAO nRF52840 (or any 3.3 V Arduino-compatible board)
- Piezoelectric disc sensor (small, cheap vibration sensor)
- 1 MΩ resistor
- Breadboard and jumper wires

**Wiring:**
```
Piezo disc positive  →  A0
Piezo disc negative  →  GND
1 MΩ resistor        →  between A0 and GND
```

The 1 MΩ resistor bleeds charge from the piezo and protects the ADC from voltage spikes.

**Important:** Do not strike or tap the piezo disc. Hold the vibrator tip gently but firmly against the disc surface.

### How to Use

1. **Upload** `vibration_validator.ino` to the XIAO.
2. **Open Serial Monitor** at 115200 baud.
3. **Hold the vibrator tip** against the piezo disc (glove or tape can help keep contact steady).
4. **Read live frequency estimates** printed every 500 ms.
   - Built-in LED turns **ON** when frequency is inside 100–135 Hz (PASS).
   - LED stays **OFF** when no signal or outside band (FAIL).
5. **Send `c`** (type c and press Enter in Serial Monitor) to capture a 3-second high-resolution CSV burst.
6. **Copy** the CSV block between `START_CAPTURE` and `END_CAPTURE`.
7. **Save** it as `vibration_capture.csv` in the `analysis/` folder.
8. **Run** `python plot_vibration.py vibration_capture.csv` to generate FFT graphs.

### Upload Troubleshooting

**If compilation succeeds but upload fails with "unable to find a matching CMSIS-DAP device":**

This is the **XIAO nRF52840 UF2 bootloader**. Do not use an external programmer.

1. **Use the regular Upload button (Ctrl+U)**
   - **Do NOT** use "Sketch > Upload Using Programmer".
   - Just press the standard **Upload arrow** or Ctrl+U.

2. **Double-tap RESET to enter bootloader mode**
   - Quickly **press the RESET button twice** in a row.
   - The board should appear as a USB drive named **"XIAO-SENSE"** (or similar).
   - While it is in that mode, press **Upload** in Arduino IDE.

3. **If double-tap doesn't work, try this sequence:**
   - Unplug the USB cable.
   - Press and **hold RESET**.
   - Plug USB back in while still holding RESET.
   - Release RESET.
   - The board should now be in bootloader mode.
   - Press Upload.

**If you get "not in sync: resp=0x00" or "programmer is not responding":**

1. **Check the Board menu**
   - Arduino IDE: **Tools > Board**
   - **XIAO nRF52840** → select **Seeed nRF52 Boards > Seeed XIAO nRF52840** (install via Board Manager if missing).
   - **Arduino Uno/Nano** → select the matching board.
   - **Do not leave it on "Arduino Uno" if your physical board is a XIAO.**

2. **Check the COM port**
   - Select the port that matches your board in **Tools > Port**.
   - XIAO usually shows as **"USB Serial Device"** (e.g., COM8).

3. **XIAO bootloader trick**
   - **Double-tap the RESET button quickly** to enter UF2 bootloader mode.
   - It should appear as a USB drive (e.g., "XIAO-SENSE").
   - Try uploading while in that mode.

4. **Verify compile size**
   - If output says `Maximum is 32256 bytes`, you are compiling for an **Arduino Uno**.
   - The XIAO nRF52840 has 1 MB flash and shows a much larger max.

5. **Port is busy**
   - Close the Serial Monitor before uploading.
   - Unplug and reconnect the USB cable.

### Tips

- If the live estimate jumps around, try pressing the vibrator more squarely against the disc.
- If ADC values are very low (near 0), the piezo may need firmer contact or a small pre-load.
- If ADC values saturate (4095 on 12-bit), reduce pressure or add a voltage divider.
- For best FFT resolution, capture at least 2–3 seconds.
