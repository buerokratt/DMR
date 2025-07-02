import { IsNotEmpty } from 'class-validator';
import { BaseMessageDto } from './base-message.dto';

export class AgentDecryptedMessageDto extends BaseMessageDto {
  @IsNotEmpty()
  payload!: unknown;
}
