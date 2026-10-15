# Sprint 3 Task 5 Brief: 数字钥匙授权与分享管理 (`DigitalKeyManageView.tsx`)

## 1. 任务背景与核心业务场景
随着车联网与无钥匙出行普及，**数字钥匙 (Digital Key)** 成为车主分享控车权限、汽车租赁与代客泊车不可或缺的底层支撑能力。
依据《手机控车平台功能清单.docx》模块 09（9.1~9.4）：
- **多通信介质支持**：支持 BLE 低功耗蓝牙钥匙（用于地库无网络场景下离线加密通信与 PKE 迎宾感应）、Cloud 云端钥匙（基于 MQTT/HTTPS 远程网关指令鉴权）以及 NFC 实体卡片钥匙；
- **细粒度权限管控**：发放钥匙时可精确配置起止时段（`startTime` ~ `endTime`）、最大使用次数（`maxUsageCount`）及可控权限范围（如仅允许开关门锁、禁止远程发动发动机）；
- **全生命周期跟踪与安全吊销 (Revoke)**：支持查看钥匙流转记录、授权人与被授权人（手机号脱敏）、使用进度；在紧急场景（如手机遗失、租赁到期）下一键高危吊销作废并下发 CRL 吊销名单至车端，更新状态为不可逆终态 `REVOKED`。

---

## 2. 交付文件清单

1. `apps/web/src/views/command/digital-key-core.ts`：
   - 纯领域模型、类型、校验与种子数据：
     - `DigitalKeyType` ('BLE' | 'CLOUD' | 'NFC')
     - `DigitalKeyStatus` ('PENDING' | 'ACTIVE' | 'EXPIRED' | 'REVOKED')
     - `DigitalKeyDto`:
       ```ts
       export interface DigitalKeyDto {
         id: string;
         keyNumber: string; // 唯一序列号如 KEY-202610-001
         vehicleId: string;
         plateNumber: string;
         vin: string;
         ownerName: string;
         ownerPhone: string;
         recipientName: string;
         recipientPhone: string;
         keyType: 'BLE' | 'CLOUD' | 'NFC';
         status: 'PENDING' | 'ACTIVE' | 'EXPIRED' | 'REVOKED';
         startTime: string;
         endTime: string;
         maxUsageCount?: number; // 未设置表示不限次数
         usedCount: number;
         permissions: CommandCode[];
         revokedAt?: string;
         revokedReason?: string;
         createdAt: string;
       }
       ```
     - 校验纯函数：
       - `validateRecipientPhone(phone: string)`: 验证手机号正则 `/^1[3-9]\d{9}$/`
       - `isKeyCurrentlyValid(key: DigitalKeyDto)`: 当前时间在起止区间内，状态为 ACTIVE 且使用次数未超限
       - `isValidKeyStatusTransition(from: DigitalKeyStatus, to: DigitalKeyStatus)`: REVOKED 与 EXPIRED 为不可逆终态
     - 统计与过滤计算：
       - `calculateDigitalKeyStats(keys: DigitalKeyDto[])`: 总数、生效中、已过期、已作废、类型分布、总使用次数
       - `filterDigitalKeys(keys: DigitalKeyDto[], query: DigitalKeyQueryParams)`: 关键字（车牌/VIN/接收人/手机/序列号）、类型、状态、日期范围
     - 高保真种子数据 `SEED_DIGITAL_KEYS`：覆盖 5~8 条典型钥匙记录（生效中 BLE、不限次云端钥匙、已作废应急钥匙、已过期租赁钥匙、待激活钥匙）。
2. `apps/web/src/api/digital-key.ts`：
   - `fetchDigitalKeysApi(params?: DigitalKeyQueryParams): Promise<DigitalKeyDto[]>`
   - `fetchDigitalKeyDetailApi(id: string): Promise<DigitalKeyDto>`
   - `createDigitalKeyApi(data: CreateDigitalKeyInput): Promise<DigitalKeyDto>`
   - `revokeDigitalKeyApi(id: string, reason: string): Promise<DigitalKeyDto>`
   - `fetchVehicleKeyHistoryApi(vehicleId: string): Promise<DigitalKeyDto[]>`
   - 严格遵循 `isApiError` 透传与在离线降级下更新内存深拷贝池。
3. `apps/web/src/views/command/DigitalKeyManageView.tsx`：
   - 响应式主视图（科技深蓝规范、Ant Design 6 纯原生 CSS 变量、Card 采用 `styles={{ body: ... }}`）：
     - 4 张统计 KPI 卡片：总钥匙数与类型分布、当前生效中钥匙、已过期/失效、已安全吊销数；
     - 过滤工具栏：关键字搜索（车牌、接收人、手机号、钥匙编号）、钥匙类型下拉、状态下拉、时间范围 `RangePicker`、+ 发放数字钥匙 按钮、刷新、重置；
     - 表格展现 (`Table`):
       - 钥匙序列号（Monospace 复制、类型 Tag: BLE 蓝牙/云端/NFC）
       - 授权车辆（车牌 Tag + 悬停显示 VIN）
       - 授权人与被授权人（姓名 + 脱敏手机号 `138****8888`）
       - 有效时间区间（起止时间、若剩余 <24h 显示黄色倒计时 Tag）
       - 使用次数进度（如 `3/10 次` 进度条，或 `不限次数` 绿色 Tag）
       - 权限清单（Tag 列表，支持折叠 Tooltip）
       - 钥匙状态 Tag (🟢 生效中, 🟡 已过期, 🔴 已作废, ⚪ 待激活)
       - 操作列：【详情】滑出抽屉、【作废】Popconfirm 危险操作二次确认；
     - `IssueDigitalKeyModal`：
       - 目标车辆下拉选择（带车牌与车型信息）
       - 被授权人姓名、手机号输入与正则校验
       - 钥匙类型单选（BLE / CLOUD / NFC）
       - 有效期 RangePicker
       - 是否限制次数 Switch + InputNumber
       - 可控指令多选框（按 4 大分类展示 13 类指令勾选）
       - 确定发放调用 API 并自动刷新列表；
     - `DigitalKeyDetailDrawer` (600px)：
       - 钥匙生命周期垂直时间轴（创建 -> 分发 -> 首次激活 -> 最近使用 -> 吊销）
       - 模拟安全数字证书 SHA-256 指纹卡片
       - 完整权限清单与操作审计信息；
4. 路由集成与导航守卫：
   - `apps/web/src/router/routes.ts`:
     - 注册 `RoutePath.DIGITAL_KEYS = '/digital-keys'`，配置 `hideInMenu: true`，严格保证 `getMenuRoutes().length === 14` 契约不变；
   - `apps/web/src/layouts/AdminLayout.tsx`:
     - 挂载路由 `RoutePath.DIGITAL_KEYS` -> `<DigitalKeyManageView />`；
   - `apps/web/src/views/command/CarControlWorkbench.tsx`:
     - 顶部操作栏增加【数字钥匙授权】按钮，点击打开多标签页；
   - `apps/web/src/views/command/index.ts`:
     - 统一导出 `DigitalKeyManageView` 与 `digital-key-core.ts` 纯函数。
5. `apps/web/src/test/digital-key.test.ts`：
   - TDD 全量单元测试套件：覆盖手机号正则、钥匙状态机流转守卫、有效性判定、统计指标核算、多维过滤、API 客户端及离线降级状态持久化。

---

## 3. 验收与质量门禁 (Gate Constraints)
- **纯 CSS 变量与 AntD 6 原生规范**：全部使用纯原生 CSS 变量，Card 采用 `styles={{ body: ... }}`，杜绝废弃的 `bodyStyle`。
- **保护主菜单路由恒定**：保持主菜单 14 条路由基准不变。
- **全量门禁检查**：
  - `pnpm --filter @car-control/web test` 100% 通过（新增测试用例不少于 20 项）；
  - `pnpm --filter @car-control/web build` Vite 8 Rolldown 0 错误编译通过。
