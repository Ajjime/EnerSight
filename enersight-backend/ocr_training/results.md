# Trained OCR models: original vs fine-tuned

Generated 2026-10-29 by `python -m ocr_training.evaluate`.
Each cell is exact match / right number / character accuracy, in percent.
Exact match: every digit right, leading zeros included. Right number: 09732
counts for 0009732, since readings are stored as numbers. Character accuracy:
1 - edit distance / length, the metric the notebook and the paper report.
Campus digit rows: 24 crops of 4 meters. Crops the app produces: 10. Roboflow test: 113 crops.

| Model | Weights | Campus digit rows | Crops the app produces | Original Roboflow test split |
|---|---|---|---|---|
| CRNN + CTC | original | 0.0 / 0.0 / 33.1 | 0.0 / 0.0 / 20.5 | 52.2 / 53.1 / 84.7 |
| CRNN + CTC | fine-tuned | 75.0 / 75.0 / 92.5 | 20.0 / 30.0 / 78.6 | 62.8 / 62.8 / 88.9 |
| TPS + ResNet + BiLSTM + Attention | original | 0.0 / 0.0 / 42.7 | 0.0 / 0.0 / 29.9 | 69.9 / 69.9 / 89.1 |
| TPS + ResNet + BiLSTM + Attention | fine-tuned | 62.5 / 62.5 / 93.0 | 50.0 / 60.0 / 78.6 | 66.4 / 66.4 / 90.7 |
| TPS + ResNet + BiLSTM + CTC | original | 4.2 / 4.2 / 55.0 | 0.0 / 0.0 / 52.0 | 73.5 / 73.5 / 90.8 |
| TPS + ResNet + BiLSTM + CTC | fine-tuned | 75.0 / 75.0 / 94.5 | 60.0 / 70.0 / 90.6 | 73.5 / 73.5 / 91.8 |

Fine-tuned weights: `train.py` (see README.md), continued from the original
weights on half synthetic seven-segment displays and half the original Roboflow
crops. Each model's checkpoint was chosen on the Roboflow validation split; none
of the sets above influenced that choice.

The campus sets cover only four meters, and their failures guided what the
synthetic renderer draws, so read those columns as optimistic. The real test is
readings exported from use (`python export_ocr_dataset.py`).
