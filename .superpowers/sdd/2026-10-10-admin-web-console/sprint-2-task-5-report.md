# Sprint 2 Task 5 Execution Report: 软硬件绑定与配对管理中心 (`VehicleBindModal.tsx` + 绑定解绑业务流 + 状态双向同步)

## 1. 任务概览
- **任务目标**: 实现手机控车管理后台车辆与车载硬件设备配对管理中心，包含首次绑定向导、原子设备更换（换绑）、高危解绑工作台及软硬件状态双向原子同步。
- **完成基准**: Git commit `d7b73ed`
- **技术栈**: React 19 + TypeScript 5 + Ant Design 6 + Vite 8 + Zustand 5

---

## 2. 交付物与修改文件

| 文件路径 | 变更类型 | 说明 |
|---|---|---|
| `apps/web/src/views/vehicle/vehicle-bind-core.ts` | 新增 | 配对前置校验函数 `validateBindingPair`、解绑归因枚举字典 `UNBIND_REASONS`、状态双向原子同步纯函数 `applyBindingChange` |
| `apps/web/src/views/vehicle/VehicleBindModal.tsx` | 新增 | 620px 响应式弹窗向导，自适应支持首次绑定 (Bind View) 与换绑/解绑工作台 (Manage/Rebind/Unbind View) |
| `apps/web/src/views/vehicle/VehicleListView.tsx` | 修改 | 连接操作列【绑定】/【换绑/解绑】按钮，唤起 `VehicleBindModal` 并在操作成功后全量刷新列表 |
| `apps/web/src/views/vehicle/index.ts` | 修改 | 导出 `VehicleBindModal` 及其组件 Props、`vehicle-bind-core.ts` 核心纯函数与模型 |
| `apps/web/src/api/vehicle.ts` | 修改 | 实现 `bindDeviceApi`、`unbindDeviceApi`、`fetchAvailableDevicesApi`，并提供离线状态池持久化同步 |
| `apps/web/src/api/device.ts` | 修改 | 导出 `getInMemoryDevices` 与 `setInMemoryDevices`，支持软硬件状态池跨模块双向原子更新 |
| `apps/web/src/test/vehicle-bind.test.ts` | 新增 | 18 项高覆盖率 TDD 单元测试，覆盖配对前置校验、跨租户拦截、设备冲突、状态不可变更新与 API 异常处理 |

---

## 3. 核心功能与安全防线验证

1. **跨租户强防御**:
   - `validateBindingPair` 校验 `vehicle.tenantId === device.tenantId`，跨租户绑定严格拦截报错。
2. **报废终态防御**:
   - 已报废车辆 (`SCRAPPED`) 拦截绑定；已报废设备 (`DECOMMISSIONED`) 拦截绑定。
3. **设备冲突排他检测**:
   - 当目标设备已绑定至其他车辆时，阻断并精确提示冲突车辆的车牌号与 VIN 码。
4. **项目归属友好预警**:
   - 车辆与设备所属项目不一致时，输出温和的跨项目运行警示，不强行阻断业务。
5. **双向原子同步**:
   - `applyBindingChange` 保证车辆与设备状态池不可变更新，新旧设备与车辆的双向引用完全一致，杜绝脏数据。
6. **高危解绑二次确认**:
   - 浅红色危险警示卡片，强制选择 5 类业务解绑归因（维修拆除、换代升级、车辆报废、过户转让、其他），集成 AntD Popconfirm 二次防误触拦截。

---

## 4. 自动化测试与构建门禁

- **测试套件**: `pnpm --filter @car-control/web test`
  - 测试文件: 12 个测试套件，包含 `vehicle-bind.test.ts`
  - 测试通过率: **144 / 144 passed (100%)**
- **TypeScript 编译与打包**: `pnpm --filter @car-control/web build`
  - `tsc && vite build`: **0 errors, 0 warnings**
