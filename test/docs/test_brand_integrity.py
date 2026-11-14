# SPDX-License-Identifier: Apache-2.0
"""A modified upstream stylesheet must never reach the rendered manual."""
import importlib.util
from io import BytesIO
from pathlib import Path

import pytest


def test_rejects_brand_checksum_mismatch(monkeypatch, tmp_path):
    path = Path(__file__).resolve().parents[2] / 'tooling/manual.py'
    spec = importlib.util.spec_from_file_location('manual', path)
    manual = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(manual)
    monkeypatch.setattr(manual, 'SOURCE', tmp_path)
    monkeypatch.setattr(manual, 'urlopen', lambda *args, **kwargs: BytesIO(b'tampered CSS'))
    with pytest.raises(ValueError, match='Docs brand checksum mismatch'):
        manual.stage_brand()
    assert not (tmp_path / 'assets/brand.css').exists()
