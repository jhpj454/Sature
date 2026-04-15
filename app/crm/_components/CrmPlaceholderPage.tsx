import { PageHeader } from "@/app/ams/_components/PageHeader";

type CrmPlaceholderPageProps = {
  title: string;
  description: string;
};

export function CrmPlaceholderPage({ title, description }: CrmPlaceholderPageProps) {
  return (
    <div className="space-y-6">
      <PageHeader title={title} description={description} />

      <section className="rounded-lg border border-slate-200/30 dark:border-white/[0.08] bg-white dark:bg-[rgba(255,255,255,0.10)] p-6">
        <div className="max-w-2xl space-y-2">
          <h2 className="text-base font-medium text-slate-800 dark:text-[#e8eaf0]">This workspace is being built.</h2>
          <p className="text-sm text-slate-500 dark:text-[#9da5b4]">
            Navigation is in place so producers can move through the CRM shell without dead
            routes. Functional deal workflows land in later phases.
          </p>
        </div>
      </section>
    </div>
  );
}
