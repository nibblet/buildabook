import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabaseServer } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { formatNumber } from "@/lib/utils";

export default async function AdminPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const admins = env.adminEmails();
  const email = (user?.email || "").toLowerCase();
  if (!user || !admins.includes(email)) redirect("/");

  const since = new Date();
  since.setDate(since.getDate() - 30);

  const { data: interactions } = await supabase
    .from("ai_interactions")
    .select("persona, model, input_tokens, output_tokens, cost_usd, created_at, context_type")
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: false });

  const rows = interactions ?? [];
  const totalCost = rows.reduce((s, r) => s + Number(r.cost_usd ?? 0), 0);
  const totalInput = rows.reduce((s, r) => s + (r.input_tokens ?? 0), 0);
  const totalOutput = rows.reduce((s, r) => s + (r.output_tokens ?? 0), 0);

  const byPersona = rows.reduce<
    Record<string, { calls: number; input: number; output: number; cost: number }>
  >((acc, r) => {
    const k = r.persona ?? "unknown";
    const cur = acc[k] ?? { calls: 0, input: 0, output: 0, cost: 0 };
    cur.calls += 1;
    cur.input += r.input_tokens ?? 0;
    cur.output += r.output_tokens ?? 0;
    cur.cost += Number(r.cost_usd ?? 0);
    acc[k] = cur;
    return acc;
  }, {});

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6 md:p-8">
      <header>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Admin
        </p>
        <h1 className="font-serif text-2xl font-semibold tracking-tight">
          AI usage — last 30 days
        </h1>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <Stat label="Total calls" value={formatNumber(rows.length)} />
        <Stat
          label="Total cost"
          value={`$${totalCost.toFixed(2)}`}
          sub={`${formatNumber(totalInput)} in / ${formatNumber(totalOutput)} out tokens`}
        />
        <Stat
          label="Calls today"
          value={formatNumber(
            rows.filter(
              (r) =>
                new Date(r.created_at).toDateString() ===
                new Date().toDateString(),
            ).length,
          )}
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">
            By persona
          </CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="py-2">Persona</th>
                <th className="py-2 text-right">Calls</th>
                <th className="py-2 text-right">Input tokens</th>
                <th className="py-2 text-right">Output tokens</th>
                <th className="py-2 text-right">Cost</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(byPersona).map(([persona, s]) => (
                <tr key={persona} className="border-t">
                  <td className="py-2">{persona}</td>
                  <td className="py-2 text-right tabular-nums">
                    {formatNumber(s.calls)}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {formatNumber(s.input)}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {formatNumber(s.output)}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    ${s.cost.toFixed(2)}
                  </td>
                </tr>
              ))}
              {Object.keys(byPersona).length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="py-4 text-center text-xs text-muted-foreground"
                  >
                    No AI calls yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">
            Recent calls
          </CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="py-2">Time</th>
                <th className="py-2">Persona</th>
                <th className="py-2">Context</th>
                <th className="py-2">Model</th>
                <th className="py-2 text-right">Tokens (i/o)</th>
                <th className="py-2 text-right">Cost</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 25).map((r, i) => (
                <tr key={i} className="border-t">
                  <td className="py-1.5 text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleString()}
                  </td>
                  <td className="py-1.5">{r.persona}</td>
                  <td className="py-1.5 text-xs text-muted-foreground">
                    {r.context_type}
                  </td>
                  <td className="py-1.5 text-xs">{r.model}</td>
                  <td className="py-1.5 text-right tabular-nums">
                    {r.input_tokens ?? 0} / {r.output_tokens ?? 0}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">
                    ${Number(r.cost_usd ?? 0).toFixed(4)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div className="mt-1 font-serif text-2xl font-semibold tabular-nums">
          {value}
        </div>
        {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}
