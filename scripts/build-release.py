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

本版增加按任务配置备用API，默认关闭；主连接传输故障后按顺序接续，超时切换可能另计费用。通用整理先核对成果归属，只提交变化字段和必要依据。
本版增加世界简报、现有区域/组织/人物/事件档案关联与能力分区；保留70条专用适配、完整档案库与手机边缘收起入口。
三个模块分别导出和恢复档案，完整聊天备份另设入口。独立恢复保留其他模块；旧待执行安排停止，不修改角色变量或携带API设置。
资源区可直接手动修正余额，档案详情可手写修改；无需调用 AI。独立 API 增加最终正文结构兼容与脱敏诊断，保存未核实时明确提示。
本版分开世界与人物正文发送，独立选择与预算；人物档案保留外貌、性格、经历、战斗方式或日常技艺，并可折叠核对所选世界书原文片段。
基础入口默认展示，高级多 Agent 配置按需使用。已有世界档案保留，旧构建需重新明确选择资料范围。
新连接默认输出上限60000、温度0.85、普通查询超时120秒；世界书构建每批至少等待600秒。上游限制仍适用。
整理优先读取正式结算，分离状态快照与叙事；普通历史整理每层一次请求并汇总预览，同对象按楼层更新保留历史。重复字段可在预览本地选择或手写修正，不追加AI调用；未完成楼层保留待重查。部分自动整理停止当前循环，不自动重试。旧聚合先例与错误档案不会自动拆分或删除。

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
