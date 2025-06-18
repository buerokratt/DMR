import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class ExternalServiceMessageDto {
  @IsUUID()
  @IsNotEmpty()
  recipientId: string; // Recipient agent ID

  @IsString()
  @IsNotEmpty()
  payload: string[];
}
