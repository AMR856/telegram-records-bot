import uuid
from datetime import date

from fastapi import APIRouter, File, Form, HTTPException, Response, UploadFile, status
from sqlalchemy import select
from starlette.concurrency import run_in_threadpool

from app.api.deps import CurrentUser, OwnedListener, SessionDep
from app.core.config import get_settings
from app.models.parser_profile import ParserProfile
from app.schemas.pattern import PatternProfileOut
from app.schemas.whatsapp import (
    CopyFromListenerRequest,
    WhatsAppExportRequest,
    WhatsAppParseResponse,
    WhatsAppProfileCreate,
    WhatsAppProfileUpdate,
)
from app.services.exporter import build_rows_workbook
from app.services.pattern_engine import pattern_export_columns
from app.services.whatsapp import (
    process_whatsapp_export,
    whatsapp_default_columns,
)

router = APIRouter(prefix="/whatsapp", tags=["whatsapp"])


async def _get_profile(session, profile_id: uuid.UUID, user_id: uuid.UUID) -> ParserProfile:
    profile = await session.scalar(
        select(ParserProfile).where(
            ParserProfile.id == profile_id,
            ParserProfile.user_id == user_id,
            ParserProfile.kind == "whatsapp",
        )
    )
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")
    return profile


@router.get("/profiles", response_model=list[PatternProfileOut])
async def list_whatsapp_profiles(
    user: CurrentUser,
    session: SessionDep,
):
    profiles = await session.scalars(
        select(ParserProfile)
        .where(
            ParserProfile.user_id == user.id,
            ParserProfile.kind == "whatsapp",
        )
        .order_by(ParserProfile.created_at.desc())
    )
    return list(profiles.all())


@router.post(
    "/profiles",
    response_model=PatternProfileOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_whatsapp_profile(
    payload: WhatsAppProfileCreate,
    user: CurrentUser,
    session: SessionDep,
):
    profile = ParserProfile(
        user_id=user.id,
        listener_id=None,
        kind="whatsapp",
        name=payload.name,
        patterns=[pattern.model_dump() for pattern in payload.patterns],
        export_columns=[column.model_dump() for column in payload.export_columns],
        fallback_to_default=payload.fallback_to_default,
    )
    session.add(profile)
    await session.commit()
    await session.refresh(profile)
    return profile


@router.get("/profiles/{profile_id}", response_model=PatternProfileOut)
async def get_whatsapp_profile(
    profile_id: uuid.UUID,
    user: CurrentUser,
    session: SessionDep,
):
    return await _get_profile(session, profile_id, user.id)


@router.put("/profiles/{profile_id}", response_model=PatternProfileOut)
async def update_whatsapp_profile(
    profile_id: uuid.UUID,
    payload: WhatsAppProfileUpdate,
    user: CurrentUser,
    session: SessionDep,
):
    profile = await _get_profile(session, profile_id, user.id)
    profile.name = payload.name
    profile.patterns = [pattern.model_dump() for pattern in payload.patterns]
    profile.export_columns = [column.model_dump() for column in payload.export_columns]
    profile.fallback_to_default = payload.fallback_to_default
    await session.commit()
    await session.refresh(profile)
    return profile


@router.delete(
    "/profiles/{profile_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_whatsapp_profile(
    profile_id: uuid.UUID,
    user: CurrentUser,
    session: SessionDep,
):
    profile = await _get_profile(session, profile_id, user.id)
    await session.delete(profile)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/profiles/{profile_id}/copy-from-listener/{listener_id}",
    response_model=PatternProfileOut,
)
async def copy_profile_from_listener(
    profile_id: uuid.UUID,
    payload: CopyFromListenerRequest,
    listener: OwnedListener,
    user: CurrentUser,
    session: SessionDep,
):
    profile = await _get_profile(session, profile_id, user.id)
    source = await session.scalar(
        select(ParserProfile).where(ParserProfile.listener_id == listener.id)
    )
    if source is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Listener has no parser profile",
        )
    name = (payload.name or source.name or "Profile 1").strip()
    profile.name = name[:100]
    profile.patterns = list(source.patterns or [])
    profile.export_columns = list(source.export_columns or [])
    profile.fallback_to_default = source.fallback_to_default
    await session.commit()
    await session.refresh(profile)
    return profile


@router.post("/parse", response_model=WhatsAppParseResponse)
async def parse_whatsapp(
    user: CurrentUser,
    session: SessionDep,
    profile_id: uuid.UUID = Form(...),
    date_order: str | None = Form(default=None),
    file: UploadFile = File(...),
):
    if date_order not in (None, "dmy", "mdy"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="date_order must be dmy or mdy",
        )
    profile = await _get_profile(session, profile_id, user.id)
    settings = get_settings()
    max_bytes = settings.whatsapp_max_upload_mb * 1024 * 1024
    content = await file.read(max_bytes + 1)
    if len(content) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds {settings.whatsapp_max_upload_mb} MB",
        )
    text = content.decode("utf-8-sig", errors="replace")
    result = await run_in_threadpool(
        process_whatsapp_export,
        text,
        patterns=list(profile.patterns or []),
        export_columns=list(profile.export_columns or []) or None,
        fallback_to_default=profile.fallback_to_default,
        date_order=date_order,
    )
    return WhatsAppParseResponse(
        rows=result.rows,
        columns=result.columns,
        message_count=result.message_count,
        row_count=result.row_count,
        unmatched_messages=result.unmatched_messages,
        date_order=result.date_order,
        date_order_ambiguous=result.date_order_ambiguous,
        total_syp=result.total_syp,
        total_usd=result.total_usd,
        senders=result.senders,
        errors=result.errors,
    )


@router.post("/export.xlsx")
async def export_whatsapp(
    payload: WhatsAppExportRequest,
    user: CurrentUser,
    session: SessionDep,
):
    profile = await _get_profile(session, payload.profile_id, user.id)
    columns = list(profile.export_columns or []) or whatsapp_default_columns()
    pattern_columns = pattern_export_columns(profile.patterns)
    rows = [row.model_dump() for row in payload.rows]
    content = await run_in_threadpool(
        build_rows_workbook, rows, columns, pattern_columns
    )
    filename = f"whatsapp-payments-{date.today():%Y%m%d}.xlsx"
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )
