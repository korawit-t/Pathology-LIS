"""
Notification Service
Handles sending messages to external channels (Line, Slack, etc.)
"""

import httpx
import ipaddress
import re
import socket
from typing import Dict, Any
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

_TZ_BANGKOK = ZoneInfo("Asia/Bangkok")


def _assert_public_https_url(url: str) -> None:
    """SSRF guard for user-supplied webhook URLs. Notification-channel
    ``credentials`` are writable by any authenticated user, so an attacker could
    point ``webhook_url`` at internal infra. Only allow https URLs whose host
    resolves exclusively to public IPs — refuse loopback / private / link-local
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

# Dummy data for test messages
DUMMY_DATA = {
    "hn": "HN-TEST-001",
    "name": "นาย ทดสอบ ระบบ",
    "clinician": "นพ. ทดสอบ คลินิก",
    "id_case": "S26-TEST",
    "accession_no": "S26-TEST",
    "diagnosis": "Adenocarcinoma (TEST)",
}


def _fill_template(template: str, data: Dict[str, Any]) -> str:
    """Replace {key} placeholders in template with values from data dict."""

    def replacer(match):
        key = match.group(1)
        return str(data.get(key, "-"))

    return re.sub(r"\{(\w+)\}", replacer, template)


async def send_line_message(credentials: Dict[str, Any], message: str) -> Dict:
    """Send a message to a Line Group chat via Line Messaging API."""
    token = credentials.get("channel_access_token")
    to = credentials.get("to_user_id")

    if not token or not to:
        raise ValueError(
            "Line credentials must have 'channel_access_token' and 'to_user_id'"
        )

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://api.line.me/v2/bot/message/push",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            json={
                "to": to,
                "messages": [{"type": "text", "text": message}],
            },
            timeout=10.0,
        )
        if resp.status_code not in (200, 201):
            raise RuntimeError(f"Line API error {resp.status_code}: {resp.text}")
        return {"status": "sent", "platform": "line", "response_code": resp.status_code}


async def send_slack_message(credentials: Dict[str, Any], message: str) -> Dict:
    """Send a message to a Slack channel via Incoming Webhook."""
    webhook_url = credentials.get("webhook_url")

    if not webhook_url:
        raise ValueError("Slack credentials must have 'webhook_url'")
    _assert_public_https_url(webhook_url)

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            webhook_url,
            json={"text": message},
            timeout=10.0,
        )
        if resp.status_code not in (200, 201):
            raise RuntimeError(f"Slack Webhook error {resp.status_code}: {resp.text}")
        return {
            "status": "sent",
            "platform": "slack",
            "response_code": resp.status_code,
        }


async def send_test_notification(platform: str, credentials: Dict[str, Any]) -> Dict:
    """
    Send a test notification using dummy data.
    Fills the message_template from credentials with DUMMY_DATA,
    or uses a default test message if no template is provided.
    """
    template = credentials.get(
        "message_template",
        "🔔 [TEST] การแจ้งเตือนทดสอบจากระบบ Pathology LIS\nHN: {hn}\nชื่อ: {name}\nแพทย์: {clinician}\nCase: {id_case}",
    )
    message = _fill_template(template, DUMMY_DATA)

    if platform == "line":
        return await send_line_message(credentials, message)
    elif platform == "slack":
        return await send_slack_message(credentials, message)
    else:
        raise ValueError(f"Unsupported platform: {platform}")


def to_bangkok_str(dt) -> str:
    """Convert a datetime to Bangkok time string. Naive datetimes assumed UTC."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=ZoneInfo("UTC"))
    return dt.astimezone(_TZ_BANGKOK).strftime("%d/%m/%Y %H:%M")


def _send_line_sync(credentials: Dict[str, Any], message: str) -> None:
    token = credentials.get("channel_access_token", "")
    to = credentials.get("to_user_id", "")
    if not token or not to:
        return
    with httpx.Client() as client:
        client.post(
            "https://api.line.me/v2/bot/message/push",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json={"to": to, "messages": [{"type": "text", "text": message}]},
            timeout=5,
        )


def _send_slack_sync(credentials: Dict[str, Any], message: str) -> None:
    webhook_url = credentials.get("webhook_url", "")
    if not webhook_url:
        return
    try:
        _assert_public_https_url(webhook_url)
    except ValueError:
        return  # refuse SSRF target in the fire-and-forget path
    with httpx.Client() as client:
        client.post(webhook_url, json={"text": message}, timeout=5)


def notify_signed_out(db, data: Dict[str, Any]) -> None:
    """Sync fire-and-forget: send case_signed_out notification via all active channels."""
    try:
        from app.models.notification_rule import NotificationRule
        from app.models.notification_channel import NotificationChannel
        rule = (
            db.query(NotificationRule)
            .filter(NotificationRule.event_key == "case_signed_out", NotificationRule.is_active.is_(True))
            .first()
        )
        if not rule or not rule.channel_ids:
            return
        channels = (
            db.query(NotificationChannel)
            .filter(
                NotificationChannel.id.in_(rule.channel_ids),
                NotificationChannel.is_active.is_(True),
            )
            .all()
        )
        template = rule.message_template or (
            "🔔 รายงานออกแล้ว\nHN: {hn}\nชื่อ: {name}\nCase: {accession_no}"
        )
        message = _fill_template(template, data)
        for ch in channels:
            try:
                if ch.platform == "line":
                    _send_line_sync(ch.credentials, message)
                elif ch.platform == "slack":
                    _send_slack_sync(ch.credentials, message)
            except Exception:
                pass
    except Exception:
        pass  # never block the HTTP response


async def broadcast_to_channels(channels, template: str, data: Dict[str, Any]) -> None:
    """Send a notification to a list of channels using a template and data dict."""
    for ch in channels:
        try:
            await send_real_notification(
                platform=ch.platform,
                credentials={**ch.credentials, "message_template": template},
                data=data,
            )
        except Exception:
            pass  # ไม่ block การบันทึก


async def send_real_notification(
    platform: str, credentials: Dict[str, Any], data: Dict[str, Any]
) -> Dict:
    """
    Send a notification with real case data.
    Fills the message_template from credentials with the provided data dict.
    """
    template = credentials.get(
        "message_template",
        "🔔 แจ้งเตือนจากระบบ Pathology LIS\nHN: {hn}\nชื่อ: {name}\nแพทย์: {clinician}\nCase: {id_case}",
    )
    message = _fill_template(template, data)

    if platform == "line":
        return await send_line_message(credentials, message)
    elif platform == "slack":
        return await send_slack_message(credentials, message)
    else:
        raise ValueError(f"Unsupported platform: {platform}")
