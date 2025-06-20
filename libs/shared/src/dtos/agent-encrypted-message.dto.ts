import { IsNotEmpty, IsString } from 'class-validator';
import { BaseMessageDto } from './base-message.dto';

export class AgentEncryptedMessageDto extends BaseMessageDto {
  @IsString()
  @IsNotEmpty()
  payload!: string;
}
