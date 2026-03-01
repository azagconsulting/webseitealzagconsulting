import { IsArray, IsString, ArrayNotEmpty } from 'class-validator';

export class MarkMessagesTrashDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  ids!: string[];
}
