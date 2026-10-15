# Sprint 1 Task 1 Brief: apps/web 基础通信层、API 客户端与全局状态底座

## Context & Base Commit
- **Base Commit**: `1117d693061d542c28d4f2308a9381e282f5c922`
- **Plan File**: `docs/superpowers/plans/2026-10-10-admin-web-console.md`
- **Tech Stack**: React 19 + TypeScript 5 + Ant Design 6 + Vite 8 + Zustand 5

## Requirements

### 1. HTTP 客户端封装 (`apps/web/src/api/client.ts`)
实现健壮的 HTTP 客户端：
- 支持 `baseUrl: '/api/v1'`，自动设置 `Content-Type: application/json`。
- **请求拦截**：
  - 自动从 `useAuthStore` 读取 `accessToken`，添加 `Authorization: Bearer ${accessToken}` 头。
  - 自动从 `useTenantStore` 读取 `currentTenantId`，添加 `x-tenant-id: ${currentTenantId}` 头。
- **响应拦截与无感静默刷新**：
  - 当收到 401 Unauthorized 时，若存在 `refreshToken` 且非刷新请求本身，自动发起 `POST /api/v1/auth/refresh` 刷新令牌：
    - 若刷新成功：更新 `useAuthStore` 中的 tokens，并自动重发原始失败请求；
    - 若刷新失败：清空 `useAuthStore`，跳转至登录页或触发全局登出事件。
  - 统一错误格式解析并抛出结构化 `ApiError`（包含 `statusCode`, `message`, `error`）。
- 提供便捷方法：`http.get<T>(url, params)`, `http.post<T>(url, data)`, `http.patch<T>(url, data)`, `http.delete<T>(url)`。

### 2. 认证与多租户 API 定义
- `apps/web/src/api/auth.ts`:
  - `loginApi(input: { username: string; password: string }): Promise<AuthResult>`
  - `refreshApi(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }>`
  - `profileApi(): Promise<UserProfile>`
  - `logoutApi(): Promise<void>`
- `apps/web/src/api/tenant.ts`:
  - `getTenantsApi(): Promise<TenantDto[]>`
  - `getTenantQuotaApi(tenantId: string): Promise<TenantQuotaDto>`
  - `updateTenantStatusApi(tenantId: string, status: string): Promise<void>`
  - `getOrgTreeApi(tenantId?: string): Promise<OrgNodeDto[]>`
  - `createOrgApi(data: any): Promise<any>`

### 3. 全局状态存储 (`apps/web/src/store/`)
- `useAuthStore.ts`:
  - 状态：`accessToken: string | null`, `refreshToken: string | null`, `user: UserInfo | null`, `permissions: string[]`, `isAuthenticated: boolean`
  - 操作：`setAuth(tokens, user, permissions)`, `clearAuth()`, `hasPermission(permCode): boolean`
  - 持久化支持（本地 localStorage 存储 token 与用户信息，保证刷新不丢失）
- `useTenantStore.ts`:
  - 状态：`currentTenantId: string | null`, `currentOrgId: string | null`, `tenantList: TenantDto[]`, `orgTree: OrgNodeDto[]`
  - 操作：`setCurrentTenantId(id: string)`, `setCurrentOrgId(id: string)`, `setTenantList(list)`, `setOrgTree(tree)`
  - 持久化支持（保存选中的租户 ID）

### 4. 路由定义与导航状态 (`apps/web/src/router/routes.ts`)
- 定义系统所有路由路径枚举与元数据：
  - `/login`: 登录
  - `/dashboard`: 运营看板
  - `/tenants`: 租户管理
  - `/orgs`: 机构管理
  - `/users`: 用户管理
  - `/roles`: 角色权限
  - `/devices`: 设备管理
  - `/vehicles`: 车辆管理
  - `/commands`: 车控中心
  - `/telemetry`: 实时定位与轨迹
  - `/geofence`: 电子围栏
  - `/alarms`: 报警中心
  - `/ota`: 固件升级
  - `/logs`: 通讯日志
  - `/monitor`: 运维监控
- 包含图标、标题、权限代码、分组等元信息。

### 5. 单元测试与验证
- 在 `apps/web/src/test/api-client.test.ts` 中编写测试：
  - 验证请求拦截器正确注入 Bearer Token 和 x-tenant-id。
  - 验证 401 拦截并调用 refresh 成功后重发请求。
  - 验证 useAuthStore 登录/登出和权限检测。
  - 验证 useTenantStore 租户切换。
- 编译通过：`pnpm --filter @car-control/web build` 0 报错。
- 提交信息：`feat(web): implement HTTP client, auth and tenant stores, and route definitions`
- 报告文件：`.superpowers/sdd/2026-10-10-admin-web-console/task-1-report.md`
