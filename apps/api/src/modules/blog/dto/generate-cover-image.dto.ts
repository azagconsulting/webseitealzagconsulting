import { IsOptional, IsString, MaxLength } from 'class-validator';

export class GenerateCoverImageDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  excerpt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  content?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  coverPrompt?: string;
}
