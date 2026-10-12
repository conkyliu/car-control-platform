import React, { useState } from 'react';
import {
  Avatar,
  Dropdown,
  Space,
  Tag,
  Typography,
  Drawer,
  Form,
  Input,
  Button,
  Popconfirm,
  message,
} from 'antd';
import type { MenuProps } from 'antd';
import {
  UserOutlined,
  KeyOutlined,
  LogoutOutlined,
  DownOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '../store/useAuthStore.ts';
import { executeLogout } from './admin-layout-core.ts';

const { Text } = Typography;

const ROLE_NAME_MAP: Record<string, string> = {
  SUPER_ADMIN: '超级管理员',
  TENANT_ADMIN: '租户管理员',
  ORG_ADMIN: '机构管理员',
  OPERATOR: '运营操作员',
  SECURITY_AUDITOR: '安全审计员',
  USER: '普通用户',
};

export const HeaderUserMenu: React.FC = () => {
  const user = useAuthStore((s) => s.user);
  const [passwordDrawerOpen, setPasswordDrawerOpen] = useState(false);
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const [form] = Form.useForm();

  const primaryRole = (user?.roles?.[0] as string) ?? 'USER';
  const roleLabel = ROLE_NAME_MAP[primaryRole] ?? primaryRole;
  const displayName = user?.displayName || user?.username || '管理员';

  const handleLogout = async () => {
    try {
      await executeLogout();
      message.success('已安全退出登录');
    } catch {
      message.error('退出登录异常');
    }
  };

  const handlePasswordSubmit = async () => {
    try {
      const values = await form.validateFields();
      setPasswordSubmitting(true);
      // 模拟修改密码接口通信
      await new Promise((resolve) => setTimeout(resolve, 600));
      message.success('密码修改成功，请牢记新密码');
      form.resetFields();
      setPasswordDrawerOpen(false);
    } catch (err: any) {
      if (err?.errorFields) {
        // Form validation error, antd handles display
        return;
      }
      message.error(err?.message || '密码修改失败，请重试');
    } finally {
      setPasswordSubmitting(false);
    }
  };

  const menuItems: MenuProps['items'] = [
    {
      key: 'user-profile',
      icon: <UserOutlined />,
      label: (
        <div>
          <div style={{ fontWeight: 600 }}>{displayName}</div>
          <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>账号: {user?.username}</div>
        </div>
      ),
      disabled: true,
    },
    {
      type: 'divider',
    },
    {
      key: 'change-password',
      icon: <KeyOutlined />,
      label: '修改密码',
      onClick: () => setPasswordDrawerOpen(true),
    },
    {
      type: 'divider',
    },
    {
      key: 'logout',
      icon: <LogoutOutlined style={{ color: '#ff4d4f' }} />,
      danger: true,
      label: (
        <Popconfirm
          title="退出登录"
          description="确认退出系统并清除当前会话吗？"
          okText="确认退出"
          cancelText="取消"
          onConfirm={handleLogout}
          placement="bottomRight"
        >
          <span style={{ display: 'inline-block', width: '100%' }}>退出登录</span>
        </Popconfirm>
      ),
    },
  ];

  return (
    <>
      <Dropdown menu={{ items: menuItems }} placement="bottomRight" arrow>
        <Space
          style={{
            cursor: 'pointer',
            padding: '4px 8px',
            borderRadius: 6,
            transition: 'background 0.2s',
          }}
        >
          <Avatar
            size="small"
            icon={<UserOutlined />}
            style={{ backgroundColor: '#1677ff' }}
            src={user?.avatar}
          />
          <Text style={{ color: '#fff', fontSize: 13, fontWeight: 500 }}>{displayName}</Text>
          <Tag color="cyan" style={{ margin: 0, fontSize: 11 }}>
            {roleLabel}
          </Tag>
          <DownOutlined style={{ color: 'rgba(255,255,255,0.65)', fontSize: 10 }} />
        </Space>
      </Dropdown>

      <Drawer
        title="修改密码"
        width={380}
        placement="right"
        onClose={() => setPasswordDrawerOpen(false)}
        open={passwordDrawerOpen}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button onClick={() => setPasswordDrawerOpen(false)}>取消</Button>
            <Button
              type="primary"
              loading={passwordSubmitting}
              icon={<CheckCircleOutlined />}
              onClick={handlePasswordSubmit}
            >
              确认修改
            </Button>
          </div>
        }
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="oldPassword"
            label="原密码"
            rules={[{ required: true, message: '请输入当前使用的原密码' }]}
          >
            <Input.Password placeholder="请输入原密码" />
          </Form.Item>

          <Form.Item
            name="newPassword"
            label="新密码"
            rules={[
              { required: true, message: '请输入新密码' },
              { min: 8, message: '密码长度至少 8 位' },
            ]}
            hasFeedback
          >
            <Input.Password placeholder="至少 8 位，包含字母与数字" />
          </Form.Item>

          <Form.Item
            name="confirmPassword"
            label="确认新密码"
            dependencies={['newPassword']}
            hasFeedback
            rules={[
              { required: true, message: '请再次输入新密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('newPassword') === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error('两次输入的新密码不一致'));
                },
              }),
            ]}
          >
            <Input.Password placeholder="请再次输入新密码以确认" />
          </Form.Item>
        </Form>
      </Drawer>
    </>
  );
};

export default HeaderUserMenu;
