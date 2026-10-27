# SPDX-License-Identifier: Apache-2.0
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import threading

import pytest
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / 'artifacts/manual'

@pytest.fixture(scope='session')
def output():
    return OUTPUT

@pytest.fixture(scope='session')
def browser():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        yield browser
        browser.close()

@pytest.fixture(scope='session')
def server(tmp_path_factory):
    root = tmp_path_factory.mktemp('manual-http')
    (root / 'robot-capability-specs').symlink_to(OUTPUT / 'html', target_is_directory=True)
    httpd = ThreadingHTTPServer(('127.0.0.1', 0), partial(SimpleHTTPRequestHandler, directory=root))
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    yield f'http://127.0.0.1:{httpd.server_port}/robot-capability-specs'
    httpd.shutdown()
    httpd.server_close()
    thread.join()
