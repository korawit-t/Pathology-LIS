import ipaddress
import socket
from urllib.parse import urlparse


def assert_public_https_url(url: str) -> None:
    """SSRF guard for user-supplied outbound URLs (notification webhooks, HIS
    export webhooks, etc). Only allow https URLs whose host resolves
    exclusively to public IPs — refuse loopback / private / link-local
    (incl. 169.254.169.254 cloud-metadata) / reserved targets."""
    parsed = urlparse(url)
    if parsed.scheme != "https":
        raise ValueError("Webhook URL must use https")
    host = parsed.hostname
    if not host:
        raise ValueError("Webhook URL has no host")
    try:
        addrinfos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        raise ValueError(f"Cannot resolve webhook host: {host}")
    for info in addrinfos:
        ip = ipaddress.ip_address(info[4][0])
        if not ip.is_global or ip.is_reserved:
            raise ValueError(
                f"Webhook URL resolves to a non-public address ({ip}); refused (SSRF guard)"
            )
