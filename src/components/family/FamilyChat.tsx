import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Send, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { hr } from 'date-fns/locale';
import { showError } from '@/hooks/useStatusFeedback';
import { useTranslation } from 'react-i18next';

interface Message {
  id: string;
  group_id: string;
  user_id: string;
  content: string;
  created_at: string;
  display_name?: string;
}

interface FamilyChatProps {
  groupId: string;
  groupColor?: string;
}

export const FamilyChat = ({ groupId, groupColor = '#3b82f6' }: FamilyChatProps) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasInitialScrolled = useRef(false);

  // Fetch messages and user display names
  const fetchMessages = async () => {
    const { data, error } = await supabase
      .from('family_messages')
      .select('*')
      .eq('group_id', groupId)
      .order('created_at', { ascending: true })
      .limit(100);

    if (error) {
      console.error('Error fetching messages:', error);
      return;
    }

    // Get unique user ids and fetch display names
    const userIds = [...new Set((data || []).map(m => m.user_id))];
    let profilesMap: Record<string, string> = {};

    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, display_name')
        .in('user_id', userIds);

      if (profiles) {
        profilesMap = Object.fromEntries(profiles.map(p => [p.user_id, p.display_name || 'Korisnik']));
      }
    }

    const enriched = (data || []).map(m => ({
      ...m,
      display_name: profilesMap[m.user_id] || 'Korisnik',
    }));

    setMessages(enriched);
    setLoading(false);
  };

  useEffect(() => {
    fetchMessages();

    // Subscribe to realtime
    const channel = supabase
      .channel(`family-chat-${groupId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'family_messages',
          filter: `group_id=eq.${groupId}`,
        },
        async (payload) => {
          const newMsg = payload.new as Message;
          // Fetch display name
          const { data: profile } = await supabase
            .from('profiles')
            .select('display_name')
            .eq('user_id', newMsg.user_id)
            .single();

          setMessages(prev => [...prev, {
            ...newMsg,
            display_name: profile?.display_name || 'Korisnik',
          }]);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'family_messages',
          filter: `group_id=eq.${groupId}`,
        },
        (payload) => {
          setMessages(prev => prev.filter(m => m.id !== (payload.old as any).id));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [groupId]);

  // Auto-scroll to bottom INSIDE the chat container only (not the page)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (!hasInitialScrolled.current) {
      el.scrollTop = el.scrollHeight;
      hasInitialScrolled.current = true;
    } else {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }
  }, [messages]);

  const handleSend = async () => {
    if (!newMessage.trim() || !user) return;

    const msgContent = newMessage.trim();
    setSending(true);
    setNewMessage('');

    const { data, error } = await supabase.from('family_messages').insert({
      group_id: groupId,
      user_id: user.id,
      content: msgContent,
    }).select('id').single();

    if (error) {
      console.error('Error sending message:', error);
      showError(t('family.sendError'));
    } else if (data) {
      // Fire-and-forget notification
      supabase.functions.invoke('notify-family-message', {
        body: {
          message_id: data.id,
          group_id: groupId,
          sender_id: user.id,
          content: msgContent,
        },
      }).catch(console.error);
    }

    setSending(false);
  };

  const handleDelete = async (messageId: string) => {
    const { error } = await supabase.from('family_messages').delete().eq('id', messageId);
    if (error) {
      showError(t('family.deleteError'));
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Messages area */}
      <div className="max-h-80 overflow-y-auto space-y-1 mb-3" ref={scrollRef}>
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            {t('family.noMessages')}
          </p>
        ) : (
          messages.map(msg => {
            const isOwn = msg.user_id === user?.id;
            return (
              <div
                key={msg.id}
                className={`flex gap-2 px-1 py-1 ${isOwn ? 'flex-row-reverse' : ''}`}
              >
                {!isOwn && (
                  <Avatar className="h-7 w-7 shrink-0 mt-1">
                    <AvatarFallback className="text-[10px]" style={{ backgroundColor: `${groupColor}20` }}>
                      {(msg.display_name || '?')[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                )}
                <div className={`max-w-[75%] ${isOwn ? 'items-end' : 'items-start'}`}>
                  {!isOwn && (
                    <p className="text-[10px] text-muted-foreground mb-0.5 px-1">{msg.display_name}</p>
                  )}
                  <div
                    className={`rounded-2xl px-3 py-1.5 text-sm break-words ${
                      isOwn
                        ? 'bg-primary text-primary-foreground rounded-br-md'
                        : 'bg-muted rounded-bl-md'
                    }`}
                    onDoubleClick={() => isOwn && handleDelete(msg.id)}
                    title={isOwn ? t('family.doubleClickDelete') : undefined}
                  >
                    {msg.content}
                  </div>
                  <p className={`text-[9px] text-muted-foreground mt-0.5 px-1 ${isOwn ? 'text-right' : ''}`}>
                    {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true, locale: hr })}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex items-center gap-2">
        <Input
          placeholder={t('family.writeMessage')}
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
          className="h-9 text-sm"
          disabled={sending}
        />
        <Button
          size="icon"
          onClick={handleSend}
          disabled={!newMessage.trim() || sending}
          className="h-9 w-9 shrink-0"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
};
