"""Regression tests for the notification webhook SSRF guard.

`notification_channel` credentials are writable by any authenticated user, so the
Slack `webhook_url` they carry is attacker-controllable. `_assert_public_https_url`
must refuse non-https schemes and any host that resolves to a non-public address
(loopback / private / link-local incl. 169.254.169.254 cloud-metadata / reserved).
"""

import pytest

from app.services.notification_service import _assert_public_https_url


@pytest.mark.parametrize(
    "url",
    [
        "http://hooks.slack.com/x",                    # not https
        "ftp://hooks.slack.com/x",                     # not https
        "https://127.0.0.1/x",                         # loopback
        "https://169.254.169.254/latest/meta-data/",   # cloud metadata
        "https://localhost/x",                         # resolves to loopback
        "https://10.0.0.5/x",                          # private
        "https://192.168.1.10/x",                      # private
        "https://[::1]/x",                             # IPv6 loopback
    ],
)
def test_guard_refuses_internal_or_insecure(url):
    with pytest.raises(ValueError):
        _assert_public_https_url(url)


def test_guard_allows_public_https():
    # Literal public IP — no DNS needed, deterministic.
    _assert_public_https_url("https://8.8.8.8/services/T000/B000/xxxx")
