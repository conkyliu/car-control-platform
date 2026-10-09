# ADR-005: 车型能力三级继承引擎设计

## 背景
不同车企品牌、车型（如纯电、混动、燃油）、年款及特定改装车辆对远程指令的支持情况差异巨大。例如低配车型无电动尾门，纯电车无发动机点火，大客户项目针对网约车可能禁用后备箱远程开启。

## 决策
1. 建立四层级继承解析管道：
   ```text
   Global Definition -> Project Override -> Model Template -> Vehicle Override -> Effective Capability
   ```
2. **服务端权威解析**：客户端绝对禁止自行根据车型计算“是否支持某指令”，必须在渲染前或提交前调用服务端的 `resolveCapability` 获取最终生效配置。
3. **多维属性继承**：不仅继承 `supported: boolean`，同时继承生效的 `securityLevel`、`timeoutMs`、`frequencyLimitSeconds`。
4. **单车覆盖最高优先级**：单车显式配置可覆盖上层所有配置（例如指定某辆车硬件故障临时禁用天窗）。

## 结果
- 彻底避免前后端配置不一致导致的控车失败或意外动作；
- 易于在运营控制台可视化查看任意车辆的生效能力树。
