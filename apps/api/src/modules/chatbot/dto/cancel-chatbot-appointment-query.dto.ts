import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CancelChatbotAppointmentQueryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  token!: string;
}
