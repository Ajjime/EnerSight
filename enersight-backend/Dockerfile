# EnerSight backend — FastAPI + EasyOCR + the trained DTRB models.
#
# A word on size: requirements.txt pulls in torch and torchvision, because the
# three trained recognition models run on PyTorch. That makes this image several
# gigabytes however it is built, and no amount of layer tidying changes that. The
# CPU-only wheel index below is the one thing that does help - the default CUDA
# build is roughly three times larger and this system never touches a GPU.
FROM python:3.11-slim

# libGL and libglib are what OpenCV links against. Without them `import cv2`
# fails at runtime with an error that says nothing about missing system packages.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libgl1 \
        libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

COPY requirements.txt .

RUN pip install --no-cache-dir \
        --extra-index-url https://download.pytorch.org/whl/cpu \
        -r requirements.txt

COPY . .

# The .pth weights are not in the repository (they live in the team's Drive; see
# install_ocr_weights.ps1). Without them the pipeline runs on EasyOCR alone, which
# is a supported configuration - GET /ocr/health reports which models loaded. Mount
# them at this path to enable the trained models:
#     -v /path/to/weights:/app/app/ocr_models/weights
VOLUME ["/app/uploads"]

EXPOSE 8000

# No --reload: that is a development convenience and it doubles memory here.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
