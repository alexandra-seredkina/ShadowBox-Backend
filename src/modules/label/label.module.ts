import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { CreateLabelHandler } from './application/create-label.handler.js';
import { DeleteLabelHandler } from './application/delete-label.handler.js';
import { ListLabelsHandler } from './application/list-labels.handler.js';
import { RenameLabelHandler } from './application/rename-label.handler.js';
import { LabelRepository } from './domain/label.repository.js';
import { PrismaLabelRepository } from './infrastructure/prisma-label.repository.js';
import { LabelController } from './presentation/label.controller.js';

@Module({
  imports: [IdentityModule],
  controllers: [LabelController],
  providers: [
    ListLabelsHandler,
    CreateLabelHandler,
    RenameLabelHandler,
    DeleteLabelHandler,
    { provide: LabelRepository, useClass: PrismaLabelRepository },
  ],
})
export class LabelModule {}
