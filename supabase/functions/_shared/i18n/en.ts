// Server-side notification catalog (EN) — SUBSET of src/i18n/locales/en.json.
// Master locale is src/i18n/locales/en.json; this file MUST stay in sync via
// src/i18n/__tests__/serverCatalogSync.test.ts (vitest gate).
//
// Only keys used by DB triggers / edge functions belong here. Adding a key
// here without the same key + same {{placeholders}} in all three master
// locales makes the sync-guard test fail.
export default {
  "notifications.worker_payout.created.single.title":
    "New payout — {{project}}",
  "notifications.worker_payout.created.single.message":
    "Payout {{amount}} received for period {{period_start}} → {{period_end}}.",
  "notifications.worker_payout.created.batch.title":
    "Batch payout — {{count}} projects",
  "notifications.worker_payout.created.batch.message":
    "Received {{amount}} for {{count}} projects ({{project_names}}).",
  "notifications.worker_payout.voided.single.title":
    "Payout voided — {{project}}",
  "notifications.worker_payout.voided.single.message":
    "Your payout {{amount}} ({{period_start}} → {{period_end}}) was voided.",
  "notifications.worker_payout.voided.batch.title":
    "Batch payout voided — {{count}} projects",
  "notifications.worker_payout.voided.batch.message":
    "Batch payout {{amount}} for {{count}} projects was voided.",
  "notifications.worker_payout.fallback_project":
    "project",
  "notifications.project_transaction.title":
    "Transaction in project „{{project}}\"",
  "notifications.project_transaction.message.created.income":
    "{{actor}} added income „{{description}}\" ({{amount}})",
  "notifications.project_transaction.message.created.expense":
    "{{actor}} added expense „{{description}}\" ({{amount}})",
  "notifications.project_transaction.message.updated.income":
    "{{actor}} updated income „{{description}}\" ({{amount}})",
  "notifications.project_transaction.message.updated.expense":
    "{{actor}} updated expense „{{description}}\" ({{amount}})",
  "notifications.payment_source_transaction.title":
    "Transaction on account „{{source}}\"",
  "notifications.payment_source_transaction.message.created.income":
    "{{actor}} added income „{{description}}\" ({{amount}})",
  "notifications.payment_source_transaction.message.created.expense":
    "{{actor}} added expense „{{description}}\" ({{amount}})",
  "notifications.payment_source_transaction.message.created.transfer":
    "{{actor}} added transfer „{{description}}\" ({{amount}})",
  "notifications.payment_source_transaction.message.updated.income":
    "{{actor}} updated income „{{description}}\" ({{amount}})",
  "notifications.payment_source_transaction.message.updated.expense":
    "{{actor}} updated expense „{{description}}\" ({{amount}})",
  "notifications.payment_source_transaction.message.updated.transfer":
    "{{actor}} updated transfer „{{description}}\" ({{amount}})",
  "notifications.pending_transaction.title":
    "New pending transaction",
  "notifications.pending_transaction.message.income":
    "{{actor}} added income „{{description}}\" ({{amount}}) to circle „{{source}}\". Awaiting your approval.",
  "notifications.pending_transaction.message.expense":
    "{{actor}} added expense „{{description}}\" ({{amount}}) to circle „{{source}}\". Awaiting your approval.",
  "notifications.note_added.project.title":
    "New comment in project „{{project}}\"",
  "notifications.note_added.project.message":
    "{{actor}} commented on transaction „{{description}}\": „{{note}}\"",
  "notifications.note_added.income_source.title":
    "New note on transaction",
  "notifications.note_added.income_source.message":
    "{{actor}} added a note to transaction „{{description}}\" in project „{{source}}\": „{{note}}\"",
  "notifications.note_added.payment_source.title":
    "New comment on account „{{source}}\"",
  "notifications.note_added.payment_source.message":
    "{{actor}} commented on transaction „{{description}}\": „{{note}}\"",
  "notifications.project_activity.title":
    "Activity in project „{{project}}\"",
  "notifications.project_activity.message.work_log_added":
    "{{actor}} added a work log{{detail}}",
  "notifications.project_activity.message.work_log_updated":
    "{{actor}} updated a work log{{detail}}",
  "notifications.project_activity.message.work_log_deleted":
    "{{actor}} deleted a work log{{detail}}",
  "notifications.project_activity.message.milestone_added":
    "{{actor}} added milestone „{{milestone}}\"",
  "notifications.project_activity.message.milestone_status_changed":
    "{{actor}} changed milestone „{{milestone}}\" status → {{status}}",
  "notifications.project_activity.message.milestone_deleted":
    "{{actor}} deleted milestone „{{milestone}}\"",
  "notifications.auto_reject_pending.title":
    "Transaction auto-rejected",
  "notifications.auto_reject_pending.message":
    "Your transaction „{{description}}\" was auto-rejected because it was not approved within 24 hours.",
  "notifications.fallback.actor":
    "Member",
  "notifications.fallback.project":
    "project",
  "notifications.activation_nudge.day1.title":
    "Welcome to Centar 👋",
  "notifications.activation_nudge.day1.message":
    "Start with your first project — renovation, client or personal goal.",
  "notifications.activation_nudge.day3.title":
    "Ready for your first project? 🎯",
  "notifications.activation_nudge.day3.message":
    "Projects help you track budget and expenses in one place.",
  "notifications.activation_nudge.day7.title":
    "Unlock the full power of Centar 🚀",
  "notifications.activation_nudge.day7.message":
    "Create your first project in 30s and stay on top of expenses.",
  "notifications.app_update.title":
    "App update available",
  "notifications.app_update.message":
    "Version {{version}} is ready. Tap to download and install it.",
  "notifications.budget_burn_push.title":
    "{{percentage}}% of frame „{{name}}“ used",
  "notifications.budget_burn_push.message":
    "Actual {{spent}} of {{limit}} frame this period.",
  "notifications.budget_pace_push.title":
    "Spending is ahead of the period pace",
  "notifications.budget_pace_push.message":
    "„{{name}}“: {{spentPct}}% of frame spent, {{elapsedPct}}% of period elapsed. Check the direction.",
  "notifications.milestone_budget.warning.title":
    "🟡 Phase „{{name}}\" is at {{percentage}}% of budget",
  "notifications.milestone_budget.warning.message":
    "Phase „{{name}}\" in project „{{project}}\" has used {{percentage}}% of the planned budget.",
  "notifications.milestone_budget.over.title":
    "🔴 Phase „{{name}}\" has exceeded budget",
  "notifications.milestone_budget.over.message":
    "Phase „{{name}}\" in project „{{project}}\" exceeds budget by {{overPct}}%. Consider revising or drawing from reserve.",
  "notifications.milestone_deadline.upcoming.title":
    "⏰ Phase „{{name}}\" is due in {{days}} days",
  "notifications.milestone_deadline.upcoming.message":
    "Phase „{{name}}\" in project „{{project}}\" is due on {{date}}.",
  "notifications.milestone_deadline.overdue.title":
    "⚠️ Phase „{{name}}\" is overdue",
  "notifications.milestone_deadline.overdue.message":
    "Phase „{{name}}\" in project „{{project}}\" is {{days}} days past due.",
  "notifications.reminder.fallback_body":
    "Reminder: {{title}}",
  "notifications.participant_digest.title":
    "Summary: „{{project}}\"",
  "notifications.participant_digest.body.empty":
    "No new events.",
  "notifications.participant_digest.body.single_no_samples":
    "1 new change in the project",
  "notifications.participant_digest.body.many_no_samples":
    "{{count}} new changes in the project",
  "notifications.participant_digest.body.single_with_samples":
    "1 new change in the project: {{samples}}",
  "notifications.participant_digest.body.many_with_samples":
    "{{count}} new changes in the project: {{samples}}",
  "notifications.invitation_accepted.title":
    "Invitation accepted",
  "notifications.invitation_accepted.message.project":
    "{{userName}} accepted the invitation to project „{{targetName}}\"",
  "notifications.invitation_accepted.message.budget":
    "{{userName}} accepted the invitation to budget „{{targetName}}\"",
  "notifications.invitation_accepted.message.payment_source":
    "{{userName}} accepted the invitation to account „{{targetName}}\"",
  "notifications.invitation_accepted.push.project":
    "{{userName}} joined project „{{targetName}}\"",
  "notifications.invitation_accepted.push.budget":
    "{{userName}} joined budget „{{targetName}}\"",
  "notifications.invitation_accepted.push.payment_source":
    "{{userName}} joined account „{{targetName}}\"",
  "notifications.member_joined.project.title":
    "New project member",
  "notifications.member_joined.project.message":
    "{{memberName}} joined project „{{targetName}}\"",
  "notifications.member_joined.budget.title":
    "New budget member",
  "notifications.member_joined.budget.message":
    "{{memberName}} joined budget „{{targetName}}\"",
  "notifications.invitation_sent.project.title":
    "Project invitation",
  "notifications.invitation_sent.project.message":
    "{{inviterName}} invites you to join project „{{targetName}}\"",
  "notifications.invitation_sent.budget.title":
    "Budget invitation",
  "notifications.invitation_sent.budget.message":
    "{{inviterName}} invites you to join budget „{{targetName}}\"",
  "notifications.invitation_sent.payment_source.title":
    "Shared account invitation",
  "notifications.invitation_sent.payment_source.message":
    "{{inviterName}} invites you to join account „{{targetName}}\"",
  "notifications.krug.member_added.title": "You've been added to a Krug",
  "notifications.krug.member_added.message": "You are now a member of a new Krug.",
  "notifications.krug.expense_proposed.title": "New Krug proposal",
  "notifications.krug.expense_proposed.message": "A transaction is awaiting your approval.",
  "notifications.krug.expense_confirmed.title": "Your proposal was confirmed",
  "notifications.krug.expense_confirmed.message": "A Krug member confirmed your proposal.",
  "notifications.krug.expense_rejected.title": "Your proposal was rejected",
  "notifications.krug.expense_rejected.message": "A Krug member rejected your proposal. Reason: {{reason}}",
  "notifications.krug.deletion_requested.title": "Krug deletion started",
  "notifications.krug.deletion_requested.message": "The owner requested Krug deletion.",
  "notifications.krug.deleted.title": "Krug was deleted",
  "notifications.krug.deleted.message": "A Krug you were part of has been permanently removed.",
  "notifications.decisions.first_reminder.title": "Decision awaits your response",
  "notifications.decisions.first_reminder.body": "\"{{title}}\" has been awaiting your response for 12 hours.",
  "notifications.decisions.overdue.title": "Response deadline has passed",
  "notifications.decisions.overdue.body": "Decision \"{{title}}\" — the 24-hour response deadline has passed.",
  "notifications.decisions.daily.title": "Decision is still awaiting a response",
  "notifications.decisions.daily.body": "\"{{title}}\" — please respond.",
  "notifications.krug.invited.title": "You were invited to a Krug",
  "notifications.krug.invited.message": "Someone invited you to their Krug. Accept or decline in the app.",
  "notifications.krug.invitation_accepted.title": "Invitation accepted",
  "notifications.krug.invitation_accepted.message": "The invited person accepted the Krug invitation.",
  "notifications.krug.invitation_declined.title": "Invitation declined",
  "notifications.krug.invitation_declined.message": "The invited person declined the Krug invitation.",
  "notifications.krug.member_left.title": "A member left the Krug",
  "notifications.krug.member_left.message": "A member has left this Krug.",
  "notifications.krug.owner_left.title": "The owner left the Krug",
  "notifications.krug.owner_left.message": "The previous owner left the Krug. Ownership was transferred to another full member.",
  "notifications.krug.ownership_received.title": "You are now the Krug owner",
  "notifications.krug.ownership_received.message": "The previous owner left and transferred ownership to you. You now manage this Krug.",
  "notifications.krug.membership_notice.title": "Membership in Krug \"{{krug}}\"",
  "notifications.krug.membership_notice.message": "You have been a member of Krug \"{{krug}}\" since {{date}}. If you don't want to be a member, you can leave the Krug in its settings.",
  "notifications.krug.settlement_reminder.title": "Outstanding items in Krug",
  "notifications.krug.settlement_reminder.message": "You have {{count}} outstanding items totalling {{total}} {{currency}}.",
  "notifications.krug.settlement_settled.title": "Settlement confirmed",
  "notifications.krug.settlement_settled.message": "A Krug member marked a transfer as settled.",
  "notifications.krug.settlement_voided.title": "Settlement voided",
  "notifications.krug.settlement_voided.message": "A Krug member voided a recorded settlement ({{amount}} {{currency}}). Reason: {{reason}}",
  "notifications.krug.override_proposed.title": "Split proposal",
  "notifications.krug.override_proposed.message": "A Krug member proposed a manual split of a shared expense. Open the expense to confirm or reject.",
  "notifications.krug.override_confirmed.title": "Split confirmed",
  "notifications.krug.override_confirmed.message": "Your manual split proposal was confirmed and is now active.",
  "notifications.krug.override_rejected.title": "Split proposal rejected",
  "notifications.krug.override_rejected.message": "Your manual split proposal was rejected. Reason: {{reason}}",
  "notifications.project_expense_review.submitted.title": "Expense awaits your approval",
  "notifications.project_expense_review.submitted.message.expense": "{{actor}} submitted expense „{{description}}\" ({{amount}}) in project „{{project}}\". Awaiting your approval.",
  "notifications.project_expense_review.submitted.message.income": "{{actor}} submitted income „{{description}}\" ({{amount}}) in project „{{project}}\". Awaiting your approval.",
  "notifications.project_expense_review.approved.title": "Expense approved",
  "notifications.project_expense_review.approved.message": "{{actor}} approved „{{description}}\" ({{amount}}) in project „{{project}}\".",
  "notifications.project_expense_review.rejected.title": "Expense rejected",
  "notifications.project_expense_review.rejected.message": "{{actor}} rejected „{{description}}\" ({{amount}}) in project „{{project}}\". Reason: {{reason}}",
  "notifications.mail.pending.title": "A new document is waiting for review",
  "notifications.mail.pending.body": "A document arrived by e-mail. Open the review and confirm.",
  "notifications.invoice_due.upcoming.title": "Invoice due in 3 days",
  "notifications.invoice_due.upcoming.message": "{{supplier}} — {{amount}}, due {{date}}",
  "notifications.invoice_due.today.title": "Invoice due today",
  "notifications.invoice_due.today.message": "{{supplier}} — {{amount}}, due {{date}}",
} as const;
