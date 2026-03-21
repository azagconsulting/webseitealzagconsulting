import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Purge messages (and their stored analysis) older than 14 days.
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgeOldMessages() {
    const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const result = await this.prisma.customerMessage.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    if (result.count) {
      this.logger.log(`Purged ${result.count} messages older than 14 days.`);
    }
  }

  // Purge trashed messages after 30 days
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async purgeTrashedMessages() {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const result = await this.prisma.customerMessage.deleteMany({
      where: { deletedAt: { lt: cutoff } },
    });
    if (result.count) {
      this.logger.log(
        `Papierkorb bereinigt: ${result.count} Nachrichten gelöscht.`,
      );
    }
  }
}
