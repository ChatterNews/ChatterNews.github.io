#!/usr/bin/env python3
"""Serve only the USB app directory, on loopback, with Studio isolation headers."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit
import argparse


class OrbitHandler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.wasm': 'application/wasm', '.js': 'text/javascript', '.mjs': 'text/javascript'}

    def end_headers(self):
        self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
        self.send_header('Cross-Origin-Embedder-Policy', 'require-corp')
        self.send_header('Permissions-Policy', 'microphone=(self), camera=(self)')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def send_head(self):
        allowed = {f'localhost:{self.server.server_port}', f'127.0.0.1:{self.server.server_port}'}
        if self.headers.get('Host') not in allowed:
            self.send_error(403, 'Open Orbit through its localhost address.')
            return None
        root = Path(self.directory).resolve()
        path = unquote(urlsplit(self.path).path)
        candidate = (root / path.lstrip('/')).resolve()
        if not candidate.is_relative_to(root):
            self.send_error(403)
            return None
        if not candidate.exists() and 'text/html' in self.headers.get('Accept', '') and not Path(path).suffix:
            self.path = '/index.html'
        return super().send_head()

    def list_directory(self, path):
        self.send_error(404)
        return None


def make_server(app, port):
    return ThreadingHTTPServer(('127.0.0.1', port), partial(OrbitHandler, directory=str(app)))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8765)
    args = parser.parse_args()
    app = Path(__file__).resolve().parent / 'app'
    if not (app / 'index.html').is_file():
        parser.error('Missing app/index.html. Keep the entire Orbit-USB folder together.')
    try:
        server = make_server(app, args.port)
    except OSError as error:
        parser.error(f'Could not start Orbit: {error}. Close an older Orbit launcher and retry.')
    print(f'Orbit is reading its app files from {app}', flush=True)
    print(f'Open http://localhost:{args.port} in the Chromebook Chrome browser.', flush=True)
    print('Keep this terminal open. Finish session in Orbit, close the browser tab, then press Ctrl+C here before ejecting the USB.', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
