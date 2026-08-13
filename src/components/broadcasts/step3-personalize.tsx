'use client';

import { useMemo } from 'react';
import type { MessageTemplate } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { VariableMapping } from '@/lib/broadcasts/variables';
import {
  TemplatePersonalizeForm,
  computeTemplatePersonalizeValidation,
} from '@/components/templates/template-personalize-form';

interface Step3Props {
  template: MessageTemplate;
  variables: Record<string, VariableMapping>;
  onUpdate: (variables: Record<string, VariableMapping>) => void;
  headerMediaUrl: string;
  onHeaderMediaUrlChange: (url: string) => void;
  onNext: () => void;
  onBack: () => void;
}

export function Step3Personalize({
  template,
  variables,
  onUpdate,
  headerMediaUrl,
  onHeaderMediaUrlChange,
  onNext,
  onBack,
}: Step3Props) {
  const t = useTranslations('Broadcasts.wizard');

  const { canProceed } = useMemo(
    () =>
      computeTemplatePersonalizeValidation(template, variables, headerMediaUrl),
    [template, variables, headerMediaUrl],
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          {t('personalize.title')}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('personalize.subtitle')}
        </p>
      </div>

      <TemplatePersonalizeForm
        template={template}
        variables={variables}
        onVariablesChange={onUpdate}
        headerMediaUrl={headerMediaUrl}
        onHeaderMediaUrlChange={onHeaderMediaUrlChange}
      />

      <div className="flex items-center justify-between border-t border-border pt-4">
        <Button
          variant="outline"
          onClick={onBack}
          className="border-border text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('back')}
        </Button>
        <Button
          onClick={onNext}
          disabled={!canProceed}
          className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {t('next')}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
