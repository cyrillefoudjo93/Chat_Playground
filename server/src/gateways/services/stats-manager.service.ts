import { Injectable } from '@nestjs/common';

export interface StatsData {
  connectedUsers: number;
  totalMessages: number;
  totalRooms: number;
  deliverySuccess: number;
  deliveryFailures: number;
}

@Injectable()
export class StatsManager {
  private stats: StatsData = {
    connectedUsers: 0,
    totalMessages: 0,
    totalRooms: 0,
    deliverySuccess: 0,
    deliveryFailures: 0,
  };

  public incrementConnectedUsers() {
    this.stats.connectedUsers++;
  }

  public decrementConnectedUsers() {
    if (this.stats.connectedUsers > 0) {
      this.stats.connectedUsers--;
    }
  }

  public incrementTotalMessages() {
    this.stats.totalMessages++;
  }

  public incrementRoomCount() {
    this.stats.totalRooms++;
  }

  public decrementRoomCount() {
    if (this.stats.totalRooms > 0) {
      this.stats.totalRooms--;
    }
  }

  public recordDeliverySuccess() {
    this.stats.deliverySuccess++;
  }

  public recordDeliveryFailure() {
    this.stats.deliveryFailures++;
  }

  public getStats(): StatsData {
    return { ...this.stats };
  }

  public reset() {
    this.stats = {
      connectedUsers: 0,
      totalMessages: 0,
      totalRooms: 0,
      deliverySuccess: 0,
      deliveryFailures: 0,
    };
  }
}
