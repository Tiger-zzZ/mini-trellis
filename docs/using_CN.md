# 开发时怎么用

下面用一次回调接口修改，说明什么时候查、什么时候记。命令在项目根目录执行。Claude Code 用 `/mini-trellis:remember`，Codex 用 `$mini-trellis-remember`，OpenCode 用 `/mini-trellis:remember`，Pi 用 `/mini-trellis-remember`。

## 改代码之前先查

要改回调重试时，先看以前有没有定过规则：

```bash
mini-trellis mem recall "回调 重试"
```

输出是几条短摘录，每条带路径和 `ref`。摘录够用就按它改。要看完整笔记或当时的对话，把 `ref` 交给 `read`：

```bash
mini-trellis mem read "<ref>"
```

只查某一次对话时，用 `mini-trellis mem search "回调 重试"`，再把返回的 session ID 交给 `mini-trellis mem context <session-id>`。

没有命中就直接改。不必为了走流程先建任务。

## 开发过程中记什么

值得留下的只有以后还会用到的结论。

| 发生了什么 | 记在哪里 | 怎么说 |
| --- | --- | --- |
| 定下「回调必须带幂等键」 | `.trellis/spec/` | 对 Agent 说：把这条写成项目约定，并更新已有的 spec。 |
| 查了支付平台文档，重试最多两次 | `.trellis/research/` | 对 Agent 说：按这个主题更新研究笔记，写上结论、条件和文档链接。 |
| 试过先去重再记账，对账对不上，放弃了 | 同一篇研究笔记 | 标明这是 rejected，不要写成当前规则。 |
| 这次改了哪个文件、测试是否通过 | `.trellis/workspace/<你>/` 的 journal | 会话结束前执行对应宿主的 `remember`。 |

journal 只记过程和笔记路径。规则正文写在 spec 或 research 里。已经有同一主题的文件时，改那个文件，不要再新建一篇。

对 Agent 可以直接说：

```text
这次确认：回调必须带幂等键，重复回调直接返回第一次的结果。
先去重再记账已经试过，对账对不上，标成 rejected。
把约定写入现有 spec，研究笔记补上支付平台文档链接，然后执行 remember。
```

`remember` 会先改主题文件，再在 journal 里留下链接。新安装默认只写文件，不自动提交 Git。

## 下次会话怎么接上

新开一轮后，用同一句查询：

```bash
mini-trellis mem recall "回调 幂等"
```

先看到约定和被否决的做法，再改代码。如果上一轮做过 `/compact`，细节仍在本地会话里，`mem recall` 可以搜到压缩前的原话，再用 `mem read` 展开。

长期规则有变时，说明哪一条被替代，让 Agent 改 spec，并在旧研究笔记里写上新笔记的路径。
