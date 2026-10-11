import * as React from "react";
import { Badge } from "./badge";
import type { CaseStatus, HearingStatus, PaymentStatus } from "@tpt-court/types";

const caseStatusConfig: Record<CaseStatus, { label: string; variant: "default" | "secondary" | "success" | "warning" | "destructive" | "outline" }> = {
  FILED: { label: "Filed", variant: "secondary" },
  PENDING: { label: "Pending", variant: "warning" },
  ACTIVE: { label: "Active", variant: "default" },
  ADJOURNED: { label: "Adjourned", variant: "warning" },
  DEFAULT: { label: "Default", variant: "destructive" },
  DISMISSED_FOR_WANT_OF_PROSECUTION: { label: "Dismissed (DWOP)", variant: "destructive" },
  CLOSED: { label: "Closed", variant: "success" },
  ARCHIVED: { label: "Archived", variant: "outline" },
};

const hearingStatusConfig: Record<HearingStatus, { label: string; variant: "default" | "secondary" | "success" | "warning" | "destructive" | "outline" }> = {
  SCHEDULED: { label: "Scheduled", variant: "default" },
  IN_PROGRESS: { label: "In Progress", variant: "warning" },
  COMPLETED: { label: "Completed", variant: "success" },
  ADJOURNED: { label: "Adjourned", variant: "warning" },
  CANCELLED: { label: "Cancelled", variant: "destructive" },
  NO_SHOW: { label: "No Show", variant: "destructive" },
};

const paymentStatusConfig: Record<PaymentStatus, { label: string; variant: "default" | "secondary" | "success" | "warning" | "destructive" | "outline" }> = {
  PENDING: { label: "Pending", variant: "warning" },
  COMPLETED: { label: "Paid", variant: "success" },
  FAILED: { label: "Failed", variant: "destructive" },
  REFUNDED: { label: "Refunded", variant: "secondary" },
};

export function CaseStatusBadge({ status }: { status: CaseStatus }) {
  const config = caseStatusConfig[status];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

export function HearingStatusBadge({ status }: { status: HearingStatus }) {
  const config = hearingStatusConfig[status];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const config = paymentStatusConfig[status];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
