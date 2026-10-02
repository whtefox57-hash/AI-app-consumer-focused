import { Cast } from "@/components/cast";
import { configured } from "@/lib/supabase";
export const dynamic = "force-dynamic";
export default function Home() {
  return <Cast configured={configured()} />;
}
