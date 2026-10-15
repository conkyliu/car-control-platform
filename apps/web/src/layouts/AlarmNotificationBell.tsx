import React from 'react';
import { Badge, Button, Tooltip } from 'antd';
import { BellOutlined } from '@ant-design/icons';
import { useNavTabsStore } from '../store/useNavTabsStore.ts';
import { RoutePath } from '../router/routes.ts';
import { usePendingAlarmCount } from '../views/alarm/alert-notification-core.ts';

export const AlarmNotificationBell: React.FC = () => {
  const openTab = useNavTabsStore((s) => s.openTab);
  const pendingCount = usePendingAlarmCount();

  const handleOpenAlarmsTab = () => {
    openTab({
      key: RoutePath.ALARMS,
      title: '报警中心',
      closable: true,
    });
  };

  return (
    <Tooltip
      title={
        pendingCount > 0
          ? `待处置告警: ${pendingCount} 条 (点击直达报警中心)`
          : '报警中心 (暂无待处置告警)'
      }
    >
      <Badge count={pendingCount} overflowCount={99} offset={[-2, 4]} size="small">
        <Button
          type="text"
          shape="circle"
          icon={<BellOutlined style={{ fontSize: 18, color: '#fff' }} />}
          onClick={handleOpenAlarmsTab}
          title="系统待处置告警通知"
          aria-label="系统待处置告警通知"
        />
      </Badge>
    </Tooltip>
  );
};

export default AlarmNotificationBell;
