import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Send, Trash2 } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useFamilyComments } from '@/hooks/useFamilyComments';
import { useAuth } from '@/hooks/useAuth';
import { useUserProfiles } from '@/hooks/useUserProfiles';
import { clickableProps } from '@/lib/a11y';

interface Props {
  groupId: string;
  expenseId: string;
}

export function FamilyCommentsInline({ groupId, expenseId }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { rows, add, remove, maxLength } = useFamilyComments({ groupId, expenseId });
  const { getDisplayName } = useUserProfiles(
    Array.from(new Set(rows.map((r) => r.author_user_id))),
  );
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSend = async () => {
    if (!text.trim()) return;
    setSubmitting(true);
    try {
      await add(text);
      setText('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {rows.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">
            {t('family.comments.empty', 'Još nema komentara.')}
          </p>
        ) : (
          rows.map((r) => (
            <div
              key={r.id}
              className="rounded-lg bg-muted/40 px-2.5 py-1.5 text-xs"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-foreground truncate">
                  {getDisplayName(r.author_user_id)}
                </span>
                {user?.id === r.author_user_id && (
                  <div
                    {...clickableProps(() => remove(r.id))}
                    aria-label={t('common.delete', 'Obriši')}
                    className="text-muted-foreground hover:text-destructive p-0.5 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Trash2 className="h-3 w-3" />
                  </div>
                )}
              </div>
              <p className="text-foreground/90 whitespace-pre-wrap mt-0.5">
                {r.body}
              </p>
            </div>
          ))
        )}
      </div>

      <div className="space-y-1">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, maxLength))}
          placeholder={t('family.comments.placeholder', 'Komentar (max 280)')}
          rows={2}
          className="text-sm resize-none"
        />
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">
            {text.length}/{maxLength}
          </span>
          <Button
            size="sm"
            onClick={handleSend}
            disabled={submitting || !text.trim()}
            className="h-7 gap-1"
          >
            <Send className="h-3 w-3" />
            {t('family.comments.send', 'Pošalji')}
          </Button>
        </div>
      </div>
    </div>
  );
}
