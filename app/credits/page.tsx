import { CreditsContent, SectionPage } from "@/components/SectionPage";

export default function CreditsPage() {
  return (
    <SectionPage
      section="credits"
      title="Extra Credits"
      eyebrow="Usage balance"
      summary="Track credits for AI interview sessions, resume scans, and premium job-fit checks."
    >
      <CreditsContent />
    </SectionPage>
  );
}
