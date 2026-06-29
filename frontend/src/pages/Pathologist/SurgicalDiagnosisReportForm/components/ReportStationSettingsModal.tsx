import React from "react";
import { Modal, Space, Typography, Radio, Select, Switch, Divider, Slider } from "antd";
import { SettingOutlined } from "@ant-design/icons";
import { UserPreferences } from "../../../../services/userService";

const { Text } = Typography;

interface ReportStationSettingsModalProps {
  open: boolean;
  onCancel: () => void;
  isSplitMode: boolean;
  diagnosisMode: string;
  isPatientInfoExpanded: boolean;
  showNavigator: boolean;
  autoSave: boolean;
  autoSaveInterval: number;
  editorFontSize: "small" | "medium" | "large";
  showSpecimenCategory: boolean;
  onUpdatePreference: (newPrefs: UserPreferences) => Promise<void>;
}

const INTERVAL_OPTIONS = [
  { label: "30s", value: 30 },
  { label: "45s", value: 45 },
  { label: "60s", value: 60 },
  { label: "90s", value: 90 },
];

const ReportStationSettingsModal: React.FC<ReportStationSettingsModalProps> = ({
  open,
  onCancel,
  isSplitMode,
  diagnosisMode,
  isPatientInfoExpanded,
  showNavigator,
  autoSave,
  autoSaveInterval,
  editorFontSize,
  showSpecimenCategory,
  onUpdatePreference,
}) => {
  return (
    <Modal
      title={
        <Space>
          <SettingOutlined />
          <span>Report Station Settings</span>
        </Space>
      }
      open={open}
      onCancel={onCancel}
      footer={null}
      width={420}
    >
      <Space direction="vertical" style={{ width: "100%" }} size="large">
        {/* 1. Layout Preference */}
        <section>
          <Text strong>Default Layout Style</Text>
          <div style={{ marginTop: 8 }}>
            <Radio.Group
              value={isSplitMode ? "split" : "single"}
              onChange={(e) =>
                onUpdatePreference({
                  is_split_mode: e.target.value === "split",
                })
              }
              buttonStyle="solid"
            >
              <Radio.Button value="single">Single View</Radio.Button>
              <Radio.Button value="split">Split View</Radio.Button>
            </Radio.Group>
          </div>
          <Text type="secondary" style={{ fontSize: "11px" }}>
            Choose between a focused single column or a side-by-side comparison
            view.
          </Text>
        </section>

        {/* 2. Diagnosis Mode Preference */}
        <section>
          <Text strong>Default Diagnosis Mode</Text>
          <div style={{ marginTop: 8 }}>
            <Select
              style={{ width: "100%" }}
              value={diagnosisMode}
              onChange={(val) =>
                onUpdatePreference({ default_diagnosis_mode: val })
              }
              options={[
                { label: "Individual", value: "individual" },
                { label: "Integrated", value: "integrated" },
                { label: "Clean Mode", value: "clean" },
              ]}
            />
          </div>
        </section>

        {/* 3. Patient Info Display Preference */}
        <section>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Text strong>Auto-expand Patient Info</Text>
            <Switch
              size="small"
              checked={isPatientInfoExpanded}
              onChange={(checked) =>
                onUpdatePreference({ patient_info_expanded: checked })
              }
            />
          </div>
          <Text type="secondary" style={{ fontSize: "11px" }}>
            Show full patient details and clinical history by default.
          </Text>
        </section>

        {/* 4. Navigator Display Preference */}
        <section>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Text strong>Show Navigator (Side Panel)</Text>
            <Switch
              size="small"
              checked={showNavigator}
              onChange={(checked) =>
                onUpdatePreference({ show_navigator: checked })
              }
            />
          </div>
          <Text type="secondary" style={{ fontSize: "11px" }}>
            Display the quick navigation links on the left side of the screen.
          </Text>
        </section>

        {/* 5. Auto-save */}
        <section>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <Text strong>Auto-save Draft</Text>
              <div>
                <Text type="secondary" style={{ fontSize: "11px" }}>
                  Automatically save when there are unsaved changes.
                </Text>
              </div>
            </div>
            <Switch
              size="small"
              checked={autoSave}
              onChange={(checked) => onUpdatePreference({ auto_save: checked })}
            />
          </div>
          {autoSave && (
            <div style={{ marginTop: 10 }}>
              <Text type="secondary" style={{ fontSize: "11px" }}>Save interval</Text>
              <Radio.Group
                size="small"
                value={autoSaveInterval}
                onChange={(e) => onUpdatePreference({ auto_save_interval: e.target.value })}
                style={{ marginTop: 6, display: "flex", gap: 4 }}
              >
                {INTERVAL_OPTIONS.map((opt) => (
                  <Radio.Button key={opt.value} value={opt.value}>{opt.label}</Radio.Button>
                ))}
              </Radio.Group>
            </div>
          )}
        </section>

        {/* 6. Editor Font Size */}
        <section>
          <Text strong>Editor Font Size</Text>
          <div style={{ marginTop: 8 }}>
            <Radio.Group
              value={editorFontSize}
              onChange={(e) => onUpdatePreference({ editor_font_size: e.target.value })}
              buttonStyle="solid"
            >
              <Radio.Button value="small">S</Radio.Button>
              <Radio.Button value="medium">M</Radio.Button>
              <Radio.Button value="large">L</Radio.Button>
            </Radio.Group>
          </div>
          <Text type="secondary" style={{ fontSize: "11px" }}>
            Font size applied to diagnosis text editors (S=13px, M=15px, L=18px).
          </Text>
        </section>

        {/* 7. Show Specimen Category Column */}
        <section>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <Text strong>Show Specimen Category Column</Text>
              <div>
                <Text type="secondary" style={{ fontSize: "11px" }}>
                  Display the IHC / AP test column in the specimen table.
                </Text>
              </div>
            </div>
            <Switch
              size="small"
              checked={showSpecimenCategory}
              onChange={(checked) => onUpdatePreference({ show_specimen_category: checked })}
            />
          </div>
        </section>

        <Divider style={{ margin: "8px 0" }} />

        <div style={{ textAlign: "center" }}>
          <Text
            type="secondary"
            style={{ fontSize: "12px", fontStyle: "italic" }}
          >
            * These preferences are saved to your profile and will be applied
            automatically on your next login.
          </Text>
        </div>
      </Space>
    </Modal>
  );
};

export default ReportStationSettingsModal;
