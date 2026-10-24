#!/usr/bin/env python3
"""Send one JSON WebDriver command to the active packaged native session."""
import argparse,datetime,json,pathlib,sys,time
p=argparse.ArgumentParser();p.add_argument('--package-root',type=pathlib.Path,default=pathlib.Path(__file__).resolve().parents[1]);args=p.parse_args()
state=json.loads((args.package_root/'runtime'/'active-session.json').read_text());root=pathlib.Path(state['commands'])
cmd=json.load(sys.stdin);name=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%f');request=root/(name+'.request.json');response=root/(name+'.response.json')
request.write_text(json.dumps(cmd,ensure_ascii=False));deadline=time.time()+float(cmd.get('timeout',45))+5
while not response.exists():
 if time.time()>deadline:raise SystemExit('Queue timed out; the request remains at '+str(request))
 time.sleep(.1)
print(response.read_text())
