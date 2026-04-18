import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FeedbackForm } from "@/app/(app)/feedback/feedback-form";

export default async function FeedbackPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6 md:p-8">
      <header>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Phase 3
        </p>
        <h1 className="font-serif text-2xl font-semibold tracking-tight">
          Feedback
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Tell Paul what to fix or build next. Your message is stored with this
          project so he can review it in the studio tools — no email required.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Note for the developer</CardTitle>
          <CardDescription>
            Be specific if you can — screen names, what you expected, what
            happened instead.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FeedbackForm />
        </CardContent>
      </Card>
    </div>
  );
}
