from typing import Any, Literal
from pydantic import BaseModel, Field


class FieldRequest(BaseModel):
    geojson: dict[str, Any]


class AnalysisRequest(FieldRequest):
    properties: list[str] | None = None
    source: Literal["iSDAsoil", "SoilGrids"] | None = None
    depth: str | None = None


class Uncertainty(BaseModel):
    kind: str
    unit: str | None = None
    low: float | None = None
    high: float | None = None
    value: float | None = None
    note: str | None = None


class SoilValue(BaseModel):
    property: str
    label: str
    value: float | None = None
    text_value: str | None = None
    unit: str
    source: str
    depth: str
    method: str
    status: Literal["ok", "no_coverage", "error", "disabled"]
    estimated: bool = True
    uncertainty: Uncertainty | None = None
    native_resolution_m: float | None = None
    layer_url: str | None = None
    min: float | None = None
    max: float | None = None
    coverage_pct: float = 0
    message: str | None = None


class AnalysisResponse(BaseModel):
    field: dict[str, Any]
    values: list[SoilValue]
    preferred: dict[str, str] = Field(default_factory=dict)
    issues: list[str] = Field(default_factory=list)
    cached: bool = False
