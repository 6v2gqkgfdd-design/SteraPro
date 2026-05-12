import {
  SkeletonLine,
  SkeletonListCard,
} from '@/components/skeletons'

export default function WorkOrdersLoading() {
  return (
    <main className="stera-page-pb bg-stera-cream px-5 pt-3 sm:px-8 sm:pt-6">
      <div className="mx-auto max-w-4xl space-y-5">
        <div className="flex gap-2">
          <SkeletonLine width="120px" height="2.5rem" />
          <SkeletonLine width="120px" height="2.5rem" />
          <SkeletonLine width="120px" height="2.5rem" />
          <SkeletonLine width="120px" height="2.5rem" />
        </div>
        <div className="space-y-3">
          <SkeletonListCard />
          <SkeletonListCard />
          <SkeletonListCard />
        </div>
      </div>
    </main>
  )
}
