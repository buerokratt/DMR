import { IsNotEmpty, IsString, IsUUID, IsEnum, IsOptional } from 'class-validator';
import { MessageType } from '../enums/message-type.enum';

export class AgentMessageDto {
  @IsUUID()
  @IsNotEmpty()
  id!: string; // Message ID, for now, generate a UUID with crypto.randomUUID()

  @IsString()
  @IsNotEmpty()
  timestamp!: string; // Use a current timestamp

  @IsUUID()
  @IsNotEmpty()
  senderId!: string; // This agent ID

  @IsUUID()
  @IsNotEmpty()
  recipientId!: string; // Recipient agent ID

  @IsString()
  @IsNotEmpty()
  payload!: string;

  @IsEnum(MessageType)
  @IsNotEmpty()
  type!: MessageType;

  @IsOptional()
  @IsString()
  receivedAt?: string;
}
