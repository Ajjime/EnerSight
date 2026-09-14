# OCR evaluation set

This folder holds the hand-labelled photos that `evaluate_ocr.py` scores the
meter-reading pipeline against. It is how the project answers "how accurate is your
OCR, and how did you measure it?" with a number from its own data rather than from
a training notebook.

## What is here now

Only **two** photos, both recovered from `uploads/meter_photos/`. Two photos is a
demonstration that the harness runs, not a result you can defend. **Collect 30 to
50 photos before the defense.**

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
