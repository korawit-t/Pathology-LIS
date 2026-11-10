"""
Notification Service
Handles sending messages to external channels (Line, Slack, MOPH Notify, etc.)
"""

import httpx
import logging
import re
from typing import Dict, Any, Tuple
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

from app.utils.network_security import assert_public_https_url as _assert_public_https_url
from app.utils.patient_name import short_person_name

logger = logging.getLogger(__name__)

_TZ_BANGKOK = ZoneInfo("Asia/Bangkok")

# MOPH Notify (หมอพร้อม bot in a LINE group), per MOPH's "API Document MOPH
# Notify". Not MOPH Alert — that one (morpromt2c, /alert/v3.1/messages)
# pushes to one person by CID and cannot reach a group.
MOPH_NOTIFY_DEFAULT_BASE_URL = "https://morpromt2f.moph.go.th"
_MOPH_NOTIFY_SEND_PATH = "/api/notify/send"

# Every reply is {"message": ..., "message_code": ...}; only 200 is a send.
# The document lists the failures under message_code 401 without saying
# which HTTP status carries them, so the body decides, not the status alone.
_MOPH_NOTIFY_ERROR_HINTS = {
    "unauthorized": "client-key or secret-key is wrong",
    "messages error": "the message is not in a format LINE accepts",
    "send messages error": "MOPH Notify could not deliver the message",
    "require messages": "the request had no messages",
}

# Dummy data for test messages
DUMMY_DATA = {
    "hn": "HN-TEST-001",
    "name": "นาย ทดสอบ ระบบ",
    "clinician": "นพ. ทดสอบ คลินิก",
    "id_case": "S26-TEST",
    "accession_no": "S26-TEST",
    "diagnosis": "Adenocarcinoma (TEST)",
    "specimen": "Colonic mucosa, sigmoid colon, colonoscopy biopsy (TEST)",
}


def _fill_template(template: str, data: Dict[str, Any]) -> str:
    """Replace {key} placeholders in template with values from data dict.

    {name_short} and {clinician_short} are derived here from {name} and
    {clinician}, so every event offers them whatever built its data — the
    backend or a frontend trigger. A value the caller passes itself wins.
    """
    values = dict(data)
    for full_key, short_key in (("name", "name_short"), ("clinician", "clinician_short")):
        if short_key not in values and full_key in values:
            values[short_key] = short_person_name(values[full_key])

    def replacer(match):
        key = match.group(1)
        return str(values.get(key, "-"))

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


def _moph_notify_request(credentials: Dict[str, Any], message: str) -> Tuple[str, Dict[str, str], Dict[str, Any]]:
    """(url, headers, body) for one MOPH Notify send.

    The keys come from the หน่วยบริการ menu of the MOPH Notify CMS. The
    request names no group: which LINE group gets the message is decided on
    MOPH's side by those keys. `base_url` is optional (MOPH also runs a UAT
    host); it must stay on moph.go.th — the keys ride on every request and
    must never go anywhere else.
    """
    client_key = credentials.get("client_key")
    secret_key = credentials.get("secret_key")
    if not client_key or not secret_key:
        raise ValueError("MOPH Notify credentials must have 'client_key' and 'secret_key'")

    base_url = str(credentials.get("base_url") or MOPH_NOTIFY_DEFAULT_BASE_URL).rstrip("/")
    parsed = urlparse(base_url)
    host = (parsed.hostname or "").lower()
    # "@" and "\" are refused outright: urlparse and httpx can disagree on
    # which host "https://evil.example\@x.moph.go.th" names.
    if (
        parsed.scheme != "https"
        or "@" in parsed.netloc
        or "\\" in base_url
        or not (host == "moph.go.th" or host.endswith(".moph.go.th"))
    ):
        raise ValueError("MOPH Notify base_url must be an https URL on moph.go.th")

    headers = {
        "Content-Type": "application/json",
        "client-key": str(client_key),
        "secret-key": str(secret_key),
    }
    body = {"messages": [{"type": "text", "text": message}]}
    return f"{base_url}{_MOPH_NOTIFY_SEND_PATH}", headers, body


def _moph_notify_failure(resp) -> str:
    """Why a MOPH Notify reply is not a successful send, or "" if it is one."""
    try:
        reply = resp.json()
    except ValueError:
        reply = None
    if not isinstance(reply, dict):
        reply = {}
    code = reply.get("message_code")
    if 200 <= resp.status_code < 300 and str(code) == "200":
        return ""
    text = str(reply.get("message") or resp.text[:300]).strip()
    detail = f"{text} (message_code={code}, HTTP {resp.status_code})"
    hint = _MOPH_NOTIFY_ERROR_HINTS.get(text.lower())
    return f"{detail}: {hint}" if hint else detail


async def send_moph_notify_message(credentials: Dict[str, Any], message: str) -> Dict:
    """Send a message to a LINE group through MOPH Notify (หมอพร้อม bot)."""
    url, headers, body = _moph_notify_request(credentials, message)

    async with httpx.AsyncClient() as client:
        resp = await client.post(url, headers=headers, json=body, timeout=10.0)
    failure = _moph_notify_failure(resp)
    if failure:
        raise RuntimeError(f"MOPH Notify refused the message: {failure}")
    return {"status": "sent", "platform": "moph_notify", "response_code": resp.status_code}


async def _send_via_platform(platform: str, credentials: Dict[str, Any], message: str) -> Dict:
    if platform == "line":
        return await send_line_message(credentials, message)
    if platform == "slack":
        return await send_slack_message(credentials, message)
    if platform == "moph_notify":
        return await send_moph_notify_message(credentials, message)
    raise ValueError(f"Unsupported platform: {platform}")


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
    return await _send_via_platform(platform, credentials, message)


def to_bangkok_str(dt) -> str:
    """Convert a datetime to Bangkok time string. Naive datetimes assumed UTC."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=ZoneInfo("UTC"))
    return dt.astimezone(_TZ_BANGKOK).strftime("%d/%m/%Y %H:%M")


_THAI_MONTH_ABBR = (
    "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
    "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
)

_APPT_NONE_LINE = "\n\n📅 ⚠️ ไม่พบนัดล่วงหน้าในระบบ"


def _thai_date(iso_date: str) -> str:
    """'2026-08-24' -> '24 ส.ค. 69' (Buddhist era, 2-digit year).

    Matches how appointment dates are written by hand in HOSxP's own note
    field ('17/8/69'), so staff read one convention across the message.
    Returns the input unchanged if it isn't a parseable ISO date.
    """
    try:
        y, m, d = (int(p) for p in iso_date.split("-"))
        return f"{d} {_THAI_MONTH_ABBR[m - 1]} {(y + 543) % 100:02d}"
    except (ValueError, IndexError, AttributeError):
        return str(iso_date)


def _appt_time(raw: str) -> str:
    """'7:00:00' / '07:00:00' -> '07:00'. Empty for midnight (HOSxP's 'no
    time set') and for anything unparseable."""
    if not raw:
        return ""
    parts = str(raw).split(":")
    if len(parts) < 2:
        return ""
    try:
        h, mi = int(parts[0]), int(parts[1])
    except ValueError:
        return ""
    return "" if (h == 0 and mi == 0) else f"{h:02d}:{mi:02d}"


def format_appointment_block(appointments) -> str:
    """Render the '📅 นัดที่ยังมาไม่ถึง' fragment appended to a notification.

    Returns a string starting with blank lines so it can be concatenated onto
    any template without leaving a stray gap when there is nothing to add.
    An empty *list* means the patient genuinely has no upcoming appointment
    and gets the warning line — callers must pass None instead when the HIS
    could not be reached, since "we could not check" must never be shown as
    "this patient has no appointment".
    """
    if appointments is None:
        return ""
    if not appointments:
        return _APPT_NONE_LINE

    shown, extra = appointments[:5], max(0, len(appointments) - 5)
    lines = [f"\n\n📅 นัดที่ยังมาไม่ถึง ({len(appointments)})"]
    for a in shown:
        when = " ".join(x for x in (_thai_date(a.get("nextdate")), _appt_time(a.get("nexttime"))) if x)
        where = a.get("department") or (f"คลินิก {a['clinic']}" if a.get("clinic") else "")
        lines.append(f"• {when} — {where}" if where else f"• {when}")
        # HOSxP notes routinely contain hard line breaks; left raw they wreck
        # the message layout in LINE.
        note = " ".join(str(a.get("note") or "").split())
        if note:
            lines.append(f"  {note[:80]}")
    if extra:
        lines.append(f"  …และอีก {extra} รายการ")
    return "\n".join(lines)


def format_admission_line(admission) -> str:
    """Render '🏥 กำลัง admit — <ward>' for an inpatient, nothing otherwise.

    Only the positive case gets a line: an admitted patient is reached by
    walking to the ward rather than by phoning to move an appointment, so the
    line exists to redirect the recipient. "Not admitted" is the norm and
    saying so on every alert would be noise.
    """
    if not admission:
        return ""
    ward = admission.get("ward_name") or admission.get("ward") or "-"
    detail = ", ".join(
        part for part in (
            f"AN {admission['an']}" if admission.get("an") else "",
            f"ตั้งแต่ {_thai_date(admission['regdate'])}" if admission.get("regdate") else "",
        ) if part
    )
    return f"\n\n🏥 กำลัง admit — {ward}" + (f" ({detail})" if detail else "")


def build_his_patient_context(hn: str) -> tuple:
    """(admission_line, appointment_block) for a patient, over one HIS session.

    Best-effort by design: if the HIS is unconfigured, unreachable, or errors,
    both come back empty so the alert still goes out without them. A
    malignancy notification must never be lost because a secondary lookup
    failed — and, per format_appointment_block, a failed lookup must never be
    rendered as "no appointment found" either.
    """
    if not hn or hn == "-":
        return "", ""

    from app.db.his_database import get_his_session_direct
    from app.his_adapters import HisFeature, get_his_adapter_or_none

    adapter = get_his_adapter_or_none()
    if adapter is None:
        return "", ""
    # A HIS without one of these (e.g. a custom-SQL site) leaves that part out
    # rather than running HOSxP's query against another vendor's database —
    # and an unsupported lookup is "unknown", never "no appointment found".
    want_admission = adapter.supports(HisFeature.ADMISSION)
    want_appointments = adapter.supports(HisFeature.APPOINTMENTS)
    if not (want_admission or want_appointments):
        return "", ""

    his_db = None
    try:
        his_db = get_his_session_direct()
        if his_db is None:
            return "", ""
        return (
            format_admission_line(adapter.get_active_admission(his_db, hn)) if want_admission else "",
            format_appointment_block(adapter.get_future_appointments(his_db, hn)) if want_appointments else "",
        )
    except Exception:
        return "", ""
    finally:
        if his_db is not None:
            try:
                his_db.close()
            except Exception:
                pass


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


def _send_moph_notify_sync(credentials: Dict[str, Any], message: str) -> None:
    try:
        url, headers, body = _moph_notify_request(credentials, message)
    except ValueError:
        return  # incomplete keys or a base_url off moph.go.th — never send the keys
    with httpx.Client() as client:
        resp = client.post(url, headers=headers, json=body, timeout=5)
    failure = _moph_notify_failure(resp)
    if failure:
        # This path is fire-and-forget, so a refused send would otherwise
        # vanish without a trace. Never log the headers — they carry the keys.
        logger.warning("MOPH Notify refused the message: %s", failure)


def notify_event(db, event_key: str, data: Dict[str, Any], default_template: str = None) -> None:
    """Sync fire-and-forget: send a notification for the given event_key via all active channels."""
    try:
        from app.models.notification_rule import NotificationRule
        from app.models.notification_channel import NotificationChannel
        rule = (
            db.query(NotificationRule)
            .filter(NotificationRule.event_key == event_key, NotificationRule.is_active.is_(True))
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
        template = rule.message_template or default_template or (
            "🔔 แจ้งเตือนจากระบบ Pathology LIS\nHN: {hn}\nชื่อ: {name}\nCase: {id_case}"
        )
        message = _fill_template(template, data)
        for ch in channels:
            try:
                if ch.platform == "line":
                    _send_line_sync(ch.credentials, message)
                elif ch.platform == "slack":
                    _send_slack_sync(ch.credentials, message)
                elif ch.platform == "moph_notify":
                    _send_moph_notify_sync(ch.credentials, message)
            except Exception:
                pass
    except Exception:
        pass  # never block the HTTP response


def notify_signed_out(db, data: Dict[str, Any]) -> None:
    """Sync fire-and-forget: send case_signed_out notification via all active channels."""
    notify_event(
        db,
        "case_signed_out",
        data,
        default_template="🔔 รายงานออกแล้ว\nHN: {hn}\nชื่อ: {name}\nCase: {accession_no}",
    )


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
    return await _send_via_platform(platform, credentials, message)
