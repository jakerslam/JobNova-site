import { SectionPage, SubscriptionContent } from "@/components/SectionPage";

export default function SubscriptionPage() {
  return (
    <SectionPage
      section="subscription"
      title="Subscription"
      eyebrow="Plan management"
      summary="Compare the free prototype experience with premium fit analysis and interview-support features."
    >
      <SubscriptionContent />
    </SectionPage>
  );
}
