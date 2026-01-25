import { useState } from 'react';
import { Bell, Check, CheckCheck, Trash2, UserPlus, X, Loader2, FolderOpen, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useNotifications } from '@/hooks/useNotifications';
import { formatDistanceToNow } from 'date-fns';
import { hr } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

const getNotificationIcon = (type: string) => {
  switch (type) {
    case 'member_joined':
    case 'invitation_accepted':
      return <UserPlus className="w-4 h-4 text-primary" />;
    case 'project_invitation':
      return <FolderOpen className="w-4 h-4 text-primary" />;
    case 'budget_invitation':
      return <Wallet className="w-4 h-4 text-primary" />;
    default:
      return <Bell className="w-4 h-4 text-muted-foreground" />;
  }
};

export const NotificationsDropdown = () => {
  const { t } = useTranslation();
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

  const handleNotificationClick = async (notificationId: string, isRead: boolean) => {
    if (!isRead) {
      await markAsRead(notificationId);
    }
  };

  const handleRespondToInvitation = async (
    notificationId: string, 
    invitationId: string, 
    type: 'project' | 'budget', 
    action: 'accept' | 'decline'
  ) => {
    setRespondingTo(notificationId);
    try {
      const { data, error } = await supabase.functions.invoke('respond-to-invitation', {
        body: {
          type,
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

      // Remove the notification
      await deleteNotification(notificationId);
      refetch();
    } catch (error) {
      console.error('Error responding to invitation:', error);
      toast.error(t('common.error'));
    } finally {
      setRespondingTo(null);
    }
  };

  const isInvitationNotification = (type: string) => {
    return type === 'project_invitation' || type === 'budget_invitation';
  };

  return (
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
                const invitationType = notification.type === 'project_invitation' ? 'project' : 'budget';
                const invitationId = (notification.data as any)?.invitation_id;

                return (
                  <div
                    key={notification.id}
                    className={cn(
                      'px-3 py-2 hover:bg-muted/50 cursor-pointer flex flex-col gap-2 group relative',
                      !notification.read && 'bg-primary/5'
                    )}
                    onClick={() => !isInvitation && handleNotificationClick(notification.id, notification.read)}
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

                    {/* Invitation action buttons */}
                    {isInvitation && invitationId && (
                      <div className="flex gap-2 ml-7">
                        <Button
                          size="sm"
                          className="flex-1 h-8"
                          disabled={respondingTo === notification.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRespondToInvitation(notification.id, invitationId, invitationType, 'accept');
                          }}
                        >
                          {respondingTo === notification.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <>
                              <Check className="w-3 h-3 mr-1" />
                              {t('notifications.accept', 'Prihvati')}
                            </>
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 h-8"
                          disabled={respondingTo === notification.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRespondToInvitation(notification.id, invitationId, invitationType, 'decline');
                          }}
                        >
                          <X className="w-3 h-3 mr-1" />
                          {t('notifications.decline', 'Odbij')}
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
