# Control Security & Risk Management Specification (控车安全与风控规范)

## 1. 业务目标
远程控车直接关联人身安全、财产安全与车辆机械寿命。本规范定义服务端强制执行的安全分级、认证校验、频次限流与车辆风控规则。

## 2. 控车安全等级 (Security Levels)

| 安全等级 | 适用指令示例 | 认证要求 | 防护目标 |
|---|---|---|---|
| **L0 (常规)** | 车辆上锁 (`CMD_LOCK`), 鸣笛寻车 (`CMD_FIND_VEHICLE`), 关闭空调 (`CMD_AC_STOP`) | 仅需合法登录态与 RBAC 权限 (`VEHICLE_CONTROL`) | 基础防盗，低误操作危害 |
| **L1 (敏感)** | 车辆解锁 (`CMD_UNLOCK`), 开启后备箱 (`CMD_TRUNK_OPEN`), 开启车窗 (`CMD_WINDOW_OPEN`), 开启空调 (`CMD_AC_START`) | 必须校验独立控车安全码 (`securityCode`，6位独立密码) | 防止手机丢失或未锁屏时车门被非法打开 |
| **L2 (极危)** | 远程启动发动机 (`CMD_ENGINE_START`), 远程熄火 (`CMD_ENGINE_STOP`) | 必须校验强安全二次确认凭据 (`confirmationToken`) | 杜绝意外点火引发尾气中毒、溜车或机械事故 |

## 3. 频次限制 (Rate Limiting)
- **保护目标**：防止用户连击、前端脚本死循环或恶意网络攻击导致车载 CAN 总线阻塞或继电器烧蚀。
- **规则**：
  - 每辆车的每个 `commandCode` 具备独立的冷却时间（默认 5 秒，特定指令如远程点火为 15 秒）。
  - 若在冷却时间窗口内再次提交请求，服务端直接返回 HTTP 429 `RATE_LIMITED`。

## 4. 车辆运营风控规则 (Vehicle Operational Constraints)
1. **维保状态 (`MAINTENANCE`)**：禁止下发远程启动发动机，避免给正在机舱作业的维修技师带来人身危险。
2. **风控锁定 (`LOCKED`)**：如逾期租金或被盗风控锁死状态下，禁止下发车辆解锁、后备箱开启或远程启动。
3. **报废状态 (`SCRAPPED`)**：禁止下发任何控制指令。
