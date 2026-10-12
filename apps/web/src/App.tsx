import React from 'react';
import { ConfigProvider, App as AntdApp } from 'antd';
import { AuthGuard } from './router/AuthGuard.tsx';

export const carControlTheme = {
  cssVar: { prefix: 'ant' },
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
  return (
    <ConfigProvider theme={carControlTheme}>
      <AntdApp>
        <AuthGuard />
      </AntdApp>
    </ConfigProvider>
  );
};

export default App;
