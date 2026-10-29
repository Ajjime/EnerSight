# OCR evaluation set

This folder holds the hand-labelled photos that `evaluate_ocr.py` scores the
meter-reading pipeline against. It is how the project answers "how accurate is your
OCR, and how did you measure it?" with a number from its own data rather than from
a training notebook.

## What is here now

**Four** photos, all recovered from `uploads/meter_photos/`:

| Photo | Meter | On the display |
|---|---|---|
| `0954eef9….jpg` | campus, Aclara I-210+ (full phone photo) | `00653` |
| `4850b837….jpg` | campus, Vision (full phone photo) | `11847` |
| `1a052d10….png` | non-campus LCD, already cropped | `087654` |
| `44db66f2….png` | non-campus LCD, already cropped | `0009732` |

The `0009732` label used to read `09732`, which is what EasyOCR returns. That made a
reading with two missing digits score as exact. Labels must come from the display,
never from the OCR output.

Four photos show that the harness runs; they are not a result you can defend.
Readings saved through the upload page now record what OCR read next to the value
that was saved, and `python export_ocr_dataset.py` turns them into a photo folder
plus a `labels.csv` in this same format, so the set grows as the system is used.

## Adding photos

1. Drop the image files into `images/`. JPG, PNG and WEBP all work.
2. Add one row per photo to `labels.csv`:

   ```
   filename,true_reading
   meter_001.jpg,087654
   ```

3. Read the digits off the photo yourself. Rules for a label:
   - Keep leading zeros. `087654`, not `87654`.
   - Digits only. No decimal point, no spaces, no `kWh`.
   - Record only the digits the system is supposed to read. If the meter shows a
     red decimal decade that you exclude in practice, exclude it here too.
   - If you cannot read the photo confidently yourself, leave it out. A label you
     are unsure of makes the measurement worse, not better.

## Getting a representative set

The number is only as honest as the sample. Aim to include:

- Both meter styles you encounter, LCD and mechanical dial.
- Photos taken at an angle, not just straight-on.
- At least a few poor conditions: glare, dim light, a dirty or scratched cover.
- A spread of digit counts, since the pipeline only accepts 3 to 8 digits.
- Photos from more than one building, so you are not measuring one meter.

If every photo is a clean straight-on shot of the same meter, the score will be
flattering and a panelist is entitled to say so. Note the composition of your set
on the slide.

## Running it

From `enersight-backend/`:

```
python evaluate_ocr.py --images eval_data/images --labels eval_data/labels.csv
```

The first photo is slow because it loads EasyOCR and the three trained
checkpoints. Results land in `eval_results/`.

## Reading the output

The table scores each engine separately: the shipped ensemble plus each of its
four voters. That comparison is the interesting result, because it shows whether
reconciling the engines beats any single one of them. On the two photos here
EasyOCR is correct on both while all three trained models fail, which matches the
note in `app/routes/ocr.py` about the ranking inverting on real photos.

Also check the confidence calibration table. The upload page auto-marks a reading
as verified at 97% confidence or above, so if accuracy in that bucket is not close
to 100% then that threshold is promising more than the pipeline delivers.
