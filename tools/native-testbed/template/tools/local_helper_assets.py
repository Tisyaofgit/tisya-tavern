#!/usr/bin/env python3
"""Two fixed public helper assets, served locally without upstream forwarding."""
import argparse,json
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
EXTENSION=ROOT/'runtime/data/com.tauritavern.client/data/default-user/extensions/JS-Slash-Runner'

def main():
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--port',type=int,default=8096);args=parser.parse_args()
 assets={'/helper/manifest.json':(EXTENSION/'manifest.json').read_bytes(),'/helper/CHANGELOG.md':(EXTENSION/'CHANGELOG.md').read_bytes()}
 class Handler(BaseHTTPRequestHandler):
  def log_message(self,*_):pass
  def reply(self,code,payload):
   self.send_response(code);self.send_header('Access-Control-Allow-Origin','*');self.send_header('Content-Type','application/json' if self.path.endswith('.json') else 'text/plain; charset=utf-8');self.send_header('Content-Length',str(len(payload)));self.end_headers();self.wfile.write(payload)
  def do_GET(self):
   allowed=self.path in assets
   print(json.dumps({'method':'GET','allowed':allowed,'asset':self.path if allowed else None}),flush=True)
   self.reply(200 if allowed else 404,assets[self.path] if allowed else b'Not found')
  def do_POST(self):self.reply(405,b'Method not allowed')
  do_PUT=do_POST
  do_PATCH=do_POST
  do_DELETE=do_POST
  do_HEAD=do_POST
 with ThreadingHTTPServer(('127.0.0.1',args.port),Handler) as server:
  print(json.dumps({'listening':'http://127.0.0.1:'+str(server.server_port),'fixedAssets':sorted(assets),'externalRequests':False}),flush=True)
  server.serve_forever()

if __name__=='__main__':main()
