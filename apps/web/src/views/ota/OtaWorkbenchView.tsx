import React, { useState } from 'react';
import {
  Tabs,
  Button,
  Space,
  Typography,
  message,
  theme,
} from 'antd';
import {
  CloudUploadOutlined,
  DashboardOutlined,
  RocketOutlined,
} from '@ant-design/icons';
import { FirmwareManageView } from './FirmwareManageView.tsx';
import { OtaExecutionDashboardView } from './OtaExecutionDashboardView.tsx';
import { OtaPlanWizardModal } from './OtaPlanWizardModal.tsx';
import { type OtaPlanDto } from './ota-plan-core.ts';

const { Title, Text } = Typography;

export type OtaWorkbenchTabKey = 'firmware' | 'execution';

/**
 * OTA 固件与批量升级综合工作台
 * 聚合固件包生命周期管理、4步向导式升级计划制定、与批量升级实时监控大屏
 */
export const OtaWorkbenchView: React.FC = () => {
  const { token } = theme.useToken();
  const [activeTabKey, setActiveTabKey] = useState<OtaWorkbenchTabKey>('execution');
  const [wizardOpen, setWizardOpen] = useState(false);
  const [targetPlanId, setTargetPlanId] = useState<string | undefined>(undefined);

  // 计划制定成功后，无缝切至 Tab 2 并高亮选中新计划
  const handlePlanCreated = (newPlan: OtaPlanDto) => {
    setWizardOpen(false);
    setActiveTabKey('execution');
    setTargetPlanId(newPlan.id);
    message.success(`升级计划 [${newPlan.name}] 已下发，已自动切至执行监控大屏`);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 顶部全局工作台工具栏与 Tabs 容器 */}
      <Tabs
        activeKey={activeTabKey}
        onChange={(key) => setActiveTabKey(key as OtaWorkbenchTabKey)}
        tabBarExtraContent={{
          right: (
            <Space style={{ paddingRight: 8 }}>
              <Button
                type="primary"
                icon={<RocketOutlined />}
                onClick={() => setWizardOpen(true)}
              >
                + 制定 OTA 计划
              </Button>
            </Space>
          ),
        }}
        items={[
          {
            key: 'execution',
            label: (
              <Space size={6}>
                <DashboardOutlined />
                <span>批量升级监控大屏</span>
              </Space>
            ),
            children: (
              <OtaExecutionDashboardView
                selectedPlanId={targetPlanId}
                onSelectPlanId={(id) => setTargetPlanId(id)}
              />
            ),
          },
          {
            key: 'firmware',
            label: (
              <Space size={6}>
                <CloudUploadOutlined />
                <span>固件包版本库</span>
              </Space>
            ),
            children: (
              <FirmwareManageView onPlanCreated={handlePlanCreated} />
            ),
          },
        ]}
      />

      {/* 全局 OTA 升级计划 4 步制定向导模态框 */}
      <OtaPlanWizardModal
        open={wizardOpen}
        onCancel={() => setWizardOpen(false)}
        onSuccess={handlePlanCreated}
      />
    </div>
  );
};
