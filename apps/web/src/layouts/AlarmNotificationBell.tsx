import React, { useState } from 'react';
import { Badge, Button, Drawer, List, Tag, Typography, Space } from 'antd';
import { BellOutlined, ArrowRightOutlined, AlertOutlined } from '@ant-design/icons';
import { useNavTabsStore } from '../store/useNavTabsStore.ts';
import { RoutePath } from '../router/routes.ts';

const { Text, Title } = Typography;

export interface AlarmNoticeItem {
  id: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  title: string;
  targetVin: string;
  timestamp: string;
}

const DEMO_ALARMS: AlarmNoticeItem[] = [
  {
    id: 'alm-01',
    severity: 'CRITICAL',
    title: '车辆防盗非法入侵触发报警',
    targetVin: 'LSVAA2180E2034912',
    timestamp: '2 分钟前',
  },
  {
    id: 'alm-02',
    severity: 'HIGH',
    title: '主电瓶严重欠压 (<10.8V)',
    targetVin: 'LSVBA2180K2098231',
    timestamp: '15 分钟前',
  },
  {
    id: 'alm-03',
    severity: 'HIGH',
    title: '电子围栏越界越界告警',
    targetVin: 'LSVCA3180F3012984',
    timestamp: '40 分钟前',
  },
];

const SEVERITY_CONFIG: Record<string, { label: string; color: string }> = {
  CRITICAL: { label: '紧急 P0', color: '#cf1322' },
  HIGH: { label: '高危 P1', color: '#fa541c' },
  MEDIUM: { label: '中危 P2', color: '#faad14' },
  LOW: { label: '低危 P3', color: '#595959' },
};

export const AlarmNotificationBell: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [alarms, setAlarms] = useState<AlarmNoticeItem[]>(DEMO_ALARMS);
  const openTab = useNavTabsStore((s) => s.openTab);

  const unreadCount = alarms.length;

  const handleOpenAlarmsTab = () => {
    setOpen(false);
    openTab({
      key: RoutePath.ALARMS,
      title: '报警中心',
      closable: true,
    });
  };

  const handleClearAll = () => {
    setAlarms([]);
  };

  return (
    <>
      <Badge count={unreadCount} overflowCount={99} offset={[-2, 4]} size="small">
        <Button
          type="text"
          shape="circle"
          icon={<BellOutlined style={{ fontSize: 18, color: '#fff' }} />}
          onClick={() => setOpen(true)}
          title="系统未读告警通知"
          aria-label="系统未读告警通知"
        />
      </Badge>

      <Drawer
        title={
          <Space>
            <AlertOutlined style={{ color: '#ff4d4f' }} />
            <span>实时告警通知 ({unreadCount})</span>
          </Space>
        }
        placement="right"
        width={380}
        onClose={() => setOpen(false)}
        open={open}
        extra={
          unreadCount > 0 && (
            <Button type="link" size="small" onClick={handleClearAll}>
              全部已读
            </Button>
          )
        }
        footer={
          <div style={{ textAlign: 'center' }}>
            <Button
              type="primary"
              block
              icon={<ArrowRightOutlined />}
              onClick={handleOpenAlarmsTab}
            >
              一键直达报警中心处理
            </Button>
          </div>
        }
      >
        <List
          itemLayout="vertical"
          dataSource={alarms}
          locale={{ emptyText: '暂无未处理告警' }}
          renderItem={(item) => {
            const sev = SEVERITY_CONFIG[item.severity] ?? SEVERITY_CONFIG.LOW;
            return (
              <List.Item
                key={item.id}
                style={{
                  padding: '12px',
                  marginBottom: '10px',
                  borderRadius: 6,
                  background: '#fafafa',
                  border: '1px solid #f0f0f0',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Tag color={sev.color} style={{ margin: 0, fontWeight: 'bold' }}>
                    {sev.label}
                  </Tag>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {item.timestamp}
                  </Text>
                </div>
                <div style={{ marginTop: 8 }}>
                  <Text strong style={{ fontSize: 14 }}>
                    {item.title}
                  </Text>
                </div>
                <div style={{ marginTop: 4 }}>
                  <Text type="secondary" style={{ fontSize: 12, fontFamily: 'monospace' }}>
                    VIN: {item.targetVin}
                  </Text>
                </div>
              </List.Item>
            );
          }}
        />
      </Drawer>
    </>
  );
};

export default AlarmNotificationBell;
