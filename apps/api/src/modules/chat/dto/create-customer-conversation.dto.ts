import { IsOptional, IsUUID } from 'class-validator';

export class CreateCustomerConversationDto {
  @IsOptional()
  @IsUUID()
  customerId?: string;
}
