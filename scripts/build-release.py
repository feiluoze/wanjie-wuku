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
readme = f'''# 万界武库 {manifest['version']}

安装：将 ZIP 内的 wanjie-wuku 文件夹放入酒馆扩展目录；更新前备份旧扩展与聊天档案，覆盖后按 Ctrl+F5。
也可通过酒馆扩展管理器安装或更新 https://github.com/feiluoze/wanjie-wuku 。
聊天档案与 API 设置保存在酒馆账户，不在安装包中。无需重新导入世界书或接入已有词条。

本版增加手动分批整理、断点保存、主动续跑与连续处理。取消或刷新保留已保存批次及日志，未保存候选需重查；失败停止，正式结算与状态块保持完整。
势力档案、人物任职和独立关系联动；可手写指定关系并保护，AI不能覆盖玩家确认的人物身份。高级专职与独立发送分区沿用预算边界。
内置作者1013版设定，通用123条，太始天仅保留完整版专用入口。
世界简报、稳定档案关联、所选来源片段与资料性质分开展示。太始垂天操作写入待发送输入框，实际结果依正文确认。
历时支持预览后登记外界历时、倍率、内部历时及局部范围；首次改设及千年资格依据已登记时间判断，不自动猜测剧情时间或历法。
常用整理、显化与历时入口前置，创建资料管理折叠；手动修正和错误保留明显入口。世界、人物发送分别选择与控制预算。
三个模块分别导出和恢复，日志、备用API与手动余额修正继续保留。更新前备份；本版不制作旧档迁移，新设定建议新建档案。

完整更新、验证边界与操作提醒见 {release_notes}；未完成内容及后续反馈见 docs/ROADMAP.md。
本包只包含可读运行模块和使用文档，不包含开发数据、测试样本、运行日志或个人连接密钥。
隐私与第三方请求说明见 PRIVACY.md。
'''
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
