export enum CommandStatus {
  CREATED = 'CREATED',
  VALIDATING = 'VALIDATING',
  QUEUED = 'QUEUED',
  SENDING = 'SENDING',
  SENT = 'SENT',
  WAITING_ACK = 'WAITING_ACK',
  SUCCESS = 'SUCCESS',
  DEVICE_REJECTED = 'DEVICE_REJECTED',
  FAILED = 'FAILED',
  TIMEOUT = 'TIMEOUT',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
}

/**
 * 终态列表：到达终态后不允许二次状态流转，保证幂等性与一致性。
 */
export const TERMINAL_COMMAND_STATUSES: ReadonlySet<CommandStatus> = new Set([
  CommandStatus.SUCCESS,
  CommandStatus.DEVICE_REJECTED,
  CommandStatus.FAILED,
  CommandStatus.TIMEOUT,
  CommandStatus.CANCELLED,
  CommandStatus.EXPIRED,
]);

/**
 * 判断指令是否处于终态
 */
export function isTerminalStatus(status: CommandStatus): boolean {
  return TERMINAL_COMMAND_STATUSES.has(status);
}

/**
 * 允许的状态转移拓扑规则
 */
export const VALID_STATUS_TRANSITIONS: Record<CommandStatus, CommandStatus[]> = {
  [CommandStatus.CREATED]: [CommandStatus.VALIDATING, CommandStatus.CANCELLED],
  [CommandStatus.VALIDATING]: [CommandStatus.QUEUED, CommandStatus.FAILED, CommandStatus.CANCELLED],
  [CommandStatus.QUEUED]: [CommandStatus.SENDING, CommandStatus.CANCELLED, CommandStatus.EXPIRED],
  [CommandStatus.SENDING]: [CommandStatus.SENT, CommandStatus.FAILED],
  [CommandStatus.SENT]: [CommandStatus.WAITING_ACK, CommandStatus.FAILED],
  [CommandStatus.WAITING_ACK]: [
    CommandStatus.SUCCESS,
    CommandStatus.DEVICE_REJECTED,
    CommandStatus.FAILED,
    CommandStatus.TIMEOUT,
  ],
  // 终态不允许向任何状态转移
  [CommandStatus.SUCCESS]: [],
  [CommandStatus.DEVICE_REJECTED]: [],
  [CommandStatus.FAILED]: [],
  [CommandStatus.TIMEOUT]: [],
  [CommandStatus.CANCELLED]: [],
  [CommandStatus.EXPIRED]: [],
};

/**
 * 校验状态转移是否合法
 */
export function canTransitionStatus(from: CommandStatus, to: CommandStatus): boolean {
  const allowed = VALID_STATUS_TRANSITIONS[from];
  return Boolean(allowed && allowed.includes(to));
}
