import type { DriveScope } from '@prisma/client';

export interface DriveUserSummary {
  id: string;
  displayName: string;
  email?: string | null;
  avatarUrl?: string | null;
}

export interface DriveTeamSummary {
  id: string;
  name: string;
  isDefault: boolean;
}

export interface DriveFolder {
  id: string;
  name: string;
  scope: DriveScope;
  ownerUserId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DriveFileResponse {
  id: string;
  scope: DriveScope;
  folderId?: string | null;
  name: string;
  size: number;
  mimeType: string;
  ownerUserId?: string | null;
  uploadedBy: DriveUserSummary;
  ownerUser?: DriveUserSummary | null;
  team?: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface DriveFileListResponse {
  items: DriveFileResponse[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
  };
}

export interface GoogleDriveStatusResponse {
  connected: boolean;
  email?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  connectedAt?: string | null;
  maxFileSizeMb: number;
}

export interface GoogleDriveSharedDrive {
  id: string;
  name: string;
}

export interface GoogleDriveFileResponse {
  id: string;
  name: string;
  mimeType: string;
  size?: number | null;
  driveId?: string | null;
  modifiedTime?: string | null;
  webViewLink?: string | null;
}

export interface GoogleDriveFileListResponse {
  items: GoogleDriveFileResponse[];
  nextPageToken?: string | null;
}
