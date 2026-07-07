/**
 * Bone — loading skeleton placeholder.
 *
 * Drop-in replacement for the identical inline `Bone` components that were
 * duplicated in DashboardPage and MonthlyPageContent.
 */

export function Bone({ className }: { className: string }) {
  return <div className={`animate-pulse rounded bg-bg-elevated ${className}`} />
}
