from fastapi.testclient import TestClient

from app.application import create_app
from app.config import Settings
from app.services.rate_limits import SlidingWindowRateLimiter


def test_browser_security_headers_cover_success_and_rejection() -> None:
    client = TestClient(create_app(Settings()))
    for response in [client.get("/api/v1/health"), client.get("/api/v1/missing")]:
        assert response.headers["x-content-type-options"] == "nosniff"
        assert response.headers["x-frame-options"] == "DENY"
        assert "frame-ancestors 'none'" in response.headers["content-security-policy"]
        assert response.headers["referrer-policy"] == "no-referrer"


def test_limiter_bounds_unique_clients_without_resetting_active_budgets() -> None:
    now = [0.0]
    limiter = SlidingWindowRateLimiter(1, 60, clock=lambda: now[0], max_keys=2)
    assert limiter.allow("one")
    assert limiter.allow("two")
    assert not limiter.allow("three")
    assert not limiter.allow("one")
    now[0] = 61
    assert limiter.allow("three")
    assert limiter.allow("one")
