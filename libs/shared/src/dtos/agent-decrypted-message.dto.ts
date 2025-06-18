import { IsEnum, IsNotEmpty, IsString, IsUUID } from 'class-validator';
import { MessageType } from '../enums';

export class AgentDecryptedMessageDto {
  @IsUUID()
  @IsNotEmpty()
  id: string; // Message ID, for now, generate a UUID with crypto.randomUUID()

  @IsString()
  @IsNotEmpty()
  timestamp: string; // Use a current timestamp

  @IsUUID()
  @IsNotEmpty()
  senderId: string; // This agent ID

  @IsUUID()
  @IsNotEmpty()
  recipientId: string; // Recipient agent ID

  @IsString({ each: true })
  @IsNotEmpty()
  payload: string[];

  @IsEnum(MessageType)
  type: MessageType;
}
