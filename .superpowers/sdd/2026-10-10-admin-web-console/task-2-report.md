# Sprint 1 Task 2 Execution Report: 登录与安全认证模块 (`LoginView.tsx` + `SliderCaptcha`)

- **Task Name**: 登录与安全认证模块 (P0 1.1 账号密码登录 + 1.2 登录防刷人机验证)
- **Base Commit**: `57484456af67382456bba4af080cf3317fce8fcb`
- **Commit Hash**: `ff237391142bd7c3e1c7cec893a4d5d9e2ad1410`
- **Date**: 2026-10-12
- **Status**: Completed (100% Verified)

---

## 1. 交付文件清单

| 文件路径 | 类型 | 功能说明 |
|---|---|---|
| `apps/web/src/components/SliderCaptcha/slider-captcha-core.ts` | 新增 | 滑块人机验证算法核心：位移限制计算、>=90% 阈值判定、一次性安全 Ticket 生成、生命周期状态控制器 |
| `apps/web/src/components/SliderCaptcha/SliderCaptcha.tsx` | 新增 | Ant Design 6 规范滑块人机验证组件，支持鼠标/移动端 Touch 拖拽交互、自适应宽度、`SliderCaptchaHandle` (`reset()` / `isVerified()`) |
| `apps/web/src/components/SliderCaptcha/index.ts` | 新增 | 统一模块导出 |
| `apps/web/src/views/auth/login-view-core.ts` | 新增 | 登录流程核心：账号本地记住持久化、表单与人机状态校验、规范化友好错误映射 (401/403/网络超时)、令牌存入 `useAuthStore` |
| `apps/web/src/views/auth/LoginView.tsx` | 新增 | 登录页面完整视图：科技深蓝渐变、居中卡片、AntD 6 Form、工号/密码/人机滑块/记住账号/立即登录，严丝合缝对齐 `docs/design/page-specs/login.md` |
| `apps/web/src/views/auth/index.ts` | 新增 | 统一视图导出 |
| `apps/web/src/App.tsx` | 修改 | 接入 Ant Design 6 纯 CSS 变量 `ConfigProvider` 主题，集成 `LoginView` 条件渲染与登录态桥接 |
| `apps/web/src/test/slider-captcha.test.ts` | 新增 | 滑块边界位移截断、90% 通过阈值、Ticket 生成与控制器重置测试 |
| `apps/web/src/test/login-view.test.ts` | 新增 | 记住账号持久化、防刷校验拦截、自然语言异常转换、成功存入 Zustand Store 流程测试 |

---

## 2. 自动化测试与构建验证

### 2.1 单元测试套件 (`pnpm --filter @car-control/web test`)
```text
▶ API Client, Stores, and Route Definitions Test Suite
  ✔ useAuthStore sets credentials, detects permissions and wildcards, clears auth
  ✔ useTenantStore manages active tenant, org tree, and tenant list
  ✔ HttpClient injects Authorization and x-tenant-id headers automatically
  ✔ HttpClient intercepts 401, calls refresh, updates store, and retries original request
  ✔ HttpClient queues concurrent 401 requests to trigger only ONE token refresh
  ✔ HttpClient clears useAuthStore and throws ApiError when refresh token itself fails
  ✔ HttpClient correctly parses 4xx and 5xx errors into structured ApiError
  ✔ Route definitions include all 15 business paths with title, icon, and permissions
  ✔ auth and tenant API wrapper functions are exported and callable
✔ API Client, Stores, and Route Definitions Test Suite (9 tests passed)

▶ LoginView Page Core Logic Test Suite
  ✔ Remember Me saves, retrieves, and clears username from storage
  ✔ validateLoginForm checks username, password, and captcha requirements
  ✔ mapLoginErrorToMessage returns spec-compliant natural language messages
  ✔ executeLogin blocks API call when captcha is not verified
  ✔ executeLogin succeeds, stores tokens and user in useAuthStore, persists username
✔ LoginView Page Core Logic Test Suite (5 tests passed)

▶ SliderCaptcha Human Verification Logic Test Suite
  ✔ calculateSliderOffset clamps displacement correctly within [0, maxOffset]
  ✔ evaluateSliderVerification verifies strictly against 90% threshold
  ✔ generateCaptchaToken produces non-empty unique verification tokens
  ✔ SliderCaptchaController handles lifecycle, rebound, success, and reset
✔ SliderCaptcha Human Verification Logic Test Suite (4 tests passed)

ℹ tests 21
ℹ pass 21
ℹ fail 0
```

### 2.2 构建验证 (`pnpm --filter @car-control/web build`)
- TypeScript 类型校验 (`tsc`)：0 报错。
- Vite 生产打包 (`vite build`)：成功打包 3055 modules，产物无任何警告或破坏。

---

## 3. 验收标准逐项核验

- [x] **未完成滑块拖动时无法触发登录请求**：表单拦截并友好提示“请先完成滑块人机验证”，提交按钮维持 disabled。
- [x] **滑块 90% 阈值判定与弹性回弹**：位移小于 90% 自动归零；达到或超过 90% 判定通过，锁定绿色常驻并触发 `onSuccess(token)`。
- [x] **双令牌存储与导航桥接**：调用 `loginApi` 成功后将 AccessToken、RefreshToken 及用户信息保存至 `useAuthStore`，触发 `onLoginSuccess`。
- [x] **友好的自然语言错误提示与异常自愈**：
  - 401 密码错误：“账号或密码不正确，连续失败 5 次将锁定 15 分钟”；
  - 403 账号停用：“该账号已被管理员停用，请联系企业管理员”；
  - 网络异常：“连接服务器超时，请检查网络设置”；
  - 失败时自动调用 `sliderRef.current.reset()` 重置滑块、清空密码并重新聚焦。
- [x] **记住账号功能**：勾选后持久化至 LocalStorage，下次进入时自动回显并聚焦至密码框。
- [x] **Ant Design 6 纯 CSS 变量风格**：使用 `--car-color-*` 和 `ConfigProvider` 主题 token，无老旧样式垫片。

---

## 4. 后续任务交接与关注事项

- **关注事项 (Concerns)**：无阻断性问题。
- **下一阶段衔接**：Sprint 1 Task 3 将实现主后台布局（`AdminLayout`、菜单与顶栏用户中心）及二级动态路由系统，届时将把 `/login` 接入 React Router 路由表并配合 `AuthGuard` 实现鉴权跳转闭环。


---

## 5. Review Findings 修复记录 (Commit: `f5579a5ac95600fe4e3e43a6728abbe0d37412c3`)

根据评审反馈，已完成以下关键优化与体验增强：
1. **用户名回车自动聚焦密码框** (`LoginView.tsx`)：
   - 为用户名输入框绑定 `onPressEnter` 事件，触发 `e.preventDefault()` 并通过 `passwordInputRef.current?.focus?.()` 平滑聚焦密码框，防止用户在完成人机验证前意外触发提前提交报错。
2. **移动端手势防冲突与触控优化** (`SliderCaptcha.tsx`)：
   - 滑块滑道轨道与拖拽把手样式均配置 `touchAction: 'none'`，彻底消除移动端浏览器在滑块交互过程中可能触发的页面手势下拉/横滑冲突。
3. **消除拖拽过程中的 Window 监听器重复绑定/解绑** (`SliderCaptcha.tsx`)：
   - 引入 `offsetRef = useRef<number>(0)` 实时记录拖拽位移，使 `handleEnd` 回调解耦对 `offset` state 的依赖，彻底避免每移动 1 像素即销毁并重新绑定 window `mousemove`/`mouseup` 监听器的性能开销。
4. **键盘无障碍访问增强** (`SliderCaptcha.tsx`)：
   - 拖拽把手增加 `tabIndex={disabled ? -1 : 0}`，支持键盘 Tab 导航聚焦与无障碍支持。
5. **回归测试与生产构建验证**：
   - `pnpm --filter @car-control/web test`：21/21 tests 100% 通过。
   - `pnpm --filter @car-control/web build`：`tsc && vite build` 0 报错通过。
