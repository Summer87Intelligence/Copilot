import { AccessDeniedCard } from "@/components/copilot/access-denied-card";
import { isModuleAccessDenied } from "@/lib/auth/server-module-permissions";
import { BankReviewPageClient } from "@/components/copilot/bank-review/bank-review-page-client";

export const dynamic = "force-dynamic";

export default async function Page() {
  if (await isModuleAccessDenied("bank_movements")) {
    return <AccessDeniedCard />;
  }
  return <BankReviewPageClient />;
}
