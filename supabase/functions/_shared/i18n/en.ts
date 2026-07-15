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
    "Welcome to V&M Balance 👋",
  "notifications.activation_nudge.day1.message":
    "Start with your first project — renovation, client or personal goal.",
  "notifications.activation_nudge.day3.title":
    "Ready for your first project? 🎯",
  "notifications.activation_nudge.day3.message":
    "Projects help you track budget and expenses in one place.",
  "notifications.activation_nudge.day7.title":
    "Unlock the full power of V&M Balance 🚀",
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
  "notifications.krug.expense_rejected.message": "A Krug member rejected your proposal.",
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
} as const;
