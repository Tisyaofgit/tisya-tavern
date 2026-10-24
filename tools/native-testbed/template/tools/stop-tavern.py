#!/usr/bin/env python3
"""Ask only this package's active supervisor to close its native session."""
import json,pathlib
root=pathlib.Path(__file__).resolve().parents[1];session=json.loads((root/'runtime/active-session.json').read_text());directory=pathlib.Path(session['sessionDirectory']).resolve()
if not directory.is_relative_to((root/'runtime/sessions').resolve()):raise SystemExit('Session directory is outside this package')
(directory/'stop.json').write_text('{}\n');print('Stop requested. Wait for '+str(directory/'closed.json'))
