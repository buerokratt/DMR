import { IsEnum, IsNotEmpty, IsString, IsUUID } from 'class-validator';
import { MessageType } from '../enums';

export abstract class BaseMessageDto {
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

  @IsEnum(MessageType)
  type!: MessageType;
}
