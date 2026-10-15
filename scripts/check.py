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

    # i18n: every data-i18n key must exist in both languages, and zh/en must define the same keys
    m = re.search(r'(?:const|let|var)\s+(?:dict|translations)\s*=\s*\{(.*?)\n\s*\};', s, re.S)
    if m:
        body = m.group(1)
        sp = re.search(r"^\s*['\"]?en['\"]?\s*:\s*\{", body, re.M)
        zh, en = body[:sp.start()], body[sp.end():]
        zh = zh.split('{', 1)[1] if '{' in zh else zh
        key = r"^\s*'([\w.-]+)'\s*:"
        zk, ek = set(re.findall(key, zh, re.M)), set(re.findall(key, en, re.M))
        used = set(re.findall(r'data-i18n="([^"]+)"', s)) | set(re.findall(r'data-title-i18n="([^"]+)"', s))
        for k in sorted(used - zk):
            errors.append(f'{p}: data-i18n "{k}" missing in zh-TW')
        for k in sorted(used - ek):
            errors.append(f'{p}: data-i18n "{k}" missing in en')
        for k in sorted(zk ^ ek):
            errors.append(f'{p}: i18n key "{k}" is not defined in both languages')

print(f'checked {len(pages)} pages')
if errors:
    print('\n'.join(errors))
    sys.exit(1)
