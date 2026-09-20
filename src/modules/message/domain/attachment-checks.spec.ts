import { isDangerousAttachment } from './attachment-checks.js';

function attachment(filename: string, mimeType = 'application/octet-stream') {
  return { filename, mimeType, isInline: false };
}

describe('isDangerousAttachment', () => {
  it.each([
    'setup.exe',
    'invoice.pdf.exe',
    'run.JS',
    'report.docm',
    'evil.exe. ',
  ])('flags %j by its extension', (filename) => {
    expect(isDangerousAttachment(attachment(filename))).toBe(true);
  });

  it('flags executables and macro documents by type', () => {
    expect(
      isDangerousAttachment(attachment('file', 'application/x-msdownload')),
    ).toBe(true);
    expect(
      isDangerousAttachment(
        attachment('sheet', 'application/vnd.ms-excel.sheet.macroEnabled.12'),
      ),
    ).toBe(true);
  });

  it.each(['photo.jpg', 'report.pdf', 'notes', ''])(
    'accepts %j',
    (filename) => {
      expect(isDangerousAttachment(attachment(filename, 'image/jpeg'))).toBe(
        false,
      );
    },
  );
});
