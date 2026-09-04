import asyncio
import logging
import re
from datetime import datetime, time as dtime, timedelta
from typing import List

from app.db.database import SessionLocal
from app.db.his_database import get_his_session_direct
from app.his_adapters.hosxp import get_hns_with_visit_today as hosxp_get_hns_with_visit_today
from app.models.notification_channel import NotificationChannel
from app.models.scheduled_notification_state import ScheduledNotificationState
from app.models.system_setting import SystemSetting
from app.crud import scheduled_notification_rule as scheduled_rule_crud
from app.crud import surgical_block_stain as surgical_block_stain_crud
from app.services.notification_service import broadcast_to_channels
from app.utils.time import local_now

logger = logging.getLogger(__name__)

_DEFAULT_TIMES = ["09:00", "11:00", "13:00", "15:00"]
_TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
_FALLBACK_TEMPLATE = (
    "🔔 แจ้งเตือนผลย้อมนอกค้างคีย์\n"
    "HN: {hn} | {name}\n"
    "Case: {case_id}\n"
    "รายการค้างคีย์ ({pending_count}):\n{pending_items}"
)


def _get_scheduled_times() -> List[str]:
    """Read the configured check times from SystemSetting, fresh every cycle
    (not captured once at import) so an admin's change applies on the next
    wake-up without a process restart. Falls back to _DEFAULT_TIMES if
    unset, empty, or containing malformed entries."""
    db = SessionLocal()
    try:
        row = db.query(SystemSetting).filter(SystemSetting.hospital_slug == "master").first()
        times = row.scheduled_notification_times if row else None
        valid = [t for t in (times or []) if isinstance(t, str) and _TIME_RE.match(t)]
        return sorted(set(valid)) or _DEFAULT_TIMES
    except Exception:
        logger.exception("scheduled_notifications: failed to read check times, using default")
        return _DEFAULT_TIMES
    finally:
        db.close()


def _seconds_until_next_run() -> float:
    """Seconds to sleep until the next configured check time — today's next
    remaining time, or tomorrow's earliest one if all of today's have
    already passed."""
    times = _get_scheduled_times()
    now = local_now()
    candidates = [
        datetime.combine(now.date(), dtime(int(t[:2]), int(t[3:])))
        for t in times
    ]
    future_today = [c for c in candidates if c > now]
    target = min(future_today) if future_today else min(candidates) + timedelta(days=1)
    return max((target - now).total_seconds(), 1.0)


def _load_unkeyed_outlab_by_hn() -> dict:
    db = SessionLocal()
    try:
        return surgical_block_stain_crud.get_unkeyed_outlab_by_hn(db)
    finally:
        db.close()


def _load_visiting_hns(hns: List[str]) -> set:
    """Empty set when HIS isn't configured — no HIS means no way to tell who
    turned up, which is the same "notify nobody" outcome as nobody visiting."""
    his_db = get_his_session_direct()
    if his_db is None:
        return set()
    try:
        return set(hosxp_get_hns_with_visit_today(his_db, hns=hns))
    finally:
        his_db.close()


async def _check_outlab_pending_visit_today(rule, channels: List[NotificationChannel]) -> None:
    """The one scheduled check: patients who actually visited the hospital
    today (per HOSxP's vn_stat table) who still have un-keyed outlab
    results. Uses a single batched "who's here today" query rather than a
    per-HN appointment lookup — an appointment (oapp) is only a schedule,
    not proof the patient showed up, so this checks actual arrival instead.

    Both lookups are synchronous SQLAlchemy calls, so they run in a worker
    thread: this coroutine shares the server's event loop, and a slow HIS
    query executed inline would stall every in-flight HTTP request until the
    hospital's MySQL answered."""
    by_hn = await asyncio.to_thread(_load_unkeyed_outlab_by_hn)
    if not by_hn:
        return

    # Only these patients matter, so the HN filter goes into the SQL rather
    # than pulling every HN that visited today back for a client-side
    # intersection.
    visiting_hns = await asyncio.to_thread(_load_visiting_hns, list(by_hn.keys()))

    now_dt = local_now()
    today_iso = now_dt.date().isoformat()
    breaches = [
        {
            "hn": hn,
            "name": info["patient_name"],
            "pending_count": str(len(info["items"])),
            "case_id": ", ".join(sorted({
                item["accession_no"] for item in info["items"] if item["accession_no"]
            })) or "-",
            "pending_items": "\n".join(
                f"- {item['accession_no'] or '-'} {item['block_code'] or '-'}: {item['stain_name']}"
                for item in info["items"]
            ),
        }
        for hn, info in by_hn.items()
        if hn in visiting_hns
    ]

    if not breaches:
        return

    template = rule.message_template or _FALLBACK_TEMPLATE
    db = SessionLocal()
    try:
        for breach in breaches:
            target_key = f"{breach['hn']}:{today_iso}"
            already_notified = (
                db.query(ScheduledNotificationState)
                .filter(
                    ScheduledNotificationState.rule_id == rule.id,
                    ScheduledNotificationState.target_key == target_key,
                )
                .first()
            )
            if already_notified:
                continue

            db.add(ScheduledNotificationState(
                rule_id=rule.id,
                target_key=target_key,
                first_detected_at=now_dt,
                last_notified_at=now_dt,
            ))
            db.commit()

            await broadcast_to_channels(channels, template, breach)
    finally:
        db.close()


async def _poll_once() -> None:
    db = SessionLocal()
    try:
        rules = scheduled_rule_crud.get_active_rules(db)
        if not rules:
            return

        rule_channels = {}
        for rule in rules:
            channel_ids = rule.channel_ids or []
            channels = (
                db.query(NotificationChannel)
                .filter(NotificationChannel.id.in_(channel_ids), NotificationChannel.is_active.is_(True))
                .all()
                if channel_ids else []
            )
            rule_channels[rule.id] = channels
    finally:
        db.close()

    for rule in rules:
        channels = rule_channels.get(rule.id) or []
        if not channels:
            continue
        try:
            if rule.rule_type == "outlab_pending_visit_today":
                await _check_outlab_pending_visit_today(rule, channels)
            else:
                logger.warning("scheduled_notifications: unknown rule_type %s", rule.rule_type)
        except Exception:
            # One broken rule's check must never take down the others this cycle.
            logger.exception("scheduled_notifications: check failed for rule_type %s", rule.rule_type)


async def run_forever() -> None:
    logger.info("Scheduled notifications worker started")
    try:
        while True:
            await asyncio.sleep(_seconds_until_next_run())
            try:
                await _poll_once()
            except Exception:
                logger.exception("Scheduled notifications worker: poll cycle failed")
    except asyncio.CancelledError:
        logger.info("Scheduled notifications worker stopped")
        raise
