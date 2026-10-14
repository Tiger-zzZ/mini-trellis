/**
 * Document discovery and unified recall.
 *
 * Fixtures are synthetic files in a temp git repo. No real session store is
 * touched: dialogue coverage lives in the adapter suites.
 */

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { discoverDocs } from "../../src/mem/docs.js";
import { excerptAround, queryTerms } from "../../src/mem/lexical.js";
import { MEM_PLATFORMS } from "../../src/mem/platforms.js";
import { readMemRefs, recallMem } from "../../src/mem/recall.js";

let root: string;

function write(rel: string, body: string): void {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body);
}

beforeEach(() => {
  for (const adapter of Object.values(MEM_PLATFORMS))
    vi.spyOn(adapter, "list").mockReturnValue([]);
  root = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-recall-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(root, { recursive: true, force: true });
});

describe("queryTerms", () => {
  it("keeps a Chinese query term whole and adds bigrams", () => {
    const terms = queryTerms("幂等性");
    expect(terms).toContain("幂等性");
    expect(terms).toContain("幂等");
  });

  it("normalizes case per token", () => {
    const terms = queryTerms("Retry Budget");
    expect(terms).toContain("retry");
    expect(terms).toContain("budget");
  });
});

describe("recall relevance and safe dedupe", () => {
  it("recalls an exact document path even when its body does not repeat the filename", () => {
    write("docs/retry_budget.md", "# Limits\nUse at most two attempts.\n");
    const result = recallMem({ cwd: root, query: "docs/retry_budget.md" });
    expect(result.hits[0]?.path).toBe("docs/retry_budget.md");
    expect(result.hits[0]?.strength).toBe("strong");
    const ref = result.hits[0]?.ref;
    expect(ref).toBeDefined();
    const expanded = readMemRefs({ cwd: root, refs: ref ? [ref] : [] });
    expect(expanded.reads[0]?.text).toContain("at most two attempts");
  });

  it("prefers a relevant heading over a passing body mention", () => {
    write("docs/a.md", "# Miscellaneous\nAn example mentions retry budget.\n");
    write("docs/z.md", "# Retry budget\nUse at most two attempts.\n");
    const result = recallMem({ cwd: root, query: "retry budget" });
    expect(result.hits[0]?.path).toBe("docs/z.md");
    expect(result.hits[0]?.title).toBe("Retry budget");
  });

  it("keeps equal excerpts from different speakers and different surrounding decisions", () => {
    const adapter = MEM_PLATFORMS.claude;
    vi.mocked(adapter.list).mockReturnValue([
      { id: "safe-dedupe", platform: "claude", cwd: root, filePath: "synthetic" },
    ]);
    vi.spyOn(adapter, "extract").mockReturnValue([
      { role: "user", text: "retry budget = 2" },
      { role: "assistant", text: "retry budget = 2" },
      { role: "user", text: "No, not for writes." },
      { role: "assistant", text: "retry budget = 2" },
    ]);
    const result = recallMem({ cwd: root, query: "retry budget", limit: 10, maxChars: 10000 });
    expect(result.hits.map((hit) => hit.turn)).toEqual([0, 1, 3]);
  });
});

describe("discoverDocs", () => {
  it("caps large knowledge collections and reports the scan as incomplete", () => {
    for (let i = 0; i < 1001; i++) write(`.trellis/research/topic-${i}.md`, `# Topic ${i}\nneedle\n`);
    const found = discoverDocs(root);
    expect(found.docs).toHaveLength(1000);
    expect(found.warnings.some(w => w.code === "doc-search-incomplete")).toBe(true);
    const recalled = recallMem({ cwd: root, query: "needle" });
    expect(recalled.incomplete).toBe(true);
    expect(recalled.hits.length).toBeGreaterThan(0);
  });

  it("reports a depth-limited scan instead of claiming deep documents do not exist", () => {
    write(`.trellis/spec/${"nested/".repeat(10)}decision.md`, "# Deep\nneedle\n");
    const found = recallMem({ cwd: root, query: "needle" });
    expect(found.incomplete).toBe(true);
    expect(found.hits).toEqual([]);
  });

  it("does not mark scan incomplete when deep directories beyond depth cap contain only non-Markdown data files", () => {
    write(".trellis/research/topic.md", "# Topic\n\nneedle\n");
    write(
      `.trellis/research/${"nested/".repeat(10)}raw.json`,
      "{\"status\":\"ok\"}\n",
    );
    const found = recallMem({ cwd: root, query: "needle" });
    expect(found.incomplete).toBe(false);
    expect(found.warnings).toEqual([]);
    expect(found.hits[0]?.path).toBe(".trellis/research/topic.md");
  });

  it("reads trellis even when gitignored, plus docs and one link level", () => {
    write(".gitignore", ".trellis/\n");
    write(".trellis/spec/billing.md", "# Billing\n\n支付接口必须幂等。\n");
    write(
      ".trellis/research/archive/old.md",
      "# Old\n\nEarlier cadence was weekly.\n",
    );
    write("README.md", "# Proj\n\nSee [limits](docs/limits.md).\n");
    write("docs/limits.md", "# Limits\n\nUpload limit is 25 MB.\n");
    write("docs/limits.md", "# Limits\n\nSee [extra](extra/detail.md).\n");
    write("docs/extra/detail.md", "# Detail\n\nThe default port is 8443.\n");
    write("node_modules/pkg/README.md", "# Dep\n\nnot a project doc\n");
    write("notes/secret.env", "TOKEN=nope\n");

    const found = discoverDocs(root);
    const rels = found.docs.map((d) => d.relPath).sort();

    expect(rels).toContain(".trellis/spec/billing.md");
    expect(rels).toContain("docs/extra/detail.md");
    expect(rels.some((r) => r.includes("node_modules"))).toBe(false);
    expect(rels.some((r) => r.endsWith(".env"))).toBe(false);

    const archived = found.docs.find((d) => d.relPath.endsWith("old.md"));
    expect(archived?.archived).toBe(true);
  });

  it("does not mark search incomplete when already-discovered trellis notes have >200 internal cross-links", () => {
    for (let i = 0; i < 30; i++) {
      const links = Array.from(
        { length: 10 },
        (_, j) => `[link-${j}](./topic-${(i + j) % 30}.md) [data](./fixture-${j}.json)`,
      ).join(" ");
      write(`.trellis/research/topic-${i}.md`, `# Topic ${i}\n\n${links}\n`);
    }
    const found = discoverDocs(root);
    expect(found.docs).toHaveLength(30);
    expect(found.warnings).toEqual([]);
  });

  it("marks migrated legacy task files as archived and ranks active research notes ahead of them", () => {
    write(
      ".trellis/research/08-15-flow-impact/legacy/prd.md",
      "# Goal\n\nTransco capacity flow impact baseline.\n",
    );
    write(
      ".trellis/research/08-15-flow-impact/research/validation.md",
      "# Goal\n\nTransco capacity flow impact verified.\n",
    );
    const result = recallMem({
      cwd: root,
      query: "Transco capacity flow impact",
      limit: 2,
    });
    expect(result.hits[0]?.path).toBe(
      ".trellis/research/08-15-flow-impact/research/validation.md",
    );
    expect(result.hits[0]?.status).toBeUndefined();
    expect(result.hits[1]?.path).toBe(
      ".trellis/research/08-15-flow-impact/legacy/prd.md",
    );
    expect(result.hits[1]?.status).toBe("archived");
  });

  it("resolves a subdirectory to the same root", () => {
    write("docs/guide.md", "# Guide\n\nhello\n");
    fs.mkdirSync(path.join(root, "src"));
    const fromSub = discoverDocs(path.join(root, "src"));
    // git reports the real path, which on macOS resolves /var to /private/var.
    expect(fs.realpathSync(fromSub.root)).toBe(fs.realpathSync(root));
    expect(fromSub.docs.map((d) => d.relPath)).toContain("docs/guide.md");
  });

  it("does not follow a symlink out of the project", () => {
    write("docs/inside.md", "# Inside\n");
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-outside-"));
    fs.writeFileSync(path.join(outside, "secret.md"), "# Secret\n");
    fs.symlinkSync(outside, path.join(root, "docs", "linked"));
    const rels = discoverDocs(root).docs.map((d) => d.relPath);
    expect(rels.some((r) => r.includes("secret"))).toBe(false);
    fs.rmSync(outside, { recursive: true, force: true });
  });

  it("finds documents in a non-git project reached through a symlinked prefix", () => {
    // `consider` compares realpaths; a root kept as the symlinked spelling
    // (macOS /tmp → /private/tmp, /var → /private/var) would make every file
    // look like it escaped the project and drop the whole tree.
    const actual = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-nogit-"));
    const alias = path.join(
      os.tmpdir(),
      `trellis-alias-${process.pid}-${Date.now()}`,
    );
    try {
      fs.mkdirSync(path.join(actual, "docs"));
      fs.writeFileSync(
        path.join(actual, "docs", "guide.md"),
        "# Guide\n\nhello\n",
      );
      fs.symlinkSync(actual, alias);
      const found = discoverDocs(alias);
      expect(found.git).toBe(false);
      expect(found.docs.map((d) => d.relPath)).toContain("docs/guide.md");
      expect(found.root).toBe(fs.realpathSync(actual));
    } finally {
      fs.rmSync(alias, { force: true });
      fs.rmSync(actual, { recursive: true, force: true });
    }
  });
});

describe("recallMem", () => {
  it("returns a bounded doc hit with its location", () => {
    write("docs/limits.md", "# Limits\n\nThe upload size limit is 25 MB.\n");
    const result = recallMem({ query: "upload size limit", cwd: root });
    expect(result.hits.length).toBeGreaterThan(0);
    const hit = result.hits[0];
    expect(hit?.sourceKind).toBe("doc");
    expect(hit?.path).toBe("docs/limits.md");
    expect(hit?.excerpt).toContain("25 MB");
    expect(hit?.strength).toBe("strong");
  });

  it("marks an archived research hit", () => {
    write(
      ".trellis/research/archive/cadence.md",
      "# Cadence\n\nThe release cadence was weekly.\n",
    );
    const result = recallMem({ query: "release cadence", cwd: root });
    expect(result.hits[0]?.status).toBe("archived");
  });

  it("marks a partial overlap as weak and prefers full coverage", () => {
    write("docs/full.md", "# Full\n\nThe upload size limit is 25 MB.\n");
    write("docs/partial.md", "# Partial\n\nThe upload failed.\n");
    const result = recallMem({
      query: "upload size limit",
      cwd: root,
      limit: 3,
    });
    const full = result.hits.find((h) => h.path === "docs/full.md");
    const partial = result.hits.find((h) => h.path === "docs/partial.md");
    expect(full?.strength).toBe("strong");
    expect(partial).toBeUndefined();
  });

  it("falls back to one weak match when nothing covers the whole query", () => {
    write("docs/partial.md", "# Partial\n\nThe upload failed.\n");
    const result = recallMem({ query: "upload size limit", cwd: root });
    expect(result.hits).toHaveLength(1);
    expect(result.hits[0]?.strength).toBe("weak");
  });

  it("reports no match instead of inventing one", () => {
    write("docs/guide.md", "# Guide\n\nNothing relevant here.\n");
    const result = recallMem({ query: "kubernetes operator", cwd: root });
    expect(result.hits).toEqual([]);
    expect(result.incomplete).toBe(false);
  });

  it("expands a doc ref back to its source", () => {
    write("docs/limits.md", "# Limits\n\nThe upload size limit is 25 MB.\n");
    const result = recallMem({ query: "upload size", cwd: root });
    const ref = result.hits[0]?.ref;
    expect(ref).toBeDefined();
    const read = readMemRefs({ refs: [ref ?? ""], cwd: root });
    expect(read.reads[0]?.text).toContain("25 MB");
    expect(read.warnings).toEqual([]);
  });

  it("refuses a ref that escapes the project", () => {
    const read = readMemRefs({ refs: ["doc:../secret.md:1"], cwd: root });
    expect(read.reads).toEqual([]);
    expect(read.warnings[0]?.code).toBe("ref-invalid");
  });
});

function docRef(rel: string): string {
  return `doc:v1:${Buffer.from(JSON.stringify({ kind: "doc", path: rel, start: 0, end: 1, hash: "0".repeat(24) })).toString("base64url")}`;
}

describe("review regressions: source boundaries and evidence", () => {
  it("applies ignore and exclusion policy to links, root files and aliases", () => {
    write(".gitignore", "docs/private.md\nCLAUDE.md\n");
    write("docs/private.md", "secret notes");
    write("CLAUDE.md", "ignored root");
    write("node_modules/pkg/README.md", "dependency");
    write(".hidden/note.md", "hidden");
    write(
      "README_CN.md",
      "[private](docs/private.md) [dep](node_modules/pkg/README.md) [hidden](.hidden/note.md)",
    );
    fs.symlinkSync(
      path.join(root, "docs/private.md"),
      path.join(root, "docs/alias.md"),
    );
    expect(discoverDocs(root).docs.map((d) => d.relPath)).toEqual([
      "README_CN.md",
    ]);
  });

  it("rejects external symlinks and arbitrary files through versioned read refs", () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "recall-outside-"));
    try {
      fs.writeFileSync(path.join(outside, "note.md"), "outside");
      write(".env", "SYNTHETIC_ENV");
      fs.symlinkSync(
        path.join(outside, "note.md"),
        path.join(root, "README.md"),
      );
      const result = readMemRefs({
        cwd: root,
        refs: [docRef("README.md"), docRef(".env"), docRef("../note.md")],
      });
      expect(result.reads).toEqual([]);
      expect(result.warnings).toHaveLength(3);
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it("rejects a previously discovered file replaced by an external symlink", () => {
    write("docs/rule.md", "approved refund");
    const ref =
      recallMem({ cwd: root, query: "approved refund" }).hits[0]?.ref ?? "";
    const outside = fs.mkdtempSync(
      path.join(os.tmpdir(), "recall-replacement-"),
    );
    try {
      fs.writeFileSync(path.join(outside, "note.md"), "outside");
      fs.unlinkSync(path.join(root, "docs/rule.md"));
      fs.symlinkSync(
        path.join(outside, "note.md"),
        path.join(root, "docs/rule.md"),
      );
      expect(readMemRefs({ cwd: root, refs: [ref] }).reads).toEqual([]);
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it("expands the actual late evidence instead of the first token occurrence", () => {
    write(
      "docs/decision.md",
      "# Intro\nalpha\n" +
        "filler\n".repeat(100) +
        "# Decision\nalpha beta RELEASE_ALLOWED",
    );
    const hit = recallMem({ cwd: root, query: "alpha beta" }).hits[0];
    expect(hit?.section).toBe("Decision");
    expect(hit?.line).toBeGreaterThan(100);
    const read = readMemRefs({ cwd: root, refs: [hit?.ref ?? ""] });
    expect(read.reads[0]?.text).toContain("RELEASE_ALLOWED");
  });

  it("marks same-line-count replacement as changed and does not return unrelated evidence", () => {
    write("docs/decision.md", "# Decision\n\nPayment refund approved.");
    const hit = recallMem({ cwd: root, query: "Payment refund" }).hits[0];
    write("docs/decision.md", "# Decision\n\nUnrelated replacement.");
    const result = readMemRefs({ cwd: root, refs: [hit?.ref ?? ""] });
    expect(result.reads[0]?.changed).toBe(true);
    expect(result.reads[0]?.text).toBe("");
    expect(result.warnings.some((w) => w.code === "ref-changed")).toBe(true);
  });

  it("reports moved or deleted sources without throwing", () => {
    write("docs/decision.md", "refund approved");
    const ref = recallMem({ cwd: root, query: "refund" }).hits[0]?.ref ?? "";
    fs.renameSync(
      path.join(root, "docs/decision.md"),
      path.join(root, "docs/moved.md"),
    );
    const result = readMemRefs({ cwd: root, refs: [ref] });
    expect(result.reads).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("ranks greater query coverage ahead of three first-token-only candidates", () => {
    for (let i = 0; i < 3; i++) write(`docs/a${i}.md`, "alpha");
    write("docs/z.md", "alpha beta");
    const result = recallMem({ cwd: root, query: "alpha beta gamma" });
    expect(result.hits[0]?.path).toBe("docs/z.md");
    expect(result.hits[0]?.strength).toBe("weak");
    expect(result.incomplete).toBe(false);
    expect(result.truncated).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it("keeps no-shared-word lexical misses explicit", () => {
    write("docs/payment.md", "避免重复扣款");
    expect(recallMem({ cwd: root, query: "幂等" }).hits).toEqual([]);
  });

  it("honors the complete evidence record budget including refs", () => {
    write("docs/long.md", "needle " + "padding ".repeat(300));
    for (const maxChars of [0, 10, 400, 800]) {
      const result = recallMem({ cwd: root, query: "needle", maxChars });
      expect(
        result.hits.reduce((n, h) => n + JSON.stringify(h).length, 0),
      ).toBeLessThanOrEqual(maxChars);
      if (maxChars < 800) expect(result.truncated).toBe(true);
    }
  });

  it("applies read budget across a batch, not once per ref", () => {
    write("docs/a.md", "needle " + "abc ".repeat(1000));
    write("docs/b.md", "needle " + "def ".repeat(1000));
    const refs = recallMem({ cwd: root, query: "needle" }).hits.map(
      (h) => h.ref,
    );
    const result = readMemRefs({ cwd: root, refs, maxChars: 1000 });
    expect(result.reads).toHaveLength(2);
    expect(result.reads.every((r) => r.text.includes("needle"))).toBe(true);
    expect(
      result.reads.reduce((n, r) => n + JSON.stringify(r).length, 0),
    ).toBeLessThanOrEqual(1000);
    expect(result.truncated).toBe(true);
  });

  it("maps compatibility ligatures and combining sequences to original offsets", () => {
    for (const prefix of [
      "ﬃ".repeat(300),
      "e\u0301".repeat(300),
      "Ａ".repeat(300),
    ]) {
      const text = prefix + " TARGET_DECISION " + "x".repeat(500);
      const w = excerptAround(text, ["target_decision"], 80);
      expect(w.excerpt).toContain("TARGET_DECISION");
      expect(text.slice(w.anchorStart, w.anchorEnd)).toBe("TARGET_DECISION");
      expect(w.excerpt.length).toBeLessThanOrEqual(80);
    }
  });

  it("reports skipped large files as an incomplete scan, not an empty complete result", () => {
    write("docs/large.md", "needle" + "x".repeat(1_000_001));
    const result = recallMem({ cwd: root, query: "needle" });
    expect(result.hits).toEqual([]);
    expect(result.incomplete).toBe(true);
    expect(result.truncated).toBe(false);
    expect(result.warnings[0]?.code).toBe("doc-too-large");
  });

  it("reports invalid refs rather than silently returning nothing", () => {
    const result = readMemRefs({
      cwd: root,
      refs: ["doc:v1:broken", "session:bad", "nonsense"],
    });
    expect(result.reads).toEqual([]);
    expect(result.warnings).toHaveLength(3);
  });

  it("preserves a dialogue hit when a preceding turn exceeds the entire read budget", () => {
    vi.mocked(MEM_PLATFORMS.claude.list).mockReturnValue([
      {
        id: "synthetic",
        platform: "claude",
        cwd: root,
        filePath: "synthetic.jsonl",
      },
    ]);
    const extract = vi.spyOn(MEM_PLATFORMS.claude, "extract").mockReturnValue([
      { role: "user", text: "background ".repeat(1000) },
      { role: "assistant", text: "needle CONFIRMED_DECISION" },
      { role: "user", text: "Only for test accounts." },
    ]);
    const ref = recallMem({ cwd: root, query: "needle" }).hits[0]?.ref ?? "";
    const result = readMemRefs({ cwd: root, refs: [ref] });
    expect(result.reads[0]?.text).toContain(
      "assistant: needle CONFIRMED_DECISION",
    );
    expect(result.reads[0]?.text).toContain("user: Only for test accounts.");
    expect(result.reads[0]?.truncated).toBe(true);
    extract.mockReturnValue([{ role: "user", text: "rewritten conversation" }]);
    expect(readMemRefs({ cwd: root, refs: [ref] }).reads[0]?.changed).toBe(
      true,
    );
  });
  it("refuses a session ref from another project even when its id is known", () => {
    vi.mocked(MEM_PLATFORMS.claude.list).mockReturnValue([
      {
        id: "foreign",
        platform: "claude",
        cwd: root + "-other",
        filePath: "foreign.jsonl",
      },
    ]);
    const extract = vi.spyOn(MEM_PLATFORMS.claude, "extract");
    const ref =
      "session:v1:" +
      Buffer.from(
        JSON.stringify({
          kind: "session",
          platform: "claude",
          id: "foreign",
          turn: 0,
          start: 0,
          end: 1,
          hash: "0".repeat(24),
        }),
      ).toString("base64url");
    const result = readMemRefs({ cwd: root, refs: [ref] });
    expect(result.reads).toEqual([]);
    expect(result.warnings.some((w) => w.code === "ref-missing")).toBe(true);
    expect(extract).not.toHaveBeenCalled();
  });

  it("keeps the lexical fallback and original offsets without Intl.Segmenter", async () => {
    const original = Intl.Segmenter;
    try {
      Object.defineProperty(Intl, "Segmenter", {
        configurable: true,
        writable: true,
        value: undefined,
      });
      vi.resetModules();
      const fallback = await import("../../src/mem/lexical.js");
      expect(fallback.queryTerms("支付接口幂等性")).toContain("幂等");
      expect(
        fallback.excerptAround(
          "e\u0301".repeat(100) + " TARGET " + "end".repeat(100),
          ["target"],
          40,
        ).excerpt,
      ).toContain("TARGET");
    } finally {
      Object.defineProperty(Intl, "Segmenter", {
        configurable: true,
        writable: true,
        value: original,
      });
      vi.resetModules();
    }
  });
});
