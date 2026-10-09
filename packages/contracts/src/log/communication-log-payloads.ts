/**
 * 设备通讯报文日志契约与类型定义
 */

/**
 * 报文流向：上行或下行
 */
export enum CommunicationDirection {
  UPLINK = 'UPLINK',
  DOWNLINK = 'DOWNLINK',
}

/**
 * 通讯通道类型
 */
export enum CommunicationChannel {
  MQTT = 'MQTT',
  TCP = 'TCP',
  HTTP = 'HTTP',
}

/**
 * 通讯日志记录传输对象 DTO
 */
export interface CommunicationLogDto {
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

/**
 * 通讯日志查询过滤入参 DTO
 */
export interface CommunicationLogFilterDto {
  tenantId?: string;
  vehicleId?: string;
  deviceNo?: string;
  traceId?: string;
  requestId?: string;
  direction?: CommunicationDirection | 'UPLINK' | 'DOWNLINK';
  channel?: CommunicationChannel | 'MQTT' | 'TCP' | 'HTTP';
  topic?: string;
  startTime?: Date | string;
  endTime?: Date | string;
}
