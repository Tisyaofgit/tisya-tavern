#!/usr/bin/env python3
"""Deterministically bundle this controlled, dependency-free local module graph."""
from pathlib import Path
import argparse, base64, datetime as dt, hashlib, json, re
ROOT=Path(__file__).resolve().parents[1]
IMPORT=re.compile(r"^import\s*\{([^}]+)\}\s*from\s*['\"]([^'\"]+)['\"];?",re.M)
EXPORT=re.compile(r'^export\s+(?:async\s+)?(?:class|function|const|let|var)\s+([A-Za-z_$][\w$]*)',re.M)

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--check',action='store_true')
    args=parser.parse_args()
    source=ROOT; html=(source/'phone-entry.html').read_text(); modules={}; order=[]; active=set()
    def visit(path):
        path=path.resolve()
        if not path.is_relative_to(source.resolve()): raise ValueError('Dependency outside preview')
        if path in modules:return modules[path]
        if path in active:raise ValueError('Cyclic module dependency')
        active.add(path); code=path.read_text(); imports=[]
        for match in IMPORT.finditer(code):
            if not match[2].startswith('./'):raise ValueError('External import')
            dep=visit(path.parent/match[2]); binding=re.sub(r'\s+as\s+',':',match[1])
            imports.append('const {'+binding+'}='+dep+';')
        exports=EXPORT.findall(code)
        code=IMPORT.sub('',code);code=re.sub(r'^export\s+(?=(?:async\s+)?(?:class|function|const|let|var)\b)','',code,flags=re.M)
        if re.search(r'^\s*(?:import|export)\s',code,re.M):raise ValueError('Unsupported module syntax: '+path.name)
        name='__network_module_'+str(len(modules));modules[path]=name
        order.append((path,'const '+name+'=(()=>{\n'+ '\n'.join(imports)+'\n'+code+'\nreturn {'+','.join(exports)+'};\n})();'))
        active.remove(path);return name
    visit(source/'phone-app.mjs')
    script='\n\n'.join(code for _,code in order)
    css_files=[]
    def css(match):
        name=match[1];css_files.append(name)
        return '<style>\n'+(source/name).read_text()+'\n</style>'
    html=re.sub(r'<link rel="stylesheet" href="\./([^\"]+)">',css,html)
    token='<script type="module" src="./phone-app.mjs"></script>'
    if html.count(token)!=1:raise ValueError('Unexpected entry point')
    embedded=[]
    def embed(match):
        relative=match[0]; path=source/relative[2:]
        if not path.is_file():raise ValueError('Missing asset '+relative)
        if path.suffix!='.svg':raise ValueError('Only local SVG assets expected')
        if path.name not in embedded:embedded.append(path.name)
        return 'data:image/svg+xml;base64,'+base64.b64encode(path.read_bytes()).decode()
    script=re.sub(r'\./assets/[A-Za-z0-9_.-]+\.svg',embed,script)
    html=re.sub(r'\./assets/[A-Za-z0-9_.-]+\.svg',embed,html)
    html=html.replace(token,'<script type="module">\n'+script.replace('</script','<\\/script')+'\n</script>')
    if re.search(r'(?:src|href)=["\'](?:https?://|\./)',html):raise ValueError('External runtime reference')
    dest=ROOT/'phone.html'
    if args.check:
        if not dest.exists() or dest.read_text()!=html:raise SystemExit('phone.html is stale; run python3 tools/build-phone.py')
    else:dest.write_text(html)
    print(json.dumps({'file':str(dest.name),'bytes':dest.stat().st_size,'sha256':hashlib.sha256(dest.read_bytes()).hexdigest(),'modules':len(order),'css':len(css_files),'embedded_assets':len(embedded),'check':args.check},ensure_ascii=False))
if __name__=='__main__':main()
