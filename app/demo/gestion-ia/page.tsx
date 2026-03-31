import { redirect } from "next/navigation";

/** La demo de IA vive en `/demo/ia` (centro de mando unificado). */
export default function DemoGestionIaRedirectPage() {
  redirect("/demo/ia");
}
