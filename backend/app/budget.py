"""Persistent, atomic call allowance. This is not a provider dollar limit."""
from contextlib import closing
import logging
import os
from pathlib import Path
import sqlite3

logger = logging.getLogger(__name__)


class CallBudget:
    def __init__(self, path: Path, limit: int = 100):
        self.path = path
        self.limit = max(0, limit)

    @classmethod
    def from_env(cls, root: Path):
        try:
            limit = int(os.getenv("AI_MAX_CALLS", "100"))
        except ValueError:
            logger.warning("Invalid AI call allowance; paid requests disabled")
            limit = 0
        return cls(Path(os.getenv("AI_USAGE_DB", str(root / ".state" / "ai_usage.sqlite3"))), limit)

    def reserve(self) -> bool:
        """Count BEFORE the network call, including failures/timeouts. Fail closed.

        A conditional UPDATE is atomic across processes sharing this database.
        There is no automatic daily/restart/deploy reset and no HTTP reset route.
        """
        if self.limit <= 0:
            return False
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            with closing(sqlite3.connect(self.path, timeout=0.25)) as db:
                with db:
                    db.execute("CREATE TABLE IF NOT EXISTS allowance (id INTEGER PRIMARY KEY CHECK(id=1), used INTEGER NOT NULL CHECK(used>=0))")
                    db.execute("INSERT OR IGNORE INTO allowance(id, used) VALUES (1, 0)")
                    updated = db.execute("UPDATE allowance SET used=used+1 WHERE id=1 AND used<?", (self.limit,))
                    return updated.rowcount == 1
        except (OSError, sqlite3.Error):
            logger.warning("AI allowance storage unavailable; paid requests disabled")
            return False
