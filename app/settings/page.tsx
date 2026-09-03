import { SectionPage, SettingsContent } from "@/components/SectionPage";

export default function SettingsPage() {
  return (
    <SectionPage
      section="settings"
      title="Setting"
      eyebrow="Account controls"
      summary="Manage prototype preferences for notifications, privacy, and job-search assistance."
    >
      <SettingsContent />
    </SectionPage>
  );
}
