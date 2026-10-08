# ROADMAP.md · 控车平台全周期演进与里程碑

> 基线周期：20 周主线开发 + 4 周缓冲/生产化验收 = 24 周。  
> 当前阶段：**Phase 0 (Week 0-1) - Transport POC & Simulator 建设**

## 1. 里程碑与准入门禁 (Gates)

| 阶段 | 周期 | 核心交付 | Gate 验收标准 | 状态 |
|---|---|---|---|---|
| **Gate 0** | Week 0-1 | Transport POC & 设备模拟器 | 模拟器上线、心跳、开锁指令端到端 ACK 闭环、超时及异常测试通过 | 🟡 进行中 |
| **Gate 1** | Week 2-4 | Monorepo + 基础平台 (Auth/Tenant/RBAC/Audit) | 跨租户跨项目越权 E2E 拦截通过、JWT 刷新与审计留痕完整 | ⚪ 待开始 |
| **Gate 2** | Week 3-6 | 设备与车辆管理 (Device/Vehicle/Binding) | 设备导入建档、车辆绑定、实时在线状态追踪可联动 | ⚪ 待开始 |
| **Gate 3** | Week 5-10 | 核心控车域 (Command/Capability/State/WS) | 完整 11 种命令状态流转、能力继承、安全等级 L0-L2、延迟/重复 ACK 防护 | ⚪ 待开始 |
| **Gate 4** | Week 8-12 | 实时业务 (Location/Alarm/Log) | 定位当前与历史轨迹抽稀、报警核心处理与通知、全链路日志检索 | ⚪ 待开始 |
| **Gate 5** | Week 11-16 | OTA 固件升级系统 | 固件上传、分批计划、熄火校验、断点续传与设备进度上报闭环 | ⚪ 待开始 |
| **Gate 6** | Week 13-18 | 移动端与数字钥匙 (App / BLE POC) | 控车 APP、按 Week 1-2 POC 结果集成 BLE 数字钥匙 | ⚪ 待开始 |
| **Gate 7** | Week 16-18 | 开放 API (OpenAPI) | 开放 API 签名验签、限流、设备/车辆/控车接口输出 | ⚪ 待开始 |
| **Gate 8** | Week 18-20 | 全链路端到端集成 (E2E Integration) | Web + API + MQTT + Simulator + WS 复合场景矩阵测试通过 | ⚪ 待开始 |
| **Gate 9** | Week 21-24 | 生产化安全加固、压测与上线发布 | 1,000 ~ 10,000 设备压测指标达标、灾备恢复演练、正式上线 | ⚪ 待开始 |

## 2. 当前冲刺：Week 0-1 Transport POC
- 目标：
  1. 搭建 Monorepo 体系及共享包 (`contracts`, `domain-types`, `config`)。
  2. 实现可运行的 `apps/simulator` 设备模拟器。
  3. 实现轻量级 NestJS `apps/api`，包含基础 Command 领域与 WebSocket 推送。
  4. 运行端到端闭环验证脚本，确保心跳、下发、ACK、超时与幂等逻辑具备可执行证据。
