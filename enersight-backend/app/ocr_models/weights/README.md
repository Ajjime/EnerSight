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
