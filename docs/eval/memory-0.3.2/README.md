# 记忆对比夹具 0.3.2

同一份合成笔记，四道题。笔记在 `notes/`。评分时复制进临时仓库的 `.trellis/research/`，再跑 `mem recall`。这里没有私人仓库里的模块名。

比较对象：

| 对象 | 这一版怎么记 |
| --- | --- |
| mini-trellis 0.3.1 | 只跑 `mem recall`。完整代理回路没有跑。 |
| Trellis 0.7.0-beta.4 | 这个快照带阶段流程。完整代理回路没有跑。 |
| Comet | 没有能在这份笔记上跑的环境。不写百分比。 |

每题重复 3 次。`mem recall` 记下对错、墙钟、现行笔记是否在前三条、被替代笔记是否靠后、无依据时是否零命中，以及召回 JSON 的字符数。轮次、宿主输入 / 输出 / 缓存 token 留空。没有用分词器换算。失败和超时分开记；这次召回没有失败。不用 v0.2.1 的旧验收填表。v0.2.2 的 4,910 对 37,619 字符仍是注入量，不是这张表。

`notes/compact-demo.md` 把「4 attempts」放在压缩边界前面。边界后的摘要没有这个数字。它不是宿主会话文件。

评分脚本是 `packages/cli/test/eval/score-memory.ts`。

```bash
pnpm --filter mini-trellis exec vitest run test/eval/memory-fixture.test.ts
```

设置 `MEMORY_EVAL_OUT` 时，同一次测试把召回结果写成 JSON。
