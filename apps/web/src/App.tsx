import React from 'react';
import { Layout, Typography, Space, ConfigProvider } from 'antd';
import { CarOutlined } from '@ant-design/icons';
import { CarControlPanel } from './components/CarControlPanel.tsx';
import { LoginView } from './views/auth/LoginView.tsx';
import { useAuthStore } from './store/useAuthStore.ts';

const { Header, Content, Footer } = Layout;
const { Title } = Typography;

export const carControlTheme = {
  cssVar: true,
  token: {
    colorPrimary: '#1677ff',
    colorSuccess: '#52c41a',
    colorWarning: '#faad14',
    colorError: '#ff4d4f',
    colorInfo: '#1677ff',
    borderRadius: 6,
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang SC', sans-serif",
  },
  components: {
    Layout: {
      headerBg: '#001529',
      siderBg: '#001529',
    },
    Table: {
      headerBg: '#fafafa',
      rowHoverBg: '#f0f5ff',
    },
    Card: {
      headerHeight: 48,
    },
  },
};

export const App: React.FC = () => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  return (
    <ConfigProvider theme={carControlTheme}>
      {!isAuthenticated ? (
        <LoginView />
      ) : (
        <Layout style={{ minHeight: '100vh' }}>
          <Header
            style={{
              display: 'flex',
              alignItems: 'center',
              backgroundColor: '#001529',
              padding: '0 24px',
            }}
          >
            <Space size="middle">
              <CarOutlined style={{ fontSize: 24, color: '#1890ff' }} />
              <Title level={4} style={{ color: '#fff', margin: 0 }}>
                手机控车平台 · 全栈控制台 V2.0
              </Title>
            </Space>
          </Header>
          <Content style={{ padding: '16px 24px' }}>
            <CarControlPanel />
          </Content>
          <Footer style={{ textAlign: 'center', color: '#888' }}>
            手机控车平台 (Car Control Platform) · 企业级全栈架构 · 2026
          </Footer>
        </Layout>
      )}
    </ConfigProvider>
  );
};
