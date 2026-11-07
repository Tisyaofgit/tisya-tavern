import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('checkpoint', Path(__file__).resolve().parents[1] / 'tools/checkpoint-native-state.py')
checkpoint = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checkpoint)


class NativeCheckpoint(unittest.TestCase):
    def test_cached_offline_script_dependencies_are_recoverable(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            relative = Path('data/com.tauritavern.client/WebKitCache/Version 17/Blobs/dependency')
            original = root / 'host/runtime' / relative
            original.parent.mkdir(parents=True)
            original.write_bytes(b'offline-script-dependency\x00\xff')
            state = root / 'host/runtime/data/com.tauritavern.client/data/default-user/settings.json'
            state.parent.mkdir(parents=True)
            state.write_text('{}')
            out = root / 'checkpoint'
            checkpoint.capture(root / 'host', out, {})
            self.assertTrue((out / relative).is_file(), 'offline iframe dependency was discarded')
            self.assertEqual((out / relative).read_bytes(), original.read_bytes())
            self.assertEqual(checkpoint.verify(out), 3)

    def test_split_settings_and_unknown_new_state_survive(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            host = root / 'host'
            data = host / 'runtime/data/com.tauritavern.client'
            required = ['data/default-user/settings.json', 'data/default-user/settings/presets.json',
                        'data/default-user/settings/persona-state.json', 'data/default-user/settings/appearance.json',
                        'data/default-user/settings/future-shard.json', 'data/default-user/tauritavern-settings.json',
                        'data/default-user/chats/card/main.jsonl', 'databases/state.sqlite-wal', 'security/origin.json',
                        'WebKitCache/derived', 'CacheStorage/cached-dependency']
            for name in required + ['data/default-user/extensions/plugin/runtime.js']:
                p = data / name
                p.parent.mkdir(parents=True, exist_ok=True)
                p.write_text(name)
            out = root / 'checkpoint'
            checkpoint.capture(host, out, {'source_commit': 'pinned-test-source'})
            for name in required:
                self.assertEqual((out / 'data/com.tauritavern.client' / name).read_text(), name)
            self.assertFalse((out / 'data' / checkpoint.EXTENSIONS).exists())
            self.assertEqual(checkpoint.verify(out), len(required) + 1)
            (out / 'data/com.tauritavern.client' / required[1]).write_text('changed')
            with self.assertRaisesRegex(RuntimeError, 'mismatch'):
                checkpoint.verify(out)

    def test_active_or_interrupted_host_cannot_be_captured(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            runtime = root / 'runtime'
            session = runtime / 'sessions/one'
            session.mkdir(parents=True)
            (runtime / 'active-session.json').write_text(json.dumps({'sessionDirectory': str(session)}))
            with self.assertRaisesRegex(RuntimeError, 'close receipt'):
                checkpoint.capture(root, root / 'checkpoint', {})

    def test_state_symlinks_are_not_silently_followed(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            data = root / 'runtime/data'
            data.mkdir(parents=True)
            (root / 'outside').write_text('outside')
            (data / 'unexpected').symlink_to(root / 'outside')
            with self.assertRaisesRegex(RuntimeError, 'symlink'):
                checkpoint.capture(root, root / 'checkpoint', {})


if __name__ == '__main__':
    unittest.main()
