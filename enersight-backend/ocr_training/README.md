# Fine-tuning the trained OCR models

The three DTRB models (CRNN + CTC, TPS + ResNet + BiLSTM + Attention, TPS + ResNet +
BiLSTM + CTC) were trained in the Colab notebook on Roboflow photos of one meter
style. On the campus meters they read **0%** of readings correctly. This folder
fine-tunes them from those original weights so they read the campus displays,
without changing the architectures.

## Why they failed

1. **They were handed the wrong part of the photo.** The pipeline's old binary
   localiser gave them two LCD rows at once, half the meter body, or a row with
   digits cut off. `routes/ocr.py` now gives them the text box EasyOCR's detector
   found, widened so thin "1"s at the ends are not lost (`_dtrb_crop_around`).
2. **They had never seen this kind of display.** Every training photo was a single
   meter style. The campus meters (Aclara I-210+, Vision) use different segment
   shapes, show faint unlit segments, and have a second row and a "kWh" label.

## The fix

`train.py` continues training each model from its original weights on a 50/50 mix
of:

- **synthetic seven-segment displays** (`synth.py`): random 4-8 digit readings with
  leading zeros or blank cells, varied segment thickness, slant and spacing, faint
  unlit segments, "kWh", small annunciators, a partial second row, glare, blur, noise
  and JPEG damage. The LCD frame and the meter face beyond it are drawn where the
  pipeline's widened crop shows them, often close to the digits: a first run without
  this read the Aclara's frame as a leading "1" and the Vision's top shadow plus its
  first "1" as a "7";
- **the original real crops**, built exactly as the notebook built them
  (`data.py`), with the same photo damage applied.

The checkpoint kept is the one that scores best on the real validation split, so
the held-out test sets never influence which weights ship.

## Data

The Roboflow exports are not in the repo. Training used:

- `merged_meter_dataset.zip`: the notebook's `label kwh.v4` export plus the
  `digital-meter-electricity` export (1,126 train / 289 valid crops). The other
  public Roboflow meter sets were unusable (rotated images, gas meters, labels too
  short).
- `label kwh.v4i.tensorflow.zip` `test/`: the split behind the paper's accuracy
  figures, used only to check the fine-tuned models did not get worse on it.

## Running it

From `enersight-backend/`, with the exports extracted somewhere:

```
python -m ocr_training.train --key crnn_ctc --out ocr_training/runs/crnn_ctc ^
    --real <merged>/train --valid <merged>/valid --roboflow-test <labelkwh>/test
python -m ocr_training.train --key tps_ctc  --lr 1e-4 --steps 1200 --out ocr_training/runs/tps_ctc  ...
python -m ocr_training.train --key tps_attn --lr 1e-4 --steps 1200 --out ocr_training/runs/tps_attn ...
```

On a laptop CPU (i5-1334U) CRNN takes about 25 minutes. The two TPS models take
about three and a half hours when trained side by side (5 threads each, about 11 s
per step). A Colab GPU is much faster. The script stops Windows from idle-sleeping while
it runs, but closing the lid still pauses it.

Install a result by copying `<out>/best_valid.pth` to
`app/ocr_models/weights/<model folder>/finetuned.pth`. The backend loads
`finetuned.pth` when it exists and the original `best_accuracy.pth` otherwise;
`GET /ocr/health` reports which file each model uses. Delete `finetuned.pth` to go
back.

Then compare the two:

```
python -m ocr_training.evaluate --roboflow-test <labelkwh>/test
```

which writes [results.md](results.md).

## Held-out tests and their limits

`heldout.py` defines them: digit rows hand-cropped from the four labelled photos in
`eval_data/` (two are the campus meters), and in `heldout/production/` the ten
crops the pipeline actually hands the models after a user crops a photo.

Four meters is very little, and their failures were used to decide what the
synthetic renderer draws (faint unlit segments, empty cells after the reading), so
those numbers are optimistic. The real test is readings from use: every reading
saved through the upload page keeps its photo and the confirmed value, and
`python export_ocr_dataset.py` exports them. Once a few hundred exist they should
become both the test set and part of the training data.

## Next round: training on real campus readings

```
python export_ocr_dataset.py --verified-only
python -m ocr_training.crops_from_export ocr_dataset ocr_training/runs/campus_crops
python -m ocr_training.train --key tps_ctc --init app/ocr_models/weights/TPS-ResNet-BiLSTM-CTC/finetuned.pth ^
    --real <merged>/train --real-crops ocr_training/runs/campus_crops --valid <merged>/valid ...
```

`crops_from_export` cuts each photo down to its digit row the way the live pipeline
does. Look through a sample before training: if the detector picked the wrong text,
the crop will not match its label. Keep some readings out of training (a different
week, or different meters) to test on, or the score will flatter the model.
