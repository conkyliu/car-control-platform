/**
 * MQTT 规范 Topic 构造器与解析器
 */
export class MqttTopicBuilder {
  /**
   * 云端下发控制指令 Topic
   * /sys/{productKey}/{deviceNo}/cmd/down
   */
  static commandDown(productKey: string, deviceNo: string): string {
    return `/sys/${productKey}/${deviceNo}/cmd/down`;
  }

  /**
   * 设备上报控制指令 ACK Topic
   * /sys/{productKey}/{deviceNo}/cmd/ack
   */
  static commandAck(productKey: string, deviceNo: string): string {
    return `/sys/${productKey}/${deviceNo}/cmd/ack`;
  }

  /**
   * 设备心跳上报 Topic
   * /sys/{productKey}/{deviceNo}/heartbeat
   */
  static heartbeat(productKey: string, deviceNo: string): string {
    return `/sys/${productKey}/${deviceNo}/heartbeat`;
  }

  /**
   * 设备上线/下线/运行状态 Topic
   * /sys/{productKey}/{deviceNo}/status
   */
  static status(productKey: string, deviceNo: string): string {
    return `/sys/${productKey}/${deviceNo}/status`;
  }

  /**
   * 设备实时定位 Topic
   * /sys/{productKey}/{deviceNo}/location
   */
  static location(productKey: string, deviceNo: string): string {
    return `/sys/${productKey}/${deviceNo}/location`;
  }

  /**
   * 设备报警上报 Topic
   * /sys/{productKey}/{deviceNo}/alarm
   */
  static alarm(productKey: string, deviceNo: string): string {
    return `/sys/${productKey}/${deviceNo}/alarm`;
  }

  /**
   * 解析 Topic 中的 productKey 和 deviceNo
   */
  static parse(topic: string): { productKey: string; deviceNo: string; action: string } | null {
    const parts = topic.split('/').filter(Boolean);
    // e.g. ['sys', 'PK123', 'DEV456', 'cmd', 'ack']
    if (parts.length >= 4 && parts[0] === 'sys') {
      const productKey = parts[1];
      const deviceNo = parts[2];
      const action = parts.slice(3).join('/');
      return { productKey, deviceNo, action };
    }
    return null;
  }
}
