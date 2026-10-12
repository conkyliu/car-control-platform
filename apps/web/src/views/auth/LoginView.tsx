import React, { useState, useEffect, useRef } from 'react';
import {
  Form,
  Input,
  Button,
  Checkbox,
  Card,
  Typography,
  Space,
  message,
  Modal,
} from 'antd';
import {
  UserOutlined,
  LockOutlined,
  CarOutlined,
} from '@ant-design/icons';
import {
  SliderCaptcha,
} from '../../components/SliderCaptcha/SliderCaptcha.tsx';
import type { SliderCaptchaHandle } from '../../components/SliderCaptcha/SliderCaptcha.tsx';
import {
  getRememberedUsername,
  mapLoginErrorToMessage,
  executeLogin,
} from './login-view-core.ts';
import type { LoginFormValues } from './login-view-core.ts';
import type { AuthResult } from '../../api/auth.ts';
import { useAuthStore } from '../../store/useAuthStore.ts';

export * from './login-view-core.ts';

const { Title, Text, Link } = Typography;

export interface LoginViewProps {
  onLoginSuccess?: (result?: AuthResult) => void;
  tenantId?: string;
  initialUsername?: string;
  className?: string;
  style?: React.CSSProperties;
}

export const LoginView: React.FC<LoginViewProps> = ({
  onLoginSuccess,
  tenantId,
  initialUsername,
  className,
  style,
}) => {
  const [form] = Form.useForm<LoginFormValues>();
  const [loading, setLoading] = useState<boolean>(false);
  const [isCaptchaVerified, setIsCaptchaVerified] = useState<boolean>(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  const sliderRef = useRef<SliderCaptchaHandle>(null);
  const passwordInputRef = useRef<any>(null);

  // 初始化：检查登录态与记住账号逻辑
  useEffect(() => {
    // 若当前已处于鉴权登录态，静默触发导航通知
    const authState = useAuthStore.getState();
    if (authState.isAuthenticated && authState.accessToken) {
      onLoginSuccess?.();
      return;
    }

    const remembered = initialUsername ?? getRememberedUsername();
    if (remembered) {
      form.setFieldsValue({
        username: remembered,
        rememberMe: true,
      });
      // 记住账号场景下自动聚焦到密码框
      setTimeout(() => {
        passwordInputRef.current?.focus?.();
      }, 100);
    } else {
      form.setFieldsValue({
        rememberMe: true,
      });
    }
  }, [form, initialUsername, onLoginSuccess]);

  const handleCaptchaSuccess = (token: string) => {
    setIsCaptchaVerified(true);
    setCaptchaToken(token);
  };

  const handleCaptchaReset = () => {
    setIsCaptchaVerified(false);
    setCaptchaToken(null);
  };

  const handleForgotPassword = () => {
    Modal.info({
      title: '重置与找回密码',
      content: (
        <div>
          <p>为保障企业车控核心中台资产安全，系统不开放公网自助重置密码通道。</p>
          <p>请联系您所在企业的系统管理员或中台运维工程师为您派发临时重置链接。</p>
        </div>
      ),
      okText: '知道了',
    });
  };

  const handleSubmit = async (values: LoginFormValues) => {
    if (!isCaptchaVerified) {
      message.warning('请先完成滑块人机验证');
      return;
    }

    setLoading(true);

    try {
      const authResult = await executeLogin({
        input: {
          username: values.username,
          password: values.password,
          tenantId,
        },
        captchaVerified: isCaptchaVerified,
        captchaToken,
        rememberMe: Boolean(values.rememberMe),
      });

      const displayName =
        authResult.user?.displayName || authResult.user?.username || '管理员';
      message.success(`欢迎回来，${displayName}`);

      onLoginSuccess?.(authResult);
    } catch (err: unknown) {
      const friendlyNotice = mapLoginErrorToMessage(err);
      message.error(friendlyNotice);

      // 登录失败异常恢复策略：重置滑块、清空密码并重新聚焦
      sliderRef.current?.reset();
      setIsCaptchaVerified(false);
      setCaptchaToken(null);
      form.setFieldValue('password', '');
      passwordInputRef.current?.focus?.();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className={className}
      style={{
        minHeight: '100vh',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '24px 16px',
        background: 'linear-gradient(135deg, #001529 0%, #002347 50%, #0a3663 100%)',
        boxSizing: 'border-box',
        ...style,
      }}
    >
      <div style={{ flex: '1 0 auto', display: 'flex', alignItems: 'center' }}>
        <Card
          bordered={false}
          style={{
            width: '100%',
            maxWidth: 420,
            borderRadius: 8,
            boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.28)',
            backgroundColor: '#ffffff',
            padding: '12px 16px',
          }}
        >
          {/* 头部品牌标识 */}
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: '50%',
                backgroundColor: 'var(--car-color-primary-bg, #e6f4ff)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 12,
              }}
            >
              <CarOutlined style={{ fontSize: 28, color: 'var(--car-color-primary, #1677ff)' }} />
            </div>
            <Title level={3} style={{ margin: '0 0 6px 0', color: 'var(--car-text-title, rgba(0, 0, 0, 0.88))' }}>
              手机控车平台 · 企业级管理中台
            </Title>
            <Text type="secondary" style={{ fontSize: 13 }}>
              Enterprise Vehicle IoT Management Console
            </Text>
          </div>

          {/* 登录表单 */}
          <Form
            form={form}
            layout="vertical"
            size="large"
            onFinish={handleSubmit}
            requiredMark={false}
            autoComplete="off"
          >
            {/* 用户名 */}
            <Form.Item
              name="username"
              rules={[
                { required: true, message: '请输入管理员工号 / 账号' },
                { min: 3, max: 32, message: '账号长度在 3~32 位字符之间' },
              ]}
            >
              <Input
                prefix={<UserOutlined style={{ color: 'var(--car-text-secondary, #8c8c8c)' }} />}
                placeholder="请输入管理员工号 / 账号"
                allowClear
                autoFocus
                disabled={loading}
                onPressEnter={(e) => {
                  e.preventDefault();
                  passwordInputRef.current?.focus?.();
                }}
              />
            </Form.Item>

            {/* 密码 */}
            <Form.Item
              name="password"
              rules={[{ required: true, message: '请输入登录密码' }]}
            >
              <Input.Password
                ref={passwordInputRef}
                prefix={<LockOutlined style={{ color: 'var(--car-text-secondary, #8c8c8c)' }} />}
                placeholder="请输入登录密码"
                allowClear
                disabled={loading}
              />
            </Form.Item>

            {/* 人机验证滑块 */}
            <Form.Item style={{ marginBottom: 16 }}>
              <SliderCaptcha
                ref={sliderRef}
                onSuccess={handleCaptchaSuccess}
                onReset={handleCaptchaReset}
                disabled={loading}
              />
            </Form.Item>

            {/* 记住账号与忘记密码 */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 24,
              }}
            >
              <Form.Item name="rememberMe" valuePropName="checked" noStyle>
                <Checkbox disabled={loading}>记住账号</Checkbox>
              </Form.Item>
              <Link onClick={handleForgotPassword} style={{ fontSize: 13 }}>
                忘记密码？
              </Link>
            </div>

            {/* 立即登录按钮 */}
            <Form.Item style={{ marginBottom: 8 }}>
              <Button
                type="primary"
                htmlType="submit"
                block
                size="large"
                loading={loading}
                disabled={!isCaptchaVerified || loading}
                style={{
                  height: 44,
                  borderRadius: 6,
                  fontSize: 16,
                  fontWeight: 500,
                }}
              >
                立 即 登 录
              </Button>
            </Form.Item>
          </Form>
        </Card>
      </div>

      {/* 底部版权信息 */}
      <footer style={{ textAlign: 'center', color: 'rgba(255, 255, 255, 0.55)', fontSize: 12 }}>
        Copyright © 2026 手机控车平台. All rights reserved.
      </footer>
    </div>
  );
};

LoginView.displayName = 'LoginView';
