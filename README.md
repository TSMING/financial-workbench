# financial-workbench

面向交易会计与财务报告的个人财务审阅 Skill，附带本机交互 dashboard。支持中国大陆、澳洲、香港、美国、欧盟的会计、证券与审计官方来源切换。

## 运行 dashboard

下载并解压 `financial-workbench.zip`。在其中的 `financial-workbench` 文件夹运行 `start-dashboard.cmd`，或安装 Python 依赖后执行：

```text
python -m pip install -r scripts/requirements-dashboard.txt
python scripts/dashboard_server.py --open-browser
```

打开 `http://127.0.0.1:8765/`，导入文件或粘贴原文，选择地区、资料类型、报告期及分录币种，再点击“开始审查”。

真实联网审阅需要本机安装 Codex CLI 并使用 `codex login` 登录；它使用该登录账号的模型和搜索能力。文件导入和基础提取在本机进行，开始后原文提交给 Codex 审阅。账号登录、网络或额度不可用时，页面会明确显示失败。

PDF、DOCX、XLSX/XLS、CSV、HTML、XML、TXT 等可导入；S-1/F-1、年报、公告和其他地区公示文件由资料类型指定。旧 DOC 先转 DOCX，扫描 PDF 先 OCR。原文输入框保留，可编辑导入文字。币种选项只补充未注明币种，不自动换汇。

每次关闭或刷新后清空页面内容，并清除本机服务会话；异常退出后的会话在120秒无心跳后清理。本机不持久化导入原文或结果，主动导出除外。GitHub 只存放程序、Skill 与压缩包，不存放用户审阅材料。

## Skill

完整源码位于 [`financial-workbench/`](financial-workbench/)，入口为 [`SKILL.md`](financial-workbench/SKILL.md)。可将该文件夹安装到个人 skills 目录，在 Codex 中调用 `$financial-workbench`。

面板输出是带原文证据与官方来源的候选工作底稿。条文不可读、适用主体或期间不明时保留待核查；未完整核对的分录不视为可过账凭证。
