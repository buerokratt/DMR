import { ExternalServiceMessageDto } from '@dmr/shared';
import { Body, Controller, HttpCode, HttpStatus, Post, UseInterceptors } from '@nestjs/common';
import { HttpMetricsInterceptor } from '../../common/interceptors/http-metrics.interceptor';
import { TimeoutInterceptor } from '../../common/interceptors/timeout.interceptor';
import { MessagesService } from './messages.service';

@Controller({ path: 'messages', version: '1' })
@UseInterceptors(TimeoutInterceptor, HttpMetricsInterceptor)
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async sendMessage(@Body() message: ExternalServiceMessageDto): Promise<void> {
    return this.messagesService.sendEncryptedMessageToServer(message);
  }
}
