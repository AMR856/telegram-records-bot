import uuid

from sqlalchemy import select

from app.core.config import get_settings
from app.core.security import encrypt_token, token_fingerprint, token_hint
from app.db.session import SessionLocal
from app.models.listener import BotListener
from app.models.log import ListenerLog
from app.models.payment import Payment
from app.models.user import User
from app.services.parser import MessageParser
from app.services.poller import PollerManager, Runtime
from tests.conftest import bot_token


class DummyClient:
    async def close(self):
        return None


async def make_listener() -> uuid.UUID:
    token = bot_token("P")
    async with SessionLocal() as session:
        user = User(email=f"poll-{uuid.uuid4().hex[:8]}@example.com", password_hash="x")
        session.add(user)
        await session.flush()
        listener = BotListener(
            user_id=user.id,
            channel_input="-1001234567890",
            token_encrypted=encrypt_token(token),
            token_fingerprint=token_fingerprint(token),
            token_hint=token_hint(token),
            status="stopped",
            parser_state={},
        )
        session.add(listener)
        await session.commit()
        await session.refresh(listener)
        return listener.id


def update(update_id: int, text: str, chat_id: int = -1001234567890) -> dict:
    return {
        "update_id": update_id,
        "channel_post": {
            "message_id": update_id,
            "date": 1700000000,
            "chat": {"id": chat_id},
            "text": text,
        },
    }


def edited_update(
    update_id: int,
    message_id: int,
    text: str,
    chat_id: int = -1001234567890,
) -> dict:
    return {
        "update_id": update_id,
        "edited_channel_post": {
            "message_id": message_id,
            "date": 1700000000,
            "chat": {"id": chat_id},
            "text": text,
        },
    }


def deleted_update(
    update_id: int,
    message_ids: list[int],
    chat_id: int = -1001234567890,
) -> dict:
    return {
        "update_id": update_id,
        "deleted_business_messages": {
            "chat": {"id": chat_id},
            "message_ids": message_ids,
        },
    }


async def test_process_update_creates_log_and_payments():
    listener_id = await make_listener()
    manager = PollerManager(SessionLocal, get_settings())
    runtime = Runtime(
        listener_id=listener_id,
        token="token",
        resolved_chat_id=-1001234567890,
        client=DummyClient(),
        parser=MessageParser(),
        last_update_id=None,
    )

    await manager._process_update(runtime, update(1, "علي 1000 فاتورة شهر 10"))
    await manager._process_update(runtime, update(2, "محمد 2000 فاتورة شهر 10"))

    async with SessionLocal() as session:
        payments = list(
            (await session.scalars(select(Payment).where(Payment.listener_id == listener_id))).all()
        )
        logs = list(
            (
                await session.scalars(
                    select(ListenerLog).where(ListenerLog.listener_id == listener_id)
                )
            ).all()
        )
        listener = await session.get(BotListener, listener_id)
    assert len(payments) == 2
    assert {payment.name for payment in payments} == {"علي", "محمد"}
    assert sum(float(payment.value) for payment in payments) == 3000.0
    assert len(logs) == 2
    assert listener.last_update_id == 2


async def test_other_chat_is_ignored_but_offset_advances():
    listener_id = await make_listener()
    manager = PollerManager(SessionLocal, get_settings())
    runtime = Runtime(
        listener_id=listener_id,
        token="token",
        resolved_chat_id=-1001234567890,
        client=DummyClient(),
        parser=MessageParser(),
        last_update_id=None,
    )
    await manager._process_update(runtime, update(5, "علي 1000 فاتورة", chat_id=-999))
    async with SessionLocal() as session:
        payments = (await session.scalars(select(Payment))).all()
        logs = (await session.scalars(select(ListenerLog))).all()
        listener = await session.get(BotListener, listener_id)
    assert payments == []
    assert logs == []
    assert listener.last_update_id == 5


async def test_process_update_stores_currency_and_refunds():
    listener_id = await make_listener()
    manager = PollerManager(SessionLocal, get_settings())
    runtime = Runtime(
        listener_id=listener_id,
        token="token",
        resolved_chat_id=-1001234567890,
        client=DummyClient(),
        parser=MessageParser(),
        last_update_id=None,
    )

    await manager._process_update(
        runtime,
        update(
            1,
            "احمد نور الدين شرارة 10 $ +500 الف / ترصيد شهر 11 / تم ترجيع 50",
        ),
    )

    async with SessionLocal() as session:
        payments = list(
            (await session.scalars(select(Payment).where(Payment.listener_id == listener_id))).all()
        )
    assert len(payments) == 3
    usd = next(payment for payment in payments if payment.currency == "USD")
    refund = next(payment for payment in payments if payment.kind == "refund")
    assert float(usd.value) == 10.0
    assert float(refund.value) == -50.0
    assert usd.message_id == 1


async def test_edited_message_replaces_payments_and_marks_log():
    listener_id = await make_listener()
    manager = PollerManager(SessionLocal, get_settings())
    runtime = Runtime(
        listener_id=listener_id,
        token="token",
        resolved_chat_id=-1001234567890,
        client=DummyClient(),
        parser=MessageParser(),
        last_update_id=None,
    )

    await manager._process_update(runtime, update(1, "علي 1000 فاتورة شهر 10"))
    await manager._process_update(runtime, edited_update(2, 1, "علي 1500 فاتورة شهر 10"))

    async with SessionLocal() as session:
        payments = list(
            (await session.scalars(select(Payment).where(Payment.listener_id == listener_id))).all()
        )
        logs = list(
            (
                await session.scalars(
                    select(ListenerLog).where(
                        ListenerLog.listener_id == listener_id,
                        ListenerLog.kind == "message",
                    )
                )
            ).all()
        )
    assert len(payments) == 1
    assert float(payments[0].value) == 1500.0
    assert payments[0].update_id == 1
    assert payments[0].message_id == 1
    assert len(logs) == 1
    assert logs[0].text == "علي 1500 فاتورة شهر 10"
    assert logs[0].edited_at is not None
    assert logs[0].message_id == 1


async def test_deleted_messages_remove_logs_and_payments():
    listener_id = await make_listener()
    manager = PollerManager(SessionLocal, get_settings())
    runtime = Runtime(
        listener_id=listener_id,
        token="token",
        resolved_chat_id=-1001234567890,
        client=DummyClient(),
        parser=MessageParser(),
        last_update_id=None,
    )

    await manager._process_update(runtime, update(1, "علي 1000 فاتورة شهر 10"))
    await manager._process_update(runtime, deleted_update(2, [1]))

    async with SessionLocal() as session:
        payments = (await session.scalars(select(Payment))).all()
        logs = list((await session.scalars(select(ListenerLog))).all())
        listener = await session.get(BotListener, listener_id)
    assert payments == []
    assert all(log.kind != "message" for log in logs)
    assert any("Telegram" in log.text for log in logs)
    assert listener.last_update_id == 2


async def test_duplicate_update_is_ignored():
    listener_id = await make_listener()
    manager = PollerManager(SessionLocal, get_settings())
    runtime = Runtime(
        listener_id=listener_id,
        token="token",
        resolved_chat_id=-1001234567890,
        client=DummyClient(),
        parser=MessageParser(),
        last_update_id=None,
    )

    await manager._process_update(runtime, update(1, "علي 1000 فاتورة شهر 10"))
    await manager._process_update(runtime, update(1, "علي 1000 فاتورة شهر 10"))

    async with SessionLocal() as session:
        payments = (await session.scalars(select(Payment))).all()
        logs = (await session.scalars(select(ListenerLog))).all()
    assert len(payments) == 1
    assert len(logs) == 1


async def test_duplicate_payment_same_name_value_month_is_rejected():
    listener_id = await make_listener()
    manager = PollerManager(SessionLocal, get_settings())
    runtime = Runtime(
        listener_id=listener_id,
        token="token",
        resolved_chat_id=-1001234567890,
        client=DummyClient(),
        parser=MessageParser(),
        last_update_id=None,
    )

    await manager._process_update(runtime, update(1, "علي 1000 فاتورة شهر 10"))
    await manager._process_update(runtime, update(2, "علي 1000 فاتورة شهر 10"))

    async with SessionLocal() as session:
        payments = list(
            (await session.scalars(select(Payment).where(Payment.listener_id == listener_id))).all()
        )
        warnings = list(
            (
                await session.scalars(
                    select(ListenerLog).where(
                        ListenerLog.listener_id == listener_id,
                        ListenerLog.kind == "event",
                        ListenerLog.level == "warning",
                    )
                )
            ).all()
        )
        message_log = await session.scalar(
            select(ListenerLog).where(
                ListenerLog.listener_id == listener_id,
                ListenerLog.message_id == 2,
            )
        )
    assert len(payments) == 1
    assert len(warnings) == 1
    assert "Duplicate payment ignored" in warnings[0].text
    assert message_log.parsed_count == 0


async def test_same_name_value_in_different_month_or_value_is_allowed():
    listener_id = await make_listener()
    manager = PollerManager(SessionLocal, get_settings())
    runtime = Runtime(
        listener_id=listener_id,
        token="token",
        resolved_chat_id=-1001234567890,
        client=DummyClient(),
        parser=MessageParser(),
        last_update_id=None,
    )

    await manager._process_update(runtime, update(1, "علي 1000 فاتورة شهر 10"))
    await manager._process_update(runtime, update(2, "علي 1000 فاتورة شهر 11"))
    await manager._process_update(runtime, update(3, "علي 1500 فاتورة شهر 10"))

    async with SessionLocal() as session:
        payments = list(
            (await session.scalars(select(Payment).where(Payment.listener_id == listener_id))).all()
        )
    assert len(payments) == 3


async def test_duplicate_payment_within_same_message_is_rejected():
    listener_id = await make_listener()
    manager = PollerManager(SessionLocal, get_settings())
    runtime = Runtime(
        listener_id=listener_id,
        token="token",
        resolved_chat_id=-1001234567890,
        client=DummyClient(),
        parser=MessageParser(),
        last_update_id=None,
    )

    await manager._process_update(
        runtime,
        update(1, "علي 1000 فاتورة شهر 10\nعلي 1000 فاتورة شهر 10"),
    )

    async with SessionLocal() as session:
        payments = list(
            (await session.scalars(select(Payment).where(Payment.listener_id == listener_id))).all()
        )
    assert len(payments) == 1


async def test_parser_state_survives_snapshot_restore():
    parser = MessageParser()
    assert parser.parse("علي محمد 1250") == []
    state = parser.snapshot()

    restored = MessageParser()
    restored.restore(state)
    payments = restored.parse("1000 فاتورة شهر 10 + 250 باقة")
    assert len(payments) == 1
    assert payments[0].value == 1250
    assert payments[0].name == "علي محمد"
