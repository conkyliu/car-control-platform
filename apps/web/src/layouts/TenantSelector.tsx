import React, { useEffect } from 'react';
import { Select, Space, Tag, Badge, Typography } from 'antd';
import { ApartmentOutlined } from '@ant-design/icons';
import { useTenantStore } from '../store/useTenantStore.ts';
import { useAuthStore } from '../store/useAuthStore.ts';
import { switchTenant, isSuperAdminUser } from './admin-layout-core.ts';

const { Text } = Typography;

const DEFAULT_DEMO_TENANTS = [
  { id: 't_default', name: '平台直属运营车队', code: 'PLATFORM_DEFAULT', status: 'ACTIVE' as const, quotaDeviceCount: 1000 },
  { id: 't_enterprise_01', name: '极速物流股份租户', code: 'JISU_LOGISTICS', status: 'ACTIVE' as const, quotaDeviceCount: 500 },
  { id: 't_enterprise_02', name: '安捷客运出行租户', code: 'ANJIE_MOBILITY', status: 'ACTIVE' as const, quotaDeviceCount: 200 },
];

export const TenantSelector: React.FC = () => {
  const currentTenantId = useTenantStore((s) => s.currentTenantId);
  const tenantList = useTenantStore((s) => s.tenantList);
  const setTenantList = useTenantStore((s) => s.setTenantList);
  const user = useAuthStore((s) => s.user);

  const isSuperAdmin = isSuperAdminUser(user?.roles as string[] | undefined);

  // 初始化保障：若租户列表为空，注入基线示例租户列表并同步激活租户
  useEffect(() => {
    if (tenantList.length === 0) {
      setTenantList(DEFAULT_DEMO_TENANTS);
      if (!currentTenantId) {
        useTenantStore.getState().setCurrentTenantId(DEFAULT_DEMO_TENANTS[0].id);
      }
    } else if (!currentTenantId) {
      useTenantStore.getState().setCurrentTenantId(tenantList[0]?.id ?? 't_default');
    }
  }, [tenantList.length, currentTenantId, setTenantList]);

  const activeTenants = tenantList.length > 0 ? tenantList : DEFAULT_DEMO_TENANTS;
  const currentTenant = activeTenants.find((t) => t.id === currentTenantId) ?? activeTenants[0];

  const handleTenantChange = (value: string) => {
    switchTenant(value);
  };

  if (!isSuperAdmin) {
    // 普通租户：只读锁定显示租户名与配额
    return (
      <Space
        size="small"
        style={{
          background: 'rgba(255, 255, 255, 0.08)',
          padding: '4px 12px',
          borderRadius: 6,
          border: '1px solid rgba(255, 255, 255, 0.15)',
        }}
      >
        <ApartmentOutlined style={{ color: '#4096ff' }} />
        <Text style={{ color: '#fff', fontSize: 13, fontWeight: 500 }}>
          {currentTenant?.name ?? '当前企业租户'}
        </Text>
        <Badge
          count={`配额: ${currentTenant?.quotaDeviceCount ?? 1000}`}
          style={{ backgroundColor: '#1677ff', color: '#fff', fontSize: 11 }}
        />
      </Space>
    );
  }

  // 超级管理员：下拉选择租户
  return (
    <Space size="small">
      <ApartmentOutlined style={{ color: '#4096ff', fontSize: 15 }} />
      <Select
        value={currentTenant?.id ?? 't_default'}
        onChange={handleTenantChange}
        style={{ minWidth: 260 }}
        popupMatchSelectWidth={false}
        dropdownStyle={{ minWidth: 320 }}
        aria-label="租户切换器"
        options={activeTenants.map((item) => ({
          value: item.id,
          label: (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontWeight: 500 }}>{item.name}</span>
              <Space size={4}>
                <Tag color="blue" style={{ fontSize: 11, margin: 0 }}>
                  配额 {item.quotaDeviceCount}
                </Tag>
                <Tag
                  color={item.status === 'ACTIVE' ? 'success' : 'warning'}
                  style={{ fontSize: 11, margin: 0 }}
                >
                  {item.status === 'ACTIVE' ? '正常' : '暂停'}
                </Tag>
              </Space>
            </div>
          ),
        }))}
      />
    </Space>
  );
};

export default TenantSelector;
