# Trained OCR model weights

Place the three trained DTRB checkpoints here. They are **not** committed to git
(see `.gitignore`) because they are large binaries.

```
weights/
├── None-VGG-BiLSTM-CTC/best_accuracy.pth       # CRNN + CTC
├── TPS-ResNet-BiLSTM-Attn/best_accuracy.pth    # TPS + ResNet + BiLSTM + Attention
└── TPS-ResNet-BiLSTM-CTC/best_accuracy.pth     # TPS + ResNet + BiLSTM + CTC  (best)
```

Source: the capstone Colab notebook (`kwh_ocr_v5_easyocr_3_trained_models`), which
saves them to Google Drive under `KWH_OCR_Capstone/` in its final cell. The folder
names above match DTRB's `--exp_name` values used during training.

The OCR pipeline degrades gracefully: any checkpoint that is missing is simply
skipped, and the ensemble runs with whatever voters are available. Check which ones
loaded via `GET /ocr/health` → `dtrb_variants_loaded`.

To load a checkpoint from somewhere else, set the matching env var in
`enersight-backend/.env`: `CRNN_CTC_MODEL_PATH`, `TPS_ATTN_MODEL_PATH`,
or `TPS_CTC_MODEL_PATH`.

## Fine-tuned weights

Each folder may also hold a `finetuned.pth`: the same model fine-tuned from
`best_accuracy.pth` to read the campus meters, which the originals read 0% correctly
(see `ocr_training/README.md` and `ocr_training/results.md`). When it exists the
backend loads it instead of `best_accuracy.pth`; delete it to go back to the
original. `GET /ocr/health` → `dtrb_weight_files` says which file each model uses.

Like the originals, these are not in git. Keep a copy in the team's Google Drive.
