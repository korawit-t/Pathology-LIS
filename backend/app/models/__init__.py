# app/models/__init__.py

# ต้อง Import คลาส Patient และ SurgicalSpecimen เข้ามา
# แม้ว่าคุณจะไม่ได้ใช้ตัวแปรเหล่านั้นโดยตรงในไฟล์นี้
# การทำเช่นนี้เป็นการบังคับให้ Python โหลดไฟล์และคลาสเหล่านี้
from .user import User
from .patient import Patient
from .surgical_specimen import SurgicalSpecimen
from .gross_image import GrossImage
from .surgical_case import SurgicalCase
from .surgical_block import SurgicalBlock
from .surgical_specimen_ap_test import SurgicalSpecimenAPTest
from .external_lab import ExternalLab
from .anatomical_pathology_test import AnatomicalPathologyTest
from .organization import Position, Hospital, Title, MedicalScheme
from .surgical_diagnosis import SurgicalDiagnosis  # เก็บไว้ที่เดียว
from .surgical_request_file import SurgicalRequestFile
from .gyne_cyto_request_file import GyneCytoRequestFile
from .nongyne_request_file import NongyneRequestFile
from .tissue_processing import TissueProcessingRun, TissueProcessingItem
from .embedding import EmbeddingRun, EmbeddingDetail
from .system_setting import SystemSetting
from .gross_template import GrossTemplate
from .sectioning import SectioningRun, SectioningDetail

# รวม Stain ที่เกี่ยวข้องไว้ด้วยกัน
from .surgical_block_stain import (
    SurgicalBlockStain,
    SurgicalStainRun,
    SurgicalStainRunDetail,
)

from .surgical_report import SurgicalReport, SurgicalReportImage, ReportApprovalLog
from .microscopic_image import MicroscopicImage
from .diagnostic_template import DiagnosticTemplate
from .slide_dispatch import SlideDispatchItem, SlideDispatchRun
from .specimen_template import SpecimenTemplate
from .gyne_cyto_case import GyneCytologyCase
from .gyne_diagnosis import GyneDiagnosis
from .gyne_cyto_stain import GyneCytologyStain, GyneStainRunDetail
from .gyne_cyto_report import GyneCytoReport, GyneReportStatus, GyneReportType
from .nongyne_cyto_case import NongyneCytologyCase
from .nongyne_cyto_stain import NongyneStainRun, NongyneStainRunDetail, NongyneCytologyStain
from .nongyne_diagnosis import NongyneDiagnosis
from .nongyne_cyto_report import NongyneCytoReport, NongyneReportStatus, NongyneReportType, NongyneReportSigner
from .nongyne_case_image import NongyneCaseImage
from .gyne_case_image import GyneCaseImage
from .notification_channel import NotificationChannel
from .notification_rule import NotificationRule
from .block_storage import BlockStorageRun, BlockStorageDetail
from .slide_storage import SlideStorageRun, SlideStorageDetail
from .outlab_consult import OutlabConsultRun, OutlabConsultRunDetail
from .slide_block_release import SlideBlockRelease
from .surgical_block_event import SurgicalBlockEvent
from .audit_log import AuditLog
from .cyto_approval_log import CytoReportAuditLog
from .ihc_marker_option import IHCMarkerOption
from .ihc_result import IHCResult
from .ihc_marker_extra_field import IHCMarkerExtraField
from .ihc_marker_extra_field_option import IHCMarkerExtraFieldOption
from .ihc_result_extra_value import IHCResultExtraValue
from .nongyne_ihc_result import NongyneIHCResult
from .nongyne_cyto_histo_correlation import NongyneCytoHistoCorrelation
from .surgical_case_correlation import SurgicalCaseCorrelation
from .internal_consult import InternalConsult
from .revoked_token import RevokedToken
from .cyto_workload import CytoWorkloadLog
from .critical_notification_log import CriticalNotificationLog
from .legacy_surgical_report import LegacySurgicalReport
from .legacy_gyne_cyto_report import LegacyGyneCytoReport
from .legacy_nongyne_cyto_report import LegacyNongyneCytoReport
from .llm_profile import LlmProfile
from .tumor_registry import TumorRegistry
from .wsi_setting import WsiScannerProfile, WsiSetting
from .wsi_file import WsiFile
from .wsi_slide_link import WsiSlideLink
from .stain_panel import StainPanel, StainPanelItem
from .his_export_log import HisExportLog
from .molecular_case import MolecularCase

# ... models อื่นๆ
# การทำแบบนี้จะทำให้เวลาเราเขียน:
# from app.models import SurgicalSpecimen
# มันจะทำงานได้ทันที และ Metadata จะโหลดคลาสทั้งหมดนี้ไว้รอสร้างตารางครับ
