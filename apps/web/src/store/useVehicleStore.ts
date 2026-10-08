import { create } from 'zustand';
import { CommandCode, CommandStatus } from '@car-control/contracts';

export interface CommandLogItem {
  id: string;
  commandCode: CommandCode;
  status: CommandStatus;
  timestamp: number;
  message?: string;
}

export interface VehicleStoreState {
  selectedVehicleId: string;
  isOnline: boolean;
  batteryVoltage: number;
  lockStatus: 'LOCKED' | 'UNLOCKED';
  trunkStatus: 'OPEN' | 'CLOSED';
  engineStatus: 'RUNNING' | 'STOPPED';
  commandLogs: CommandLogItem[];
  executingCommand: CommandCode | null;

  setVehicle: (vehicleId: string) => void;
  setOnline: (online: boolean) => void;
  setBatteryVoltage: (voltage: number) => void;
  addCommandLog: (log: CommandLogItem) => void;
  updateCommandStatus: (commandId: string, status: CommandStatus, message?: string) => void;
  setExecutingCommand: (code: CommandCode | null) => void;
}

export const useVehicleStore = create<VehicleStoreState>((set) => ({
  selectedVehicleId: 'VEH_001',
  isOnline: true,
  batteryVoltage: 12.6,
  lockStatus: 'LOCKED',
  trunkStatus: 'CLOSED',
  engineStatus: 'STOPPED',
  commandLogs: [],
  executingCommand: null,

  setVehicle: (vehicleId) => set({ selectedVehicleId: vehicleId }),
  setOnline: (online) => set({ isOnline: online }),
  setBatteryVoltage: (voltage) => set({ batteryVoltage: voltage }),
  addCommandLog: (log) =>
    set((state) => ({
      commandLogs: [log, ...state.commandLogs.slice(0, 49)],
    })),
  updateCommandStatus: (commandId, status, message) =>
    set((state) => {
      const updated = state.commandLogs.map((item) =>
        item.id === commandId ? { ...item, status, message: message || item.message } : item
      );

      // 联动模拟车门状态
      let lockStatus = state.lockStatus;
      let trunkStatus = state.trunkStatus;
      let engineStatus = state.engineStatus;

      const target = state.commandLogs.find((c) => c.id === commandId);
      if (target && status === CommandStatus.SUCCESS) {
        if (target.commandCode === CommandCode.CMD_UNLOCK) lockStatus = 'UNLOCKED';
        if (target.commandCode === CommandCode.CMD_LOCK) lockStatus = 'LOCKED';
        if (target.commandCode === CommandCode.CMD_TRUNK_OPEN) trunkStatus = 'OPEN';
        if (target.commandCode === CommandCode.CMD_TRUNK_CLOSE) trunkStatus = 'CLOSED';
        if (target.commandCode === CommandCode.CMD_ENGINE_START) engineStatus = 'RUNNING';
        if (target.commandCode === CommandCode.CMD_ENGINE_STOP) engineStatus = 'STOPPED';
      }

      return {
        commandLogs: updated,
        lockStatus,
        trunkStatus,
        engineStatus,
      };
    }),
  setExecutingCommand: (code) => set({ executingCommand: code }),
}));
