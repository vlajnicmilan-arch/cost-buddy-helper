import { useTranslation } from 'react-i18next';
import { SelectGroup, SelectItem, SelectLabel } from '@/components/ui/select';
import { buildTreeCategorySections, BuildTreeOptionsInput } from '@/lib/categoryTreeOptions';

/**
 * Sadržaj za <SelectContent>: skupine → listovi, „Moje kategorije" i
 * vlastite kategorije u svojoj skupini. Jedina implementacija osobnog izbornika.
 */
export const TreeCategoryOptions = (props: BuildTreeOptionsInput) => {
  const { t } = useTranslation();
  const sections = buildTreeCategorySections(props);
  return (
    <>
      {sections.map((s) => (
        <SelectGroup key={s.key} data-testid={`tree-section-${s.key}`}>
          <SelectLabel className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {t(s.labelKey)}
          </SelectLabel>
          {s.items.map((i) => (
            <SelectItem key={`${s.key}-${i.value}`} value={i.value} className="pl-6">
              <span className="flex items-center gap-2">
                {i.color ? (
                  <span
                    className="w-5 h-5 rounded flex items-center justify-center text-xs"
                    style={{ backgroundColor: `${i.color}20`, color: i.color }}
                  >
                    {i.icon}
                  </span>
                ) : (
                  <span>{i.icon}</span>
                )}
                <span>{i.labelKey ? t(i.labelKey) : i.name}</span>
              </span>
            </SelectItem>
          ))}
        </SelectGroup>
      ))}
    </>
  );
};
