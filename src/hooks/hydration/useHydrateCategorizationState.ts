import { useCallback } from 'react'
import { useStore } from '@/store'
import {
  STORAGE_KEY_RULES,
  STORAGE_KEY_OVERRIDES,
  STORAGE_KEY_DEFAULT_NAME_OVERRIDES,
  readRulesFromStorage,
  readOverridesFromStorage,
} from '@/lib/categories'
import {
  STORAGE_KEY_SPAARPOTJES,
  STORAGE_KEY_TAG_OVERRIDES,
  readSavingsAccountsFromStorage,
  readTagOverridesFromStorage,
} from '@/hooks/useSavingsAccounts'
import {
  STORAGE_KEY_PERSONAL_ACCOUNTS,
  readPersonalAccountsFromStorage,
} from '@/lib/personalAccounts'
import type { AICategoryResult } from '@/store/slices/llmTypes'

export function useHydrateCategorizationState() {
  const hydrateExclusions = useStore((s) => s.hydrateExclusions)
  const setCategoryOverridesState = useStore((s) => s.setCategoryOverridesState)
  const setCategorizationRules = useStore((s) => s.setCategorizationRules)
  const setSavingsAccountsState = useStore((s) => s.setSavingsAccountsState)
  const setTagOverridesState = useStore((s) => s.setTagOverridesState)
  const setPersonalAccountsState = useStore((s) => s.setPersonalAccountsState)
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
        ([, value]) => value.source === 'llm',
      )

      setAiCategories(Object.fromEntries(aiEntries))

      const overrides: Record<string, string> = {}
      for (const [id, value] of Object.entries(data as Record<string, AICategoryResult>)) {
        if (value.source === 'rule') {
          overrides[id] = value.category
        }
      }

      localStorage.setItem(STORAGE_KEY_OVERRIDES, JSON.stringify(overrides))
      setCategoryOverridesState(readOverridesFromStorage())
    }

    if (rulesResult.status === 'fulfilled' && rulesResult.value !== null) {
      const rules: unknown[] = rulesResult.value?.data?.rules ?? []
      localStorage.setItem(STORAGE_KEY_RULES, JSON.stringify(rules))
      setCategorizationRules(readRulesFromStorage())
    }

    if (spaarpotjesResult.status === 'fulfilled' && spaarpotjesResult.value !== null) {
      const accounts: unknown[] = spaarpotjesResult.value?.data?.accounts ?? []
      localStorage.setItem(STORAGE_KEY_SPAARPOTJES, JSON.stringify(accounts))
      setSavingsAccountsState(readSavingsAccountsFromStorage())
    }

    if (tagOverridesResult.status === 'fulfilled' && tagOverridesResult.value !== null) {
      const tagOverrides: Record<string, string[]> = tagOverridesResult.value?.data ?? {}
      localStorage.setItem(STORAGE_KEY_TAG_OVERRIDES, JSON.stringify(tagOverrides))
      setTagOverridesState(readTagOverridesFromStorage())
    }

    if (personalAccountsResult.status === 'fulfilled' && personalAccountsResult.value !== null) {
      const accounts: unknown[] = personalAccountsResult.value?.data?.accounts ?? []
      localStorage.setItem(STORAGE_KEY_PERSONAL_ACCOUNTS, JSON.stringify(accounts))
      setPersonalAccountsState(readPersonalAccountsFromStorage())
    }

    if (defaultNameOverridesResult.status === 'fulfilled' && defaultNameOverridesResult.value !== null) {
      const nameOverrides: Record<string, string> = defaultNameOverridesResult.value?.data ?? {}
      localStorage.setItem(STORAGE_KEY_DEFAULT_NAME_OVERRIDES, JSON.stringify(nameOverrides))
    }
  }, [hydrateExclusions, setCategoryOverridesState, setCategorizationRules, setSavingsAccountsState, setTagOverridesState, setPersonalAccountsState, setAiCategories])
}
