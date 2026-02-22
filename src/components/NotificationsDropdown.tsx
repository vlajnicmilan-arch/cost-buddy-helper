import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, CheckCheck, Trash2, UserPlus, X, Loader2, FolderOpen, Wallet, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useNotifications } from '@/hooks/useNotifications';
import { formatDistanceToNow } from 'date-fns';
import { hr } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { Notification } from '@/types/notification';

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
  const navigate = useNavigate();
  const {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    refetch,
  } = useNotifications();
  const [open, setOpen] = useState(false);
  const [respondingTo, setRespondingTo] = useState<string | null>(null);
  const [invitationDialog, setInvitationDialog] = useState<{
    notification: Notification;
    invitationType: 'project' | 'budget' | 'payment_source' | 'family';
    invitationId: string;
  } | null>(null);

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
    
    setRespondingTo(notification.id);
    try {
      const { data, error } = await supabase.functions.invoke('respond-to-invitation', {
        body: {
          type: invitationType,
          invitationId,
          action,
        },
      });

      if (error) throw error;

      if (data.error) {
        toast.error(data.error);
        return;
      }

      if (action === 'accept') {
        toast.success(t('notifications.invitationAccepted', 'Pozivnica prihvaćena'));
      } else {
        toast.success(t('notifications.invitationDeclined', 'Pozivnica odbijena'));
      }

      await deleteNotification(notification.id);
      refetch();
    } catch (error) {
      console.error('Error responding to invitation:', error);
      toast.error(t('common.error'));
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
          <div className="flex items-center justify-between px-3 py-2">
            <h3 className="font-semibold text-sm">{t('notifications.title', 'Obavijesti')}</h3>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => markAllAsRead()}
              >
                <CheckCheck className="w-3 h-3 mr-1" />
                {t('notifications.markAllRead', 'Označi sve')}
              </Button>
            )}
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
                      className={cn(
                        'px-3 py-2 hover:bg-muted/50 cursor-pointer flex flex-col gap-2 group relative',
                        !notification.read && 'bg-primary/5'
                      )}
                      onClick={() => handleNotificationClick(notification)}
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
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {!notification.read && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
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
                              className="h-6 w-6 text-destructive hover:text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteNotification(notification.id);
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
    </>
  );
};
