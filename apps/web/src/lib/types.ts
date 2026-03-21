export type UserRole = "ADMIN" | "COORDINATOR" | "AGENT" | "VIEWER" | "CUSTOMER";

export interface AuthUser {
  id: string;
  tenantId: string;
  customerId?: string | null;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  jobTitle?: string | null;
  headline?: string | null;
  phone?: string | null;
  location?: string | null;
  pronouns?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
  linkedinUrl?: string | null;
  twitterUrl?: string | null;
  calendlyUrl?: string | null;
  role: UserRole;
  lastLoginAt?: string | null;
  createdAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthResponse {
  user: AuthUser;
  tokens: AuthTokens;
}

export interface TwoFactorChallenge {
  requiresTwoFactor: true;
  deviceId: string;
  expiresAt: string;
}

export type LoginResponse = AuthResponse | TwoFactorChallenge;

export type LeadStatus =
  | "NEW"
  | "QUALIFIED"
  | "IN_PROGRESS"
  | "WON"
  | "LOST"
  | "ARCHIVED";

export type LeadPriority = "LOW" | "MEDIUM" | "HIGH";

export interface LeadAssignment {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email: string;
  role: UserRole;
}

export interface Lead {
  id: string;
  fullName: string;
  email: string;
  company?: string | null;
  phone?: string | null;
  message?: string | null;
  routingLabel?: string | null;
  source?: string | null;
  status: LeadStatus;
  priority: LeadPriority;
   processedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  assignedTo?: LeadAssignment | null;
}

export interface LeadWorkflowSettings {
  id: string;
  notifyEmail?: string | null;
  routingHeadline?: string | null;
  routingDescription?: string | null;
  autoResponderEnabled: boolean;
  autoResponderMessage?: string | null;
  autoAssignUser?: LeadAssignment | null;
  autoAssignUserId?: string | null;
}

export interface LeadTimelineEntry {
  id: string;
  leadId: string;
  status: LeadStatus;
  note?: string | null;
  createdAt: string;
  user?: LeadAssignment | null;
}

export interface ApiErrorPayload {
  message?: string;
  error?: string;
  statusCode?: number;
  issues?: string[];
}

export interface BlogAuthor {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
}

export interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt?: string | null;
  content: string;
  coverImage?: string | null;
  featured: boolean;
  published: boolean;
  publishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  author?: BlogAuthor | null;
}

export interface BlogPostListResponse {
  items: BlogPost[];
  stats?: {
    total: number;
    published: number;
    drafts: number;
  };
}

export type CustomerType = 'PRIVATE' | 'BUSINESS' | 'FLEET';
export type CustomerPackage = 'STARTER' | 'GROWTH' | 'ENTERPRISE';
export type VehicleFuelType =
  | 'GASOLINE'
  | 'DIESEL'
  | 'ELECTRIC'
  | 'HYBRID'
  | 'LPG'
  | 'OTHER';
export type VehicleTransmission = 'MANUAL' | 'AUTOMATIC';
export type ServiceOrderStatus = 'PLANNED' | 'IN_SERVICE' | 'COMPLETED' | 'CANCELLED';

export interface CustomerContact {
  id: string;
  name: string;
  role?: string | null;
  channel?: string | null;
  email?: string | null;
  phone?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Vehicle {
  id: string;
  manufacturer?: string | null;
  model?: string | null;
  trim?: string | null;
  licensePlate?: string | null;
  vin?: string | null;
  year?: number | null;
  mileageKm?: number | null;
  fuelType?: VehicleFuelType | null;
  transmission?: VehicleTransmission | null;
  color?: string | null;
  lastServiceAt?: string | null;
  nextServiceAt?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceOrder {
  id: string;
  vehicleId?: string | null;
  title: string;
  concern?: string | null;
  status: ServiceOrderStatus;
  advisorName?: string | null;
  technicianName?: string | null;
  scheduledAt?: string | null;
  completedAt?: string | null;
  odometerKm?: number | null;
  estimateCents?: number | null;
  totalCents?: number | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerPackageService {
  id: string;
  title: string;
  description?: string | null;
}

export interface Customer {
  id: string;
  name: string;
  type: CustomerType;
  customerPackage: CustomerPackage;
  packageServices: CustomerPackageService[];
  portalAccessEnabled: boolean;
  email?: string | null;
  phone?: string | null;
  mobile?: string | null;
  street?: string | null;
  postalCode?: string | null;
  city?: string | null;
  preferredChannel?: string | null;
  marketingOptIn: boolean;
  notes?: string | null;
  tags: string[];
  totalSpendCents: number;
  lastContactAt?: string | null;
  contacts: CustomerContact[];
  vehicles: Vehicle[];
  serviceOrders: ServiceOrder[];
  createdAt: string;
  updatedAt: string;
}

export interface CustomerListResponse {
  items: Customer[];
  stats: {
    total: number;
    privateCustomers: number;
    businessCustomers: number;
    fleetCustomers: number;
    openServiceOrders: number;
    vehicles: number;
  };
}

export interface InviteCustomerPortalUserResponse {
  user: AuthUser;
  temporaryPassword: string;
  inviteEmailSent: boolean;
  inviteEmailError?: string;
}

export interface CustomerPortalHomeResponse {
  customer: {
    id: string;
    name: string;
    type: CustomerType;
    customerPackage: CustomerPackage;
    packageServices: CustomerPackageService[];
    email?: string | null;
    phone?: string | null;
    city?: string | null;
  };
  stats: {
    totalOrders: number;
    openOrders: number;
    completedOrders: number;
    totalFiles: number;
  };
  nextAppointment: {
    id: string;
    title: string;
    date: string;
    startTime: string;
    endTime: string;
    meetingLink?: string | null;
  } | null;
  recentServiceOrders: Array<{
    id: string;
    title: string;
    status: ServiceOrderStatus;
    advisorName?: string | null;
    scheduledAt?: string | null;
    updatedAt: string;
  }>;
}

export interface CustomerPortalFile {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  createdAt: string;
  uploadedByName: string;
}

export interface CustomerPortalFileListResponse {
  items: CustomerPortalFile[];
}

export interface CustomerPortalProjectProfile {
  customerId: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  mobile?: string | null;
  street?: string | null;
  postalCode?: string | null;
  city?: string | null;
  preferredChannel?: string | null;
  notes?: string | null;
  legalName?: string | null;
  website?: string | null;
  industry?: string | null;
  companySize?: string | null;
  primaryContactName?: string | null;
  billingEmail?: string | null;
  projectGoals?: string | null;
  brandNotes?: string | null;
}

export interface CustomerPortalProjectProfileResponse {
  profile: CustomerPortalProjectProfile;
  assets: {
    logo: CustomerPortalFile | null;
    media: CustomerPortalFile[];
  };
}

export interface CustomerPortalProjectLogoUploadResponse {
  item: CustomerPortalFile;
}

export interface CustomerPortalProjectMediaUploadResponse {
  items: CustomerPortalFile[];
}

export type CustomerMessageDirection = "INBOUND" | "OUTBOUND";

export type CustomerMessageStatus = "DRAFT" | "QUEUED" | "SENDING" | "SENT" | "FAILED";
export type MessageCategory = "ANGEBOT" | "KOSTENVORANSCHLAG" | "KRITISCH" | "KUENDIGUNG" | "WERBUNG" | "SONSTIGES";

export interface CustomerMessageContact {
  id: string;
  name: string;
  role?: string | null;
  email?: string | null;
  phone?: string | null;
  channel?: string | null;
}

export interface CustomerMessageAttachment {
  name: string;
  type?: string | null;
  size?: number | null;
  data?: string | null;
}

export interface CustomerMessage {
  id: string;
  customerId?: string | null;
  leadId?: string | null;
  contact: CustomerMessageContact | null;
  direction: CustomerMessageDirection;
  status: CustomerMessageStatus;
  subject?: string | null;
  preview?: string | null;
  body: string;
  fromEmail?: string | null;
  toEmail?: string | null;
  attachments?: CustomerMessageAttachment[];
  readAt?: string | null;
  sentAt?: string | null;
  receivedAt?: string | null;
  isSpam?: boolean | null;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  ownerUserId?: string | null;
  
  // AI Analysis
  category?: MessageCategory | null;
  sentiment?: string | null;
  urgency?: string | null;
  summary?: string | null;
  analyzedAt?: string | null;
}

export interface MessageAnalysisSettings {
  enabled: boolean;
  updatedAt?: string;
}

export interface OpenAiSettings {
  hasApiKey: boolean;
  updatedAt?: string;
}

export interface CustomerMessageListResponse {
  customer: {
    id: string;
    name: string;
    contacts: CustomerMessageContact[];
  };
  items: CustomerMessage[];
}

export interface CustomerExtractionSuggestion {
  customer?: {
    name?: string | null;
    type?: CustomerType | null;
    email?: string | null;
    phone?: string | null;
    mobile?: string | null;
    street?: string | null;
    postalCode?: string | null;
    city?: string | null;
    preferredChannel?: string | null;
    marketingOptIn?: boolean | null;
    notes?: string | null;
    tags?: string[] | null;
    lastContactAt?: string | null;
  } | null;
  contact?: {
    name?: string | null;
    role?: string | null;
    email?: string | null;
    phone?: string | null;
    channel?: string | null;
  } | null;
  vehicle?: {
    manufacturer?: string | null;
    model?: string | null;
    trim?: string | null;
    licensePlate?: string | null;
    vin?: string | null;
    year?: number | null;
    mileageKm?: number | null;
    fuelType?: VehicleFuelType | null;
    transmission?: VehicleTransmission | null;
    color?: string | null;
    notes?: string | null;
  } | null;
};

export interface CustomerExtractionResponse {
  messageId: string;
  suggestion: CustomerExtractionSuggestion;
}

export interface ContactRequestExtractionSuggestion {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  concern?: string | null;
}

export interface ContactRequestExtractionResponse {
  leadId: string;
  suggestion: ContactRequestExtractionSuggestion;
}

export interface CustomerImportResponse {
  imported: number;
  skipped: number;
  errors: string[];
}

export type SmtpEncryption = "none" | "ssl" | "tls";

export interface SmtpSettings {
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

export interface ContactSmtpSettings {
  host: string;
  port: number;
  username: string;
  fromName?: string | null;
  fromEmail?: string | null;
  encryption: SmtpEncryption;
  hasPassword: boolean;
  updatedAt?: string;
   verifiedAt?: string;
}

export type ImapEncryption = "none" | "ssl" | "tls";

export interface ImapSettings {
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

export interface ApiSettings {
  embedUrl: string | null;
  apiToken: string | null;
  hasServiceAccount: boolean;
  trackingMode: "LOCAL" | "GA";
  updatedAt?: string;
  serviceAccountJson?: string | null;
}

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

export interface CreateEmployeeResponse {
  user: AuthUser;
  temporaryPassword?: string | null;
  inviteEmailSent?: boolean;
  inviteEmailError?: string | null;
}

export interface LeadMessageListResponse {
  lead: Lead;
  items: CustomerMessage[];
}

export type TrackingEventType = "PAGE_VIEW" | "PAGE_EXIT" | "CLICK";

export interface TrackingTimeseriesPoint {
  date: string;
  views: number;
  organic: number;
  direct: number;
  clicks: number;
  uniqueVisitors: number;
}

export interface TrackingPageStat {
  path: string;
  views: number;
  uniqueVisitors: number;
  clicks: number;
  clickRate: number;
  avgDurationMs: number;
  organicViews: number;
  directViews: number;
}

export interface TrackingSummary {
  since: string;
  until: string;
  totals: {
    views: number;
    uniqueVisitors: number;
    clicks: number;
    organicShare: number;
    avgDurationMs: number;
  };
  pages: TrackingPageStat[];
  timeseries: TrackingTimeseriesPoint[];
}

export type DriveScope = "USER" | "TEAM";
export type DriveFolderKind = "GENERAL" | "CUSTOMERS_ROOT" | "CUSTOMER";

export interface DriveUserSummary {
  id: string;
  displayName: string;
  email?: string | null;
  avatarUrl?: string | null;
}

export interface DriveTeam {
  id: string;
  name: string;
  isDefault: boolean;
}

export interface DriveFile {
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
  items: DriveFile[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
  };
}

export interface GoogleDriveStatus {
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

export interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: number | null;
  driveId?: string | null;
  modifiedTime?: string | null;
  webViewLink?: string | null;
}

export interface GoogleDriveFileListResponse {
  items: GoogleDriveFile[];
  nextPageToken?: string | null;
}

export interface DriveFolder {
  id: string;
  name: string;
  scope: DriveScope;
  kind: DriveFolderKind;
  fileCount?: number;
  ownerUserId?: string | null;
  parentId?: string | null;
  customerId?: string | null;
  systemKey?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ChatConversationType = "TEAM" | "DIRECT" | "CUSTOMER";

export interface ChatUserSummary {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  avatarUrl?: string | null;
  role: UserRole;
  displayName: string;
}

export interface ChatAttachment {
  id: string;
  driveFileId: string;
  name: string;
  mimeType?: string | null;
  size?: number | null;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  sender: ChatUserSummary;
  body?: string | null;
  attachments: ChatAttachment[];
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatConversationSummary {
  id: string;
  type: ChatConversationType;
  title: string;
  customerId?: string | null;
  customerName?: string | null;
  directUser?: ChatUserSummary | null;
  lastMessageAt?: string | null;
  unreadCount: number;
  lastMessage?: ChatMessage | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessageListResponse {
  items: ChatMessage[];
  pagination: {
    hasMore: boolean;
    nextBefore?: string | null;
  };
}

export interface ChatReadStateResponse {
  conversationId: string;
  userId: string;
  lastReadMessageId?: string | null;
  lastReadAt?: string | null;
  updatedAt: string;
}

export interface ChatReadStateSummary extends ChatReadStateResponse {
  user: ChatUserSummary;
}

export interface ChatAttachmentUploadResponse {
  fileId: string;
  name: string;
  mimeType?: string | null;
  size?: number | null;
  createdAt: string;
}

export interface ChatConversationChangedEvent {
  conversationId: string;
  reason: "conversation_created" | "message_created" | "read_updated";
  actorUserId?: string | null;
  changedAt: string;
}

export interface ChatTypingUpdatedEvent {
  conversationId: string;
  userId: string;
  isTyping: boolean;
  updatedAt: string;
}
