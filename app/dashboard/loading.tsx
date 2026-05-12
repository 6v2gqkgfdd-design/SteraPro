import {
  SkeletonCard,
  SkeletonLine,
  SkeletonListCard,
  SkeletonStat,
} from '@/components/skeletons'

export default function DashboardLoading() {
  return (
    <main className="stera-page-pb bg-stera-cream px-5 pt-3 sm:px-8 sm:pt-10">
      <div className="mx-auto max-w-4xl space-y-3 sm:space-y-6">
        <div className="flex items-center justify-between gap-3">
          <SkeletonLine width="90px" height="2rem" />
          <SkeletonLine width="120px" height="2rem" />
        </div>
        <div className="space-y-1">
          <SkeletonLine width="55%" height="1.1rem" />
          <SkeletonLine width="35%" height="0.7rem" />
        </div>

        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <SkeletonStat />
          <SkeletonStat />
          <SkeletonStat />
        </div>

        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          <SkeletonCard lines={0} className="h-14" />
          <SkeletonCard lines={0} className="h-14" />
        </div>

        <div className="space-y-2">
          <SkeletonLine width="80px" height="0.7rem" />
          <SkeletonListCard />
          <SkeletonListCard />
        </div>
      </div>
    </main>
  )
}
