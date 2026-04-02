import { useState, useEffect, useCallback } from "react";
import { RefreshCw } from "lucide-react";
import { useAuthStore, type AuthState } from "../../stores/auth";
import { client } from "../../lib/urql";
import { gql } from "@urql/core";
import { Button } from "../ui/button";

const COST_SUMMARY_QUERY = gql`
  query AgentCostSummary($organizationId: ID!, $startDate: String!, $endDate: String!) {
    agentCostSummary(organizationId: $organizationId, startDate: $startDate, endDate: $endDate) {
      budget {
        dailyLimitCents
        spentCents
        remainingCents
        remainingPercent
      }
      dailyCosts {
        date
        totalCostCents
        tier2Calls
        tier2CostCents
        tier3Calls
        tier3CostCents
        summaryCalls
        summaryCostCents
      }
    }
  }
`;

interface BudgetStatus {
  dailyLimitCents: number;
  spentCents: number;
  remainingCents: number;
  remainingPercent: number;
}

interface CostEntry {
  date: string;
  totalCostCents: number;
  tier2Calls: number;
  tier2CostCents: number;
  tier3Calls: number;
  tier3CostCents: number;
  summaryCalls: number;
  summaryCostCents: number;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function getDateRange(days: number): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days + 1);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

function BarChart({ data, maxCents }: { data: CostEntry[]; maxCents: number }) {
  const barMax = Math.max(maxCents, 1);
  return (
    <div className="flex items-end gap-1 h-32">
      {data.map((entry) => {
        const tier2Pct = (entry.tier2CostCents / barMax) * 100;
        const tier3Pct = (entry.tier3CostCents / barMax) * 100;
        const summaryPct = (entry.summaryCostCents / barMax) * 100;
        return (
          <div key={entry.date} className="flex flex-1 flex-col items-center gap-0.5">
            <div className="relative flex w-full flex-col justify-end" style={{ height: "100px" }}>
              <div
                className="w-full rounded-t bg-blue-500/80"
                style={{ height: `${tier2Pct}%`, minHeight: tier2Pct > 0 ? "2px" : 0 }}
                title={`T2: ${entry.tier2CostCents.toFixed(2)}c (${entry.tier2Calls} calls)`}
              />
              <div
                className="w-full bg-purple-500/80"
                style={{ height: `${tier3Pct}%`, minHeight: tier3Pct > 0 ? "2px" : 0 }}
                title={`T3: ${entry.tier3CostCents.toFixed(2)}c (${entry.tier3Calls} calls)`}
              />
              <div
                className="w-full rounded-b bg-green-500/80"
                style={{ height: `${summaryPct}%`, minHeight: summaryPct > 0 ? "2px" : 0 }}
                title={`Summary: ${entry.summaryCostCents.toFixed(2)}c (${entry.summaryCalls} calls)`}
              />
            </div>
            <span className="text-[9px] text-muted-foreground truncate w-full text-center">
              {formatDate(entry.date)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function CostDashboardTab() {
  const activeOrgId = useAuthStore((s: AuthState) => s.activeOrgId);
  const [budget, setBudget] = useState<BudgetStatus | null>(null);
  const [dailyCosts, setDailyCosts] = useState<CostEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);

  const fetchCosts = useCallback(async () => {
    if (!activeOrgId) return;
    setLoading(true);
    const { startDate, endDate } = getDateRange(days);
    const result = await client
      .query(COST_SUMMARY_QUERY, { organizationId: activeOrgId, startDate, endDate })
      .toPromise();
    if (result.data?.agentCostSummary) {
      setBudget(result.data.agentCostSummary.budget as BudgetStatus);
      setDailyCosts(result.data.agentCostSummary.dailyCosts as CostEntry[]);
    }
    setLoading(false);
  }, [activeOrgId, days]);

  useEffect(() => {
    fetchCosts();
  }, [fetchCosts]);

  const maxCents = dailyCosts.reduce((max: number, d: CostEntry) => Math.max(max, d.totalCostCents), 0);
  const totalSpent = dailyCosts.reduce((sum: number, d: CostEntry) => sum + d.totalCostCents, 0);
  const totalCalls = dailyCosts.reduce((sum: number, d: CostEntry) => sum + d.tier2Calls + d.tier3Calls + d.summaryCalls, 0);

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Cost Dashboard</h2>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-border overflow-hidden">
            {[7, 14, 30].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-2.5 py-1 text-xs transition-colors ${
                  days === d
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={fetchCosts}>
            <RefreshCw size={14} />
          </Button>
        </div>
      </div>

      {loading && (
        <div className="rounded-lg border border-border bg-surface-deep p-8 text-center">
          <p className="text-sm text-muted-foreground">Loading cost data...</p>
        </div>
      )}

      {!loading && (
        <>
          {/* Budget Status */}
          {budget && (
            <div className="rounded-lg border border-border bg-surface-deep p-4">
              <h3 className="text-xs font-medium text-muted-foreground mb-3">Today's Budget</h3>
              <div className="flex items-center gap-6">
                <div>
                  <div className="text-2xl font-semibold text-foreground">
                    {budget.spentCents.toFixed(1)}c
                  </div>
                  <div className="text-xs text-muted-foreground">
                    of {budget.dailyLimitCents}c limit
                  </div>
                </div>
                <div className="flex-1">
                  <div className="h-3 rounded-full bg-surface-elevated overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        budget.remainingPercent < 20
                          ? "bg-red-500"
                          : budget.remainingPercent < 50
                            ? "bg-yellow-500"
                            : "bg-green-500"
                      }`}
                      style={{ width: `${100 - budget.remainingPercent}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-1 text-[10px] text-muted-foreground">
                    <span>{budget.remainingCents.toFixed(1)}c remaining</span>
                    <span>{budget.remainingPercent.toFixed(0)}% left</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Period Summary */}
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-lg border border-border bg-surface-deep p-4">
              <div className="text-xs text-muted-foreground mb-1">Period Spend</div>
              <div className="text-lg font-semibold text-foreground">{totalSpent.toFixed(1)}c</div>
            </div>
            <div className="rounded-lg border border-border bg-surface-deep p-4">
              <div className="text-xs text-muted-foreground mb-1">Total Calls</div>
              <div className="text-lg font-semibold text-foreground">{totalCalls}</div>
            </div>
            <div className="rounded-lg border border-border bg-surface-deep p-4">
              <div className="text-xs text-muted-foreground mb-1">Avg/Day</div>
              <div className="text-lg font-semibold text-foreground">
                {dailyCosts.length > 0 ? (totalSpent / dailyCosts.length).toFixed(1) : "0"}c
              </div>
            </div>
          </div>

          {/* Daily Cost Chart */}
          {dailyCosts.length > 0 && (
            <div className="rounded-lg border border-border bg-surface-deep p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-medium text-muted-foreground">Daily Costs</h3>
                <div className="flex items-center gap-3 text-[10px]">
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-2 w-2 rounded-sm bg-blue-500/80" /> Tier 2
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-2 w-2 rounded-sm bg-purple-500/80" /> Tier 3
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-2 w-2 rounded-sm bg-green-500/80" /> Summary
                  </span>
                </div>
              </div>
              <BarChart data={dailyCosts} maxCents={maxCents} />
            </div>
          )}

          {/* Breakdown Table */}
          {dailyCosts.length > 0 && (
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-surface-deep">
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Date</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">Total</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">T2 Calls</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">T2 Cost</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">T3 Calls</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">T3 Cost</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">Summary</th>
                  </tr>
                </thead>
                <tbody>
                  {[...dailyCosts].reverse().map((entry) => (
                    <tr key={entry.date} className="border-b border-border last:border-0">
                      <td className="px-3 py-2 text-foreground">{entry.date}</td>
                      <td className="px-3 py-2 text-right font-mono text-foreground">
                        {entry.totalCostCents.toFixed(2)}c
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-muted-foreground">{entry.tier2Calls}</td>
                      <td className="px-3 py-2 text-right font-mono text-muted-foreground">
                        {entry.tier2CostCents.toFixed(2)}c
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-muted-foreground">{entry.tier3Calls}</td>
                      <td className="px-3 py-2 text-right font-mono text-muted-foreground">
                        {entry.tier3CostCents.toFixed(2)}c
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-muted-foreground">
                        {entry.summaryCostCents.toFixed(2)}c
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
