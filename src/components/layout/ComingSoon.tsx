import type { ComponentType } from 'react'
import { Card } from './Card'

export function ComingSoon({
  title,
  description,
  icon: Icon,
}: {
  title: string
  description: string
  icon: ComponentType<{ size?: number; strokeWidth?: number }>
}) {
  return (
    <Card className="flex flex-col items-center gap-3 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
        <Icon size={22} strokeWidth={2} />
      </span>
      <h2 className="text-base font-semibold text-neutral-900">{title}</h2>
      <p className="max-w-sm text-sm text-neutral-500">{description}</p>
    </Card>
  )
}
