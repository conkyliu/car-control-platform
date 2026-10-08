# ADR-001: 采用 Modular Monolith (模块化单体) 架构

## 背景
项目一期目标为 20 周交付核心控车闭环 MVP。过早拆分为微服务会导致服务间通信开销、分布式事务、数据一致性维护和部署运维复杂度急剧攀升。

## 决策
采用基于 NestJS 的 **Modular Monolith** 架构：
1. 业务逻辑在单一代码库和单一后端进程中按业务领域划分模块（Auth, Tenant, Vehicle, Device, Command, Capability, Alarm 等）。
2. 各模块之间通过领域服务（Application Service）、领域事件（Domain Event）和明确的 Repository 接口通信，严禁跨模块随意直接读写内部实体。
3. 严格禁止循环依赖。

## 结果
- 保证前期极高开发效率与重构灵活性；
- 单一进程内本地调用，避免分布式网络损耗；
- 当后续有明确高独立扩容或故障隔离需求（如独立 Device Gateway）时，可无缝物理剥离为独立微服务。
