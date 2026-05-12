import {
  SkeletonLine,
  SkeletonListCard,
} from '@/components/skeletons'

export default function MaintenanceLoading() {
  return (
    <main className="stera-page-pb bg-stera-cream px-5 pt-3 sm:px-6 sm:pt-6">
      <div className="mx-auto max-w-5xl space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex gap-2">
            <SkeletonLine width="120px" height="2.5rem" />
            <SkeletonLine width="120px" height="2.5rem" />
          </div>
          <SkeletonLine width="160px" height="2.5rem" />
        </div>
        <div className="grid gap-4">
          <SkeletonListCard />
          <SkeletonListCard />
          <SkeletonListCard />
        </div>
      </div>
    </main>
  )
}
