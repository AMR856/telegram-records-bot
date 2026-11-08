import asyncio
import contextlib
import logging
import time
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import Settings
from app.core.security import decrypt_token
from app.models.listener import BotListener, ListenerStatus
from app.models.log import ListenerLog, LogKind, LogLevel
from app.models.payment import Payment
from app.models.user import User
from app.services.parser import MessageParser
from app.services.telegram import TelegramClient, TelegramError

logger = logging.getLogger(__name__)

ALLOWED_UPDATES = [
    "message",
    "channel_post",
    "edited_message",
    "edited_channel_post",
    "deleted_business_messages",
]

PAYMENT_DECIMAL_QUANT = Decimal("0.01")


def _payment_key(name: str, value: Decimal, currency: str, month: int) -> tuple:
    return (
        name,
        value.quantize(PAYMENT_DECIMAL_QUANT),
        (currency or "SYP").upper(),
        month,
    )


class ListenerStartError(Exception):
    def __init__(self, message: str, *, code: str = "start_failed"):
        super().__init__(message)
        self.message = message
        self.code = code


class ListenerDeletedError(Exception):
    pass


@dataclass
class Runtime:
    listener_id: uuid.UUID
    token: str
    resolved_chat_id: int
    client: TelegramClient
    parser: MessageParser
    last_update_id: int | None
    stop_event: asyncio.Event = field(default_factory=asyncio.Event)
    task: asyncio.Task | None = None
    last_transient_log: float = 0.0
    had_transient_error: bool = False


class PollerManager:
    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        settings: Settings,
    ):
        self._session_factory = session_factory
        self._settings = settings
        self._runtimes: dict[uuid.UUID, Runtime] = {}
        self._lock = asyncio.Lock()
        self._retention_task: asyncio.Task | None = None

    async def startup(self) -> None:
        async with self._session_factory() as session:
            result = await session.scalars(
                select(BotListener.id)
                .join(User, User.id == BotListener.user_id)
                .where(
                    BotListener.status == ListenerStatus.RUNNING,
                    User.is_active.is_(True),
                )
            )
            running_ids = list(result.all())
        for listener_id in running_ids:
            try:
                await self.start_listener(listener_id)
            except ListenerStartError as error:
                logger.warning("Could not resume listener %s: %s", listener_id, error.message)
        if self._settings.log_retention_days > 0:
            await self.cleanup_old_logs()
            self._retention_task = asyncio.create_task(self._retention_loop())

    async def shutdown(self) -> None:
        if self._retention_task:
            self._retention_task.cancel()
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await self._retention_task
        for runtime in list(self._runtimes.values()):
            await self._stop_runtime(runtime)

    async def start_listener(self, listener_id: uuid.UUID) -> None:
        async with self._lock:
            existing = self._runtimes.get(listener_id)
            if existing is not None and existing.task and not existing.task.done():
                return
            if existing is not None:
                self._runtimes.pop(listener_id, None)
                await self._stop_runtime(existing)

            async with self._session_factory() as session:
                listener = await session.get(BotListener, listener_id)
                if listener is None:
                    raise ListenerStartError("Listener not found", code="not_found")
                token = decrypt_token(listener.token_encrypted)
                channel_input = listener.channel_input
                last_update_id = listener.last_update_id
                parser_state = listener.parser_state or {}

            client = TelegramClient(token, poll_timeout=self._settings.telegram_poll_timeout)
            try:
                me = await client.get_me()
                webhook = await client.get_webhook_info()
                if webhook.get("url"):
                    raise ListenerStartError(
                        "A webhook is configured for this bot. Remove the webhook before using "
                        "polling, because Telegram does not allow both at the same time.",
                        code="webhook_conflict",
                    )
                chat = await client.get_chat(channel_input)
                chat_id = chat.get("id")
                chat_type = chat.get("type")
                if not isinstance(chat_id, int):
                    raise ListenerStartError(
                        "Telegram did not return a valid chat id for this channel.",
                        code="invalid_channel",
                    )
                if chat_type not in ("channel", "group", "supergroup"):
                    raise ListenerStartError(
                        "The provided chat is not a channel or group.", code="invalid_channel"
                    )
                try:
                    member = await client.get_chat_member(chat_id, me["id"])
                    member_status = member.get("status")
                except TelegramError as error:
                    raise ListenerStartError(
                        "The bot cannot access this channel. Add the bot to the channel first.",
                        code="chat_access_denied",
                    ) from error
                allowed = ("creator", "administrator")
                if chat_type == "channel" and member_status not in allowed:
                    raise ListenerStartError(
                        "The bot must be an administrator of the channel to read channel posts.",
                        code="not_channel_admin",
                    )
                if chat_type != "channel" and member_status in ("left", "kicked"):
                    raise ListenerStartError(
                        "The bot is not a member of this group.", code="chat_access_denied"
                    )

                skipped_to = last_update_id
                if last_update_id is None:
                    backlog = await client.get_updates(offset=-1, timeout=0, limit=1)
                    if backlog:
                        skipped_to = backlog[-1]["update_id"]

                async with self._session_factory() as session:
                    listener = await session.get(BotListener, listener_id)
                    if listener is None:
                        raise ListenerStartError("Listener not found", code="not_found")
                    listener.status = ListenerStatus.RUNNING
                    listener.resolved_chat_id = chat_id
                    listener.chat_title = chat.get("title") or chat.get("username")
                    listener.bot_username = me.get("username")
                    listener.last_update_id = skipped_to
                    listener.last_error = None
                    listener.last_error_at = None
                    await session.commit()
            except ListenerStartError as error:
                await client.close()
                await self._apply_error(listener_id, error.message)
                raise
            except TelegramError as error:
                await client.close()
                await self._apply_error(listener_id, error.message)
                raise ListenerStartError(error.message, code=error.code) from error
            except Exception as error:
                await client.close()
                logger.exception("Unexpected error starting listener %s", listener_id)
                message = "Could not start the listener. Check the bot token and channel."
                await self._apply_error(listener_id, message)
                raise ListenerStartError(message, code="unexpected_error") from error

            parser = MessageParser()
            parser.restore(parser_state)
            runtime = Runtime(
                listener_id=listener_id,
                token=token,
                resolved_chat_id=chat_id,
                client=client,
                parser=parser,
                last_update_id=skipped_to,
            )
            runtime.task = asyncio.create_task(self._poll_loop(runtime))
            self._runtimes[listener_id] = runtime
            await self._log_event(listener_id, LogLevel.INFO, "Listener started")

    async def stop_listener(self, listener_id: uuid.UUID) -> None:
        async with self._lock:
            runtime = self._runtimes.pop(listener_id, None)
            if runtime is not None:
                await self._stop_runtime(runtime)
            async with self._session_factory() as session:
                listener = await session.get(BotListener, listener_id)
                if listener is None:
                    return
                listener.status = ListenerStatus.STOPPED
                listener.last_error = None
                listener.last_error_at = None
                await session.commit()
            await self._log_event(listener_id, LogLevel.INFO, "Listener stopped")

    async def _stop_runtime(self, runtime: Runtime) -> None:
        runtime.stop_event.set()
        if runtime.task is not None:
            runtime.task.cancel()
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await runtime.task
        with contextlib.suppress(Exception):
            await runtime.client.close()

    async def _poll_loop(self, runtime: Runtime) -> None:
        offset = runtime.last_update_id + 1 if runtime.last_update_id is not None else None
        backoff = 1
        try:
            while not runtime.stop_event.is_set():
                try:
                    updates = await runtime.client.get_updates(
                        offset=offset,
                        timeout=self._settings.telegram_poll_timeout,
                        limit=self._settings.telegram_poll_limit,
                        allowed_updates=ALLOWED_UPDATES,
                    )
                    backoff = 1
                    if runtime.had_transient_error:
                        runtime.had_transient_error = False
                        await self._clear_error(runtime.listener_id)
                    for update in updates:
                        if runtime.stop_event.is_set():
                            break
                        await self._process_update(runtime, update)
                        runtime.last_update_id = update["update_id"]
                        offset = update["update_id"] + 1
                except asyncio.CancelledError:
                    raise
                except ListenerDeletedError:
                    return
                except TelegramError as error:
                    if error.fatal:
                        await self._fail(runtime, error.message)
                        return
                    await self._transient_error(runtime, error.message)
                    await asyncio.sleep(backoff)
                    backoff = min(backoff * 2, 60)
                except Exception:
                    logger.exception("Unexpected polling error for %s", runtime.listener_id)
                    await self._transient_error(
                        runtime, "Unexpected error while polling. Retrying automatically."
                    )
                    await asyncio.sleep(backoff)
                    backoff = min(backoff * 2, 60)
        finally:
            with contextlib.suppress(Exception):
                await runtime.client.close()
            if self._runtimes.get(runtime.listener_id) is runtime:
                self._runtimes.pop(runtime.listener_id, None)

    @staticmethod
    def _message_from_update(update: dict) -> tuple[dict | None, bool]:
        for key in ("message", "channel_post"):
            if update.get(key):
                return update[key], False
        for key in ("edited_message", "edited_channel_post"):
            if update.get(key):
                return update[key], True
        return None, False

    async def _process_update(self, runtime: Runtime, update: dict) -> None:
        update_id = int(update["update_id"])

        deleted = update.get("deleted_business_messages")
        if deleted:
            chat = deleted.get("chat") or {}
            if chat.get("id") != runtime.resolved_chat_id:
                await self._save_progress(runtime.listener_id, update_id, None)
                return
            await self._delete_message_records(
                runtime.listener_id, list(deleted.get("message_ids") or [])
            )
            await self._save_progress(runtime.listener_id, update_id, None)
            return

        message, is_edit = self._message_from_update(update)
        if not message:
            await self._save_progress(runtime.listener_id, update_id, None)
            return

        chat = message.get("chat") or {}
        if chat.get("id") != runtime.resolved_chat_id:
            await self._save_progress(runtime.listener_id, update_id, None)
            return

        text = message.get("text")
        if not text:
            await self._save_progress(runtime.listener_id, update_id, None)
            return

        message_id = message.get("message_id")
        base_state = runtime.parser.snapshot()
        if is_edit and message_id is not None:
            async with self._session_factory() as session:
                stored_state = await session.scalar(
                    select(ListenerLog.parser_state).where(
                        ListenerLog.listener_id == runtime.listener_id,
                        ListenerLog.kind == LogKind.MESSAGE,
                        ListenerLog.message_id == message_id,
                    )
                )
            if stored_state:
                runtime.parser.restore(stored_state)

        state_before = runtime.parser.snapshot()
        parse_error: Exception | None = None
        payments = []
        try:
            payments = runtime.parser.parse(text)
        except Exception as error:
            parse_error = error
            logger.exception("Parser error for listener %s", runtime.listener_id)

        snapshot = runtime.parser.snapshot()
        if is_edit:
            runtime.parser.restore(base_state)
            snapshot = base_state

        valid = []
        for payment in payments:
            is_valid, _ = runtime.parser.validate(payment)
            if is_valid:
                valid.append(payment)

        message_date = None
        if message.get("date"):
            message_date = datetime.fromtimestamp(int(message["date"]), tz=UTC)

        async with self._session_factory() as session:
            listener = await session.get(BotListener, runtime.listener_id)
            if listener is None:
                raise ListenerDeletedError()

            log = None
            if message_id is not None:
                log = await session.scalar(
                    select(ListenerLog)
                    .where(
                        ListenerLog.listener_id == runtime.listener_id,
                        ListenerLog.kind == LogKind.MESSAGE,
                        ListenerLog.message_id == message_id,
                    )
                    .order_by(ListenerLog.id.asc())
                    .limit(1)
                )

            if log is None:
                duplicate = await session.scalar(
                    select(ListenerLog.id).where(
                        ListenerLog.listener_id == runtime.listener_id,
                        ListenerLog.update_id == update_id,
                    )
                )
                if duplicate is not None:
                    listener.last_update_id = update_id
                    listener.last_error = None
                    listener.last_error_at = None
                    await session.commit()
                    return

            now = datetime.now(UTC)
            if log is None:
                log = ListenerLog(
                    listener_id=runtime.listener_id,
                    kind=LogKind.MESSAGE,
                    level=LogLevel.ERROR if parse_error else LogLevel.INFO,
                    text=text,
                    update_id=update_id,
                    message_id=message_id,
                    edited_at=now if is_edit else None,
                    parser_state=state_before,
                    parsed_count=len(valid),
                )
                session.add(log)
                await session.flush()
                payment_update_id = update_id
            else:
                log.text = text
                log.level = LogLevel.ERROR if parse_error else LogLevel.INFO
                log.parsed_count = len(valid)
                if message_id is not None and log.message_id is None:
                    log.message_id = message_id
                if log.parser_state is None and state_before:
                    log.parser_state = state_before
                if is_edit:
                    log.edited_at = now
                payment_update_id = log.update_id if log.update_id is not None else update_id

            if message_id is not None:
                await session.execute(
                    delete(Payment).where(
                        Payment.listener_id == runtime.listener_id,
                        Payment.message_id == message_id,
                    )
                )
            else:
                await session.execute(
                    delete(Payment).where(
                        Payment.listener_id == runtime.listener_id,
                        Payment.update_id == payment_update_id,
                    )
                )

            current_month = datetime.now().month
            prepared = []
            for index, payment in enumerate(valid):
                month = int(payment.month or current_month)
                value = Decimal(str(payment.value))
                prepared.append((index, payment, month, value))

            existing_keys: set[tuple] = set()
            months = {month for _, _, month, _ in prepared}
            if months:
                rows = await session.execute(
                    select(Payment.name, Payment.value, Payment.currency, Payment.month).where(
                        Payment.listener_id == runtime.listener_id,
                        Payment.month.in_(months),
                    )
                )
                for existing_name, existing_value, existing_currency, existing_month in rows:
                    existing_keys.add(
                        _payment_key(
                            existing_name,
                            Decimal(str(existing_value)),
                            existing_currency,
                            existing_month,
                        )
                    )

            rejected = []
            for index, payment, month, value in prepared:
                key = _payment_key(payment.name[:255], value, payment.currency, month)
                if key in existing_keys:
                    rejected.append(payment)
                    continue
                existing_keys.add(key)
                session.add(
                    Payment(
                        listener_id=runtime.listener_id,
                        update_id=payment_update_id,
                        message_id=message_id,
                        item_index=index,
                        message_date=message_date,
                        value=value,
                        name=payment.name[:255],
                        description=payment.description or None,
                        month=month,
                        source=payment.source or "\u0643\u0627\u0634",
                        currency=payment.currency,
                        kind=payment.kind,
                    )
                )

            if rejected:
                details = ", ".join(
                    f"{payment.name} {payment.value:g} {payment.currency} (month "
                    f"{int(payment.month or current_month)})"
                    for payment in rejected
                )
                session.add(
                    ListenerLog(
                        listener_id=runtime.listener_id,
                        kind=LogKind.EVENT,
                        level=LogLevel.WARNING,
                        text=f"Duplicate payment ignored: {details}",
                    )
                )

            log.parsed_count = len(prepared) - len(rejected)

            if parse_error is not None:
                session.add(
                    ListenerLog(
                        listener_id=runtime.listener_id,
                        kind=LogKind.EVENT,
                        level=LogLevel.ERROR,
                        text=(
                            f"Failed to parse {'edited ' if is_edit else ''}message: {parse_error}"
                        ),
                    )
                )

            listener.last_update_id = update_id
            if not is_edit:
                listener.parser_state = snapshot
            listener.last_error = None
            listener.last_error_at = None
            await session.commit()

    async def _delete_message_records(self, listener_id: uuid.UUID, message_ids: list[int]) -> None:
        if not message_ids:
            return
        async with self._session_factory() as session:
            listener = await session.get(BotListener, listener_id)
            if listener is None:
                raise ListenerDeletedError()
            logs = await session.execute(
                delete(ListenerLog).where(
                    ListenerLog.listener_id == listener_id,
                    ListenerLog.kind == LogKind.MESSAGE,
                    ListenerLog.message_id.in_(message_ids),
                )
            )
            await session.execute(
                delete(Payment).where(
                    Payment.listener_id == listener_id,
                    Payment.message_id.in_(message_ids),
                )
            )
            if logs.rowcount:
                ids = ", ".join(str(message_id) for message_id in message_ids)
                session.add(
                    ListenerLog(
                        listener_id=listener_id,
                        kind=LogKind.EVENT,
                        level=LogLevel.INFO,
                        text=f"Messages deleted in Telegram: {ids}",
                    )
                )
            await session.commit()

    async def _save_progress(
        self, listener_id: uuid.UUID, update_id: int, parser_state: dict | None
    ) -> None:
        async with self._session_factory() as session:
            listener = await session.get(BotListener, listener_id)
            if listener is None:
                raise ListenerDeletedError()
            listener.last_update_id = update_id
            if parser_state is not None:
                listener.parser_state = parser_state
            await session.commit()

    async def _apply_error(self, listener_id: uuid.UUID, message: str) -> None:
        async with self._session_factory() as session:
            listener = await session.get(BotListener, listener_id)
            if listener is not None:
                listener.status = ListenerStatus.ERROR
                listener.last_error = message[:2000]
                listener.last_error_at = datetime.now(UTC)
                await session.commit()
        await self._log_event(listener_id, LogLevel.ERROR, message)

    async def _fail(self, runtime: Runtime, message: str) -> None:
        await self._apply_error(runtime.listener_id, message)

    async def _clear_error(self, listener_id: uuid.UUID) -> None:
        async with self._session_factory() as session:
            listener = await session.get(BotListener, listener_id)
            if listener is not None:
                listener.last_error = None
                listener.last_error_at = None
                await session.commit()

    async def _transient_error(self, runtime: Runtime, message: str) -> None:
        runtime.had_transient_error = True
        now = time.monotonic()
        if now - runtime.last_transient_log < 300:
            return
        runtime.last_transient_log = now
        await self._apply_running_error(runtime.listener_id, message)
        await self._log_event(runtime.listener_id, LogLevel.WARNING, message)

    async def _apply_running_error(self, listener_id: uuid.UUID, message: str) -> None:
        async with self._session_factory() as session:
            listener = await session.get(BotListener, listener_id)
            if listener is not None:
                listener.last_error = message[:2000]
                listener.last_error_at = datetime.now(UTC)
                await session.commit()

    async def _log_event(self, listener_id: uuid.UUID, level: str, text: str) -> None:
        async with self._session_factory() as session:
            listener = await session.get(BotListener, listener_id)
            if listener is None:
                return
            session.add(
                ListenerLog(
                    listener_id=listener_id,
                    kind=LogKind.EVENT,
                    level=level,
                    text=text,
                )
            )
            await session.commit()

    async def cleanup_old_logs(self) -> None:
        days = self._settings.log_retention_days
        if days <= 0:
            return
        cutoff = datetime.now(UTC) - timedelta(days=days)
        async with self._session_factory() as session:
            await session.execute(delete(ListenerLog).where(ListenerLog.created_at < cutoff))
            await session.commit()

    async def _retention_loop(self) -> None:
        while True:
            try:
                await asyncio.sleep(6 * 60 * 60)
                await self.cleanup_old_logs()
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("Log retention cleanup failed")
