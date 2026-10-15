# Sprint 1 Task 1 Report: apps/web 基础通信层、API 客户端与全局状态底座

## 1. 任务概览
- **任务编号**: Sprint 1 Task 1
- **任务名称**: `apps/web` 基础通信层、API 客户端与全局状态底座
- **状态**: ✅ 已完成 (COMPLETED)
- **提交哈希**: `de2a86f1e29e9282361cf9fcbe74c10a4faecdb7`
- **提交信息**: `feat(web): implement HTTP client, auth and tenant stores, and route definitions`

---

## 2. 变更文件清单

| 文件路径 | 变更类型 | 核心职责说明 |
|---|---|---|
| `apps/web/src/api/client.ts` | 新增 | 健壮的 `HttpClient` 封装，支持 `baseUrl: '/api/v1'`、请求头自动注入 Bearer Token 和 x-tenant-id、并发 401 静默刷新防击穿队列、统一抛出 `ApiError`，以及 `get/post/put/patch/delete` 方法 |
| `apps/web/src/api/auth.ts` | 新增 | 认证领域 API (`loginApi`, `refreshApi`, `profileApi`, `logoutApi`) |
| `apps/web/src/api/tenant.ts` | 新增 | 多租户与机构领域 API (`getTenantsApi`, `getTenantQuotaApi`, `updateTenantStatusApi`, `getOrgTreeApi`, `createOrgApi`) |
| `apps/web/src/store/useAuthStore.ts` | 新增 | 全局认证状态与权限管理，基于 Zustand 5 + localStorage 持久化，支持精准与通配符 (`module:*`) 权限校验 |
| `apps/web/src/store/useTenantStore.ts` | 新增 | 全局租户与机构状态管理，支持选中租户 ID 本地持久化与机构树拓扑管理 |
| `apps/web/src/router/routes.ts` | 新增 | 系统全部 15 个业务路由元数据定义、Icon 绑定、RBAC 权限码、分组及路由辅助方法 |
| `apps/web/src/test/api-client.test.ts` | 新增 | 基础通信层与状态底座完整单元测试套件 (包含 10 项断言) |
| `apps/web/package.json` | 修改 | 添加 `"test": "node --test --experimental-strip-types src/test/*.test.ts"` 脚本 |
| `apps/web/tsconfig.json` | 修改 | 启用 `allowImportingTsExtensions: true` 配合 Node 原生 strip-types 与 Vite 打包 |

---

## 3. 需求达成与行为验证

### 3.1 HTTP 客户端与无感刷新
- **请求拦截**:
  - 自动从 `useAuthStore` 读取 `accessToken`，添加 `Authorization: Bearer ${accessToken}`。
  - 自动从 `useTenantStore` 读取 `currentTenantId`，添加 `x-tenant-id: ${currentTenantId}`。
- **401 无感静默双令牌刷新**:
  - 当收到 401 且非刷新请求本身时，自动调起 `POST /api/v1/auth/refresh`。
  - 具备单飞并发合并机制 (`refreshPromise` 互斥队列)，同一时间发生多个 401 请求时仅触发一次换票，其他请求等待后使用新 Token 重试原请求。
  - 刷新失败时自动清空 `useAuthStore` 并广播 `auth:logout` 自定义事件。
- **错误解析**:
  - 解析后端 NestJS 标准错误响应，结构化抛出 `ApiError`（包含 `statusCode`, `message`, `error`, `details`）。

### 3.2 认证与租户领域 API
- 导出了类型严谨的 `loginApi`, `refreshApi`, `profileApi`, `logoutApi`, `getTenantsApi`, `getTenantQuotaApi`, `updateTenantStatusApi`, `getOrgTreeApi`, `createOrgApi`。

### 3.3 全局状态存储 (Zustand 5)
- `useAuthStore`: 提供 `accessToken`, `refreshToken`, `user`, `permissions`, `isAuthenticated`，支持 `SUPER_ADMIN` 超级管理员及 `vehicle:*` 模式通配符授权判断。
- `useTenantStore`: 提供 `currentTenantId`, `currentOrgId`, `tenantList`, `orgTree` 状态管理与租户切换。
- 两者均安全兼容 Node.js / SSR 与浏览器环境下的 LocalStorage 持久化存储。

### 3.4 15 大业务路由定义
- 完整定义了 15 个业务路由项（包含标题、Ant Design 图标名称、权限标识、所属功能集群分组）：
  1. `/login`: 登录
  2. `/dashboard`: 运营看板 (`DashboardOutlined`, `dashboard:read`, 概览看板)
  3. `/tenants`: 租户管理 (`ApartmentOutlined`, `tenant:manage`, 平台中枢)
  4. `/orgs`: 机构管理 (`ClusterOutlined`, `org:manage`, 平台中枢)
  5. `/users`: 用户管理 (`UserOutlined`, `user:manage`, 平台中枢)
  6. `/roles`: 角色权限 (`SafetyCertificateOutlined`, `role:manage`, 平台中枢)
  7. `/devices`: 设备管理 (`DesktopOutlined`, `device:read`, 资产管理)
  8. `/vehicles`: 车辆管理 (`CarOutlined`, `vehicle:read`, 资产管理)
  9. `/commands`: 车控中心 (`ControlOutlined`, `vehicle:control`, 车控运营)
  10. `/telemetry`: 实时定位与轨迹 (`AimOutlined`, `telemetry:read`, 位置与围栏)
  11. `/geofence`: 电子围栏 (`CompassOutlined`, `geofence:read`, 位置与围栏)
  12. `/alarms`: 报警中心 (`AlertOutlined`, `alarm:read`, 运维保障)
  13. `/ota`: 固件升级 (`CloudUploadOutlined`, `ota:manage`, 运维保障)
  14. `/logs`: 通讯日志 (`FileTextOutlined`, `audit:read`, 运维保障)
  15. `/monitor`: 运维监控 (`LineChartOutlined`, `monitor:read`, 运维保障)

---

## 4. 自动化测试与构建验收

### 4.1 单元测试结果
运行命令: `pnpm --filter @car-control/web test`
```text
▶ API Client, Stores, and Route Definitions Test Suite
  ✔ useAuthStore sets credentials, detects permissions and wildcards, clears auth (6.41ms)
  ✔ useTenantStore manages active tenant, org tree, and tenant list (0.50ms)
  ✔ HttpClient injects Authorization and x-tenant-id headers automatically (38.13ms)
  ✔ HttpClient intercepts 401, calls refresh, updates store, and retries original request (2.70ms)
  ✔ HttpClient queues concurrent 401 requests to trigger only ONE token refresh (62.11ms)
  ✔ HttpClient clears useAuthStore and throws ApiError when refresh token itself fails (2.89ms)
  ✔ HttpClient correctly parses 4xx and 5xx errors into structured ApiError (2.42ms)
  ✔ Route definitions include all 15 business paths with title, icon, and permissions (0.34ms)
  ✔ auth and tenant API wrapper functions are exported and callable (0.82ms)
✔ API Client, Stores, and Route Definitions Test Suite (125.66ms)
ℹ tests 10
ℹ suites 0
ℹ pass 10
ℹ fail 0
```

### 4.2 构建结果
运行命令: `pnpm --filter @car-control/web build`
```text
$ tsc && vite build
vite v6.4.4 building for production...
✓ 3046 modules transformed.
dist/index.html                  0.39 kB │ gzip:   0.32 kB
dist/assets/index-B8GHcOXN.js  695.31 kB │ gzip: 222.93 kB
✓ built in 5.97s
```
**0 Errors, 0 Build Warnings.**

---

## 5. 后续关注项 (Concerns & Downstream Notes)
1. **路由守卫配合**: Task 2/3 在搭建 `AdminLayout.tsx` 与 React Router 6/7 或 HashRouter 实例时，可直接导入 `routes.ts` 的 `routes` 与 `findRouteByPath` 进行动态渲染与鉴权拦截。
2. **多租户切换联动**: `useTenantStore` 已保存 `currentTenantId`，后续 Header 租户下拉框更新此值时，所有后续 API 请求均会自动带上对应 `x-tenant-id` 请求头，确保租户隔离。
