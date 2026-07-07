import { useCallback } from 'react'
import { useStore } from '@/store'
import type { AICategoryResult } from '@/store/slices/llmTypes'
import type { CategoryRule } from '@/lib/categories'
import type { SavingsAccount } from '@/types/savingsAccount'
import type { PersonalAccount } from '@/types/personalAccount'

export function useHydrateCategorizationState() {
  const hydrateExclusions = useStore((s) => s.hydrateExclusions)
  const setCategoryOverridesState = useStore((s) => s.setCategoryOverridesState)
  const setCategorizationRules = useStore((s) => s.setCategorizationRules)
  const setSavingsAccountsState = useStore((s) => s.setSavingsAccountsState)
  const setTagOverridesState = useStore((s) => s.setTagOverridesState)
  const setPersonalAccountsState = useStore((s) => s.setPersonalAccountsState)
  const setDefaultNameOverridesState = useStore((s) => s.setDefaultNameOverridesState)
  const setAiCategories = useStore((s) => s.setAiCategories)

  return useCallback(async (): Promise<void> => {
    const [
      exclusionsResult,
      categoriesResult,
      rulesResult,
      spaarpotjesResult,
      tagOverridesResult,
      personalAccountsResult,
      defaultNameOverridesResult,
    ] = await Promise.allSettled([
      fetch('/api/state/exclusions').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/state/categories').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/state/rules').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/state/spaarpotjes').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/state/tag-overrides').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/state/personal-accounts').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/state/default-name-overrides').then((r) => (r.ok ? r.json() : null)),
    ])

    if (exclusionsResult.status === 'fulfilled' && exclusionsResult.value !== null) {
      const ids: string[] = exclusionsResult.value?.data?.ids ?? []
      hydrateExclusions(ids)
    }

    if (categoriesResult.status === 'fulfilled' && categoriesResult.value !== null) {
      const data = categoriesResult.value?.data ?? {}
      const aiEntries = Object.entries(data as Record<string, AICategoryResult>).filter(
        ([, value]) => typeof value === 'object' && value !== null && value.source === 'llm',
      )
      setAiCategories(Object.fromEntries(aiEntries))

      const overrides: Record<string, string> = {}
      for (const [id, value] of Object.entries(data as Record<string, AICategoryResult | string>)) {
        if (typeof value === 'string') {
          // Manual override stored as plain string categoryId
          overrides[id] = value
        } else if (typeof value === 'object' && value !== null && value.source === 'rule') {
          overrides[id] = value.category
        }
      }
      setCategoryOverridesState(overrides)
    }

    if (rulesResult.status === 'fulfilled' && rulesResult.value !== null) {
      const rawRules = (rulesResult.value?.data?.rules ?? []) as Array<CategoryRule & { kind?: string }>
      // Normalize legacy server data: rules saved before `kind` was added need it inferred
      const rules = rawRules.map((r): CategoryRule => r.kind ? (r as CategoryRule) : { ...(r as object), kind: 'condition' } as CategoryRule)
      setCategorizationRules(rules)
    }

    if (spaarpotjesResult.status === 'fulfilled' && spaarpotjesResult.value !== null) {
      const accounts: SavingsAccount[] = spaarpotjesResult.value?.data?.accounts ?? []
      setSavingsAccountsState(accounts)
    }

    if (tagOverridesResult.status === 'fulfilled' && tagOverridesResult.value !== null) {
      const tagOverrides: Record<string, string[]> = tagOverridesResult.value?.data ?? {}
      setTagOverridesState(tagOverrides)
    }

    if (personalAccountsResult.status === 'fulfilled' && personalAccountsResult.value !== null) {
      const accounts: PersonalAccount[] = personalAccountsResult.value?.data?.accounts ?? []
      setPersonalAccountsState(accounts)
    }

    if (defaultNameOverridesResult.status === 'fulfilled' && defaultNameOverridesResult.value !== null) {
      const nameOverrides: Record<string, string> = defaultNameOverridesResult.value?.data ?? {}
      setDefaultNameOverridesState(nameOverrides)
    }
  }, [hydrateExclusions, setCategoryOverridesState, setCategorizationRules, setSavingsAccountsState, setTagOverridesState, setPersonalAccountsState, setDefaultNameOverridesState, setAiCategories])
}

