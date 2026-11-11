# 日常使用

需要历史决定时查阅资料，得到可复用结论后记录下来。下面以一次回调修复为例，说明如何从检索走到后续复用。

## 查找已有约定

```bash
mini-trellis mem recall "回调 幂等"
```

阅读来源及适用条件。摘录缺少上下文时，展开返回的引用：

```bash
mini-trellis mem read "<ref-from-recall>"
```

没有命中时，继续核对当前代码和相关文档。[检索指南](recall_CN.md)介绍了来源范围和告警含义。

## 修改并验证

沿用项目的开发工具完成修复，留下测试结果和后续改动需要遵守的新结论。例如：重复回调返回第一次的结果，并已增加覆盖重复投递的回归测试。

## 保存结论

```text
把确认的幂等规则更新到已有回调规范。
在研究笔记里补充放弃的方案及原因。
使用 mini-trellis-remember，记录修改文件、验证结果和主题链接。
```

检查实际主题文件和日志：主题正文保存当前说明，日志记录本次修改与验证。新安装默认由你决定何时进行 Git 提交。

## 维护项目现状

更新已有 README、docs 页面或 spec 中相关的章节。已实现行为以当前代码或测试为依据，已确认的后续工作单独标明。沿用文件原有语言，改名时同步修改受影响的路径和符号引用。

排版和改名可以按普通文档修改处理；新增值得复用的知识时，再留下开发日志。详见[编写与更新知识](writing-notes_CN.md)。

## 在新会话中继续使用

```text
按项目已记录的回调规则补一条重试上限测试。
用 mini-trellis mem recall 找到现行笔记，读清适用条件，
并以该来源为依据完成实现。
```

规则有变化时，先更新主题，再记录新决定。下一次会话应能找回修改后的正文及来源。

## 更多指南

<a id="opencode-v1-与-v2"></a>
[OpenCode V1 与 V2 配置](agents_CN.md#opencode)

<a id="codebuddy-cli-与-ide"></a>
[CodeBuddy CLI 与 IDE 配置](agents_CN.md#codebuddy)

<a id="pi-and-omp"></a>
[Pi / OMP 配置](agents_CN.md#pi-and-omp)

<a id="kiro"></a>
[Kiro 配置](agents_CN.md#kiro)

<a id="升级与刷新"></a>
[升级与刷新](upgrade_CN.md)

<a id="zcode-zai"></a>
[ZCode 配置](agents_CN.md#zcode)

<a id="在-cursor-里"></a>
[Cursor 配置](agents_CN.md#cursor)

<a id="把选定历史整理成项目知识"></a>
<a id="把选定聊天整理成项目知识"></a>
[整理选定历史](history_CN.md)

<a id="compact-之后怎么定位"></a>
[compact 后找回上下文](recall_CN.md#compact)

<a id="排障"></a>
[故障排查](troubleshooting_CN.md)
