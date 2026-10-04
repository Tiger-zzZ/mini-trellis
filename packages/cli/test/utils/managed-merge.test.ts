import { describe, expect, it } from "vitest";
import {
  mergeJsonValues,
  mergeManagedBlock,
} from "../../src/utils/managed-merge.js";

describe("managed merge helpers", () => {
  it("replaces only the managed AGENTS block", () => {
    const existing =
      "# My rules\n\n<!-- TRELLIS:START -->\nold\n<!-- TRELLIS:END -->\n\nKeep this.";
    const managed = "<!-- TRELLIS:START -->\nnew\n<!-- TRELLIS:END -->";
    expect(
      mergeManagedBlock(
        existing,
        managed,
        "<!-- TRELLIS:START -->",
        "<!-- TRELLIS:END -->",
      ),
    ).toBe(
      "# My rules\n\n<!-- TRELLIS:START -->\nnew\n<!-- TRELLIS:END -->\n\nKeep this.\n",
    );
  });

  it("appends a managed block without dropping existing instructions", () => {
    expect(
      mergeManagedBlock(
        "# My rules\n",
        "<!-- TRELLIS:START -->\nmini\n<!-- TRELLIS:END -->",
        "<!-- TRELLIS:START -->",
        "<!-- TRELLIS:END -->",
      ),
    ).toBe(
      "# My rules\n\n<!-- TRELLIS:START -->\nmini\n<!-- TRELLIS:END -->\n",
    );
  });

  it("preserves user JSON values and adds missing arrays", () => {
    expect(
      mergeJsonValues(
        { permissions: { allow: ["Read"] }, hooks: [] },
        { permissions: { deny: ["Bash"] }, hooks: [{ event: "SessionStart" }] },
      ),
    ).toEqual({
      permissions: { allow: ["Read"], deny: ["Bash"] },
      hooks: [{ event: "SessionStart" }],
    });
  });
});
