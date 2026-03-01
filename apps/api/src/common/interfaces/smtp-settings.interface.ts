export type SmtpEncryption = 'none' | 'ssl' | 'tls';

export interface SmtpCredentials {
  host: string;
  port: number;
  username: string;
  password: string;
  fromName?: string | null;
  fromEmail?: string | null;
  encryption: SmtpEncryption;
}

export interface ContactFormSmtpSettings {
  mode: 'same' | 'custom';
  host?: string;
  port?: number;
  username?: string;
  fromName?: string | null;
  fromEmail?: string | null;
  encryption?: SmtpEncryption;
  hasPassword: boolean;
  updatedAt?: string;
  verifiedAt?: string;
}

export interface SmtpSettingsResponse {
  host: string;
  port: number;
  username: string;
  fromName?: string | null;
  fromEmail?: string | null;
  encryption: SmtpEncryption;
  hasPassword: boolean;
  updatedAt: string;
  verifiedAt?: string | null;
}
