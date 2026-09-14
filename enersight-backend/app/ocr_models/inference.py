"""
Inference wrapper for the three capstone-trained DTRB OCR models.

These are the models trained in the `kwh_ocr_v5_easyocr_3_trained_models` Colab
notebook on cropped kWh meter digit rows (character set = digits only):

    key         architecture                        test-set char accuracy
    ---------   ---------------------------------   ----------------------
    crnn_ctc    None + VGG    + BiLSTM + CTC         84.1 %
    tps_attn    TPS  + ResNet + BiLSTM + Attention   82.1 %
    tps_ctc     TPS  + ResNet + BiLSTM + CTC         91.0 %   <- best

They act as supporting voters for EasyOCR in the ensemble that runs in
routes/ocr.py; the accuracies above become their static trust weights there.

Weights are loaded lazily and cached (same pattern as the EasyOCR singleton in
routes/ocr.py). A missing or unloadable checkpoint is never fatal: the variant is
skipped and the ensemble runs with whatever voters are available.
"""

import argparse
import logging
import os
import re
from dataclasses import dataclass
from pathlib import Path

import cv2
import torch
import torch.nn.functional as F
from PIL import Image
from torchvision import transforms

from .dtrb.model import Model
from .dtrb.utils import AttnLabelConverter, CTCLabelConverter

logger = logging.getLogger(__name__)

# dtrb/modules/{prediction,transformation}.py pick their device the same way at
# import time and allocate internal tensors on it. Deviating here (e.g. forcing
# CPU) would put model weights and those internal tensors on different devices
# and blow up mid-forward on any CUDA host, so mirror their choice exactly.
_DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# Must match the training run (see the notebook's train.py invocations).
CHARACTER = "0123456789"
IMG_H = 32
IMG_W = 100
BATCH_MAX_LENGTH = 10

_WEIGHTS_DIR = Path(__file__).parent / "weights"


@dataclass(frozen=True)
class DTRBVariant:
    key: str
    label: str
    transformation: str      # "None" | "TPS"
    feature_extraction: str  # "VGG" | "ResNet"
    sequence_modeling: str   # "BiLSTM"
    prediction: str          # "CTC" | "Attn"
    static_weight: float     # benchmark char accuracy, used as trust prior
    env_var: str
    default_path: Path


VARIANTS: tuple[DTRBVariant, ...] = (
    DTRBVariant(
        key="crnn_ctc",
        label="CRNN + CTC",
        transformation="None",
        feature_extraction="VGG",
        sequence_modeling="BiLSTM",
        prediction="CTC",
        static_weight=0.841,
        env_var="CRNN_CTC_MODEL_PATH",
        default_path=_WEIGHTS_DIR / "None-VGG-BiLSTM-CTC" / "best_accuracy.pth",
    ),
    DTRBVariant(
        key="tps_attn",
        label="TPS + ResNet + BiLSTM + Attention",
        transformation="TPS",
        feature_extraction="ResNet",
        sequence_modeling="BiLSTM",
        prediction="Attn",
        static_weight=0.821,
        env_var="TPS_ATTN_MODEL_PATH",
        default_path=_WEIGHTS_DIR / "TPS-ResNet-BiLSTM-Attn" / "best_accuracy.pth",
    ),
    DTRBVariant(
        key="tps_ctc",
        label="TPS + ResNet + BiLSTM + CTC",
        transformation="TPS",
        feature_extraction="ResNet",
        sequence_modeling="BiLSTM",
        prediction="CTC",
        static_weight=0.910,
        env_var="TPS_CTC_MODEL_PATH",
        default_path=_WEIGHTS_DIR / "TPS-ResNet-BiLSTM-CTC" / "best_accuracy.pth",
    ),
)

_VARIANT_BY_KEY = {v.key: v for v in VARIANTS}

# key -> (model, converter, prediction_type); keys that failed to load are parked
# in _load_failed so a missing checkpoint isn't retried on every single request.
_loaded: dict[str, tuple[torch.nn.Module, object, str]] = {}
_load_failed: set[str] = set()

_TO_TENSOR = transforms.Compose([
    transforms.Grayscale(num_output_channels=1),
    transforms.Resize((IMG_H, IMG_W)),
    transforms.ToTensor(),
    transforms.Normalize((0.5,), (0.5,)),
])


# ── Loading ───────────────────────────────────────────────────────────────────

def _weight_path(variant: DTRBVariant) -> Path:
    override = os.environ.get(variant.env_var, "").strip()
    return Path(override) if override else variant.default_path


def _build_opt(variant: DTRBVariant, num_class: int) -> argparse.Namespace:
    """Recreate the argparse namespace DTRB's Model expects (training defaults)."""
    return argparse.Namespace(
        Transformation=variant.transformation,
        FeatureExtraction=variant.feature_extraction,
        SequenceModeling=variant.sequence_modeling,
        Prediction=variant.prediction,
        character=CHARACTER,
        batch_max_length=BATCH_MAX_LENGTH,
        imgH=IMG_H,
        imgW=IMG_W,
        input_channel=1,
        output_channel=512,
        hidden_size=256,
        num_fiducial=20,
        num_class=num_class,
        rgb=False,
        sensitive=False,
        PAD=False,
    )


def _strip_data_parallel_prefix(state: dict) -> dict:
    """Training wrapped the model in nn.DataParallel, so keys carry a 'module.' prefix."""
    if not any(key.startswith("module.") for key in state):
        return state
    return {
        (key[len("module."):] if key.startswith("module.") else key): value
        for key, value in state.items()
    }


def load_variant(key: str):
    """
    Lazily load one variant. Returns (model, converter, prediction_type), or None
    when the checkpoint is absent or unloadable (logged once, then remembered).
    """
    if key in _loaded:
        return _loaded[key]
    if key in _load_failed:
        return None

    variant = _VARIANT_BY_KEY.get(key)
    if variant is None:
        logger.error("Unknown DTRB variant %r", key)
        _load_failed.add(key)
        return None

    path = _weight_path(variant)
    if not path.is_file():
        logger.warning(
            "DTRB variant %r: no checkpoint at %s — skipping it in the ensemble. "
            "See app/ocr_models/weights/README.md.", key, path
        )
        _load_failed.add(key)
        return None

    try:
        converter = (
            AttnLabelConverter(CHARACTER) if variant.prediction == "Attn"
            else CTCLabelConverter(CHARACTER)
        )
        opt = _build_opt(variant, num_class=len(converter.character))

        model = Model(opt).to(_DEVICE)
        state = torch.load(path, map_location=_DEVICE)
        model.load_state_dict(_strip_data_parallel_prefix(state))
        model.eval()

        _loaded[key] = (model, converter, variant.prediction)
        logger.info("DTRB variant %r loaded from %s on %s", key, path, _DEVICE)
        return _loaded[key]
    except Exception as exc:
        logger.error("DTRB variant %r failed to load from %s: %s", key, path, exc)
        _load_failed.add(key)
        return None


def available_variants() -> dict[str, bool]:
    """{variant_key: is_loadable} — powers the /ocr/health report."""
    return {v.key: load_variant(v.key) is not None for v in VARIANTS}


# ── Inference ─────────────────────────────────────────────────────────────────

def _confidence(step_probs) -> float:
    """
    Geometric mean of the per-step max-softmax probabilities along the decoded path.

    DTRB's demo.py uses a raw cumulative product instead. That is length-dependent,
    which is fine when you only ever compare one model against itself but not here:
    a CTC head scores ~26 timesteps while an attention head scores only len(text)+1,
    so the product would systematically understate the CTC models — the very models
    that won the benchmark. The geometric mean is the same quantity normalised per
    step, so the four ensemble voters stay comparable.
    """
    if step_probs is None or step_probs.numel() == 0:
        return 0.0
    return float(torch.exp(torch.log(step_probs.clamp_min(1e-12)).mean()))


def _decode_ctc(preds, converter) -> tuple[str, torch.Tensor]:
    probs = F.softmax(preds, dim=2)
    max_prob, index = probs.max(dim=2)  # both (1, T)

    preds_size = torch.IntTensor([preds.size(1)])
    # CTCLabelConverter.decode wants a 2D [batch, timestep] index tensor — do not flatten.
    text = converter.decode(index, preds_size)[0]

    # Keep only the timesteps that actually emit a character, mirroring the
    # blank/repeat collapsing inside CTCLabelConverter.decode, so the confidence
    # reflects the emitted digits rather than the (near-certain) blanks between them.
    row = index[0]
    emitting = [
        i for i in range(row.numel())
        if row[i] != 0 and not (i > 0 and row[i - 1] == row[i])
    ]
    return text, max_prob[0][emitting] if emitting else max_prob[0][:0]


def _decode_attn(preds, converter, length_for_pred) -> tuple[str, torch.Tensor]:
    probs = F.softmax(preds, dim=2)
    max_prob, index = probs.max(dim=2)

    text = converter.decode(index, length_for_pred)[0]
    end = text.find("[s]")
    if end != -1:
        return text[:end], max_prob[0][:end]
    return text, max_prob[0]


def predict(key: str, crop_bgr) -> tuple[str, float]:
    """
    Read a pre-cropped digit region with one trained variant.

    `crop_bgr` is an OpenCV BGR ndarray tightly framing the digit row, matching how
    these models were trained. Returns (digits, confidence in [0, 1]); ("", 0.0) if
    the variant is unavailable or anything goes wrong — callers just lose a voter.
    """
    loaded = load_variant(key)
    if loaded is None:
        return "", 0.0
    model, converter, prediction_type = loaded

    try:
        pil = Image.fromarray(cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2RGB))
        image = _TO_TENSOR(pil).unsqueeze(0).to(_DEVICE)

        length_for_pred = torch.IntTensor([BATCH_MAX_LENGTH]).to(_DEVICE)
        text_for_pred = torch.LongTensor(1, BATCH_MAX_LENGTH + 1).fill_(0).to(_DEVICE)

        with torch.no_grad():
            if prediction_type == "CTC":
                preds = model(image, text_for_pred)
                text, step_probs = _decode_ctc(preds, converter)
            else:
                preds = model(image, text_for_pred, is_train=False)
                text, step_probs = _decode_attn(preds, converter, length_for_pred)

        digits = re.sub(r"[^0-9]", "", text)
        if not digits:
            return "", 0.0
        return digits, _confidence(step_probs)
    except Exception as exc:
        logger.error("DTRB variant %r inference failed: %s", key, exc)
        return "", 0.0
