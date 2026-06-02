export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  data: Record<string, unknown>;
  read: boolean;
  created_at: string;
  status?: 'active' | 'resolved' | 'dismissed';
  dedup_key?: string | null;
  severity?: 'info' | 'warning' | 'critical';
}
