import React, { useState } from 'react';
import {
  Layout,
  Menu,
  Breadcrumb,
  Button,
  Card,
  Space,
  Tag,
  Typography,
  Empty,
} from 'antd';
import type { MenuProps } from 'antd';
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  CarOutlined,
  DashboardOutlined,
  ApartmentOutlined,
  ClusterOutlined,
  UserOutlined,
  SafetyCertificateOutlined,
  DesktopOutlined,
  ControlOutlined,
  AimOutlined,
  CompassOutlined,
  AlertOutlined,
  CloudUploadOutlined,
  FileTextOutlined,
  LineChartOutlined,
  BookOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '../store/useAuthStore.ts';
import { useNavTabsStore } from '../store/useNavTabsStore.ts';
import {
  RoutePath,
  getAccessibleRoutesByCategory,
  computeBreadcrumbs,
  findRouteByPath,
} from '../router/routes.ts';
import { TenantSelector } from './TenantSelector.tsx';
import { AlarmNotificationBell } from './AlarmNotificationBell.tsx';
import { HeaderUserMenu } from './HeaderUserMenu.tsx';
import { NavTabs } from './NavTabs.tsx';
import {
  CarControlWorkbench,
  CapabilityTemplateView,
  DigitalKeyManageView,
  CommandDictionaryView,
} from '../views/command/index.ts';
import { TenantListView, OrgTreeView } from '../views/tenant/index.ts';
import { UserListView, RolePermissionView, AuditLogView } from '../views/rbac/index.ts';
import { DeviceListView, ProjectManageView } from '../views/device/index.ts';
import { VehicleListView, ModelManageView } from '../views/vehicle/index.ts';
import { RealtimeLocationMap, GeofenceManageView } from '../views/telemetry/index.ts';

const { Header, Sider, Content, Footer } = Layout;
const { Title, Text, Paragraph } = Typography;

const ROUTE_ICON_MAP: Record<string, React.ReactNode> = {
  DashboardOutlined: <DashboardOutlined />,
  ApartmentOutlined: <ApartmentOutlined />,
  ClusterOutlined: <ClusterOutlined />,
  UserOutlined: <UserOutlined />,
  SafetyCertificateOutlined: <SafetyCertificateOutlined />,
  DesktopOutlined: <DesktopOutlined />,
  CarOutlined: <CarOutlined />,
  ControlOutlined: <ControlOutlined />,
  AimOutlined: <AimOutlined />,
  CompassOutlined: <CompassOutlined />,
  AlertOutlined: <AlertOutlined />,
  CloudUploadOutlined: <CloudUploadOutlined />,
  FileTextOutlined: <FileTextOutlined />,
  LineChartOutlined: <LineChartOutlined />,
  BookOutlined: <BookOutlined />,
};

export const AdminLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);

  const hasPermission = useAuthStore((s) => s.hasPermission);
  const activeKey = useNavTabsStore((s) => s.activeKey);
  const openTab = useNavTabsStore((s) => s.openTab);
  const refreshCounter = useNavTabsStore((s) => s.refreshCount[s.activeKey] ?? 0);

  // 根据当前登录权限过滤可访问路由并按分类归集
  const accessibleGroups = getAccessibleRoutesByCategory(hasPermission);

  // 构建 Ant Design 侧边栏菜单项
  const menuItems: MenuProps['items'] = Object.entries(accessibleGroups).map(
    ([categoryName, routeList]) => {
      // 若分类为概览看板且仅有1条，提升为一级菜单
      if (categoryName === '概览看板' && routeList.length === 1) {
        const item = routeList[0]!;
        return {
          key: item.path,
          icon: item.icon ? ROUTE_ICON_MAP[item.icon] : undefined,
          label: item.title,
        };
      }

      return {
        key: `group-${categoryName}`,
        label: categoryName,
        children: routeList.map((item) => ({
          key: item.path,
          icon: item.icon ? ROUTE_ICON_MAP[item.icon] : undefined,
          label: item.title,
        })),
      };
    }
  );

  const handleMenuClick: MenuProps['onClick'] = ({ key }) => {
    const route = findRouteByPath(key);
    if (route) {
      openTab({
        key: route.path,
        title: route.title,
        closable: route.path !== RoutePath.DASHBOARD,
        icon: route.icon,
      });
    }
  };

  const breadcrumbs = computeBreadcrumbs(activeKey);
  const currentRouteMeta = findRouteByPath(activeKey);

  // 渲染主内容区域视图
  const renderActiveView = () => {
    if (activeKey === RoutePath.TENANTS) {
      return <TenantListView />;
    }

    if (activeKey === RoutePath.ORGS) {
      return <OrgTreeView />;
    }

    if (activeKey === RoutePath.USERS) {
      return <UserListView />;
    }

    if (activeKey === RoutePath.ROLES) {
      return <RolePermissionView />;
    }

    if (activeKey === RoutePath.LOGS) {
      return <AuditLogView />;
    }

    if (activeKey === RoutePath.DEVICES) {
      return <DeviceListView />;
    }

    if (activeKey === RoutePath.VEHICLES) {
      return <VehicleListView />;
    }

    if (activeKey === RoutePath.MODELS) {
      return <ModelManageView />;
    }

    if (activeKey === RoutePath.PROJECTS) {
      return <ProjectManageView />;
    }

    if (activeKey === RoutePath.COMMANDS) {
      return <CarControlWorkbench />;
    }

    if (activeKey === RoutePath.CAPABILITIES) {
      return <CapabilityTemplateView />;
    }

    if (activeKey === RoutePath.DIGITAL_KEYS) {
      return <DigitalKeyManageView />;
    }

    if (activeKey === RoutePath.COMMAND_DICTIONARY) {
      return <CommandDictionaryView />;
    }

    if (activeKey === RoutePath.TELEMETRY) {
      return <RealtimeLocationMap />;
    }

    if (activeKey === RoutePath.GEOFENCE) {
      return <GeofenceManageView />;
    }

    return (
      <Card
        style={{
          borderRadius: 8,
          boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
        }}
      >
        <div style={{ marginBottom: 16 }}>
          <Space align="center" size="middle">
            <Title level={4} style={{ margin: 0 }}>
              {currentRouteMeta?.title ?? '控制台工作台'}
            </Title>
            {currentRouteMeta?.category && (
              <Tag color="blue">{currentRouteMeta.category}</Tag>
            )}
          </Space>
          {currentRouteMeta?.description && (
            <Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
              {currentRouteMeta.description}
            </Paragraph>
          )}
        </div>

        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <div>
              <Text strong style={{ fontSize: 15 }}>
                {currentRouteMeta?.title ?? '功能页面'} 开发就绪
              </Text>
              <div style={{ color: 'rgba(0,0,0,0.45)', marginTop: 4 }}>
                该模块底层 API 与契约已就绪，将在接下来的迭代中提供专属可视化大屏与交互表单。
              </div>
            </div>
          }
        />
      </Card>
    );
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {/* 左侧可折叠沉浸式侧边栏 */}
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        trigger={null}
        width={220}
        collapsedWidth={64}
        style={{
          overflow: 'auto',
          height: '100vh',
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
          zIndex: 100,
          backgroundColor: '#001529',
          transition: 'all 0.2s ease',
        }}
      >
        {/* Brand Logo 区域 */}
        <div
          style={{
            height: 56,
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            padding: collapsed ? '0' : '0 20px',
            gap: 12,
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <CarOutlined style={{ fontSize: 24, color: '#1677ff', flexShrink: 0 }} />
          {!collapsed && (
            <span
              style={{
                color: '#fff',
                fontSize: 16,
                fontWeight: 600,
                letterSpacing: 0.5,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              手机控车平台
            </span>
          )}
        </div>

        {/* 动态 RBAC 菜单 */}
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[activeKey]}
          defaultOpenKeys={Object.keys(accessibleGroups).map((k) => `group-${k}`)}
          items={menuItems}
          onClick={handleMenuClick}
          style={{ borderRight: 0, backgroundColor: 'transparent' }}
        />
      </Sider>

      {/* 右侧主布局容器 */}
      <Layout
        style={{
          marginLeft: collapsed ? 64 : 220,
          transition: 'all 0.2s ease',
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#f5f7fa',
        }}
      >
        {/* 顶部 Header 沉浸栏 */}
        <Header
          style={{
            height: 56,
            padding: '0 20px',
            backgroundColor: '#001529',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            position: 'sticky',
            top: 0,
            zIndex: 90,
            boxShadow: '0 1px 4px rgba(0, 21, 41, 0.12)',
          }}
        >
          {/* 左侧：折叠展开触发器 */}
          <Space size="middle" align="center">
            <Button
              type="text"
              icon={
                collapsed ? (
                  <MenuUnfoldOutlined style={{ color: '#fff', fontSize: 17 }} />
                ) : (
                  <MenuFoldOutlined style={{ color: '#fff', fontSize: 17 }} />
                )
              }
              onClick={() => setCollapsed(!collapsed)}
              title={collapsed ? '展开侧边栏' : '折叠侧边栏'}
              aria-label={collapsed ? '展开侧边栏' : '折叠侧边栏'}
            />
          </Space>

          {/* 右侧：租户切换器 + 告警铃铛 + 用户菜单 */}
          <Space size="middle" align="center">
            <TenantSelector />
            <AlarmNotificationBell />
            <HeaderUserMenu />
          </Space>
        </Header>

        {/* 多标签页工作台 */}
        <NavTabs />

        {/* 面包屑导航指示条 */}
        <div style={{ padding: '12px 20px 0' }}>
          <Space size="small">
            <Text type="secondary" style={{ fontSize: 12 }}>
              当前位置:
            </Text>
            <Breadcrumb
              items={breadcrumbs.map((crumb) => ({
                title: crumb.title,
              }))}
            />
          </Space>
        </div>

        {/* 业务内容区域 */}
        <Content
          key={`${activeKey}-${refreshCounter}`}
          style={{
            padding: '12px 20px 20px',
            flex: 1,
          }}
        >
          {renderActiveView()}
        </Content>

        {/* 底部版权说明 */}
        <Footer
          style={{
            textAlign: 'center',
            color: 'rgba(0, 0, 0, 0.45)',
            fontSize: 13,
            padding: '16px 20px',
            background: 'transparent',
          }}
        >
          Copyright © 2026 手机控车平台. All rights reserved.
        </Footer>
      </Layout>
    </Layout>
  );
};

export default AdminLayout;
