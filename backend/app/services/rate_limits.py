"""Small process-local limits; platform-wide controls are layered at deployment."""

from __future__ import annotations

from collections import defaultdict, deque
from collections.abc import Callable
from threading import Lock
from time import monotonic


class SlidingWindowRateLimiter:
    def __init__(
        self,
        limit: int,
        window_seconds: float,
        *,
        clock: Callable[[], float] = monotonic,
        max_keys: int = 10_000,
    ) -> None:
        if limit < 1 or window_seconds <= 0 or max_keys < 1:
            raise ValueError("Rate limit and window must be positive")
        self._limit = limit
        self._window_seconds = window_seconds
        self._clock = clock
        self._max_keys = max_keys
        self._entries: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def allow(self, key: str) -> bool:
        now = self._clock()
        cutoff = now - self._window_seconds
        with self._lock:
            if key not in self._entries and len(self._entries) >= self._max_keys:
                for old_key, old_entries in list(self._entries.items()):
                    if not old_entries or old_entries[-1] <= cutoff:
                        del self._entries[old_key]
                if len(self._entries) >= self._max_keys:
                    return False
            entries = self._entries[key]
            while entries and entries[0] <= cutoff:
                entries.popleft()
            if len(entries) >= self._limit:
                return False
            entries.append(now)
            return True
