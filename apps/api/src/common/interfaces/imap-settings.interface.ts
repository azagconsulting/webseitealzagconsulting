export type ImapEncryption = 'none' | 'ssl' | 'tls';

export interface ImapCredentials {
  host: string;
  port: number;
  username: string;
  password: string;
  mailbox: string;
  spamMailbox?: string | null;
  encryption: ImapEncryption;
  sinceDays?: number;
  verifiedAt?: string | null;
}

export interface ImapSettingsResponse {
  host: string;
  port: number;
  username: string;
  mailbox: string;
  spamMailbox?: string | null;
  encryption: ImapEncryption;
  hasPassword: boolean;
  sinceDays?: number;
  updatedAt: string;
  verifiedAt?: string | null;
}
