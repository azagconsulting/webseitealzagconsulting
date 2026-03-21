export interface WorkspaceAddress {
  street?: string | null;
  postalCode?: string | null;
  city?: string | null;
  country?: string | null;
}

export interface WorkspaceBranding {
  primaryColor?: string | null;
  secondaryColor?: string | null;
  accentColor?: string | null;
  logoFileId?: string | null;
}

export interface WorkspaceSettings {
  companyName?: string | null;
  legalName?: string | null;
  industry?: string | null;
  tagline?: string | null;
  mission?: string | null;
  vision?: string | null;
  description?: string | null;
  foundedYear?: number | null;
  teamSize?: number | null;
  supportEmail?: string | null;
  supportPhone?: string | null;
  timezone?: string | null;
  currency?: string | null;
  vatNumber?: string | null;
  registerNumber?: string | null;
  website?: string | null;
  address?: WorkspaceAddress;
  branding?: WorkspaceBranding;
  updatedAt?: string;
}
