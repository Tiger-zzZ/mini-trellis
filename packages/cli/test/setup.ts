// Strip host-shell session env vars so the OpenCode / Trellis context
// resolvers under test fall through to platform-input-derived keys
// instead of picking up whatever the dev's terminal happens to export.
delete process.env.TRELLIS_CONTEXT_ID;

// Host agents often enable commit.gpgsign globally. SSH signing under
// parallel vitest load can hang past the suite's 10s timeout; test repos
// never need signed commits.
process.env.GIT_CONFIG_COUNT = "1";
process.env.GIT_CONFIG_KEY_0 = "commit.gpgsign";
process.env.GIT_CONFIG_VALUE_0 = "false";

// Strip CLAUDE_ENV_FILE: session-start.py appends `export TRELLIS_CONTEXT_ID=…`
// to it, so a dev running the suite inside a Claude Code session would write
// test fixture keys into their own real shell setup file.
delete process.env.CLAUDE_ENV_FILE;

// Strip *_PROJECT_DIR vars: shared-hooks/session-start.py prefers them over
// JSON cwd / process cwd, so a dev running tests inside a Claude Code /
// Copilot / etc. session would otherwise have the hook read the *real*
// repo's .trellis/ instead of the test tmpDir.
delete process.env.CLAUDE_PROJECT_DIR;
delete process.env.QODER_PROJECT_DIR;
delete process.env.CODEBUDDY_PROJECT_DIR;
delete process.env.FACTORY_PROJECT_DIR;
delete process.env.CURSOR_PROJECT_DIR;
delete process.env.GEMINI_PROJECT_DIR;
delete process.env.KIRO_PROJECT_DIR;
delete process.env.COPILOT_PROJECT_DIR;
