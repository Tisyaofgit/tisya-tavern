"""Build the self-contained review prototype. No production modules are changed."""
from pathlib import Path
import base64
import subprocess

root = Path(__file__).resolve().parent
font = base64.b64encode((root / 'reading.woff2').read_bytes()).decode()
css = (root / 'style.css').read_text().replace('url(reading.woff2)', f'url(data:font/woff2;base64,{font})')
html = (root / 'index.html').read_text()
html = html.replace('<link rel="stylesheet" href="style.css">', '<style>' + css + '</style>')
def inline_script(source):
    # Parser fixtures contain literal script/comment boundaries. A data URL
    # keeps those bytes out of HTML raw-text parsing, without eval or a CDN.
    return '<script src="data:text/javascript;base64,' + base64.b64encode(source.encode()).decode() + '"></script>'

html = html.replace('<script src="catalog.js"></script>', inline_script((root / 'catalog.js').read_text()))
bundle = subprocess.check_output(['node', str(root / 'bundle-preview.mjs')], text=True)
html = html.replace('<script type="module" src="demo.js"></script>', inline_script(bundle))
(root / 'preview.html').write_text(html)
print(f'preview.html: {len(html.encode())} bytes')
