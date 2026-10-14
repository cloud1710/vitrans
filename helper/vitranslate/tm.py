"""Translation memory keyed by model + pack + tagged source: translates duplicates once and resumes jobs."""
import hashlib
import sqlite3
import threading


class TM:
    def __init__(self, path):
        self._lock = threading.Lock()
        self._db = sqlite3.connect(str(path), check_same_thread=False)
        self._db.execute("PRAGMA journal_mode=WAL")
        self._db.execute("PRAGMA synchronous=NORMAL")
        self._db.execute("CREATE TABLE IF NOT EXISTS tm (key TEXT PRIMARY KEY, out TEXT NOT NULL, level INTEGER NOT NULL)")
        self._db.execute("PRAGMA user_version=1")
        self._db.commit()

    @staticmethod
    def key(model, pack_key, tagged):
        raw = "\0".join((model, pack_key, tagged))
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()

    def get(self, key):
        with self._lock:
            row = self._db.execute("SELECT out, level FROM tm WHERE key = ?", (key,)).fetchone()
        return (row[0], row[1]) if row else None

    def put(self, key, out, level):
        if not out or not out.strip():
            return  # an empty result is a failure, never a cache entry
        with self._lock:
            self._db.execute("INSERT OR REPLACE INTO tm (key, out, level) VALUES (?, ?, ?)", (key, out, level))
            self._db.commit()

    def close(self):
        with self._lock:
            self._db.close()
