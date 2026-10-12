"""Build the browser extension only; retain development inputs in the source tree."""
from pathlib import Path
import argparse
import json
import re
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
parser.add_argument('--out', type=Path, required=True)
args = parser.parse_args()
root = args.root.resolve()
manifest = json.loads((root / 'manifest.json').read_text(encoding='utf-8'))
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

本版增加太始天独立选书与词条、分批构建、基础/高级入口、任务模型显示与取消，以及紧凑的世界文明轮廓。
基础入口默认展示，高级多 Agent 配置按需使用。已有世界档案保留，旧构建需重新明确选择资料范围。
新连接默认输出上限60000、温度0.85、普通查询超时120秒；世界书构建每批至少等待600秒。上游限制仍适用。

完整更新、验证边界与操作提醒见 RELEASE-1.3.md；未完成内容及后续反馈见 docs/ROADMAP.md。
本包只包含可读运行模块和使用文档，不包含开发数据、测试样本、运行日志或个人连接密钥。
隐私与第三方请求说明见 PRIVACY.md。
'''
args.out.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(args.out, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for name in files + ['README.md', 'RELEASE-1.3.md', 'docs/ROADMAP.md', 'PRIVACY.md']:
        info = zipfile.ZipInfo('wanjie-wuku/' + name, date_time=(1980, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o644 << 16
        z.writestr(info, readme.encode('utf-8') if name == 'README.md' else (root / name).read_bytes())
with zipfile.ZipFile(args.out) as z:
    assert z.testzip() is None
    assert not any('/data/' in n or '/tests/' in n for n in z.namelist())
    print(json.dumps({'version': manifest['version'], 'files': len(z.infolist()), 'uncompressedBytes': sum(i.file_size for i in z.infolist()), 'zipBytes': args.out.stat().st_size, 'path': str(args.out)}, ensure_ascii=False))
