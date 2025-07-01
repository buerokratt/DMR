import { Type } from 'class-transformer';
import {
  IsEnum,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { MessageType } from '../enums';

abstract class Message<T> {
  @IsUUID()
  @IsNotEmpty()
  id!: string;

  @IsUUID()
  @IsNotEmpty()
  recipientId!: string;

  @IsISO8601()
  @IsNotEmpty()
  timestamp!: string;

  @IsEnum(MessageType)
  @IsNotEmpty()
  type!: MessageType;

  abstract payload: T;
}

class ChatDto {
  @IsUUID()
  @IsNotEmpty()
  id!: string;

  @IsOptional()
  @IsString()
  endUserFirstName?: string;

  @IsOptional()
  @IsString()
  endUserLastName?: string;

  @IsOptional()
  @IsString()
  endUserId?: string;

  @IsOptional()
  @IsString()
  endUserEmail?: string;

  @IsOptional()
  @IsString()
  endUserPhone?: string;

  @IsOptional()
  @IsString()
  customerSupportDisplayName?: string;

  @IsString()
  @IsNotEmpty()
  created!: string;

  @IsOptional()
  @IsString()
  endUserOs?: string;

  @IsOptional()
  @IsString()
  endUserUrl?: string;
}

class ChatMessageDto {
  @IsUUID()
  @IsNotEmpty()
  id!: string;

  @IsUUID()
  @IsNotEmpty()
  chatId!: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  event?: string;

  @IsOptional()
  @IsString()
  csaTitle?: string;

  @IsOptional()
  @IsString()
  authorId?: string;

  @IsString()
  @IsNotEmpty()
  authorTimestamp!: string;

  @IsOptional()
  @IsString()
  authorFirstName?: string;

  @IsOptional()
  @IsString()
  authorLastName?: string;

  @IsString()
  @IsNotEmpty()
  authorRole!: string;

  @IsOptional()
  @IsString()
  forwardedByUser?: string;

  @IsOptional()
  @IsString()
  forwardedFromCsa?: string;

  @IsOptional()
  @IsString()
  forwardedToCsa?: string;

  @IsOptional()
  @IsString()
  originalBaseId?: string;

  @IsOptional()
  @IsString()
  originalCreated?: string;

  @IsOptional()
  @IsString()
  rating?: string;

  @IsOptional()
  @IsString()
  created?: string;

  @IsOptional()
  @IsString()
  preview?: string;

  @IsOptional()
  @IsString()
  updated?: string;

  @IsOptional()
  @IsString()
  buttons?: string;

  @IsOptional()
  @IsString()
  options?: string;
}

export class ChatMessagePayloadDto {
  @ValidateNested()
  @Type(() => ChatDto)
  chat!: ChatDto;

  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  messages!: ChatMessageDto[];
}

export class ExternalServiceMessageDto extends Message<ChatMessagePayloadDto> {
  @ValidateIf((obj) => obj.type === MessageType.ChatMessage)
  @ValidateNested()
  @Type(() => ChatMessagePayloadDto)
  payload!: ChatMessagePayloadDto;
}
