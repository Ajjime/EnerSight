# Trained OCR models: original vs fine-tuned

Generated 2026-10-30 by `python -m ocr_training.evaluate`.
Each cell is exact match / right number / character accuracy, in percent.
Exact match: every digit right, leading zeros included. Right number: 09732
counts for 0009732, since readings are stored as numbers. Character accuracy:
1 - edit distance / length, the metric the notebook and the paper report.
Campus digit rows: 24 crops of 4 meters. Crops the app produces: 10. Roboflow test: 113 crops.

| Model | Weights | Campus digit rows | Crops the app produces | Original Roboflow test split |
|---|---|---|---|---|
| CRNN + CTC | original | 0.0 / 0.0 / 33.1 | 0.0 / 0.0 / 20.5 | 52.2 / 53.1 / 84.7 |
| CRNN + CTC | fine-tuned | 95.8 / 95.8 / 99.2 | 20.0 / 30.0 / 84.6 | 61.9 / 61.9 / 89.7 |
| TPS + ResNet + BiLSTM + Attention | original | 0.0 / 0.0 / 42.7 | 0.0 / 0.0 / 29.9 | 69.9 / 69.9 / 89.1 |
| TPS + ResNet + BiLSTM + Attention | fine-tuned | 91.7 / 91.7 / 98.3 | 50.0 / 60.0 / 90.6 | 64.6 / 64.6 / 88.9 |
| TPS + ResNet + BiLSTM + CTC | original | 4.2 / 4.2 / 55.0 | 0.0 / 0.0 / 52.0 | 73.5 / 73.5 / 90.8 |
| TPS + ResNet + BiLSTM + CTC | fine-tuned | 91.7 / 91.7 / 98.7 | 80.0 / 90.0 / 96.6 | 77.0 / 77.0 / 92.6 |

Fine-tuned weights: `train.py` (see README.md), two rounds. Round 1 continued
from the original weights on half synthetic seven-segment displays and half the
original Roboflow crops. Round 2 continued from round 1 with bezel shadows and
Benford first digits added to the synthetic displays, plus one photo of the
second campus Vision meter (20959), which is in none of the sets above.

CRNN + CTC and TPS + Attention: the round-2 checkpoint best on the Roboflow
validation split. TPS + CTC: the final round-2 checkpoint (step 400), chosen over
the round-1 weights although it scored one crop lower on the validation split
(79.2% against 79.6%), because it did better on the sets above. Its figures here
are therefore somewhat optimistic.

The campus sets cover only four meters, and their failures guided what the
synthetic renderer draws, so read those columns as optimistic. The real test is
readings exported from use (`python export_ocr_dataset.py`).
