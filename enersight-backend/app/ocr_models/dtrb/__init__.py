"""
Vendored inference-only subset of clovaai/deep-text-recognition-benchmark (DTRB).

Upstream: https://github.com/clovaai/deep-text-recognition-benchmark
License: Apache 2.0 (see header in model.py)

Copied verbatim except for model.py's module imports, which were made relative
so the code works as a package here instead of as a repo root. Training-only
files (train.py, test.py, dataset.py, create_lmdb_dataset.py) are not vendored.
"""
