import { IsOptional, IsUUID } from 'class-validator';

export class MarkChatReadDto {
  @IsOptional()
  @IsUUID()
  lastReadMessageId?: string;
}
