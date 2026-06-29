# app/enums/quality_enum.py
import enum


class QualityEnum(str, enum.Enum):
    poor = "poor"
    fair = "fair"
    good = "good"
