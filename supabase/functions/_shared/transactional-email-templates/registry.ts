/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'

export interface TemplateEntry {
  component: React.ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  to?: string
  displayName?: string
  previewData?: Record<string, any>
}

import { template as budgetAlert } from './budget-alert.tsx'
import { template as transactionConfirmation } from './transaction-confirmation.tsx'
import { template as accountDeletionScheduled } from './account-deletion-scheduled.tsx'
import { template as accountDeletionCancelled } from './account-deletion-cancelled.tsx'
import { template as accountDeletionCompleted } from './account-deletion-completed.tsx'
import { template as supportAutoResponder } from './support-auto-responder.tsx'
import { template as feedbackAdminAlert } from './feedback-admin-alert.tsx'
import { template as projectWorkerInvitation } from './project-worker-invitation.tsx'
import { template as crashAlert } from './crash-alert.tsx'
import { template as invoicePaymentReminder } from './invoice-payment-reminder.tsx'

export const TEMPLATES: Record<string, TemplateEntry> = {
  'budget-alert': budgetAlert,
  'transaction-confirmation': transactionConfirmation,
  'account-deletion-scheduled': accountDeletionScheduled,
  'account-deletion-cancelled': accountDeletionCancelled,
  'account-deletion-completed': accountDeletionCompleted,
  'support-auto-responder': supportAutoResponder,
  'feedback-admin-alert': feedbackAdminAlert,
  'project-worker-invitation': projectWorkerInvitation,
  'crash-alert': crashAlert,
  'invoice-payment-reminder': invoicePaymentReminder,
}
