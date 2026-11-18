import re
import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.services.pattern_engine import (
    EXPORT_FIELDS,
    PatternError,
    build_target_map,
    compile_patterns,
)

PLACEHOLDER_NAME_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
COLUMN_KEY_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


class PatternField(BaseModel):
    placeholder: str = Field(min_length=1, max_length=50)
    target: str = Field(min_length=1, max_length=100)
    type: Literal["number", "text", "word", "month"] = "text"
    required: bool = True

    @field_validator("placeholder")
    @classmethod
    def clean_placeholder(cls, value: str) -> str:
        value = value.strip().strip("{}")
        if not PLACEHOLDER_NAME_RE.fullmatch(value):
            raise ValueError("placeholder must use letters, digits, and underscores")
        return value


class PatternDefinition(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    template: str = Field(min_length=1, max_length=1000)
    fields: list[PatternField] = Field(min_length=1)
    defaults: dict[str, str] = Field(default_factory=dict)
    enabled: bool = True

    @field_validator("name", "template")
    @classmethod
    def clean_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("value cannot be empty")
        return value

    @model_validator(mode="after")
    def validate_pattern(self) -> "PatternDefinition":
        try:
            compile_patterns([self.model_dump()])
        except PatternError as error:
            raise ValueError(str(error)) from error
        return self


class ExportColumn(BaseModel):
    key: str = Field(min_length=1, max_length=100)
    header: str = Field(min_length=1, max_length=100)
    source: Literal["field", "custom", "constant"] = "field"
    field: str | None = Field(default=None, max_length=100)
    default: str | None = Field(default=None, max_length=500)

    @field_validator("key")
    @classmethod
    def clean_key(cls, value: str) -> str:
        value = value.strip()
        if not COLUMN_KEY_RE.fullmatch(value):
            raise ValueError("key must use letters, digits, and underscores")
        return value

    @field_validator("header")
    @classmethod
    def clean_header(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("header cannot be empty")
        return value

    @model_validator(mode="after")
    def validate_source(self) -> "ExportColumn":
        if self.source == "field":
            if not self.field:
                raise ValueError("field is required for field columns")
            if self.field not in EXPORT_FIELDS:
                raise ValueError(f"unknown field '{self.field}'")
        return self


class PatternProfileUpdate(BaseModel):
    name: str = Field(default="Profile 1", min_length=1, max_length=100)
    patterns: list[PatternDefinition] = Field(default_factory=list)
    export_columns: list[ExportColumn] = Field(default_factory=list)
    fallback_to_default: bool = True

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("name cannot be empty")
        return value

    @model_validator(mode="after")
    def validate_pattern_targets(self) -> "PatternProfileUpdate":
        keys = [column.key for column in self.export_columns]
        if len(set(keys)) != len(keys):
            raise ValueError("export column keys must be unique")
        targets = build_target_map([column.model_dump() for column in self.export_columns])
        field_targets = {field.target for pattern in self.patterns for field in pattern.fields}
        default_targets = {target for pattern in self.patterns for target in pattern.defaults}
        unknown = (field_targets | default_targets) - set(targets)
        if unknown:
            raise ValueError(
                "pattern targets are not mapped to columns: " + ", ".join(sorted(unknown))
            )
        return self


class CopyProfileRequest(BaseModel):
    profile_id: uuid.UUID


class PatternProfileOut(BaseModel):
    id: uuid.UUID
    listener_id: uuid.UUID | None = None
    kind: str
    name: str
    patterns: list[PatternDefinition]
    export_columns: list[ExportColumn]
    fallback_to_default: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PatternPreviewRequest(BaseModel):
    text: str = Field(min_length=1, max_length=20000)
    patterns: list[PatternDefinition] = Field(default_factory=list)
    export_columns: list[ExportColumn] = Field(default_factory=list)
    default_month: int | None = Field(default=None, ge=1, le=12)

    @model_validator(mode="after")
    def validate_targets(self) -> "PatternPreviewRequest":
        keys = [column.key for column in self.export_columns]
        if len(set(keys)) != len(keys):
            raise ValueError("export column keys must be unique")
        targets = build_target_map([column.model_dump() for column in self.export_columns])
        field_targets = {field.target for pattern in self.patterns for field in pattern.fields}
        default_targets = {target for pattern in self.patterns for target in pattern.defaults}
        unknown = (field_targets | default_targets) - set(targets)
        if unknown:
            raise ValueError(
                "pattern targets are not mapped to columns: " + ", ".join(sorted(unknown))
            )
        return self


class PatternPreviewRow(BaseModel):
    value: float
    name: str
    description: str
    month: int
    source: str
    currency: str
    kind: str
    extra: dict[str, str]
    cells: list[str]


class PatternPreviewResponse(BaseModel):
    rows: list[PatternPreviewRow]
    unmatched_lines: list[str]
    errors: list[str]
    columns: list[ExportColumn]
