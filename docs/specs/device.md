# Device Domain Specification (设备与车载终端规范)

## 1. 业务目标
负责车载 TBox 智能终端全生命周期管理（设备建档、批量导入、状态机流转、软硬件绑定、配置下发与反查追溯）。

## 2. 设备唯一性与属性
- `deviceNo` (设备序列号): 业务唯一编号，如 `TBOX_20261008001`
- `imei` (国际移动设备识别码): 15 位硬件唯一识别码，防伪造防重复
- `productKey` (阿里云 IoT 产品标识): 对应设备物模型与 MQTT Topic
- `status` (业务生命周期): `ACTIVE` (已激活), `INACTIVE` (未激活), `DECOMMISSIONED` (已废弃/报废)
- `onlineStatus` (实时通讯状态): `ONLINE` (在线), `OFFLINE` (离线)

## 3. 四级反查追溯链路 (Hierarchy Traceability)
设备上报心跳、GPS 或告警时，必须能够高频快速反查所属关系：
```text
Device (设备)
  ↓ (deviceId 关联)
Vehicle (车辆 / 车牌 / VIN)
  ↓ (projectId 关联)
Project (所属大客户项目)
  ↓ (tenantId 关联)
Tenant (SaaS 租户)
```

## 4. 批量导入与配额防护
- 导入格式校验：`deviceNo` 长度 6-32 位，`imei` 必须为符合标准的 15 位数字。
- 重复校验：单批次内去重，全库全局唯一性去重。
- 租户配额硬拦截：建档前调用 `tenantService.assertQuotaAvailable(tenantId, currentCount + importCount)`，超出直接拦截并拒绝导入。
