import { useState, useEffect } from "react";
import { App } from "antd";
import SpecimenTemplateService, {
  SpecimenTemplate,
} from "../../services/specimenTemplateService";
import SurgicalSpecimenService from "../../services/surgicalSpecimenService";
import logger from "../../utils/logger";
import type { Specimen } from "./SpecimenManagerSection";

export const useSpecimenManager = (
  activeCaseId: number | undefined,
  specimens: Specimen[],
  onSpecimensChange?: (updatedList: Specimen[]) => void,
) => {
  const { message } = App.useApp();
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [customSpecimens, setCustomSpecimens] = useState<SpecimenTemplate[]>(
    [],
  );
  const [newCustomName, setNewCustomName] = useState("");

  // --- Template Logic ---
  const fetchTemplates = async () => {
    try {
      const data = await SpecimenTemplateService.getTemplates();
      setCustomSpecimens(data);
    } catch (err) {
      logger.error("Failed to fetch templates", err);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const handleAddCustom = async () => {
    if (!newCustomName.trim()) return;
    try {
      await SpecimenTemplateService.createTemplate({
        name: newCustomName.trim(),
      });
      setNewCustomName("");
      message.success("เพิ่มเข้าลิสต์สำเร็จ");
      fetchTemplates();
    } catch (err: any) {
      message.error(err.response?.data?.detail || "ชื่อนี้อาจมีอยู่แล้วในระบบ");
    }
  };

  const handleEditCustom = async (id: number, updatedName: string) => {
    if (!updatedName.trim()) return;
    try {
      await SpecimenTemplateService.updateTemplate(id, {
        name: updatedName.trim(),
      });
      message.success("แก้ไขชื่อสำเร็จ");
      fetchTemplates();
    } catch (err: any) {
      message.error(err.response?.data?.detail || "ไม่สามารถแก้ไขได้");
    }
  };

  const handleRemoveCustom = async (id: number) => {
    try {
      await SpecimenTemplateService.deleteTemplate(id);
      message.success("ลบออกจากลิสต์สำเร็จ");
      fetchTemplates();
    } catch (err) {
      message.error("ไม่สามารถลบได้");
    }
  };

  // --- Case Specimen Logic ---
  const handleAdd = async (overrideName?: string) => {
    const nameToUse = (overrideName ?? newName).trim();
    if (!nameToUse || !activeCaseId) return;
    setLoading(true);
    try {
      const newSpecimen = await SurgicalSpecimenService.createSpecimen({
        surgical_case_id: activeCaseId,
        specimen_name: nameToUse,
      });
      onSpecimensChange?.([...specimens, newSpecimen]);
      setNewName("");
      message.success("เพิ่มชิ้นเนื้อสำเร็จ");
    } catch (err) {
      message.error("ไม่สามารถเพิ่มชิ้นเนื้อได้");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (index: number, record: Specimen) => {
    if (!record.id) return;
    try {
      setLoading(true);
      await SurgicalSpecimenService.deleteSpecimen(record.id);
      const updatedList = specimens
        .filter((_, i) => i !== index)
        .map((spec, i) => ({
          ...spec,
          specimen_label: String.fromCharCode(65 + i),
        }));
      onSpecimensChange?.(updatedList);
      message.success("ลบชิ้นเนื้อสำเร็จ");
    } catch (err: any) {
      message.error(err.response?.data?.detail || "ลบข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateName = async (id: number, updatedName: string) => {
    try {
      setLoading(true);
      const updated = await SurgicalSpecimenService.updateSpecimen(id, {
        specimen_name: updatedName,
      });
      const updatedList = specimens.map((s) => (s.id === id ? updated : s));
      onSpecimensChange?.(updatedList);
      message.success("แก้ไขชื่อชิ้นเนื้อสำเร็จ");
    } catch (err: any) {
      message.error(err.response?.data?.detail || "ไม่สามารถแก้ไขชื่อได้");
    } finally {
      setLoading(false);
    }
  };

  const displayNextLabel = () => {
    if (!specimens || specimens.length === 0) return "A";
    const lastLabel = specimens[specimens.length - 1].specimen_label;
    return String.fromCharCode(lastLabel.charCodeAt(0) + 1);
  };

  return {
    newName,
    setNewName,
    loading,
    isModalOpen,
    setIsModalOpen,
    customSpecimens,
    newCustomName,
    setNewCustomName,
    handleAddCustom,
    handleEditCustom,
    handleRemoveCustom,
    handleAdd,
    handleDelete,
    handleUpdateName,
    displayNextLabel,
  };
};
