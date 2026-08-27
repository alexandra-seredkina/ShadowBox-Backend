import { Global, Injectable, Module } from '@nestjs/common';
import { Clock } from '../../shared/kernel/clock.js';

@Injectable()
export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

@Global()
@Module({
  providers: [{ provide: Clock, useClass: SystemClock }],
  exports: [Clock],
})
export class ClockModule {}
