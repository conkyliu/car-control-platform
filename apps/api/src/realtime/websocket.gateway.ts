import { Injectable } from '@nestjs/common';
import { WebSocketEvent, WebSocketRoomBuilder } from '@car-control/contracts';

export type EventListener = (event: string, payload: unknown) => void;

@Injectable()
export class WebSocketGatewayService {
  private roomListeners: Map<string, Set<EventListener>> = new Map();

  /**
   * 客户端加入指定房间
   */
  joinRoom(room: string, listener: EventListener): () => void {
    if (!this.roomListeners.has(room)) {
      this.roomListeners.set(room, new Set());
    }
    this.roomListeners.get(room)!.add(listener);

    return () => {
      this.roomListeners.get(room)?.delete(listener);
    };
  }

  /**
   * 向指定房间广播事件
   */
  emitToRoom(room: string, event: WebSocketEvent | string, payload: unknown): void {
    const listeners = this.roomListeners.get(room);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(event as string, payload);
        } catch (err) {
          console.error(`[WebSocket] Listener error in room ${room}:`, err);
        }
      }
    }
  }

  /**
   * 客户端加入车辆房间 (需经过鉴权与车辆归属检查)
   */
  joinVehicleRoom(vehicleId: string, listener: EventListener): () => void {
    return this.joinRoom(WebSocketRoomBuilder.vehicleRoom(vehicleId), listener);
  }

  /**
   * 向指定车辆房间广播事件
   */
  emitToVehicle(vehicleId: string, event: WebSocketEvent, payload: unknown): void {
    this.emitToRoom(WebSocketRoomBuilder.vehicleRoom(vehicleId), event, payload);
  }
}
