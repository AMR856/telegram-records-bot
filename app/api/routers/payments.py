from datetime import UTC, date, datetime, time, timedelta

from fastapi import APIRouter, Query, Response
from sqlalchemy import func, or_, select
from starlette.concurrency import run_in_threadpool

from app.api.deps import OwnedListener, SessionDep
from app.models.payment import Payment
from app.schemas.payment import PaymentOut, PaymentPage
from app.services.exporter import build_payments_workbook

router = APIRouter(prefix="/listeners", tags=["payments"])


def _filters(
    listener_id,
    month: int | None,
    q: str | None,
    date_from: date | None,
    date_to: date | None,
):
    filters = [Payment.listener_id == listener_id]
    if month is not None:
        filters.append(Payment.month == month)
    if q:
        pattern = f"%{q.strip()}%"
        filters.append(or_(Payment.name.ilike(pattern), Payment.description.ilike(pattern)))
    if date_from is not None:
        filters.append(Payment.received_at >= datetime.combine(date_from, time.min, tzinfo=UTC))
    if date_to is not None:
        filters.append(
            Payment.received_at
            < datetime.combine(date_to + timedelta(days=1), time.min, tzinfo=UTC)
        )
    return filters


def _to_out(payment: Payment) -> PaymentOut:
    return PaymentOut(
        id=payment.id,
        value=float(payment.value),
        currency=payment.currency or "SYP",
        kind=payment.kind or "payment",
        name=payment.name,
        description=payment.description,
        month=payment.month,
        source=payment.source,
        received_at=payment.received_at,
        message_date=payment.message_date,
    )


@router.get("/{listener_id}/payments", response_model=PaymentPage)
async def get_payments(
    listener: OwnedListener,
    session: SessionDep,
    month: int | None = Query(default=None, ge=1, le=12),
    q: str | None = Query(default=None, max_length=100),
    date_from: date | None = None,
    date_to: date | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
):
    filters = _filters(listener.id, month, q, date_from, date_to)
    total = int(await session.scalar(select(func.count(Payment.id)).where(*filters)) or 0)
    total_value = float(
        await session.scalar(
            select(func.coalesce(func.sum(Payment.value), 0)).where(
                *filters, Payment.currency == "SYP"
            )
        )
        or 0
    )
    total_usd = float(
        await session.scalar(
            select(func.coalesce(func.sum(Payment.value), 0)).where(
                *filters, Payment.currency == "USD"
            )
        )
        or 0
    )
    rows = list(
        (
            await session.scalars(
                select(Payment)
                .where(*filters)
                .order_by(Payment.received_at.desc(), Payment.id.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        ).all()
    )
    return PaymentPage(
        items=[_to_out(row) for row in rows],
        total=total,
        total_value=total_value,
        total_usd=total_usd,
        page=page,
        page_size=page_size,
    )


@router.get("/{listener_id}/payments/export.xlsx")
async def export_payments(
    listener: OwnedListener,
    session: SessionDep,
    month: int | None = Query(default=None, ge=1, le=12),
    q: str | None = Query(default=None, max_length=100),
    date_from: date | None = None,
    date_to: date | None = None,
):
    filters = _filters(listener.id, month, q, date_from, date_to)
    rows = list(
        (
            await session.scalars(
                select(Payment).where(*filters).order_by(Payment.received_at, Payment.id)
            )
        ).all()
    )
    content = await run_in_threadpool(build_payments_workbook, rows)
    filename = f"payments-{listener.id.hex[:8]}-{date.today():%Y%m%d}.xlsx"
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )
