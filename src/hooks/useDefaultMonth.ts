import { useEffect } from 'react'

/**
 * useDefaultMonth — sync the selected month to the most recent available month.
 *
 * Replaces the identical useEffect in DashboardPage, CategoriesPage, and
 * useMonthlyBreakdown. Effect fires whenever `months` changes (e.g. after
 * data loads) and re-selects the last month if the current selection is not
 * present in the new list.
 *
 * @param months     Sorted 'YYYY-MM' key array.
 * @param selected   Currently selected key (empty string = none).
 * @param setSelected Setter for the selected key.
 */
export function useDefaultMonth(
  months: string[],
  selected: string,
  setSelected: (key: string) => void,
): void {
  useEffect(() => {
    if (months.length > 0 && !months.includes(selected)) {
      setSelected(months[months.length - 1])
    }
  }, [months, selected, setSelected])
}
