import { IsOptional, IsString } from 'class-validator';

export class UpdateChatbotKnowledgeDto {
  @IsOptional()
  @IsString()
  knowledgeBase?: string | null;
}
