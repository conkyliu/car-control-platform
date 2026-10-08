# ADR-004: 指令领域完整状态机与幂等设计

## 背景
远程车控属于高风险物理操作，简单的 CRUD 或简单的“下发-成功”双状态无法表达真实车联网环境下的网络丢包、延迟 ACK、车载端拒绝执行与命令超时。

## 决策
1. 建立 11 个状态的完整有限状态机：`CREATED`, `VALIDATING`, `QUEUED`, `SENDING`, `SENT`, `WAITING_ACK`, `SUCCESS`, `DEVICE_REJECTED`, `FAILED`, `TIMEOUT`, `CANCELLED`, `EXPIRED`；
2. 引入 `idempotencyKey` 保证客户端防重发；
3. 基于 BullMQ 延迟队列实现精准的 ACK 超时检测，超时后转移至 `TIMEOUT`；
4. 迟到 ACK 与重复 ACK 进行幂等保护，终态不可逆。

## 结果
- 控车流程具备确定性状态追踪与审计能力；
- 杜绝重复下发和状态竞争导致的车辆物理误动作。
