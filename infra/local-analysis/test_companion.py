"""Real loopback HTTP boundary checks; no model inference or cloud credentials."""
import json
from pathlib import Path
import subprocess
import unittest
import urllib.error
import urllib.parse
import urllib.request
import shutil
import time

ROOT = Path(__file__).resolve().parents[2]
JOBS = ROOT / '.local/test-companion-jobs'
TRACKING = {'timestampSeconds': 0, 'videoWidth': 100, 'videoHeight': 100, 'points': [{'x': 1, 'y': 2}, {'x': 3, 'y': 4}]}


def job(**overrides):
    value = {'movement': 'squat', 'tracking': TRACKING, 'name': 'Przysiad ąę', 'account': 'user-1',
             'sourceVideo': {'durationSeconds': 3, 'width': 100, 'height': 100}, 'fileName': 'lift.mp4'}
    value.update(overrides)
    return urllib.parse.quote(json.dumps(value))


class CompanionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        shutil.rmtree(JOBS, ignore_errors=True)
        cls.process = subprocess.Popen([
            'dotnet', str(ROOT / '.local/local-analyzer-artifacts/bin/Metrivum.LocalAnalyzer/debug/MetrivumAnalyzer.dll'),
            '--MotionTraceRoot', str(ROOT.parent / 'MotionTrace'),
            '--PairingFile', str(ROOT / '.local/test-companion-pairing-token'),
            '--JobsDirectory', str(JOBS),
        ], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        cls.process.stdout.readline()
        cls.token = cls.process.stdout.readline().strip().split(': ', 1)[1]

    @classmethod
    def tearDownClass(cls):
        subprocess.run(['taskkill', '/PID', str(cls.process.pid), '/T', '/F'], capture_output=True)
        cls.process.wait(timeout=10)
        cls.process.stdout.close()
        cls.process.stderr.close()

    def request(self, *, origin='http://localhost:5173', token=None, configuration=None, body=b'video', method='POST', host=None,
                content_length=None, path='/jobs'):
        headers = {'Origin': origin, 'Authorization': 'Bearer ' + (self.token if token is None else token),
                   'Content-Type': 'video/mp4', 'X-Metrivum-Job': job() if configuration is None else configuration}
        if host:
            headers['Host'] = host
        if content_length is not None:
            headers['Content-Length'] = str(content_length)
        request = urllib.request.Request('http://127.0.0.1:59121' + path, body if method in ('POST', 'PUT') else None, headers, method=method)
        try:
            response = urllib.request.urlopen(request, timeout=10)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            return response.status, response.headers, response.read()

    def jobs(self):
        status, _, body = self.request(method='GET', path='/jobs?account=user-1')
        self.assertEqual(status, 200)
        return json.loads(body)

    def test_untrusted_origin(self):
        self.assertEqual(self.request(origin='http://evil.example')[0], 403)

    def test_rebinding_host(self):
        self.assertEqual(self.request(host='evil.example:59121')[0], 403)

    def test_invalid_pairing(self):
        self.assertEqual(self.request(token='wrong')[0], 401)

    def test_preflight(self):
        status, headers, _ = self.request(method='OPTIONS', token='')
        self.assertEqual(status, 204)
        self.assertEqual(headers['Access-Control-Allow-Origin'], 'http://localhost:5173')
        self.assertNotIn('*', headers['Access-Control-Allow-Headers'])

    def test_pairing_gives_the_token_only_to_the_configured_origin(self):
        def pair(origin):
            request = urllib.request.Request('http://127.0.0.1:59121/pair', method='POST', headers={'Origin': origin})
            try:
                with urllib.request.urlopen(request, timeout=5) as response:
                    return response.status, json.loads(response.read())
            except urllib.error.HTTPError as error:
                return error.code, None
        status, body = pair('http://localhost:5173')
        self.assertEqual(status, 200)
        self.assertEqual(body['token'], self.token)
        self.assertEqual(pair('http://evil.example')[0], 403)

    def test_discovery_needs_no_token_but_reveals_no_private_data(self):
        request = urllib.request.Request('http://127.0.0.1:59121/discovery', headers={'Origin': 'http://localhost:5173'})
        with urllib.request.urlopen(request, timeout=10) as response:
            data = json.load(response)
        self.assertEqual(data['protocolVersion'], 1)
        self.assertEqual(set(data), {'application', 'protocolVersion', 'version', 'pairing', 'features'})
        self.assertIn('jobs', data['features'])
        self.assertIn('preprocess', data['features'])

    def test_status_requires_pairing(self):
        request = urllib.request.Request('http://127.0.0.1:59121/status', headers={'Origin': 'http://localhost:5173'})
        with self.assertRaises(urllib.error.HTTPError) as failure:
            urllib.request.urlopen(request, timeout=10)
        self.assertEqual(failure.exception.code, 401)

    def test_status_is_private_and_ready(self):
        request = urllib.request.Request('http://127.0.0.1:59121/status', headers={
            'Origin': 'http://localhost:5173', 'Authorization': 'Bearer ' + self.token})
        with urllib.request.urlopen(request, timeout=10) as response:
            self.assertIn(json.load(response)['state'], ('ready', 'analyzing', 'runtime_missing'))

    def test_queued_video_is_kept_listed_per_account_and_removable(self):
        status, _, body = self.request()
        self.assertEqual(status, 201)
        created = json.loads(body)
        self.assertEqual(created['name'], 'Przysiad ąę')
        self.assertIn(created['id'], [item['id'] for item in self.jobs()])
        status, _, other = self.request(method='GET', path='/jobs?account=someone-else')
        self.assertEqual(json.loads(other), [])
        status, headers, video = self.request(method='GET', path='/jobs/' + created['id'] + '/video')
        self.assertEqual((status, video), (200, b'video'))
        self.assertTrue((JOBS / created['id'] / 'job.json').exists())
        self.assertEqual(self.request(method='DELETE', path='/jobs/' + created['id'])[0], 204)
        for _ in range(50):
            if created['id'] not in [item['id'] for item in self.jobs()] and not (JOBS / created['id']).exists():
                break
            time.sleep(.1)
        self.assertNotIn(created['id'], [item['id'] for item in self.jobs()])

    def test_queue_holds_at_most_ten_videos(self):
        ids = []
        try:
            for _ in range(10):
                status, _, body = self.request()
                if status == 201:
                    ids.append(json.loads(body)['id'])
            self.assertEqual(self.request()[0], 409)
        finally:
            for item in self.jobs():
                self.request(method='DELETE', path='/jobs/' + item['id'])

    def test_unknown_or_traversal_job_ids_are_not_found(self):
        self.assertEqual(self.request(method='GET', path='/jobs/..%2F..%2Fsecret/video')[0], 404)
        self.assertEqual(self.request(method='GET', path='/jobs/not-a-guid/result')[0], 404)

    def test_trim_must_be_long_enough_and_contain_the_marked_frame(self):
        too_short = job(trim={'startSeconds': 1, 'endSeconds': 1.2})
        self.assertEqual(self.request(configuration=too_short)[0], 400)
        outside = job(trim={'startSeconds': 1, 'endSeconds': 2.5})  # marked frame is at 0 s
        self.assertEqual(self.request(configuration=outside)[0], 400)
        past_end = job(trim={'startSeconds': 0, 'endSeconds': 9})
        self.assertEqual(self.request(configuration=past_end)[0], 400)

    def test_trim_and_stabilization_are_kept_with_the_job(self):
        status, _, body = self.request(configuration=job(trim={'startSeconds': 0, 'endSeconds': 2}, stabilize=True))
        self.assertEqual(status, 201)
        created = json.loads(body)
        try:
            self.assertEqual(created['trim'], {'startSeconds': 0, 'endSeconds': 2})
            self.assertTrue(created['stabilize'])
            saved = json.loads((JOBS / created['id'] / 'job.json').read_text(encoding='utf-8'))
            self.assertTrue(saved['stabilize'])
        finally:
            self.request(method='DELETE', path='/jobs/' + created['id'])

    def test_bad_configuration(self):
        self.assertEqual(self.request(configuration='%7B')[0], 400)

    def test_missing_points(self):
        status, headers, body = self.request(configuration=job(tracking=None))
        self.assertEqual(status, 400)
        self.assertEqual(headers['Cache-Control'], 'no-store')
        self.assertNotIn(b'C:\\', body)

    def test_empty_video(self):
        self.assertEqual(self.request(body=b'')[0], 400)

    def test_large_video_is_413(self):
        self.assertEqual(self.request(content_length=268435457)[0], 413)


if __name__ == '__main__':
    unittest.main()
