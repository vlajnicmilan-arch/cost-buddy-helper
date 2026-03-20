import { useState } from 'react';
import { Plus, Pencil, Trash2, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCustomCategories } from '@/hooks/useCustomCategories';
import { CustomCategoryDialog } from './CustomCategoryDialog';
import { CustomCategory } from '@/types/customCategory';
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
import { Skeleton } from '@/components/ui/skeleton';
import { useTranslation } from 'react-i18next';
import { useFeatureAccess } from '@/hooks/useFeatureAccess';
import { UpgradePrompt } from '@/components/UpgradePrompt';

export const CustomCategoriesPanel = () => {
  const { customCategories, loading, addCustomCategory, updateCustomCategory, deleteCustomCategory } = useCustomCategories();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CustomCategory | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<CustomCategory | null>(null);
  const { t } = useTranslation();
  const { hasAccess, getRequiredTier } = useFeatureAccess();

  if (!hasAccess('custom_categories')) {
    return <UpgradePrompt feature={t('settings.customCategories', 'Prilagođene kategorije')} requiredTier={getRequiredTier('custom_categories')} />;
  }

  const handleSave = async (data: { name: string; icon: string; color: string }) => {
    if (editingCategory) {
      await updateCustomCategory(editingCategory.id, data);
    } else {
      await addCustomCategory(data);
    }
    setEditingCategory(null);
  };

  const handleEdit = (category: CustomCategory) => {
    setEditingCategory(category);
    setDialogOpen(true);
  };

  const handleDelete = (category: CustomCategory) => {
    setCategoryToDelete(category);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (categoryToDelete) {
      await deleteCustomCategory(categoryToDelete.id);
      setCategoryToDelete(null);
      setDeleteConfirmOpen(false);
    }
  };

  const openNewDialog = () => {
    setEditingCategory(null);
    setDialogOpen(true);
  };

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Tag className="h-5 w-5" />
            {t('categories.customCategories')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Tag className="h-5 w-5" />
              {t('categories.customCategories')}
            </CardTitle>
            <Button size="sm" onClick={openNewDialog}>
              <Plus className="h-4 w-4 mr-1" />
              {t('common.new')}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {customCategories.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              {t('categories.noCustomCategories')}<br />
              {t('categories.clickToAdd')}
            </p>
          ) : (
            <div className="space-y-2">
              {customCategories.map((category) => (
                <div
                  key={category.id}
                  className="flex items-center justify-between p-2 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white"
                      style={{ backgroundColor: category.color }}
                    >
                      <span>{category.icon}</span>
                    </div>
                    <span className="font-medium">{category.name}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleEdit(category)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(category)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <CustomCategoryDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        category={editingCategory}
        onSave={handleSave}
      />

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('categories.deleteCategory')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('categories.deleteCategoryConfirm')} "{categoryToDelete?.name}"?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
