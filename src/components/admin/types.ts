export interface BugReport {
  id: string;
  user_id: string;
  title: string;
  description: string;
  device_info: any;
  status: string;
  created_at: string;
  user_display_name?: string;
}

export interface AppUser {
  id: string;
  email: string;
  display_name: string | null;
  currency: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  confirmed_at: string | null;
  banned_until: string | null;
  roles: string[];
  last_device_info: any;
  last_login_at: string | null;
  referral_count: number;
  app_version: string | null;
}

export interface AdminStats {
  total_users: number;
  active_users_7d: number;
  active_users_30d: number;
  total_expenses: number;
  expenses_7d: number;
  total_projects: number;
  total_budgets: number;
  total_savings: number;
  open_bug_reports: number;
  total_referrals: number;
}

export const statusColors: Record<string, string> = {
  open: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400',
  in_progress: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  resolved: 'bg-green-500/15 text-green-700 dark:text-green-400',
  closed: 'bg-muted text-muted-foreground',
};

export const statusLabels: Record<string, string> = {
  open: 'Otvoreno',
  in_progress: 'U tijeku',
  resolved: 'Riješeno',
  closed: 'Zatvoreno',
};

export const parseUserAgent = (ua: string) => {
  if (!ua) return 'Nepoznat';
  if (ua.includes('Android')) return 'Android';
  if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS';
  if (ua.includes('Windows')) return 'Windows';
  if (ua.includes('Mac')) return 'macOS';
  if (ua.includes('Linux')) return 'Linux';
  return 'Ostalo';
};

export const parseDetailedUA = (ua: string) => {
  if (!ua) return { os: 'Nepoznat', browser: 'Nepoznat', device: 'Nepoznat' };

  let os = 'Nepoznat';
  if (ua.includes('Android')) {
    const match = ua.match(/Android\s([\d.]+)/);
    os = match ? `Android ${match[1]}` : 'Android';
  } else if (ua.includes('iPhone')) {
    const match = ua.match(/iPhone OS ([\d_]+)/);
    os = match ? `iOS ${match[1].replace(/_/g, '.')}` : 'iOS';
  } else if (ua.includes('iPad')) {
    os = 'iPadOS';
  } else if (ua.includes('Windows NT 10')) {
    os = 'Windows 10/11';
  } else if (ua.includes('Windows')) {
    os = 'Windows';
  } else if (ua.includes('Mac OS X')) {
    const match = ua.match(/Mac OS X ([\d_]+)/);
    os = match ? `macOS ${match[1].replace(/_/g, '.')}` : 'macOS';
  } else if (ua.includes('Linux')) {
    os = 'Linux';
  }

  let browser = 'Nepoznat';
  if (ua.includes('Edg/')) {
    const match = ua.match(/Edg\/([\d.]+)/);
    browser = match ? `Edge ${match[1].split('.')[0]}` : 'Edge';
  } else if (ua.includes('Chrome/') && !ua.includes('Edg/')) {
    const match = ua.match(/Chrome\/([\d.]+)/);
    browser = match ? `Chrome ${match[1].split('.')[0]}` : 'Chrome';
  } else if (ua.includes('Firefox/')) {
    const match = ua.match(/Firefox\/([\d.]+)/);
    browser = match ? `Firefox ${match[1].split('.')[0]}` : 'Firefox';
  } else if (ua.includes('Safari/') && !ua.includes('Chrome')) {
    const match = ua.match(/Version\/([\d.]+)/);
    browser = match ? `Safari ${match[1].split('.')[0]}` : 'Safari';
  }

  let device = 'Desktop';
  if (ua.includes('Mobile') || ua.includes('Android')) device = 'Mobitel';
  if (ua.includes('iPad') || ua.includes('Tablet')) device = 'Tablet';

  return { os, browser, device };
};

export const isBanned = (u: AppUser) => {
  if (!u.banned_until) return false;
  return new Date(u.banned_until) > new Date();
};
