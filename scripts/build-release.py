"""Build the browser extension only; retain development inputs in the source tree."""
from pathlib import Path
import argparse
import json
import re
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
parser.add_argument('--out', type=Path, required=True)
parser.add_argument('--source-out', type=Path, help='Optional source archive using explicit public directories only')
args = parser.parse_args()
root = args.root.resolve()
manifest = json.loads((root / 'manifest.json').read_text(encoding='utf-8'))
package = json.loads((root / 'package.json').read_text(encoding='utf-8'))
core_version = re.search(r"export const VERSION = ['\"]([^'\"]+)['\"]", (root / 'src/core.js').read_text(encoding='utf-8')).group(1)
if package['version'] != manifest['version'] or core_version != manifest['version']:
    raise ValueError('Manifest, package and runtime versions must match')
release_notes = f"RELEASE-{manifest['version']}.md"
if not (root / release_notes).is_file():
    raise ValueError(f'Missing release notes: {release_notes}')
files = ['bootstrap.js', 'index.js', 'manifest.json', 'style.css', 'LICENSE', 'NOTICE.md']
files += sorted(p.relative_to(root).as_posix() for p in (root / 'src').glob('*.js'))
for entry in [manifest['js'], manifest['css']]:
    if entry not in files:
        raise ValueError('Manifest entry missing from release')
for name in files:
    path = root / name
    if not path.is_file():
        raise ValueError(f'Missing release input: {name}')
    if path.suffix == '.js':
        for value in re.findall(r"(?:from\s*|import\s*)['\"](\.[^'\"]+)['\"]", path.read_text(encoding='utf-8')):
            dependency = (path.parent / value).resolve().relative_to(root).as_posix()
            if dependency not in files:
                raise ValueError(f'Runtime import excluded: {name} -> {dependency}')
# Use the current release description rather than a stale template from an older build.
source_readme = (root / 'README.md').read_text(encoding='utf-8')
heading, _, body = source_readme.partition('\n')
readme = heading + f"\n\n安装：将 ZIP 内的 wanjie-wuku 文件夹放入酒馆的 data/default-user/extensions/ 目录；覆盖更新前备份旧扩展与聊天档案，完成后按 Ctrl+F5。\n\n本包可用于首次安装和覆盖更新，包含完整运行文件；网页上传仓库请使用单独的增量上传包。\n\n" + body.lstrip()
args.out.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(args.out, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for name in files + ['README.md', release_notes, 'docs/ROADMAP.md', 'PRIVACY.md']:
        info = zipfile.ZipInfo('wanjie-wuku/' + name, date_time=(1980, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o644 << 16
        z.writestr(info, readme.encode('utf-8') if name == 'README.md' else (root / name).read_bytes())
with zipfile.ZipFile(args.out) as z:
    assert z.testzip() is None
    assert not any('/data/' in n or '/tests/' in n for n in z.namelist())
    print(json.dumps({'version': manifest['version'], 'files': len(z.infolist()), 'uncompressedBytes': sum(i.file_size for i in z.infolist()), 'zipBytes': args.out.stat().st_size, 'path': str(args.out)}, ensure_ascii=False))
if args.source_out:
    source_files = [p for p in root.iterdir() if p.is_file() and (p.suffix in ('.js', '.css', '.json', '.md') or p.name in ('LICENSE', '.gitignore', '.gitattributes'))]
    for directory, suffixes in {'src': {'.js'}, 'data': {'.json'}, 'scripts': {'.py', '.mjs'}, 'tests': {'.js', '.mjs', '.html'}, 'docs': {'.md'}}.items():
        source_files += [p for p in (root / directory).rglob('*') if p.is_file() and not p.is_symlink() and p.suffix in suffixes]
    args.source_out.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(args.source_out, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for path in sorted(source_files):
            info = zipfile.ZipInfo('wanjie-wuku/' + path.relative_to(root).as_posix(), date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            z.writestr(info, path.read_bytes())
    with zipfile.ZipFile(args.source_out) as z:
        assert z.testzip() is None
        print(json.dumps({'version': manifest['version'], 'files': len(z.infolist()), 'zipBytes': args.source_out.stat().st_size, 'path': str(args.source_out)}, ensure_ascii=False))
