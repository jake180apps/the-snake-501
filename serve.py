#!/usr/bin/env python3
"""Small static server for The Snake 501. GitHub Pages is the other way to host it."""

from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PORT = 8747


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        if self.path.endswith(".webmanifest"):
            self.send_header("Content-Type", "application/manifest+json")
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"The Snake 501 at http://127.0.0.1:{PORT}")
    server.serve_forever()
