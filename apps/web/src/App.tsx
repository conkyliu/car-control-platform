import React from 'react';
import { Layout, Typography, Space } from 'antd';
import { CarOutlined } from '@ant-design/icons';
import { CarControlPanel } from './components/CarControlPanel';

const { Header, Content, Footer } = Layout;
const { Title } = Typography;

export const App: React.FC = () => {
  return (
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
  );
};
