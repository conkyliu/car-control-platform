import { EventEmitter } from 'node:events';

export type MessageHandler = (topic: string, payload: Buffer | string) => void | Promise<void>;

export interface SimulatorTransport {
  publish(topic: string, payload: string | object): Promise<void>;
  subscribe(topic: string, handler: MessageHandler): Promise<void>;
  unsubscribe(topic: string): Promise<void>;
  disconnect(): Promise<void>;
}

/**
 * 进程内事件总线传输适配器，用于本地快速闭环验证与自动化测试
 */
export class InMemoryTransport implements SimulatorTransport {
  private static sharedBus = new EventEmitter();
  private subscriptions: Map<string, (topic: string, payload: string) => void> = new Map();

  constructor(private bus: EventEmitter = InMemoryTransport.sharedBus) {}

  async publish(topic: string, payload: string | object): Promise<void> {
    const raw = typeof payload === 'string' ? payload : JSON.stringify(payload);
    // 异步派发，模拟网络异步特性
    queueMicrotask(() => {
      this.bus.emit(topic, topic, raw);
    });
  }

  async subscribe(topic: string, handler: MessageHandler): Promise<void> {
    const listener = (eventTopic: string, payload: string) => {
      handler(eventTopic, payload);
    };
    this.subscriptions.set(topic, listener);
    this.bus.on(topic, listener);
  }

  async unsubscribe(topic: string): Promise<void> {
    const listener = this.subscriptions.get(topic);
    if (listener) {
      this.bus.off(topic, listener);
      this.subscriptions.delete(topic);
    }
  }

  async disconnect(): Promise<void> {
    for (const [topic, listener] of this.subscriptions) {
      this.bus.off(topic, listener);
    }
    this.subscriptions.clear();
  }

  static getSharedBus(): EventEmitter {
    return this.sharedBus;
  }
}
