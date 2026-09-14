import importlib.util
from pathlib import Path
import tempfile
import threading
import unittest
from urllib.request import Request, urlopen
from urllib.error import HTTPError

spec = importlib.util.spec_from_file_location('launcher', Path(__file__).with_name('launch-orbit.py'))
launcher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(launcher)


class LauncherTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        root = Path(self.temp.name)
        app = root / 'app'
        app.mkdir()
        (app / 'index.html').write_text('<h1>Orbit</h1>')
        (app / 'engine.wasm').write_bytes(b'wasm-fixture')
        (app / 'empty').mkdir()
        (root / 'student.chatter').write_text('private work')
        (app / 'outside').symlink_to(root / 'student.chatter')
        self.server = launcher.make_server(app, 0)
        self.thread = threading.Thread(target=self.server.serve_forever)
        self.thread.start()
        self.url = f'http://localhost:{self.server.server_port}'

    def tearDown(self):
        self.server.shutdown()
        self.thread.join()
        self.server.server_close()
        self.temp.cleanup()

    def test_app_routes_and_audio_headers(self):
        with urlopen(Request(self.url + '/studio/story', headers={'Accept': 'text/html'})) as response:
            self.assertIn(b'Orbit', response.read())
            self.assertEqual(response.headers['Cross-Origin-Opener-Policy'], 'same-origin')
            self.assertEqual(response.headers['Cross-Origin-Embedder-Policy'], 'require-corp')
        with urlopen(self.url + '/engine.wasm') as response:
            self.assertEqual(response.headers['Content-Type'], 'application/wasm')

    def test_never_serves_student_work_or_directory_lists(self):
        for path in ['/../student.chatter', '/%2e%2e/student.chatter', '/outside', '/empty/']:
            with self.assertRaises(HTTPError) as error:
                urlopen(self.url + path)
            self.assertIn(error.exception.code, [403, 404])
            error.exception.close()

    def test_rejects_foreign_host(self):
        with self.assertRaises(HTTPError) as error:
            urlopen(Request(self.url, headers={'Host': 'unrelated.example'}))
        self.assertEqual(error.exception.code, 403)
        error.exception.close()


if __name__ == '__main__':
    unittest.main()
