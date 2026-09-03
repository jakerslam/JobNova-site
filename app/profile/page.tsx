import { ProfileContent, SectionPage, SectionVisual } from "@/components/SectionPage";

export default function ProfilePage() {
  return (
    <SectionPage
      section="profile"
      title="Profile"
      eyebrow="Candidate details"
      summary="Keep the career profile, work preferences, and skill signals that drive recommendations in one focused view."
    >
      <ProfileContent />
      <SectionVisual title="Recommendation signals" detail="Profile details feed the match score, role filters, and interview prompts." />
    </SectionPage>
  );
}
