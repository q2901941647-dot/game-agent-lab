# -*- coding: utf-8 -*-
"""
把 GameAgentLab 打包成单文件 HTML。
用途：方便在没有任何本地服务的环境下「双击即用」，也便于单独发送。
运行：python tools/build_standalone.py
"""
import base64
import io
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = ["src/kb.js", "src/testset.js", "src/engine.js", "src/app.js"]

# 单文件版必须把外链图片内联进去，否则双击打开时 hero 背景 404。
# （这也是唯一一处外链资源：官方主视觉横幅。）
ASSETS = {"assets/hero_kv.jpg": "image/jpeg"}

html = io.open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()

bundle = []
for rel in SRC:
    code = io.open(os.path.join(ROOT, rel), encoding="utf-8").read()
    bundle.append("/* ===== %s ===== */\n%s" % (rel, code))

tags = "\n".join('<script src="%s"></script>' % r for r in SRC)
inline = "<script>\n" + "\n\n".join(bundle) + "\n</script>"

if tags not in html:
    raise SystemExit("未找到预期的 script 标签块，请检查 index.html 结构")

html = html.replace(tags, inline)

for rel, mime in ASSETS.items():
    p = os.path.join(ROOT, rel)
    if not os.path.exists(p):
        raise SystemExit("缺少素材：" + rel)
    b64 = base64.b64encode(open(p, "rb").read()).decode("ascii")
    for quote in ('"', "'"):
        html = html.replace("url(%s%s%s)" % (quote, rel, quote),
                            "url(data:%s;base64,%s)" % (mime, b64))

if "url(assets/" in html or 'url("assets/' in html:
    raise SystemExit("还有未内联的资源引用，请补进 ASSETS")

html = html.replace("<title>", "<!-- 单文件构建版 · 由 tools/build_standalone.py 生成 -->\n<title>")

out = os.path.join(ROOT, "GameAgentLab-standalone.html")
io.open(out, "w", encoding="utf-8").write(html)
print("已生成:", out, "（%.1f KB）" % (os.path.getsize(out) / 1024.0))
