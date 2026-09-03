import { MockInterviewContent, SectionPage, SectionVisual } from "@/components/SectionPage";

export default function MockInterviewPage() {
  return (
    <SectionPage
      section="mock-interview"
      title="AI Mock Interview"
      eyebrow="Practice center"
      summary="Prepare for role-specific interviews with focused sessions, feedback loops, and prompts tailored to the jobs you are tracking."
    >
      <MockInterviewContent />
      <SectionVisual title="Session planner" detail="Upcoming practice flows are organized around the roles you saved most recently." />
    </SectionPage>
  );
}
