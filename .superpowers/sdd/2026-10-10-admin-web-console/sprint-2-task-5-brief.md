# Sprint 2 Task 5 Brief: 软硬件绑定与配对管理中心 (`VehicleBindModal.tsx` + 绑定解绑业务流 + 状态双向同步)

## 1. 任务背景与目标
基于《手机控车平台功能清单.docx》模块 05（5.4 车辆绑定 / 解绑 / 转让，P0 核心功能）、《开发计划-V2.1-补充PM与UIUX.md》与《docs/specs/vehicle.md》，在 `apps/web` 中交付软硬件绑定与配对管理模态框向导 (`VehicleBindModal.tsx`)。
支持：
1. **新车软硬件设备绑定 (Bind)**：空闲车辆匹配空闲可用 T-Box 设备，支持手动搜索与模拟扫码快速录入；
2. **设备更换与换绑 (Rebind / Replace T-Box)**：在旧设备故障或升级场景下，原子化解除旧设备并绑定新设备；
3. **解除软硬件绑定 (Unbind)**：高危操作二次确认，必填解绑归因（维修拆除/换装升级/报废/转让），解除后设备回库为独立可用状态；
4. **硬防线与安全约束**：严禁跨租户绑定、已报废车辆/设备拦截、已占用设备冲突校验、操作留痕。

---

## 2. 详细功能与交互规范

### A. 核心纯逻辑与配对约束 (`apps/web/src/views/vehicle/vehicle-bind-core.ts`)
1. **配对前置校验纯函数 (`validateBindingPair`)**：
   - 校验车辆与设备租户一致性（`vehicle.tenantId === device.tenantId`，跨租户严格拦截）；
   - 校验车辆状态合法性（`vehicle.status !== 'SCRAPPED'`，已报废车辆禁止绑定）；
   - 校验设备状态合法性（`device.status !== 'DECOMMISSIONED'`，已报废设备禁止绑定）；
   - 校验设备占用状态：若目标设备已绑定其他车辆，阻断并提示冲突车牌与 VIN；
   - 项目一致性友好提示：若车辆项目与设备项目不一致，给出温和的跨项目归属预警提示。
2. **解绑归因枚举与字典 (`UNBIND_REASONS`)**：
   - `MAINTENANCE`: 模组故障拆卸维修
   - `HARDWARE_UPGRADE`: 终端硬件换代升级
   - `VEHICLE_SCRAPPED`: 车辆到期报废注销
   - `OWNERSHIP_TRANSFER`: 车主变更/过户转让
   - `OTHER`: 其他业务调整
3. **配对与解绑状态计算纯函数 (`applyBindingChange`)**：
   - 输入车辆与设备池，返回更新后的车辆与设备克隆对象，保证本地状态池原子同步。

---

### B. 交互模态框设计 (`apps/web/src/views/vehicle/VehicleBindModal.tsx`)
1. **模态框规格与模式自适应**：
   - 宽度 `620px`，居中弹窗，支持 `destroyOnClose`；
   - 接收 props：`open: boolean`, `vehicle: VehicleDto | null`, `onClose: () => void`, `onSuccess: () => void`；
   - 依据传入的车辆是否已绑定设备，智能呈现对应交互视图：
2. **场景一：未绑定车辆 -> 首次绑定向导 (Bind View)**：
   - 顶部卡片：展示目标车辆基本信息（车牌蓝色 Tag、VIN 等宽、品牌车型、当前项目）；
   - 设备选择区：
     - 单选切换：`从空闲设备库选择` / `扫码/手动输入序列号`；
     - 搜索下拉 `Select`：支持模糊输入设备号 deviceNo 或 15 位 IMEI，实时筛选空闲未绑定设备；
     - 选定设备后：实时呈现该设备工况卡片（在线状态 Badge、4G 信号指示、固件版本、项目归属）；
     - 绑定备注输入框 `Input.TextArea` (选填)；
     - 【确认绑定】按钮：Loading 态，校验并调用 `bindDeviceApi`。
3. **场景二：已绑定车辆 -> 换绑与解绑工作台 (Manage / Rebind / Unbind View)**：
   - 顶部卡片：展示当前绑定的车载设备（设备号 monospace、IMEI、绑定时间、在线状态）；
   - 双操作分区：
     - **操作 A：更换新设备 (换绑)**：
       - 下拉选择备用新设备，选定后提示将自动断开旧设备并连接新设备；
       - 【确认换绑】按钮，调用换绑流程。
     - **操作 B：解除软硬件绑定 (解绑)**：
       - 浅红色危险操作警示卡片，提示“解除绑定后，平台将停止对该车辆的远程车控与遥测数据接收”；
       - 必选解绑原因 `Select`（维修拆除 / 换代升级 / 车辆报废 / 过户转让 / 其他）；
       - 详细说明 `Input.TextArea` (选填)；
       - 【解除绑定 (Danger)】按钮：点击触发 Secondary Popconfirm 二次防误触弹窗，确认后调用 `unbindDeviceApi`。

---

### C. 数据分层与 API 抽象 (`apps/web/src/api/vehicle.ts`)
1. `bindDeviceApi(vehicleId: string, deviceId: string, remark?: string): Promise<{ success: boolean; message: string }>`:
   - 发送 `POST /api/v1/vehicles/:id/bind-device`，请求体 `{ deviceId, remark }`。
2. `unbindDeviceApi(vehicleId: string, reason?: string): Promise<{ success: boolean; message: string }>`:
   - 发送 `POST /api/v1/vehicles/:id/unbind-device`，请求体 `{ reason }`。
3. `fetchAvailableDevicesApi(projectId?: string): Promise<DeviceDto[]>`:
   - 获取当前租户下未绑定的空闲可用设备（过滤 `deviceId` 未被占用的 ACTIVE 设备）。
4. 严格遵循 `isApiError` 模式：真实服务端异常直通提示，离线环境在本地内存状态池中执行车辆与设备的绑定/解绑原子更新。

---

### D. 页面集成 (`apps/web/src/views/vehicle/VehicleListView.tsx`)
1. 在车辆列表中，操作列【绑定】（未绑定车辆）与【换绑/解绑】（已绑定车辆）按钮点击后，唤起 `VehicleBindModal` 并传入选中的车辆对象；
2. 操作完成后触发 `onSuccess` 回调，全量刷新车辆列表与指标统计卡片；
3. 从 `apps/web/src/views/vehicle/index.ts` 导出 `VehicleBindModal` 与核心辅助函数。

---

### E. 自动化测试要求 (`apps/web/src/test/vehicle-bind.test.ts`)
1. 配对前置校验测试：跨租户拦截、报废车辆拦截、报废设备拦截；
2. 设备占用冲突检测测试；
3. 状态原子同步纯逻辑测试（绑定后车辆与设备双向更新，解绑后设备归库）；
4. 解绑归因枚举与校验测试；
5. API 客户端集成测试：`bindDeviceApi`, `unbindDeviceApi`, `fetchAvailableDevicesApi`；
6. 离线状态降级与内存状态池持久化测试。

---

### F. 编译与构建门禁
- `pnpm --filter @car-control/web test` 100% 通过；
- `pnpm --filter @car-control/web build` Vite 8 / Rolldown 0 报错通过。
