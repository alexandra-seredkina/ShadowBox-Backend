import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { toEncryptedBlobJson } from '../../../shared/http/api-format.js';
import type { Mailbox, NewMessage } from '../domain/inbound-mail.store.js';
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

  async isKnownSender(
    ownerId: MessageOwnerId,
    sender: SenderHash,
  ): Promise<boolean> {
    const count = await this.prisma.knownSender.count({
      where: { accountId: ownerId, senderHash: Uint8Array.from(sender.hash) },
    });
    return count > 0;
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
          alias.folderId ?? (await inboxOf(tx, message.ownerId)),
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

async function inboxOf(
  tx: Prisma.TransactionClient,
  ownerId: MessageOwnerId,
): Promise<string> {
  const inbox = await tx.folder.findUniqueOrThrow({
    where: {
      accountId_systemRole: { accountId: ownerId, systemRole: 'inbox' },
    },
    select: { id: true },
  });
  return inbox.id;
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
