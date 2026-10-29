# 本机 dashboard

在 skill 根目录运行 `python scripts/dashboard_server.py --open-browser`，或在 Windows 运行 `start-dashboard.cmd`。本机地址默认 `http://127.0.0.1:8765/`，仅监听 loopback。另一个端口可用 `--port` 指定。环境需要 Python 3.10+、`requirements-dashboard.txt` 中的文件读取库，以及可用并登录的 Codex CLI（`codex login`）。可用 `FINSKILL_CODEX` 指定 CLI 可执行文件路径；不需要把 API key 放入页面或仓库。

启动器只在缺少依赖时安装到本 skill 的 `.runtime/python`。如果端口已占用，复用已运行的工作台或选择新端口。退出服务用运行终端中的 Ctrl+C。

“开始审查”先显示候选科目和基础文字检查，同时通过 `codex --search exec` 的只读、无 shell、ephemeral 调用检索官方资料并返回结构化审阅。原文会交给当前登录的 Codex 处理，并产生该账号的模型／搜索用量；它不是浏览器里的离线 LLM。每次运行要求真实搜索、打开正文、引用原句，具体主体、报告期及版本不足时保留待核查。机器检查仅验证引用原句是否存在、来源域名及实际打开记录，不保证会计法律判断正确。

支持文本 PDF、DOCX、XLSX/XLSM、XLS、CSV/TSV、HTML/XHTML/XML、TXT/JSON 等。S-1、S-1/A、F-1、年报、招股书、工商公示等由资料类型选项指定。旧 DOC 需转 DOCX；扫描 PDF 需先 OCR。PDF 无文字页、Word 嵌入对象、表格未重算公式等限制显示在导入结果中；文件格式支持不代表已读取图片、宏、外部链接或所有嵌入附件。每文件25MB，合计80万字符；长文每4万字符分段审阅，跨段勾稽另复核。

会话仅存在于页面和服务内存，不写入本地数据库或浏览器 storage。`pagehide` 清空页面并通知服务删除会话、取消任务；异常退出时服务在无心跳120秒后清理。刷新、再次打开、浏览器前进后退恢复均从空白内容开始。服务没有把用户文件或审阅结果同步到 GitHub 的操作；只有用户主动导出的审阅包会下载到设备。此处的清理范围为本机工作台，不代表删除模型服务端的账户记录或用户自行导出的文件。

地区资料位于 `assets/dashboard/profiles.json`，分别记录证券、会计、审计和公示来源及访问状态；目录整理日期不能替代每次审阅的版本核查。审阅 JSON 结构见 `assets/dashboard/review-schema.json`。页面不把未读条文、搜索摘要、旧版本或没有真实原文的结论显示为已充分支持。
