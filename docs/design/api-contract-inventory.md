# 手机控车平台 Admin 管理后台 · API 契约盘点与前后端对齐清单 (API Contract Inventory)

> **文档版本**：v1.0 (Sprint 0 基线)  
> **制定依据**：对比 `docs/api/API_REFERENCE.md`、`packages/contracts`、`apps/api` 真实控制器及网关实现  
> **归属路径**：`docs/design/api-contract-inventory.md`

---

## 1. REST API 契约全景盘点表

| 业务域 | 接口路径 (Path) | HTTP 方法 | 后端实现状态 | 前端对应消费模块 / 界面 | 鉴权与上下文要求 |
|---|---|:---:|:---:|---|---|
| **认证域** | `/api/v1/auth/login` | `POST` | ✅ 已就绪 | `LoginView` (登录提交) | 公开接口 |
| | `/api/v1/auth/refresh` | `POST` | ✅ 已就绪 | `client.ts` (401 静默刷新) | 携带 `refreshToken` |
| | `/api/v1/auth/profile` | `GET` | ✅ 已就绪 | `useAuthStore` (用户个人信息) | Bearer Token |
| | `/api/v1/auth/logout` | `POST` | ✅ 已就绪 | `HeaderUserMenu` (退出登录) | Bearer Token |
| **租户域** | `/api/v1/tenants` | `GET` | ✅ 已就绪 | `TenantListView`, `TenantSelector` | `SUPER_ADMIN` |
| | `/api/v1/tenants/:id/quota` | `GET` | ✅ 已就绪 | `TenantListView` (配额看板) | 租户权限 |
| | `/api/v1/tenants/:id/status`| `PATCH` | ✅ 已就绪 | `TenantListView` (启停租户) | `SUPER_ADMIN` |
| | `/api/v1/tenants/:id/orgs` | `GET` | ✅ 已就绪 | `OrgTreeView` (机构树) | `x-tenant-id` |
| **设备域** | `/api/v1/devices` | `GET` | ✅ 已就绪 | `DeviceListView` (多维列表筛选) | `x-tenant-id` |
| | `/api/v1/devices/:id` | `GET` | ✅ 已就绪 | `DeviceDetailDrawer` (设备详情) | `x-tenant-id` |
| | `/api/v1/devices` | `POST` | ✅ 已就绪 | `DeviceListView` (单个建档) | `x-tenant-id` |
| | `/api/v1/devices/import` | `POST` | ✅ 已就绪 | `BatchImportModal` (Excel 导入) | `x-tenant-id` |
| | `/api/v1/devices/:id/config`| `PATCH`| ✅ 已就绪 | `DeviceDetailDrawer` (参数配置) | `x-tenant-id` |
| **车辆域** | `/api/v1/vehicles` | `GET` | ✅ 已就绪 | `VehicleListView` (车辆台账) | `x-tenant-id` |
| | `/api/v1/vehicles/:id` | `GET` | ✅ 已就绪 | `VehicleListView` (车辆详情卡片) | `x-tenant-id` |
| | `/api/v1/vehicles/:id/bind` | `POST` | ✅ 已就绪 | `VehicleBindModal` (软硬件绑定) | `x-tenant-id` |
| | `/api/v1/vehicles/:id/unbind`| `POST` | ✅ 已就绪 | `VehicleBindModal` (解绑/过户) | `x-tenant-id` |
| | `/api/v1/vehicles/models` | `GET` | ✅ 已就绪 | `ModelManageView` (车型品牌) | `x-tenant-id` |
| **车控域** | `/api/v1/commands` | `POST` | ✅ 已就绪 | `CarControlWorkbench` (下发控车) | `x-tenant-id`, L2防线 |
| | `/api/v1/commands/history` | `GET` | ✅ 已就绪 | `CommandStreamDrawer` (流水历史) | `x-tenant-id` |
| | `/api/v1/capabilities/templates` | `GET` | ✅ 已就绪 | `CapabilityTemplateView` (能力模板) | 字典配置 |
| **位置域** | `/api/v1/locations/latest` | `GET` | ✅ 已就绪 | `RealtimeLocationMap` (实时打点) | `x-tenant-id` |
| | `/api/v1/locations/trajectory`| `GET` | ✅ 已就绪 | `TrajectoryReplayView` (抽稀轨迹) | `x-tenant-id`, `tolerance` |
| | `/api/v1/geofences` | `GET/POST`| ✅ 已就绪 | `GeofenceManageView` (电子围栏) | `x-tenant-id` |
| **告警域** | `/api/v1/alarms` | `GET` | ✅ 已就绪 | `AlertCenterView` (告警列表) | `x-tenant-id` |
| | `/api/v1/alarms/:id/process`| `POST` | ✅ 已就绪 | `AlertProcessDrawer` (人工处置) | `x-tenant-id`, 不可逆 |
| **OTA 域** | `/api/v1/ota/firmware` | `GET/POST`| ✅ 已就绪 | `FirmwarePackageView` (固件库) | `x-tenant-id`, SHA256 |
| | `/api/v1/ota/plans` | `GET/POST`| ✅ 已就绪 | `OtaPlanWizard` (升级计划向导) | `x-tenant-id`, 前置门禁 |
| | `/api/v1/ota/plans/:id/tasks`| `GET` | ✅ 已就绪 | `OtaProgressDashboard` (批次大屏)| `x-tenant-id` |
| **日志与指标**| `/api/v1/logs/communication` | `GET` | ✅ 已就绪 | `CommunicationLogView` (报文日志) | `x-tenant-id` |
| | `/metrics` | `GET` | ✅ 已就绪 | `SystemMonitorView` (7大监控指标) | 纯文本 Prometheus 0.0.4 |

---

## 2. WebSocket 实时推送事件契约

前端与后端 WebSocket Gateway 建立双向长连接，用于支持秒级推流：

| 实时事件名 (Event) | 订阅房间 (Room) | 推送载荷核心字段 (Payload) | 前端消费组件与行为 |
|---|---|---|---|
| `command.status` | `vehicle:${vehicleId}` | `{ commandId, vehicleId, status, durationMs, ackPayload, errorCode }` | `CommandStreamDrawer` 动态更新指令状态机 (WAITING_ACK -> SUCCESS/REJECTED/TIMEOUT) |
| `location.updated` | `vehicle:${vehicleId}` | `{ vehicleId, lat, lng, speed, course, ignition, batteryVoltage, timestamp }` | `RealtimeLocationMap` 平滑更新车辆经纬度与车速卡片 |
| `alarm.triggered` | `tenant:${tenantId}` | `{ alarmId, vehicleId, plateNo, alarmType, severity, message, timestamp }` | 全局 `AlarmNotificationBell` 红点提示与屏幕右上角声光弹窗 |
| `ota.progress` | `ota:${planId}` | `{ planId, taskId, deviceNo, step, percent, errorCode }` | `OtaProgressDashboard` 环形进度条与 4 步骤流程条实时步进 |
| `ota.completed` | `ota:${planId}` | `{ planId, totalDevices, successDevices, failedDevices, finishedAt }` | `OtaProgressDashboard` 升级任务整体完结通知 |
| `device.status` | `tenant:${tenantId}` | `{ deviceNo, status: "ONLINE" \| "OFFLINE", lastSeenAt }` | `DeviceListView` 实时更新设备在线/离线 Tag |

---

## 3. 待补齐接口缺口与责任端登记 (Gaps Register)

依据 V2.1 质量门禁 7（设计与 API 契约一致性门禁），**严禁前端使用静态假数据伪装已完成**，以下功能明确登记为待后端增强缺口：
1. **物联卡流量池接口 (`GET /api/v1/sim/pool-stats`)**：当前仅有设备表中的静态 ICCID，缺乏中国移动/联通物联卡流量池实时查询接口。**前端策略**：详情中展示静态卡号，流量直充按钮置灰并提示“运营商直连通道接入中”。
2. **财务订单流水 (`GET /api/v1/billing/orders`)**：后端未接入商户收单网关。**前端策略**：留出二级菜单，页面展示友好占位。
3. **App 客户端热更新版本库 (`GET /api/v1/app/versions`)**：移动端专属。**前端策略**：统一归并至系统参数字典管理。
