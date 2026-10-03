import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { toEncryptedBlobJson } from '../../../shared/http/api-format.js';
import type {
  Mailbox,
  NewMessage,
  SenderStatus,
} from '../domain/inbound-mail.store.js';
import { InboundMailStore } from '../domain/inbound-mail.store.js';
import type { MessageAliasId, MessageOwnerId } from '../domain/message.js';
import type { SenderHash } from '../domain/sender-hasher.js';

@Injectable()
export class PrismaInboundMailStore implements InboundMailStore {
  constructor(private readonly prisma: PrismaService) {}

  async findMailbox(
    ownerId: MessageOwnerId,
    aliasId: MessageAliasId,
  ): Promise<Mailbox | null> {
    const row = await this.prisma.alias.findFirst({
      where: { id: aliasId, accountId: ownerId, status: 'active' },
      select: { account: { select: { publicKey: true } } },
    });
    return row?.account ?? null;
  }

  async findSender(
    ownerId: MessageOwnerId,
    sender: SenderHash,
  ): Promise<SenderStatus> {
    const where = {
      accountId: ownerId,
      senderHash: Uint8Array.from(sender.hash),
    };
    const [known, blocked] = await Promise.all([
      this.prisma.knownSender.count({ where }),
      this.prisma.blockedSender.count({ where }),
    ]);
    return { isKnown: known > 0, isBlocked: blocked > 0 };
  }

  async save(message: NewMessage): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const alias = await tx.alias.update({
        where: { id: message.aliasId, accountId: message.ownerId },
        data: { lastReceivedAt: message.receivedAt },
        select: { folderId: true, labels: { select: { labelId: true } } },
      });
      const created = await tx.message.create({
        data: messageRow(
          message,
          message.isFromBlockedSender
            ? await systemFolderOf(tx, message.ownerId, 'spam')
            : (alias.folderId ??
                (await systemFolderOf(tx, message.ownerId, 'inbox'))),
        ),
        select: { id: true },
      });
      await tx.messageLabel.createMany({
        data: alias.labels.map(({ labelId }) => ({
          messageId: created.id,
          labelId,
        })),
      });
      if (message.sender !== null) {
        await tx.knownSender.createMany({
          data: {
            accountId: message.ownerId,
            senderHash: Uint8Array.from(message.sender.hash),
            hashKeyVersion: message.sender.keyVersion,
          },
          skipDuplicates: true,
        });
      }
    });
  }
}

async function systemFolderOf(
  tx: Prisma.TransactionClient,
  ownerId: MessageOwnerId,
  systemRole: 'inbox' | 'spam',
): Promise<string> {
  const folder = await tx.folder.findUniqueOrThrow({
    where: { accountId_systemRole: { accountId: ownerId, systemRole } },
    select: { id: true },
  });
  return folder.id;
}

function messageRow(
  message: NewMessage,
  folderId: string,
): Prisma.MessageUncheckedCreateInput {
  return {
    accountId: message.ownerId,
    folderId,
    aliasId: message.aliasId,
    receivedAt: message.receivedAt,
    sizeBytes: message.sizeBytes,
    threatVerdict: message.threat.verdict,
    threatMarkers: [...message.threat.markers],
    spfResult: message.threat.auth.spf,
    dkimResult: message.threat.auth.dkim,
    dmarcResult: message.threat.auth.dmarc,
    encryptedPreview: { ...toEncryptedBlobJson(message.encryptedPreview) },
    bodyBlobVersion: message.body.v,
    bodySealedKey: Uint8Array.from(message.body.sealedKey),
    bodyNonce: Uint8Array.from(message.body.nonce),
    bodyCiphertext: Uint8Array.from(message.body.ciphertext),
  };
}
