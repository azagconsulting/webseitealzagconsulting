import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CancelChatbotAppointmentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  token!: string;
}
