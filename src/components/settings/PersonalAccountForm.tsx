import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn, normalizeIBAN, validateIBAN } from '@/lib/utils'
import { ACCOUNT_TYPE_LABELS } from './accountTypeLabels'
import type { PersonalAccount } from '@/types/personalAccount'

interface PersonalAccountFormProps {
  onSave: (values: { iban: string; label: string; type: PersonalAccount['type']; enabled: boolean }) => void
  onCancel: () => void
}

export function PersonalAccountForm({ onSave, onCancel }: PersonalAccountFormProps) {
  const [iban, setIban] = useState('')
  const [label, setLabel] = useState('')
  const [type, setType] = useState<PersonalAccount['type']>('payment')
  const [errors, setErrors] = useState<{ iban?: string }>({})

  function validate(): boolean {
    const next: typeof errors = {}
    const ibanError = validateIBAN(iban)
    if (ibanError) next.iban = ibanError
    setErrors(next)
    return Object.keys(next).length === 0
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    onSave({ iban: normalizeIBAN(iban), label: label.trim(), type, enabled: true })
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-[10px] border border-border bg-bg-elevated p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-text-secondary">IBAN</label>
          <input
            type="text"
            value={iban}
            onChange={(e) => setIban(e.target.value)}
            placeholder="NL00RABO0000000000"
            className={cn(
              'w-full rounded-[6px] border px-2.5 py-1.5 text-[13px] font-mono',
              'bg-bg-base text-text-primary placeholder-text-muted',
              'focus:outline-none focus:ring-1 focus:ring-accent',
              errors.iban ? 'border-expense' : 'border-border',
            )}
          />
          {errors.iban && <p className="text-[11px] text-expense">{errors.iban}</p>}
        </div>

        <div className="space-y-1">
          <label className="text-[11px] font-medium text-text-secondary">Label (optional)</label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Boodschappenrekening"
            className={cn(
              'w-full rounded-[6px] border border-border px-2.5 py-1.5 text-[13px]',
              'bg-bg-base text-text-primary placeholder-text-muted',
              'focus:outline-none focus:ring-1 focus:ring-accent',
            )}
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-[11px] font-medium text-text-secondary">Account type</label>
        <div className="flex gap-1.5 flex-wrap">
          {(Object.keys(ACCOUNT_TYPE_LABELS) as PersonalAccount['type'][]).map((accountType) => (
            <button
              key={accountType}
              type="button"
              onClick={() => setType(accountType)}
              className={cn(
                'rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors',
                type === accountType
                  ? 'bg-accent text-white'
                  : 'bg-bg-elevated text-text-secondary hover:text-text-primary',
              )}
            >
              {ACCOUNT_TYPE_LABELS[accountType]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          <X className="h-3.5 w-3.5" />
          Cancel
        </Button>
        <Button type="submit" variant="primary" size="sm">
          <Check className="h-3.5 w-3.5" />
          Add account
        </Button>
      </div>
    </form>
  )
}
