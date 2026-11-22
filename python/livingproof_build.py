# SPDX-License-Identifier: Apache-2.0
"""Build backend that stamps the release-tag version before setuptools runs."""
import importlib.util
from pathlib import Path

from setuptools.build_meta import (
    build_sdist as _build_sdist,
    build_wheel as _build_wheel,
    get_requires_for_build_sdist as _requires_sdist,
    get_requires_for_build_wheel as _requires_wheel,
    prepare_metadata_for_build_wheel as _prepare_metadata,
)


def _versioning():
    path = Path(__file__).resolve().parent / "livingproof_scenario_parameters" / "versioning.py"
    spec = importlib.util.spec_from_file_location("livingproof_versioning", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _prepare():
    versioning = _versioning()
    version = versioning.resolve_version()
    versioning.STAMP.write_text(
        "# SPDX-License-Identifier: Apache-2.0\n"
        "# Generated when the package is built. Do not edit.\n"
        f'__version__ = "{version}"\n',
        encoding="utf-8",
    )
    return versioning


def _cleanup(versioning):
    # A Git checkout can derive the version again. A source distribution has
    # no tag, so its generated module is the version and must stay in place.
    if versioning.in_git_checkout():
        versioning.STAMP.unlink(missing_ok=True)


def get_requires_for_build_wheel(config_settings=None):
    versioning = _prepare()
    try:
        return _requires_wheel(config_settings)
    finally:
        _cleanup(versioning)


def get_requires_for_build_sdist(config_settings=None):
    versioning = _prepare()
    try:
        return _requires_sdist(config_settings)
    finally:
        _cleanup(versioning)


def prepare_metadata_for_build_wheel(metadata_directory, config_settings=None):
    versioning = _prepare()
    try:
        return _prepare_metadata(metadata_directory, config_settings)
    finally:
        _cleanup(versioning)


def build_wheel(wheel_directory, config_settings=None, metadata_directory=None):
    versioning = _prepare()
    try:
        return _build_wheel(wheel_directory, config_settings, metadata_directory)
    finally:
        _cleanup(versioning)


def build_sdist(sdist_directory, config_settings=None):
    versioning = _prepare()
    try:
        return _build_sdist(sdist_directory, config_settings)
    finally:
        _cleanup(versioning)
