import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { DeliveryProcessModule } from './delivery-process.module.js';
import { LmtpListener } from './modules/delivery/infrastructure/lmtp-listener.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(
    DeliveryProcessModule,
    { bufferLogs: true },
  );
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  await app.init();
  await app.get(LmtpListener).listen();
}
await bootstrap();
