import type { WbCtx } from '../WorkbenchPage'
import { OrganizeStep } from './OrganizeStep'
import { RecallStep } from './RecallStep'
import { ExplainStep } from './ExplainStep'
import { PracticeStep } from './PracticeStep'
import { ReflectStep } from './ReflectStep'
import { PreviewStep } from './PreviewStep'
import { RetestStep } from './RetestStep'
import { FreeStep } from './FreeStep'

export function StepBody({ ctx }: { ctx: WbCtx }) {
  const { step } = ctx
  switch (step.type) {
    case 'organize':
      return <OrganizeStep ctx={ctx} />
    case 'recall':
      return <RecallStep ctx={ctx} />
    case 'explain':
      return <ExplainStep ctx={ctx} />
    case 'practice':
      return <PracticeStep ctx={ctx} />
    case 'reflect':
      return <ReflectStep ctx={ctx} />
    case 'preview':
      return <PreviewStep ctx={ctx} />
    case 'retest':
      return <RetestStep ctx={ctx} />
    case 'free':
      return <FreeStep ctx={ctx} />
    default:
      return null
  }
}
