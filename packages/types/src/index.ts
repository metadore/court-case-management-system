// ─── Auth ─────────────────────────────────────────────────────────────────────

export type UserRole = "ADMIN" | "JUDGE" | "LAWYER" | "CLERK" | "PUBLIC";

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  courtId: string | null;
  firstName: string;
  lastName: string;
  iat: number;
  exp: number;
  /** Present and true only during the TOTP challenge step after password verification. */
  totpPending?: boolean;
}

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  courtId: string | null;
  firstName: string;
  lastName: string;
  totpEnabled: boolean;
}

// ─── Cases ────────────────────────────────────────────────────────────────────

export type CaseType =
  | "CIVIL"
  | "CRIMINAL"
  | "FAMILY"
  | "PROBATE"
  | "COMMERCIAL"
  | "CONSTITUTIONAL"
  | "APPELLATE"
  | "OTHER";

export type CaseStatus =
  | "FILED"
  | "PENDING"
  | "ACTIVE"
  | "ADJOURNED"
  | "DEFAULT"
  | "DISMISSED_FOR_WANT_OF_PROSECUTION"
  | "CLOSED"
  | "ARCHIVED";

export type CaseCloseReason =
  | "JUDGMENT"
  | "SETTLEMENT"
  | "DISMISSAL"
  | "DEFAULT_JUDGMENT"
  | "WITHDRAWN"
  | "TRANSFERRED"
  | "OTHER";

export type PartyRole =
  | "PLAINTIFF"
  | "DEFENDANT"
  | "COUNSEL_PLAINTIFF"
  | "COUNSEL_DEFENDANT"
  | "INTERVENOR"
  | "WITNESS"
  | "AMICUS"
  | "OTHER";

export type RepresentationStatus =
  | "UNREPRESENTED_PENDING"
  | "PRO_SE"
  | "COUNSEL_RETAINED"
  | "COUNSEL_APPOINTED";

export type AppointmentType = "RETAINED" | "APPOINTED";

export type CasePriority = "STANDARD" | "URGENT" | "EMERGENCY";

export interface CaseListItem {
  id: string;
  caseNumber: string;
  title: string;
  type: CaseType;
  status: CaseStatus;
  priority: CasePriority;
  filedAt: string;
  assignedJudge: { firstName: string; lastName: string } | null;
}

export interface CaseDetail extends CaseListItem {
  description: string | null;
  isPublic: boolean;
  tags: string[];
  consolidatedIntoId: string | null;
  consolidatedInto: { caseNumber: string; title: string } | null;
  parentCaseId: string | null;
  parentCase: { id: string; caseNumber: string; title: string } | null;
  appealCases: { id: string; caseNumber: string; title: string; status: CaseStatus }[];
  closeReason: CaseCloseReason | null;
  createdAt: string;
  updatedAt: string;
  parties: PartyItem[];
  hearings: HearingItem[];
  documents: DocumentItem[];
}

export interface PartyItem {
  id: string;
  name: string;
  role: PartyRole;
  email: string | null;
  phone: string | null;
  address: string | null;
  representationStatus: RepresentationStatus | null;
  appointmentType: AppointmentType | null;
  servedAt: string | null;
  serviceMethod: string | null;
  interpreterNeeded: boolean;
  interpreterLanguage: string | null;
}

export interface PartyCreatePayload {
  name: string;
  role: PartyRole;
  email?: string;
  phone?: string;
  address?: string;
  userId?: string;
  representationStatus?: RepresentationStatus;
  appointmentType?: AppointmentType;
  interpreterNeeded?: boolean;
  interpreterLanguage?: string;
}

export interface PartyUpdatePayload {
  name?: string;
  role?: PartyRole;
  email?: string;
  phone?: string;
  address?: string;
  userId?: string;
  representationStatus?: RepresentationStatus;
  appointmentType?: AppointmentType;
  servedAt?: string;
  serviceMethod?: string;
  interpreterNeeded?: boolean;
  interpreterLanguage?: string;
}

// ─── Documents ────────────────────────────────────────────────────────────────

export type DocumentType =
  | "COMPLAINT"
  | "MOTION"
  | "RESPONSE"
  | "ORDER"
  | "JUDGMENT"
  | "NOTICE"
  | "AFFIDAVIT"
  | "EVIDENCE"
  | "TRANSCRIPT"
  | "OTHER";

export type DocumentConfidentiality = "PUBLIC" | "RESTRICTED" | "SEALED" | "CONFIDENTIAL";

export interface DocumentItem {
  id: string;
  title: string;
  type: DocumentType;
  filePath: string;
  fileSize: number;
  mimeType: string;
  confidentiality: DocumentConfidentiality;
  version: number;
  createdAt: string;
  uploadedBy: { firstName: string; lastName: string };
}

// ─── Hearings ─────────────────────────────────────────────────────────────────

export type HearingType =
  | "ARRAIGNMENT"
  | "BAIL"
  | "PRELIMINARY"
  | "TRIAL"
  | "MOTION_HEARING"
  | "SENTENCING"
  | "APPEAL"
  | "STATUS_CONFERENCE"
  | "OTHER";

export type HearingStatus =
  | "SCHEDULED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "ADJOURNED"
  | "CANCELLED"
  | "NO_SHOW";

export type HearingFormat = "IN_PERSON" | "VIRTUAL" | "HYBRID";

export interface HearingItem {
  id: string;
  scheduledAt: string;
  durationMins: number;
  type: HearingType;
  status: HearingStatus;
  format: HearingFormat;
  notes: string | null;
  meetingLink: string | null;
  continuedFromId: string | null;
  continuedFrom: { id: string; scheduledAt: string; type: HearingType } | null;
  judge: { firstName: string; lastName: string } | null;
  courtroom: { name: string } | null;
}

// ─── Notifications ────────────────────────────────────────────────────────────

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
}

export type NotificationEventType =
  | "HEARING_SCHEDULED"
  | "HEARING_RESCHEDULED"
  | "HEARING_CANCELLED"
  | "HEARING_COMPLETED"
  | "HEARING_REMINDER"
  | "CASE_FILED"
  | "CASE_STATUS_CHANGED"
  | "DOCUMENT_FILED"
  | "PAYMENT_DUE"
  | "PAYMENT_RECEIVED"
  | "PARTY_ADDED"
  | "GENERAL_NOTICE";

export type DeliveryChannel = "SMS" | "EMAIL";
export type DeliveryStatus = "PENDING" | "SENDING" | "SENT" | "FAILED" | "CANCELLED";
export type SubscriptionTier = "STAFF" | "PARTY" | "PUBLIC_BASIC" | "PUBLIC_PRO";

export interface NotificationSubscriptionItem {
  id: string;
  caseId: string;
  userId: string | null;
  email: string | null;
  phone: string | null;
  subscribeAll: boolean;
  eventTypes: NotificationEventType[];
  channels: DeliveryChannel[];
  tier: SubscriptionTier;
  activeUntil: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface OutboundNotificationItem {
  id: string;
  subscriptionId: string | null;
  caseId: string | null;
  channel: DeliveryChannel;
  eventType: NotificationEventType;
  recipient: string;
  subject: string | null;
  body: string;
  status: DeliveryStatus;
  attempts: number;
  maxAttempts: number;
  nextRetryAt: string | null;
  providerRef: string | null;
  providerError: string | null;
  scheduledAt: string;
  sentAt: string | null;
  createdAt: string;
}

export interface NotificationProviderItem {
  id: string;
  name: string;
  type: string;
  channel: DeliveryChannel;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
}

export interface SubscriptionPlanItem {
  id: string;
  name: string;
  tier: SubscriptionTier;
  stripePriceId: string;
  pricePerMonth: number;
  maxCases: number | null;
  channels: DeliveryChannel[];
  description: string | null;
}

// ─── Payments ─────────────────────────────────────────────────────────────────

export type PaymentStatus = "PENDING" | "COMPLETED" | "FAILED" | "REFUNDED";
export type PaymentType =
  | "FILING_FEE"
  | "FINE"
  | "SERVICE_FEE"
  | "BAIL_BOND"
  | "OTHER";

export interface PaymentItem {
  id: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  type: PaymentType;
  description: string | null;
  createdAt: string;
}

// ─── API Response wrappers ────────────────────────────────────────────────────

export interface ApiSuccess<T> {
  data: T;
}

export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ─── Signatures ───────────────────────────────────────────────────────────────

export interface SignatureItem {
  id: string;
  signerName: string;
  signerRole: string;
  signerEmail: string | null;
  signedAt: string;
  signatureHash: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
}

export interface SignatureCreatePayload {
  signerName: string;
  signerRole: string;
  signerEmail?: string;
}

export interface SignatureCreateResponse {
  signature: SignatureItem;
  signedFile: string;
}

export interface SignatureVerifyResponse {
  isValid: boolean;
  signature: Omit<SignatureItem, "signatureHash">;
}

// ─── Lawyers ──────────────────────────────────────────────────────────────────

export type AvailabilityStatus = "AVAILABLE" | "BUSY" | "NOT_ACCEPTING";

export interface LawyerProfileSummary {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  barNumber: string | null;
  phone: string | null;
  email: string;
  bio: string | null;
  photoUrl: string | null;
  practiceAreas: string[];
  yearsOfExperience: number | null;
  officeAddress: string | null;
  website: string | null;
  availabilityStatus: AvailabilityStatus;
  averageRating: number | null;
  ratingCount: number;
  totalCases: number;
}

export interface LawyerPerformanceData {
  caseStats: {
    total: number;
    active: number;
    closed: number;
    averageDurationDays: number | null;
    byType: { type: string; count: number }[];
    overTime: { month: string; count: number }[];
  };
  hearingStats: {
    total: number;
    completed: number;
    adjourned: number;
    cancelled: number;
    completionRate: number;
    adjournmentRate: number;
    cancellationRate: number;
    reliabilityTrend: { month: string; completed: number; adjourned: number }[];
  };
  ratingStats: {
    average: number | null;
    total: number;
    distribution: { rating: number; count: number }[];
  };
}

export interface LawyerProfileDetail extends LawyerProfileSummary {
  performance: LawyerPerformanceData;
}

export interface LawyerRatingCreatePayload {
  rating: number;
  comment?: string;
}

export interface LawyerProfileUpdatePayload {
  bio?: string;
  photoUrl?: string;
  practiceAreas?: string[];
  yearsOfExperience?: number;
  officeAddress?: string;
  website?: string;
  availabilityStatus?: AvailabilityStatus;
  customHours?: Record<string, string>;
}

// ─── Socket events ────────────────────────────────────────────────────────────

// ─── Recordings / STT ─────────────────────────────────────────────────────────

export type RecordingStatus = "UPLOADED" | "PROCESSING" | "TRANSCRIBED" | "FAILED";

export interface HearingRecordingItem {
  id: string;
  hearingId: string;
  uploadedById: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  durationSecs: number | null;
  status: RecordingStatus;
  transcript: string | null;
  transcriptGeneratedAt: string | null;
  transcriptProvider: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SocketEvents {
  "notification:new": NotificationItem;
  "case:updated": { caseId: string; status: CaseStatus };
  "hearing:scheduled": HearingItem & { caseId: string };
  "document:filed": { caseId: string; documentId: string; title: string };
  "document:signed": { caseId: string; documentId: string; signerName: string };
  "recording:transcribed": { caseId: string; hearingId: string; recordingId: string };
}

// ─── Case Notes ───────────────────────────────────────────────────────────────

export type NoteVisibility = "PRIVATE" | "JUDGES_AND_CLERKS" | "ALL_STAFF";

export interface CaseNoteItem {
  id: string;
  caseId: string;
  authorId: string;
  content: string;
  visibility: NoteVisibility;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
  author: { firstName: string; lastName: string };
}

export interface CaseNoteCreatePayload {
  content: string;
  visibility?: NoteVisibility;
  isPinned?: boolean;
}

// ─── Motions & Deadlines ──────────────────────────────────────────────────────

export type MotionType =
  | "MOTION_TO_DISMISS"
  | "MOTION_FOR_SUMMARY_JUDGMENT"
  | "MOTION_IN_LIMINE"
  | "MOTION_TO_COMPEL"
  | "MOTION_FOR_CONTINUANCE"
  | "MOTION_FOR_DEFAULT_JUDGMENT"
  | "MOTION_TO_SUPPRESS"
  | "MOTION_FOR_RECONSIDERATION"
  | "MOTION_FOR_SANCTIONS"
  | "OTHER";

export type MotionStatus =
  | "FILED"
  | "PENDING_RESPONSE"
  | "RESPONSE_FILED"
  | "UNDER_SUBMISSION"
  | "GRANTED"
  | "DENIED"
  | "WITHDRAWN"
  | "MOOT";

export type DeadlineType =
  | "RESPONSE"
  | "REPLY"
  | "DISCOVERY_CUTOFF"
  | "EXPERT_DISCLOSURE"
  | "PRETRIAL_CONFERENCE"
  | "TRIAL"
  | "APPEAL"
  | "SERVICE_OF_PROCESS"
  | "OTHER";

export interface MotionItem {
  id: string;
  caseId: string;
  type: MotionType;
  title: string;
  status: MotionStatus;
  filedAt: string;
  respondByDate: string | null;
  replyByDate: string | null;
  decidedAt: string | null;
  notes: string | null;
  filedBy: { firstName: string; lastName: string };
  deadlines: DeadlineItem[];
}

export interface MotionCreatePayload {
  type: MotionType;
  title: string;
  documentId?: string;
  notes?: string;
  respondByDate?: string;
  replyByDate?: string;
}

export interface DeadlineItem {
  id: string;
  caseId: string;
  motionId: string | null;
  type: DeadlineType;
  title: string;
  dueDate: string;
  completedAt: string | null;
  completedById: string | null;
  isAutoGenerated: boolean;
  notes: string | null;
  completedBy: { firstName: string; lastName: string } | null;
}

export interface DeadlineCreatePayload {
  type: DeadlineType;
  title: string;
  dueDate: string;
  motionId?: string;
  notes?: string;
}

// ─── Case Checklist ───────────────────────────────────────────────────────────

export interface CaseChecklistItem {
  id: string;
  caseId: string;
  step: string;
  description: string | null;
  order: number;
  isCompleted: boolean;
  completedAt: string | null;
  completedBy: { firstName: string; lastName: string } | null;
}

// ─── Evidence Chain of Custody ────────────────────────────────────────────────

export type EvidenceType =
  | "PHYSICAL"
  | "DOCUMENTARY"
  | "DIGITAL"
  | "TESTIMONIAL"
  | "DEMONSTRATIVE"
  | "OTHER";

export type EvidenceStatus =
  | "INTAKE"
  | "IN_CUSTODY"
  | "TRANSFERRED"
  | "RELEASED"
  | "DESTROYED";

export interface EvidenceItem {
  id: string;
  caseId: string;
  title: string;
  description: string | null;
  type: EvidenceType;
  status: EvidenceStatus;
  custodianId: string | null;
  intakeDate: string;
  storageLocation: string | null;
  condition: string | null;
  exhibitNumber: string | null;
  custodian: { firstName: string; lastName: string } | null;
}

export interface EvidenceTransferItem {
  id: string;
  evidenceId: string;
  transferredAt: string;
  reason: string | null;
  notes: string | null;
  fromCustodian: { firstName: string; lastName: string } | null;
  toCustodian: { firstName: string; lastName: string } | null;
}

export interface EvidenceCreatePayload {
  title: string;
  description?: string;
  type: EvidenceType;
  storageLocation?: string;
  condition?: string;
  exhibitNumber?: string;
}

// ─── Fee Waivers ──────────────────────────────────────────────────────────────

export type FeeWaiverStatus = "PENDING" | "APPROVED" | "DENIED" | "WITHDRAWN";

export interface FeeWaiverItem {
  id: string;
  caseId: string;
  applicantId: string;
  incomeAmount: number;
  householdSize: number;
  numberOfDependents: number;
  employmentStatus: string | null;
  assets: string | null;
  status: FeeWaiverStatus;
  reviewedById: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  createdAt: string;
  applicant: { firstName: string; lastName: string; email: string };
  reviewedBy: { firstName: string; lastName: string } | null;
}

export interface FeeWaiverCreatePayload {
  incomeAmount: number;
  householdSize: number;
  numberOfDependents?: number;
  employmentStatus?: string;
  assets?: string;
}

// ─── Analytics ────────────────────────────────────────────────────────────────

export interface AnalyticsOverview {
  totalCases: number;
  activeCases: number;
  closedThisMonth: number;
  filedThisMonth: number;
  avgDaysToClose: number | null;
  casesByStatus: { status: string; count: number }[];
  casesByType: { type: string; count: number }[];
  casesByPriority: { priority: string; count: number }[];
  hearingsToday: number;
  overdueDeadlines: number;
  pendingFeeWaivers: number;
  unservedParties: number;
}

export interface AnalyticsAging {
  buckets: { label: string; count: number }[];
}

export interface AnalyticsJudgeWorkload {
  judgeId: string;
  firstName: string;
  lastName: string;
  activeCases: number;
  scheduledHearings: number;
  overdueDeadlines: number;
}

export interface AnalyticsResolutionTrend {
  months: { month: string; filed: number; closed: number }[];
}

// ─── Courtroom ────────────────────────────────────────────────────────────────

export interface CourtroomItem {
  id: string;
  name: string;
  capacity: number | null;
  isActive: boolean;
  courtId: string;
}
