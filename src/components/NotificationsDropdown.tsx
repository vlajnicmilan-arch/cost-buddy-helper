import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, CheckCheck, Trash2, UserPlus, X, Loader2, FolderOpen, Wallet, AlertTriangle, Clock, User, Briefcase, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useNotifications } from '@/hooks/useNotifications';
import { useAuth } from '@/hooks/useAuth';
import { formatDistanceToNow } from 'date-fns';
import { hr } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';
import { useTranslation } from 'react-i18next';
import { Notification } from '@/types/notification';
import { useAppState } from '@/contexts/AppStateContext';
import { resolveNotificationText } from '@/lib/notificationI18n';

const getNotificationIcon = (type: string) => {
  switch (type) {
    case 'member_joined':
    case 'invitation_accepted':
      return <UserPlus className="w-4 h-4 text-primary" />;
    case 'project_invitation':
    case 'project_transaction':
    case 'note_added':
      return <FolderOpen className="w-4 h-4 text-primary" />;
    case 'budget_invitation':
    case 'budget_alert':
      return <AlertTriangle className="w-4 h-4 text-warning" />;
    case 'payment_source_invitation':
    case 'payment_source_transaction':
      return <Wallet className="w-4 h-4 text-primary" />;
    case 'family_invitation':
      return <UserPlus className="w-4 h-4 text-primary" />;
    case 'family_message':
      return <Bell className="w-4 h-4 text-primary" />;
    case 'reminder':
      return <Clock className="w-4 h-4 text-orange-500" />;
    case 'app_update':
      return <Download className="w-4 h-4 text-primary" />;
    default:
      return <Bell className="w-4 h-4 text-muted-foreground" />;
  }
};

const isInvitationNotification = (type: string) => {
  return type === 'project_invitation' || type === 'budget_invitation' || type === 'payment_source_invitation' || type === 'family_invitation';
};

const getInvitationType = (type: string): 'project' | 'budget' | 'payment_source' | 'family' => {
  if (type === 'project_invitation') return 'project';
  if (type === 'budget_invitation') return 'budget';
  if (type === 'family_invitation') return 'family';
  return 'payment_source';
};

const parseNotificationData = (data: unknown): Record<string, unknown> => {
  if (!data) return {};
  if (typeof data === 'string') {
    try { return JSON.parse(data); } catch { return {}; }
  }
  return data as Record<string, unknown>;
};

export const NotificationsDropdown = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { setBusinessModeEnabled, setActiveBusinessProfileId } = useAppState();
  const {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    deleteAllNotifications,
    refetch,
  } = useNotifications();
  const [open, setOpen] = useState(false);
  const [confirmDeleteAllOpen, setConfirmDeleteAllOpen] = useState(false);
  const [respondingTo, setRespondingTo] = useState<string | null>(null);
  const [invitationDialog, setInvitationDialog] = useState<{
    notification: Notification;
    invitationType: 'project' | 'budget' | 'payment_source' | 'family';
    invitationId: string;
  } | null>(null);

  // Project-invitation context picker state
  const [chosenContext, setChosenContext] = useState<'personal' | 'business'>('personal');
  const [businessProfiles, setBusinessProfiles] = useState<Array<{ id: string; company_name: string }>>([]);
  const [chosenBusinessProfileId, setChosenBusinessProfileId] = useState<string>('');
  const [suggestedContext, setSuggestedContext] = useState<'personal' | 'business'>('personal');

  // When project invitation dialog opens, load suggestion + user's business profiles
  useEffect(() => {
    const loadProjectContext = async () => {
      if (!invitationDialog || invitationDialog.invitationType !== 'project' || !user) return;

      const { data: inv } = await supabase
        .from('project_invitations')
        .select('suggested_context')
        .eq('id', invitationDialog.invitationId)
        .maybeSingle();

      const suggested = ((inv as any)?.suggested_context === 'business' ? 'business' : 'personal') as 'personal' | 'business';
      setSuggestedContext(suggested);
      setChosenContext(suggested);

      const { data: profiles } = await supabase
        .from('business_profiles')
        .select('id, company_name')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });

      const list = (profiles || []) as Array<{ id: string; company_name: string }>;
      setBusinessProfiles(list);
      if (list.length > 0) setChosenBusinessProfileId(list[0].id);
    };
    loadProjectContext();
  }, [invitationDialog, user]);

  const getNavigationTarget = (type: string, data: Record<string, unknown>) => {
    switch (type) {
      case 'project_transaction':
      case 'note_added':
        return { path: '/projects', state: { openProjectId: data.project_id, openExpenseId: data.expense_id } };
      case 'budget_alert':
        return { path: '/budgets', state: { openBudgetId: data.budget_id } };
      case 'payment_source_transaction':
        return { path: '/', state: { openExpenseId: data.expense_id } };
      case 'family_message':
        return { path: '/family', state: { openGroupId: data.group_id, openChat: true } };
      case 'app_update':
        return { path: '/install', state: { version: data.version, apkUrl: data.apkUrl } };
      case 'invitation_accepted': {
        const targetType = data.type as string;
        if (targetType === 'family') {
          return { path: '/family', state: { openGroupId: data.target_id } };
        }
        return null;
      }
      default:
        return null;
    }
  };

  const handleNotificationClick = async (notification: Notification) => {
    const isInvitation = isInvitationNotification(notification.type);
    const data = parseNotificationData(notification.data);

    if (isInvitation) {
      const invitationId = data?.invitation_id as string;
      if (invitationId) {
        // Close dropdown, open dialog
        setOpen(false);
        if (!notification.read) {
          await markAsRead(notification.id);
        }
        setInvitationDialog({
          notification,
          invitationType: getInvitationType(notification.type),
          invitationId,
        });
      }
      return;
    }

    if (!notification.read) {
      await markAsRead(notification.id);
    }
    
    const target = getNavigationTarget(notification.type, data);
    if (target) {
      setOpen(false);
      navigate(target.path, { state: target.state });
    }
  };

  const handleRespondToInvitation = async (action: 'accept' | 'decline') => {
    if (!invitationDialog) return;
    const { notification, invitationType, invitationId } = invitationDialog;

    // Validate context choice for project accept
    if (
      action === 'accept' &&
      invitationType === 'project' &&
      chosenContext === 'business' &&
      !chosenBusinessProfileId
    ) {
      showError(t('projects.selectBusinessProfile', 'Odaberite poslovni profil ili odaberite Osobne financije.'));
      return;
    }

    setRespondingTo(notification.id);
    try {
      const body: Record<string, unknown> = {
        type: invitationType,
        invitationId,
        action,
      };

      if (action === 'accept' && invitationType === 'project') {
        body.memberContext = chosenContext;
        body.memberBusinessProfileId = chosenContext === 'business' ? chosenBusinessProfileId : null;
      }

      const { data, error } = await supabase.functions.invoke('respond-to-invitation', { body });

      if (error) throw error;

      if (data.error) {
        showError(data.error);
        return;
      }

      if (action === 'accept') {
        // Sync business mode via context setters AND localStorage so both the live state
        // (current session) and any subsequent reload pick up the right view.
        if (invitationType === 'project') {
          if (chosenContext === 'business' && chosenBusinessProfileId) {
            setBusinessModeEnabled(true);
            setActiveBusinessProfileId(chosenBusinessProfileId);
            localStorage.setItem('business_mode_enabled', 'true');
            localStorage.setItem('active_business_profile_id', chosenBusinessProfileId);
          } else if (chosenContext === 'personal') {
            setBusinessModeEnabled(false);
            setActiveBusinessProfileId(null);
            localStorage.setItem('business_mode_enabled', 'false');
            localStorage.removeItem('active_business_profile_id');
          }
        }
        showSuccess(t('notifications.invitationAccepted', 'Pozivnica prihvaćena'));
      } else {
        showSuccess(t('notifications.invitationDeclined', 'Pozivnica odbijena'));
      }

      await deleteNotification(notification.id);
      refetch();

      // Force a full reload (replace) so AppStateContext re-initializes from localStorage
      // and BusinessModeGuard re-evaluates with the new shared-business membership.
      if (action === 'accept' && invitationType === 'project') {
        const target = chosenContext === 'business' ? '/projects' : '/projects';
        setTimeout(() => { window.location.replace(target); }, 600);
      }
    } catch (error) {
      console.error('Error responding to invitation:', error);
      showError(t('common.error'));
    } finally {
      setRespondingTo(null);
      setInvitationDialog(null);
    }
  };

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="relative rounded-xl h-9 w-9">
            <Bell className="w-4 h-4 sm:w-5 sm:h-5" />
            {unreadCount > 0 && (
              <Badge
                variant="destructive"
                className="absolute -top-1 -right-1 h-5 min-w-5 flex items-center justify-center p-0 text-xs"
              >
                {unreadCount > 9 ? '9+' : unreadCount}
              </Badge>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80">
          <div className="flex items-center justify-between gap-2 px-3 py-2">
            <h3 className="font-semibold text-sm">{t('notifications.title', 'Obavijesti')}</h3>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs px-2"
                  onClick={() => markAllAsRead()}
                >
                  <CheckCheck className="w-3 h-3 mr-1" />
                  {t('notifications.markAllRead', 'Označi sve')}
                </Button>
              )}
              {notifications.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => setConfirmDeleteAllOpen(true)}
                >
                  <Trash2 className="w-3 h-3 mr-1" />
                  {t('notifications.deleteAll', 'Obriši sve')}
                </Button>
              )}
            </div>
          </div>
          <DropdownMenuSeparator />
          <ScrollArea className="max-h-80">
            {loading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                {t('common.loading', 'Učitavanje...')}
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                {t('notifications.empty', 'Nemate obavijesti')}
              </div>
            ) : (
              <div className="py-1">
                {notifications.map((notification) => {
                  const isInvitation = isInvitationNotification(notification.type);

                  return (
                    <div
                      key={notification.id}
                      role="button"
                      tabIndex={0}
                      aria-label={notification.title || notification.message || 'Obavijest'}
                      className={cn(
                        'px-3 py-2 hover:bg-muted/50 cursor-pointer flex flex-col gap-2 group relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                        !notification.read && 'bg-primary/5'
                      )}
                      onClick={() => handleNotificationClick(notification)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleNotificationClick(notification);
                        }
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 mt-0.5">
                          {getNotificationIcon(notification.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={cn('text-sm', !notification.read && 'font-medium')}>
                            {notification.title}
                          </p>
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {notification.message}
                          </p>
                          {isInvitation && (
                            <p className="text-xs text-primary font-medium mt-1">
                              {t('notifications.tapToRespond', 'Klikni za odgovor →')}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground mt-1">
                            {formatDistanceToNow(new Date(notification.created_at), {
                              addSuffix: true,
                              locale: hr,
                            })}
                          </p>
                        </div>
                        {!isInvitation && (
                          <div className="flex items-center gap-1">
                            {!notification.read && (
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={t('notifications.markRead', 'Označi kao pročitano')}
                                className="h-6 w-6 min-h-[44px] min-w-[44px] touch-manipulation"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  markAsRead(notification.id);
                                }}
                              >
                                <Check className="w-3 h-3" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={t('notifications.delete', 'Obriši')}
                              className="h-6 w-6 min-h-[44px] min-w-[44px] touch-manipulation text-destructive hover:text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteNotification(notification.id);
                                setOpen(false);
                              }}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Invitation Response Dialog */}
      <AlertDialog open={!!invitationDialog} onOpenChange={(open) => !open && setInvitationDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{invitationDialog?.notification.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {invitationDialog?.notification.message}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {invitationDialog?.invitationType === 'project' && (
            <div className="space-y-2 py-2">
              <p className="text-sm font-medium">
                {t('projects.whereToShow', 'Gdje želite vidjeti ovaj projekt?')}
              </p>
              {suggestedContext === 'business' && (
                <p className="text-xs text-muted-foreground">
                  {t('projects.ownerSuggestedBusiness', 'Vlasnik je predložio: Poslovni mod')}
                </p>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={chosenContext === 'personal' ? 'default' : 'outline'}
                  size="sm"
                  className="h-9 justify-start"
                  onClick={() => setChosenContext('personal')}
                >
                  <User className="w-4 h-4 mr-2" />
                  {t('projects.contextPersonal', 'Osobne financije')}
                </Button>
                <Button
                  type="button"
                  variant={chosenContext === 'business' ? 'default' : 'outline'}
                  size="sm"
                  className="h-9 justify-start"
                  onClick={() => setChosenContext('business')}
                  disabled={businessProfiles.length === 0}
                >
                  <Briefcase className="w-4 h-4 mr-2" />
                  {t('projects.contextBusiness', 'Poslovni mod')}
                </Button>
              </div>
              {chosenContext === 'business' && businessProfiles.length > 0 && (
                <Select value={chosenBusinessProfileId} onValueChange={setChosenBusinessProfileId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('projects.selectProfile', 'Odaberite profil')} />
                  </SelectTrigger>
                  <SelectContent>
                    {businessProfiles.map(bp => (
                      <SelectItem key={bp.id} value={bp.id}>{bp.company_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {chosenContext === 'business' && businessProfiles.length === 0 && (
                <div className="space-y-2 p-3 rounded-md border border-dashed bg-muted/40">
                  <p className="text-xs text-foreground">
                    {t('projects.ownerSuggestedBusinessNoProfile', 'Voditelj predlaže poslovni mod, ali nemaš poslovni profil.')}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setChosenContext('personal')}
                    >
                      {t('projects.fallbackToPersonal', 'Stavi u Osobne financije')}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        setInvitationDialog(null);
                        navigate('/business?createProfile=1');
                      }}
                    >
                      {t('projects.createBusinessProfile', 'Kreiraj poslovni profil')}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          <AlertDialogFooter className="flex-row gap-2">
            <Button
              variant="outline"
              className="flex-1"
              disabled={respondingTo !== null}
              onClick={() => handleRespondToInvitation('decline')}
            >
              <X className="w-4 h-4 mr-2" />
              {t('notifications.decline', 'Odbij')}
            </Button>
            <Button
              className="flex-1"
              disabled={respondingTo !== null}
              onClick={() => handleRespondToInvitation('accept')}
            >
              {respondingTo ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  {t('notifications.accept', 'Prihvati')}
                </>
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm delete all */}
      <AlertDialog open={confirmDeleteAllOpen} onOpenChange={setConfirmDeleteAllOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('notifications.confirmDeleteAllTitle', 'Obrisati sve obavijesti?')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('notifications.confirmDeleteAllDesc', 'Sve obavijesti će biti trajno uklonjene s popisa. Postojeće pozivnice ostaju aktivne i možeš ih prihvatiti preko linka koji ti je vlasnik poslao.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel', 'Odustani')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                const ok = await deleteAllNotifications();
                if (ok) {
                  showSuccess(t('notifications.allDeleted', 'Sve obavijesti obrisane'));
                  setOpen(false);
                } else {
                  showError(t('common.error', 'Greška'));
                }
              }}
            >
              {t('notifications.deleteAll', 'Obriši sve')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
