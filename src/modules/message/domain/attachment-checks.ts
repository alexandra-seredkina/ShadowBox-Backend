import type { MailAttachment } from './inbound-mail.js';

/** Files that run code when opened, including Office documents with macros. */
const DANGEROUS_EXTENSIONS: ReadonlySet<string> = new Set([
  'exe',
  'com',
  'scr',
  'pif',
  'bat',
  'cmd',
  'msi',
  'msp',
  'cpl',
  'dll',
  'js',
  'jse',
  'vbs',
  'vbe',
  'wsf',
  'wsh',
  'hta',
  'ps1',
  'psm1',
  'reg',
  'lnk',
  'jar',
  'iso',
  'img',
  'vhd',
  'chm',
  'apk',
  'sh',
  'application',
  'docm',
  'dotm',
  'xlsm',
  'xltm',
  'xlam',
  'pptm',
  'potm',
  'ppam',
  'sldm',
]);

const DANGEROUS_MIME_TYPES: ReadonlySet<string> = new Set([
  'application/x-msdownload',
  'application/x-dosexec',
  'application/x-msdos-program',
  'application/x-ms-installer',
  'application/x-msi',
  'application/vnd.microsoft.portable-executable',
  'application/java-archive',
  'application/hta',
  'application/x-sh',
]);

/** Office sends macro-enabled formats as ...macroEnabled.12. */
const MACRO_ENABLED = /macroenabled/i;

export function isDangerousAttachment(attachment: MailAttachment): boolean {
  const mimeType = attachment.mimeType.toLowerCase();
  return (
    DANGEROUS_EXTENSIONS.has(extensionOf(attachment.filename)) ||
    DANGEROUS_MIME_TYPES.has(mimeType) ||
    MACRO_ENABLED.test(mimeType)
  );
}

/** Windows ignores trailing dots and spaces, so "invoice.exe. " is still an .exe. */
function extensionOf(filename: string): string {
  const name = filename.replace(/[.\s]+$/u, '').toLowerCase();
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1);
}
