# Sprint 4 Task 3 交付报告: 历史轨迹回放工作台与播放器 (`TrajectoryReplayView.tsx` + `TrajectoryPlayer.tsx` + `trajectory-core.ts`)

> **执行周期**：Sprint 4 (GIS 地图与遥测监控)  
> **任务名称**：历史轨迹回放工作台与高频控制播放器  
> **技术栈**：React 19 + TypeScript 5 + Ant Design 6 (原生纯 CSS 变量) + Vite 8 + Douglas-Peucker 矢量抽稀 + 60fps RAF 时钟插值  
> **交付状态**：✅ 100% 验收通过，全量测试 376 项用例全部通过，生产构建 0 错误  

---

## 1. 交付文件清单 (File Inventory)

| 文件路径 | 模块性质 | 核心功能与职责说明 |
|---|---|---|
| `apps/web/src/views/telemetry/trajectory-core.ts` | 纯数学领域核心 | 轨迹点/停驻点/查询统计数据契约、停驻异常点识别算法 (`detectStayPoints`)、宏观指标计算 (`calculateTrajectoryStats`)、60fps 最短角平滑插值 (`interpolateTrajectory`)、Douglas-Peucker 抽稀 (`simplifyTrajectory`)、深圳湾至南山科技园 56 点生产仿真种子库 (`SEED_TRAJECTORIES`) |
| `apps/web/src/api/telemetry.ts` | 遥测 API 客户端 | 新增 `fetchVehicleTrajectoryApi` 接口，无缝调用 `GET /api/v1/telemetry/:vehicleId/trajectory`，具备容差预设换算、结构化 `ApiError` 透传与高保真离线内存降级 |
| `apps/web/src/views/telemetry/MapContainer.tsx` | 基础 GIS 画布扩展 | 新增轨迹折线双层光晕渲染 (`trackPolyline`)、起点/终点标旗 (`startMarker`, `endMarker`)、停驻异常徽标 (`stayPoints`)、动态平滑移动车标 (`replayVehicle`) 与自定义插槽 (`children`) |
| `apps/web/src/views/telemetry/TrajectoryPlayer.tsx` | 车载控制播放器 | 采用 Ant Design 6 纯 CSS 变量风格打造浮动科技深蓝 HUD 仪表盘，集成 `requestAnimationFrame` 60fps 高性能驱动、0%~100% 拖拽滑块、1x/2x/4x/8x/16x 多倍速调节、瞬态车速与 360° 罗盘航向指示 |
| `apps/web/src/views/telemetry/TrajectoryReplayView.tsx` | 轨迹回放工作台主视图 | 车辆检索选择器、时间范围预设 (今天/昨天/近3天/自定义)、抽稀容差 (高精度 3.3m、标准 11.1m、概览 55.5m)、6 维 KPI 统计指标卡条、全图视野自适应与播放器闭环联动 |
| `apps/web/src/views/telemetry/RealtimeLocationMap.tsx` | 实时大屏集成联动 | 车辆气泡卡片与左侧列表项【历史轨迹】一键唤起 1080px 宽全景轨迹回放弹窗工作台，并对焦指定车辆 |
| `apps/web/src/views/telemetry/index.ts` | 模块导出中枢 | 统一导出 `trajectory-core.ts`、`TrajectoryPlayer.tsx`、`TrajectoryReplayView.tsx` 与相关类型 |
| `apps/web/src/test/trajectory-replay.test.ts` | TDD 单元测试套件 | 覆盖停驻点识别、统计算法、插值算法、矢量抽稀、真实种子轨迹、API 客户端及离线降级等 20 个独立测试用例 |

---

## 2. 核心算法与技术实现细节 (Technical Highlights)

### 2.1 停驻点智能识别 (`detectStayPoints`)
- **算法规则**：连续轨迹采样点位移欧式大圆距离 $\le 30\text{米}$，且持续停留时间 $\ge 180\text{秒}$（3 分钟）时判定为停驻异常点。
- **质心计算**：通过对停驻区间内所有采样点经纬度进行均值统计，计算精确几何质心经纬度，有效滤除 GPS 静态定位漂移。
- **友好格式化**：输出符合自然交互中文规范的时长，如 `3分20秒`、`15分30秒`、`1小时20分`。

### 2.2 高频时序插值引擎 (`interpolateTrajectory`)
- **时间锚定**：根据播放游标进度百分比（0% ~ 100%）在时间维度定位相邻点对 $(P_i, P_{i+1})$，计算时间比例因子 $u$。
- **位置与速度平滑**：经度、纬度、车速采用线性过渡，保证高刷新率下无顿挫跳帧。
- **航向角跨零过渡**：采用最短角跨越算法 `diff = ((h2 - h1 + 180) % 360) - 180`，彻底解决传统线性插值在 $350^\circ \to 10^\circ$ 顺向旋转时车头倒转 $340^\circ$ 的视觉 Bug。

### 2.3 Douglas-Peucker 矢量抽稀 (`simplifyTrajectory`)
- **高保真几何分治**：首尾端点强制保留，以点到线段最大垂距判别递归拆分。
- **预设容差**：
  - 高精度：`0.00003°`（约 3.3m，微观转向精准复现）
  - 标准：`0.0001°`（约 11.1m，日常行车轨迹最佳体验）
  - 概览：`0.0005°`（约 55.5m，宏观长途高压缩比回放）

### 2.4 车载 HUD 控制播放器 (`TrajectoryPlayer.tsx`)
- **RAF 高效时钟**：基于 `requestAnimationFrame` 驱动时间步进，根据所选倍速和真实物理行驶时间换算平滑推进。
- **工况仪表盘**：动态展示当前瞬时车速（km/h）、罗盘航向（方位文字 + 旋转罗盘图标）、当前回放时间戳与已用/剩余时间。

---

## 3. 验证与门禁检查 (Verification)

### 3.1 单元测试验证
执行指令：
```bash
node --test --experimental-strip-types src/test/trajectory-replay.test.ts
```
**结果**：
- 20 个独立测试全部通过（通过率 100%）。
- 涵盖时长格式化、停驻点判定、宏观统计、插值平滑度、抽稀算法、真实种子集与 API 客户端。

执行全量 Web 测试：
```bash
pnpm --filter @car-control/web test
```
**结果**：
- 测试套件：106 个测试套件，376 个测试全部通过（0 失败，0 告警，耗时 5.6s）。

### 3.2 生产环境编译构建
执行指令：
```bash
pnpm --filter @car-control/web build
```
**结果**：
- `tsc && vite build` 编译完成，0 TypeScript 类型错误，生成产物包位于 `dist/`。

---

## 4. 交付总结与结论 (Conclusion)

Sprint 4 Task 3 所有指标与交付物均严格对齐规范，完成了从纯数学几何核心、后端遥测客户端、GIS 画布图层叠加、车载控制 HUD 播放器到全屏/弹窗工作台的端到端实现。
