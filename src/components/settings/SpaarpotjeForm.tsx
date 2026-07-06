import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { ColorPicker } from '@/components/settings/ColorPicker'
import { cn, normalizeIBAN, validateIBAN } from '@/lib/utils'
import type { SavingsAccount } from '@/types/savingsAccount'

interface SpaarpotjeFormProps {
  initial?: Partial<SavingsAccount>
  onSave: (values: { name: string; iban: string; color: string }) => void
  onCancel: () => void
  firstAvailableColor: string
}

export function SpaarpotjeForm({ initial, onSave, onCancel, firstAvailableColor }: SpaarpotjeFormProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [iban, setIban] = useState(initial?.iban ?? '')
  const [color, setColor] = useState(initial?.color ?? firstAvailableColor)
  const [errors, setErrors] = useState<{ name?: string; iban?: string }>({})

  function validate(): boolean {
    const next: typeof errors = {}
    if (!name.trim()) next.name = 'Name is required'

    const ibanError = validateIBAN(iban)
    if (ibanError) next.iban = ibanError

    setErrors(next)
    return Object.keys(next).length === 0
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    onSave({ name: name.trim(), iban: normalizeIBAN(iban), color })
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-[10px] border border-border bg-bg-elevated p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-text-secondary">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Vakantie"
            className={cn(
              'w-full rounded-[6px] border px-2.5 py-1.5 text-[13px]',
              'bg-bg-base text-text-primary placeholder-text-muted',
              'focus:outline-none focus:ring-1 focus:ring-accent',
              errors.name ? 'border-expense' : 'border-border',
            )}
          />
          {errors.name && <p className="text-[11px] text-expense">{errors.name}</p>}
        </div>

        <div className="space-y-1">
          <label className="text-[11px] font-medium text-text-secondary">Counterparty IBAN</label>
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
      </div>

      <div className="space-y-1.5">
        <label className="text-[11px] font-medium text-text-secondary">Color</label>
        <ColorPicker value={color} onChange={setColor} />
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          <X className="h-3.5 w-3.5" />
          Cancel
        </Button>
        <Button type="submit" variant="primary" size="sm">
          <Check className="h-3.5 w-3.5" />
          {initial?.id ? 'Save changes' : 'Add spaarpotje'}
        </Button>
      </div>
    </form>
  )
}
