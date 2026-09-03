import { ResumeContent, SectionPage } from "@/components/SectionPage";

export default function ResumePage() {
  return (
    <SectionPage
      section="resume"
      title="Resume"
      eyebrow="Application profile"
      summary="Review resume readiness, keyword fit, and small edits that make applications stronger for selected roles."
    >
      <ResumeContent />
    </SectionPage>
  );
}
