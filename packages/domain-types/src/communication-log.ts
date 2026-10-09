import { CommunicationDirection, CommunicationChannel } from '@car-control/contracts';

/**
 * 通讯上下行报文日志领域实体
 */
export interface CommunicationLog {
  id: string;
  tenantId: string;
  vehicleId?: string;
  deviceNo: string;
  traceId?: string;
  requestId?: string;
  direction: CommunicationDirection | 'UPLINK' | 'DOWNLINK';
  channel: CommunicationChannel | 'MQTT' | 'TCP' | 'HTTP';
  topic: string;
  payload: any;
  createdAt: Date;
}
