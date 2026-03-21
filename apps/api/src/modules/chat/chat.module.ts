import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

import type { AppConfig } from '@/config/app.config';

import { DriveModule } from '@/modules/drive/drive.module';

import { ChatController } from './chat.controller';
import { ChatGateway } from './chat.gateway';
import { ChatRealtimeService } from './chat-realtime.service';
import { ChatService } from './chat.service';

@Module({
  imports: [
    DriveModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService<AppConfig, true>) => {
        const auth = configService.getOrThrow('auth', { infer: true });
        return {
          secret: auth.jwt.secret,
          signOptions: {
            expiresIn: auth.jwt.expiresIn,
          },
        };
      },
    }),
  ],
  controllers: [ChatController],
  providers: [ChatService, ChatRealtimeService, ChatGateway],
  exports: [ChatService],
})
export class ChatModule {}
