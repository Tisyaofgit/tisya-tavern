import json
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import time
import unittest

CLIENT = Path(__file__).resolve().parents[1] / 'tools/native-queue-client.py'


class NativeQueueTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.session = self.root / 'runtime/sessions/current'
        self.commands = self.session / 'commands'
        self.commands.mkdir(parents=True)
        self.active = self.root / 'runtime/active-session.json'
        self.active.write_text(json.dumps({'sessionDirectory':str(self.session),'commands':str(self.commands)}))

    def run_client(self, action=None):
        errors = []
        def server():
            try:
                end = time.monotonic()+2
                while time.monotonic()<end:
                    requests = list(self.commands.glob('*.request.json'))
                    if requests:
                        action(requests[0]); return
                    time.sleep(.01)
                raise AssertionError('client did not send a request')
            except Exception as error: errors.append(error)
        thread = threading.Thread(target=server) if action else None
        if thread: thread.start()
        started = time.monotonic()
        result = subprocess.run([sys.executable,str(CLIENT),'--package-root',str(self.root)],input='{"timeout":45}',text=True,capture_output=True,timeout=3)
        self.assertLess(time.monotonic()-started,2)
        if thread: thread.join(2)
        if errors: raise errors[0]
        return result

    def test_closed_session_never_gets_a_request(self):
        (self.session/'closed.json').write_text('{}')
        result = self.run_client()
        self.assertNotEqual(result.returncode,0)
        self.assertIn('NATIVE_SESSION_CLOSED',result.stderr)
        self.assertEqual(list(self.commands.iterdir()),[])

    def test_shutdown_keeps_uncertain_request_and_exits_promptly(self):
        result = self.run_client(lambda _: (self.session/'closed.json').write_text('{}'))
        self.assertIn('outcome unknown',result.stderr)
        self.assertEqual(len(list(self.commands.glob('*.request.json'))),1)

    def test_replacement_does_not_replay_into_new_session(self):
        result = self.run_client(lambda _: self.active.write_text(json.dumps({'sessionDirectory':str(self.root/'other')})))
        self.assertIn('NATIVE_SESSION_REPLACED',result.stderr)
        self.assertEqual(len(list(self.commands.glob('*.request.json'))),1)

    def test_received_response_survives_immediate_shutdown(self):
        def answer(request):
            request.with_name(request.name.replace('.request.','.response.')).write_text('{"status":200,"value":7}')
            (self.session/'closed.json').write_text('{}')
        result = self.run_client(answer)
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertEqual(json.loads(result.stdout),{'status':200,'value':7})


if __name__ == '__main__': unittest.main()
