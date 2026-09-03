import { Bot, Sparkles } from "lucide-react";

export function InterviewPanel() {
  return (
    <aside className="flex h-full w-full shrink-0 flex-col overflow-y-auto bg-zinc-50 px-6 py-7 xl:w-[285px]">
      <div className="mb-7 flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm">
        <Sparkles aria-hidden="true" className="h-5 w-5 text-ink" />
      </div>

      <h2 className="text-[17px] font-semibold leading-6 text-ink">
        Ace Your Interviews with AI-Powered Mock Sessions!
      </h2>
      <p className="mt-3 border-b border-zinc-200 pb-6 text-[13px] leading-5 text-ink">
        Struggling with interview nerves or unsure how to prepare? Let our cutting-edge AI mock interviews help you shine!
      </p>

      <div className="min-h-0 flex-1 space-y-5 py-6 text-[13px] leading-5 text-ink">
        <section>
          <h3 className="mb-2 font-semibold">Why Choose Our AI Mock Interviews?</h3>
          <p className="font-semibold">Job-Specific Simulations:</p>
          <p>Practice with questions tailored to your target role, ensuring relevance and preparation.</p>
        </section>
        <section>
          <p className="font-semibold">Actionable Feedback</p>
          <p>Get detailed analysis of your responses and practical, step-by-step improvement suggestions.</p>
        </section>
        <section>
          <p className="font-semibold">Boost Success Rates:</p>
          <p>Perfect your interview skills and increase your chances of landing the job you want.</p>
        </section>
      </div>

      <button type="button" className="mt-auto flex h-12 w-full shrink-0 items-center justify-center gap-2 rounded-full bg-ink text-[13px] font-semibold text-white">
        <Bot aria-hidden="true" className="h-4 w-4" />
        Mock Interview
      </button>
    </aside>
  );
}
