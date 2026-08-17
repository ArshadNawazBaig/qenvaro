export default function SettingsLoading() {
  return (
    <div className="mx-auto w-full max-w-[1440px] animate-pulse space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="bg-muted h-20 w-full max-w-2xl rounded-xl" />
      <div className="bg-muted h-12 w-full rounded-xl" />
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="bg-muted h-96 rounded-xl" />
        <div className="bg-muted h-96 rounded-xl" />
      </div>
    </div>
  );
}
