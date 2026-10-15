# Sprint 1 Task 2 Brief: 登录与安全认证模块 (`LoginView.tsx` + `SliderCaptcha`)

## Context & Base Commit
- **Base Commit**: `57484456af67382456bba4af080cf3317fce8fcb`
- **Plan File**: `docs/superpowers/plans/2026-10-10-admin-web-console.md`
- **Page Spec**: `docs/design/page-specs/login.md` (已通过 Sprint 0 评审)
- **Design Tokens**: `docs/design/design-tokens.md` (Ant Design 6 纯 CSS 变量体系)
- **Component Guidelines**: `docs/design/component-guidelines.md` (13 类状态规范与自然交互文案)
- **Tech Stack**: React 19 + TypeScript 5 + Ant Design 6 (原生纯 CSS 变量) + Vite 8 + Zustand 5
- **Work Directory**: `/Users/mac/Work/AI/car-control-platform`

## Requirements

### 1. 滑块人机验证组件 (`apps/web/src/components/SliderCaptcha/SliderCaptcha.tsx`)
实现交互流畅的滑块人机验证组件：
- **视觉结构**：
  - 滑道轨道（Track，默认宽度约 320px，高度约 40px，圆角，浅灰/深色底）。
  - 进度背景色（拖拽时绿色/蓝色高亮条随滑块移动展开）。
  - 提示文案（中央居中文案：“向右滑动完成人机验证”，拖拽时透明度减低，验证通过后变为“验证通过”且背景全绿）。
  - 滑块拖拽头（Thumb，宽度约 44px，带有 `DoubleRightOutlined` 图标，成功时变为 `CheckCircleFilled`）。
- **拖动交互**：
  - 监听 `mousedown`/`mousemove`/`mouseup` 以及移动端 `touchstart`/`touchmove`/`touchend`。
  - 限制位移在 `[0, maxOffset]` 区间内。
  - 释放判断：若滑块位移达到 `maxOffset * 0.9` 及以上，判定验证通过；否则触发弹性回弹动画归零。
  - 验证成功后触发 `onSuccess(captchaToken: string)` 回调，并将组件锁定为 `success` 态。
  - 提供 `reset()` 方法或 `key` 刷新机制，支持登录失败后重置滑块状态。
- **纯 CSS / AntD 6 样式适配**：
  - 采用 Ant Design 6 变量或 CSS-in-JS/原生 CSS Module 编写，避免任何过时兼容垫片。

### 2. 登录视图组件 (`apps/web/src/views/auth/LoginView.tsx`)
实现符合企业级规格与功能清单 P0（1.1 账号密码登录、1.2 登录防刷人机验证）的登录页面：
- **页面布局**：
  - 科技深蓝渐变或高雅简洁居中卡片布局。
  - 品牌标识：Logo/Icon、标题“手机控车平台 · 管理中台”、副标题“Enterprise Vehicle IoT Management Console”。
- **表单要素**：
  - 账号输入框：`Input`，带有 `UserOutlined` 前缀图标，支持自动聚焦与回车提交。
  - 密码输入框：`Input.Password`，带有 `LockOutlined` 前缀图标。
  - 记住账号复选框：`Checkbox`，勾选时持久化记住用户名。
  - 滑块人机验证：嵌入 `SliderCaptcha`，未通过时登录按钮禁用或提交时提示。
  - 登录按钮：`Button type="primary" block size="large"`，支持 `loading` 状态。
- **业务流程与状态管理**：
  - 提交时调用 `loginApi({ username, password })`。
  - 成功时：调用 `useAuthStore.getState().setAuth(...)`，展示成功 Toast 提示，并触发导航（或通过 `props.onLoginSuccess?.()` 切换视图）。
  - 失败时：展示友好错误通知（如账户未激活、密码错误等），重置滑块验证码。
- **预留多租户/单点登录扩展**：支持租户标识参数传入。

### 3. 测试与构建验证
- 在 `apps/web/src/test/slider-captcha.test.ts` 中编写测试：
  - 验证 SliderCaptcha 初始状态与拖拽阈值判断逻辑（<90% 回弹，>=90% 成功）。
  - 验证 LoginView 在未完成验证时的防刷校验保护。
  - 验证登录成功与失败的状态更新。
- 编译通过：`pnpm --filter @car-control/web build` 0 报错。
- 运行测试：`pnpm --filter @car-control/web test` 100% 通过。
- 提交信息：`feat(web): implement SliderCaptcha human verification and LoginView page`
- 报告文件：`.superpowers/sdd/2026-10-10-admin-web-console/task-2-report.md`
