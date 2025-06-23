import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class ExternalServiceMessageDto {
  @IsUUID()
  @IsNotEmpty()
  id!: string;

  @IsUUID()
  @IsNotEmpty()
  recipientId!: string; // Recipient agent ID

  @IsString()
  @IsNotEmpty()
  payload!: string[];
}
