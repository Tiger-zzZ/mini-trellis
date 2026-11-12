"""Process lock for the complete journal/index/optional-commit operation."""

from __future__ import annotations

import errno
import os
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator


@contextmanager
def recording_lock(repo_root: Path, timeout: float = 30.0) -> Iterator[None]:
    """Bounded, OS-owned lock. A killed writer releases it automatically.

    Keep the file in place: unlinking a lock file lets waiters lock different
    inodes. Its existence (and any old PID) does not mean it is still held.
    This serializes one checkout, not uncommitted writes in other worktrees
    or direct edits to topic files.
    """
    trellis = repo_root / ".trellis"
    if not trellis.is_dir() or trellis.is_symlink():
        raise OSError("project is not initialized; no recording files were created")
    directory = trellis / ".runtime"
    lock_path = directory / "session-recording.lock"
    if not lock_path.resolve().is_relative_to(repo_root.resolve()):
        raise OSError("recording lock escapes the project")
    directory.mkdir(parents=True, exist_ok=True)
    with lock_path.open("a+b") as handle:
        if os.name == "nt":
            import msvcrt
            # Windows locks a byte range; initialize it without truncation.
            if handle.seek(0, os.SEEK_END) == 0:
                handle.write(b"\0")
                handle.flush()

            def acquire() -> None:
                handle.seek(0)
                msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)

            def release() -> None:
                handle.seek(0)
                msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
        else:
            import fcntl

            def acquire() -> None:
                fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)

            def release() -> None:
                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)

        deadline = time.monotonic() + timeout
        while True:
            try:
                acquire()
                break
            except OSError as exc:
                if exc.errno not in (errno.EACCES, errno.EAGAIN, errno.EDEADLK):
                    raise
                if time.monotonic() >= deadline:
                    raise TimeoutError(
                        f"recording lock busy: {lock_path}; another writer may "
                        "still be running. Retry after it finishes; do not delete the lock file."
                    ) from exc
                time.sleep(0.05)
        try:
            yield
        finally:
            release()
