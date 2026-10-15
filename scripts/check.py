import re, sys, pathlib, subprocess, tempfile, os

errors = []
pages = sorted(pathlib.Path('.').glob('*.html'))
for p in pages:
    s = p.read_text(encoding='utf-8')
    if re.search(r'^(<<<<<<<|=======|>>>>>>>)', s, re.M):
        errors.append(f'{p}: merge conflict markers')
    for href in re.findall(r'(?:href|src)="([^"#?:]+\.(?:html|css|js|png|jpg|svg))"', s):
        if not pathlib.Path(href).exists():
            errors.append(f'{p}: broken local link {href}')
    for i, js in enumerate(re.findall(r'<script>(.*?)</script>', s, re.S)):
        with tempfile.NamedTemporaryFile('w', suffix='.js', delete=False, encoding='utf-8') as f:
            f.write(js)
        r = subprocess.run(['node', '--check', f.name], capture_output=True, text=True)
        os.unlink(f.name)
        if r.returncode:
            errors.append(f'{p}: script #{i} syntax error\n{r.stderr.strip()}')

print(f'checked {len(pages)} pages')
if errors:
    print('\n'.join(errors))
    sys.exit(1)
