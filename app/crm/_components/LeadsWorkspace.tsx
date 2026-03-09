"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DataTable } from "@/app/ams/_components/DataTable";
import { FilterBar } from "@/app/ams/_components/FilterBar";
import { formatCurrency, formatDateTime } from "@/app/ams/_lib/format";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Input } from "@/app/components/ui/input";
import { Select } from "@/app/components/ui/select";
import { Tabs } from "@/app/components/ui/tabs";

type Lead = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  source: string;
  status: string;
  assigned_producer_id: string | null;
  assigned_producer_display_name?: string | null;
  assignment_status: string;
  lead_list_id: string | null;
  lead_list_name?: string | null;
  created_at: string;
  updated_at: string;
};

type Producer = {
  id: string;
  display_name: string;
  role: string;
};

type Pipeline = {
  id: string;
  name: string;
};

type Stage = {
  id: string;
  name: string;
  pipeline_id: string;
};

type Filters = {
  view: "all" | "mine" | "unassigned";
  q?: string;
  source?: string;
  status?: string;
  assignment_status?: string;
  assigned_producer_id?: string;
};

function leadDisplayName(lead: Lead) {
  const fullName = [lead.first_name, lead.last_name].filter(Boolean).join(" ").trim();
  return fullName || lead.company_name || lead.email || lead.phone || lead.id.slice(0, 8);
}

function emptyToNull(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function LeadsWorkspace({
  leads,
  producers,
  pipelines,
  filters,
}: {
  leads: Lead[];
  producers: Producer[];
  pipelines: Pipeline[];
  filters: Filters;
}) {
  const router = useRouter();
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createLoading, setCreateLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [bulkAssignLoading, setBulkAssignLoading] = useState(false);
  const [bulkAssignError, setBulkAssignError] = useState<string | null>(null);
  const [bulkAssignProducerId, setBulkAssignProducerId] = useState("");
  const [convertingLead, setConvertingLead] = useState<Lead | null>(null);
  const [convertStages, setConvertStages] = useState<Stage[]>([]);
  const [convertStageLoading, setConvertStageLoading] = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);
  const [convertLoading, setConvertLoading] = useState(false);

  useEffect(() => {
    setSelectedLeadIds((current) => current.filter((id) => leads.some((lead) => lead.id === id)));
  }, [leads]);

  useEffect(() => {
    if (!convertingLead) return;
    const pipelineId = pipelines[0]?.id;
    if (!pipelineId) {
      setConvertStages([]);
      return;
    }
    void loadStages(pipelineId);
  }, [convertingLead, pipelines]);

  async function loadStages(pipelineId: string) {
    setConvertStageLoading(true);
    setConvertError(null);
    try {
      const response = await fetch(`/api/crm/pipelines/${pipelineId}/stages`, {
        credentials: "include",
        cache: "no-store",
      });
      const text = await response.text();
      const payload = text ? JSON.parse(text) : null;
      if (!response.ok) {
        throw new Error(payload?.error ?? "Unable to load pipeline stages.");
      }
      setConvertStages(payload?.data ?? []);
    } catch (error) {
      setConvertStages([]);
      setConvertError(error instanceof Error ? error.message : "Unable to load pipeline stages.");
    } finally {
      setConvertStageLoading(false);
    }
  }

  const visibleProducers = useMemo(
    () => producers.filter((user) => user.role === "producer" || user.role === "admin"),
    [producers],
  );

  async function handleCreateLead(formData: FormData) {
    setCreateLoading(true);
    setCreateError(null);
    try {
      const payload = {
        first_name: emptyToNull(String(formData.get("first_name") ?? "")),
        last_name: emptyToNull(String(formData.get("last_name") ?? "")),
        company_name: emptyToNull(String(formData.get("company_name") ?? "")),
        email: emptyToNull(String(formData.get("email") ?? "")),
        phone: emptyToNull(String(formData.get("phone") ?? "")),
        source: String(formData.get("source") ?? "manual"),
        status: String(formData.get("status") ?? "new"),
        assigned_producer_id: emptyToNull(String(formData.get("assigned_producer_id") ?? "")),
      };

      const response = await fetch("/api/crm/leads", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const text = await response.text();
      const payloadJson = text ? JSON.parse(text) : null;
      if (!response.ok) {
        throw new Error(payloadJson?.error ?? "Unable to create lead.");
      }
      setShowCreate(false);
      router.refresh();
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Unable to create lead.");
    } finally {
      setCreateLoading(false);
    }
  }

  async function handleImportLeads(formData: FormData) {
    setImportLoading(true);
    setImportError(null);
    try {
      const response = await fetch("/api/crm/leads/import", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const text = await response.text();
      const payload = text ? JSON.parse(text) : null;
      if (!response.ok) {
        throw new Error(payload?.error ?? "Unable to import leads.");
      }
      setShowImport(false);
      router.refresh();
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Unable to import leads.");
    } finally {
      setImportLoading(false);
    }
  }

  async function handleAssignLead(leadId: string, assignedProducerId: string) {
    setBulkAssignError(null);
    try {
      const response = await fetch(`/api/crm/leads/${leadId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assigned_producer_id: assignedProducerId || null,
          assignment_status: assignedProducerId ? "assigned" : "unassigned",
        }),
      });
      const text = await response.text();
      const payload = text ? JSON.parse(text) : null;
      if (!response.ok) {
        throw new Error(payload?.error ?? "Unable to update lead assignment.");
      }
      router.refresh();
    } catch (error) {
      setBulkAssignError(error instanceof Error ? error.message : "Unable to update lead assignment.");
    }
  }

  async function handleBulkAssign() {
    if (selectedLeadIds.length === 0) return;
    setBulkAssignLoading(true);
    setBulkAssignError(null);
    try {
      for (const leadId of selectedLeadIds) {
        const response = await fetch(`/api/crm/leads/${leadId}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            assigned_producer_id: bulkAssignProducerId || null,
            assignment_status: bulkAssignProducerId ? "assigned" : "unassigned",
          }),
        });
        const text = await response.text();
        const payload = text ? JSON.parse(text) : null;
        if (!response.ok) {
          throw new Error(payload?.error ?? "Unable to bulk assign leads.");
        }
      }
      setSelectedLeadIds([]);
      router.refresh();
    } catch (error) {
      setBulkAssignError(error instanceof Error ? error.message : "Unable to bulk assign leads.");
    } finally {
      setBulkAssignLoading(false);
    }
  }

  async function handleConvertLead(formData: FormData) {
    if (!convertingLead) return;
    setConvertLoading(true);
    setConvertError(null);
    try {
      const payload = {
        pipeline_id: String(formData.get("pipeline_id") ?? ""),
        pipeline_stage_id: String(formData.get("pipeline_stage_id") ?? ""),
        create_account: String(formData.get("create_account") ?? "") === "on",
        account_type: String(formData.get("account_type") ?? "") || undefined,
        account_name: emptyToNull(String(formData.get("account_name") ?? "")) ?? undefined,
        deal_name: emptyToNull(String(formData.get("deal_name") ?? "")) ?? undefined,
        estimated_revenue: Number(formData.get("estimated_revenue") ?? 0),
        estimated_premium: emptyToNull(String(formData.get("estimated_premium") ?? "")),
        estimated_commission_pct: emptyToNull(String(formData.get("estimated_commission_pct") ?? "")),
        expected_close_date: emptyToNull(String(formData.get("expected_close_date") ?? "")),
        next_step: emptyToNull(String(formData.get("next_step") ?? "")),
      };

      const response = await fetch(`/api/crm/leads/${convertingLead.id}/convert`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const text = await response.text();
      const payloadJson = text ? JSON.parse(text) : null;
      if (!response.ok) {
        throw new Error(payloadJson?.error ?? "Unable to convert lead.");
      }
      setConvertingLead(null);
      router.refresh();
    } catch (error) {
      setConvertError(error instanceof Error ? error.message : "Unable to convert lead.");
    } finally {
      setConvertLoading(false);
    }
  }

  const resetHref = `/crm/leads?view=${filters.view}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Tabs
          active={filters.view}
          items={[
            { label: "All Leads", value: "all", href: "/crm/leads?view=all" },
            { label: "My Leads", value: "mine", href: "/crm/leads?view=mine" },
            { label: "Unassigned Leads", value: "unassigned", href: "/crm/leads?view=unassigned" },
          ]}
        />
        <div className="ml-auto flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowImport((current) => !current)}>
            {showImport ? "Close Import" : "Import CSV"}
          </Button>
          <Button size="sm" onClick={() => setShowCreate((current) => !current)}>
            {showCreate ? "Close Lead Form" : "New Lead"}
          </Button>
        </div>
      </div>

      {showCreate ? (
        <Card>
          <CardHeader>
            <CardTitle>Create Lead</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={handleCreateLead} className="grid gap-3 md:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block text-zinc-500">First Name</span>
                <Input name="first_name" />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-zinc-500">Last Name</span>
                <Input name="last_name" />
              </label>
              <label className="text-sm md:col-span-2">
                <span className="mb-1 block text-zinc-500">Company</span>
                <Input name="company_name" />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-zinc-500">Email</span>
                <Input name="email" type="email" />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-zinc-500">Phone</span>
                <Input name="phone" />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-zinc-500">Source</span>
                <Input defaultValue="manual" name="source" />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-zinc-500">Status</span>
                <Select defaultValue="new" name="status">
                  <option value="new">New</option>
                  <option value="working">Working</option>
                  <option value="qualified">Qualified</option>
                  <option value="lost">Lost</option>
                  <option value="archived">Archived</option>
                </Select>
              </label>
              <label className="text-sm md:col-span-2">
                <span className="mb-1 block text-zinc-500">Assigned Producer</span>
                <Select defaultValue="" name="assigned_producer_id">
                  <option value="">Unassigned</option>
                  {visibleProducers.map((producer) => (
                    <option key={producer.id} value={producer.id}>
                      {producer.display_name}
                    </option>
                  ))}
                </Select>
              </label>
              <div className="flex items-center gap-2 md:col-span-2">
                <Button disabled={createLoading} size="sm" type="submit">
                  {createLoading ? "Saving..." : "Save Lead"}
                </Button>
                {createError ? <p className="text-sm text-rose-600">{createError}</p> : null}
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {showImport ? (
        <Card>
          <CardHeader>
            <CardTitle>Import Leads</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={handleImportLeads} className="grid gap-3 md:grid-cols-2">
              <label className="text-sm md:col-span-2">
                <span className="mb-1 block text-zinc-500">CSV File</span>
                <Input accept=".csv,text/csv" name="file" required type="file" />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-zinc-500">List Name</span>
                <Input name="list_name" placeholder="March renewal prospects" />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-zinc-500">Lead Source</span>
                <Input defaultValue="import" name="source" />
              </label>
              <label className="text-sm md:col-span-2">
                <span className="mb-1 block text-zinc-500">Assignment Mode</span>
                <Select defaultValue="unassigned" name="assignment_mode">
                  <option value="unassigned">Leave unassigned</option>
                  <option value="single">Assign all to one producer</option>
                  <option value="round_robin">Round robin selected producers</option>
                </Select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-zinc-500">Single Producer</span>
                <Select defaultValue="" name="producer_user_id">
                  <option value="">None</option>
                  {visibleProducers.map((producer) => (
                    <option key={producer.id} value={producer.id}>
                      {producer.display_name}
                    </option>
                  ))}
                </Select>
              </label>
              <fieldset className="text-sm md:col-span-2">
                <legend className="mb-2 block text-zinc-500">Round Robin Producers</legend>
                <div className="grid gap-2 md:grid-cols-2">
                  {visibleProducers.map((producer) => (
                    <label className="flex items-center gap-2" key={producer.id}>
                      <input name="producer_user_ids" type="checkbox" value={producer.id} />
                      <span>{producer.display_name}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="flex items-center gap-2 md:col-span-2">
                <Button disabled={importLoading} size="sm" type="submit">
                  {importLoading ? "Importing..." : "Import Leads"}
                </Button>
                {importError ? <p className="text-sm text-rose-600">{importError}</p> : null}
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <FilterBar resetHref={resetHref}>
        <input name="view" type="hidden" value={filters.view} />
        <label className="text-sm md:col-span-2">
          <span className="mb-1 block text-zinc-500">Search</span>
          <Input defaultValue={filters.q ?? ""} name="q" placeholder="Lead, company, email, phone" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-zinc-500">Source</span>
          <Input defaultValue={filters.source ?? ""} name="source" placeholder="import, referral, manual" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-zinc-500">Status</span>
          <Select defaultValue={filters.status ?? ""} name="status">
            <option value="">All statuses</option>
            <option value="new">New</option>
            <option value="working">Working</option>
            <option value="qualified">Qualified</option>
            <option value="converted">Converted</option>
            <option value="lost">Lost</option>
            <option value="archived">Archived</option>
          </Select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-zinc-500">Assignment</span>
          <Select defaultValue={filters.assignment_status ?? ""} name="assignment_status">
            <option value="">All assignment states</option>
            <option value="unassigned">Unassigned</option>
            <option value="assigned">Assigned</option>
            <option value="claimed">Claimed</option>
          </Select>
        </label>
      </FilterBar>

      {selectedLeadIds.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Bulk assign leads</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 md:flex-row md:items-center">
            <p className="text-sm text-zinc-600">{selectedLeadIds.length} leads selected.</p>
            <Select defaultValue="" name="bulk_assign_producer" onChange={(event) => setBulkAssignProducerId(event.target.value)}>
              <option value="">Unassigned</option>
              {visibleProducers.map((producer) => (
                <option key={producer.id} value={producer.id}>
                  {producer.display_name}
                </option>
              ))}
            </Select>
            <Button disabled={bulkAssignLoading} size="sm" onClick={handleBulkAssign}>
              {bulkAssignLoading ? "Applying..." : "Apply Assignment"}
            </Button>
            {bulkAssignError ? <p className="text-sm text-rose-600">{bulkAssignError}</p> : null}
          </CardContent>
        </Card>
      ) : null}

      <DataTable
        columns={[
          {
            key: "select",
            header: "",
            render: (lead) => (
              <input
                checked={selectedLeadIds.includes(lead.id)}
                onChange={(event) => {
                  setSelectedLeadIds((current) =>
                    event.target.checked
                      ? [...current, lead.id]
                      : current.filter((value) => value !== lead.id),
                  );
                }}
                type="checkbox"
              />
            ),
          },
          {
            key: "lead",
            header: "Lead",
            render: (lead) => (
              <div className="space-y-1">
                <Link
                  className="font-medium text-zinc-900 hover:text-blue-700 hover:underline"
                  href={`/crm/leads/${lead.id}`}
                >
                  {leadDisplayName(lead)}
                </Link>
                <p className="text-xs text-zinc-500">{lead.company_name || lead.email || lead.phone || "No company yet"}</p>
              </div>
            ),
          },
          {
            key: "source",
            header: "Source",
            render: (lead) => <Badge variant="outline">{lead.source}</Badge>,
          },
          {
            key: "status",
            header: "Status",
            render: (lead) => <Badge variant="outline">{lead.status}</Badge>,
          },
          {
            key: "owner",
            header: "Assignment",
            render: (lead) => (
              <div className="space-y-2">
                <div className="text-xs text-zinc-500">{lead.assignment_status}</div>
                <Select
                  defaultValue={lead.assigned_producer_id ?? ""}
                  name={`assigned_${lead.id}`}
                  onChange={(event) => void handleAssignLead(lead.id, event.target.value)}
                >
                  <option value="">Unassigned</option>
                  {visibleProducers.map((producer) => (
                    <option key={producer.id} value={producer.id}>
                      {producer.display_name}
                    </option>
                  ))}
                </Select>
              </div>
            ),
          },
          {
            key: "created",
            header: "Created",
            render: (lead) => <span className="text-xs text-zinc-600">{formatDateTime(lead.created_at)}</span>,
          },
          {
            key: "actions",
            header: "Actions",
            render: (lead) => (
              <div className="space-y-2">
                <Button size="sm" variant="outline" onClick={() => setConvertingLead(lead)}>
                  Convert
                </Button>
                {lead.lead_list_name ? <p className="text-xs text-zinc-500">List: {lead.lead_list_name}</p> : null}
              </div>
            ),
          },
        ]}
        emptyMessage="No leads match these filters yet."
        rowKey={(lead) => lead.id}
        rows={leads}
      />

      {convertingLead ? (
        <Card>
          <CardHeader>
            <CardTitle>Convert Lead</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={handleConvertLead} className="grid gap-3 md:grid-cols-2">
              <label className="text-sm md:col-span-2">
                <span className="mb-1 block text-zinc-500">Lead</span>
                <div className="rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
                  {leadDisplayName(convertingLead)}
                </div>
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-zinc-500">Pipeline</span>
                <Select
                  defaultValue={pipelines[0]?.id ?? ""}
                  name="pipeline_id"
                  onChange={(event) => void loadStages(event.target.value)}
                >
                  {pipelines.map((pipeline) => (
                    <option key={pipeline.id} value={pipeline.id}>
                      {pipeline.name}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-zinc-500">Stage</span>
                <Select defaultValue={convertStages[0]?.id ?? ""} name="pipeline_stage_id">
                  {convertStages.map((stage) => (
                    <option key={stage.id} value={stage.id}>
                      {stage.name}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="flex items-center gap-2 text-sm md:col-span-2">
                <input defaultChecked type="checkbox" name="create_account" />
                <span>Create customer on conversion</span>
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-zinc-500">Customer Name</span>
                <Input defaultValue={convertingLead.company_name ?? leadDisplayName(convertingLead)} name="account_name" />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-zinc-500">Customer Type</span>
                <Select defaultValue={convertingLead.company_name ? "commercial" : "personal"} name="account_type">
                  <option value="commercial">Commercial</option>
                  <option value="personal">Personal</option>
                </Select>
              </label>
              <label className="text-sm md:col-span-2">
                <span className="mb-1 block text-zinc-500">Deal Name</span>
                <Input defaultValue={`${leadDisplayName(convertingLead)} Opportunity`} name="deal_name" />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-zinc-500">Estimated Revenue</span>
                <Input defaultValue="0" min="0" name="estimated_revenue" step="0.01" type="number" />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-zinc-500">Expected Close Date</span>
                <Input name="expected_close_date" type="date" />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-zinc-500">Estimated Premium</span>
                <Input min="0" name="estimated_premium" step="0.01" type="number" />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-zinc-500">Commission %</span>
                <Input min="0" max="1" name="estimated_commission_pct" step="0.01" type="number" />
              </label>
              <label className="text-sm md:col-span-2">
                <span className="mb-1 block text-zinc-500">Next Step</span>
                <Input name="next_step" placeholder="Send proposal" />
              </label>
              <div className="flex items-center gap-2 md:col-span-2">
                <Button disabled={convertLoading || convertStageLoading || pipelines.length === 0} size="sm" type="submit">
                  {convertLoading ? "Converting..." : "Convert Lead"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setConvertingLead(null)}>
                  Cancel
                </Button>
                {convertStageLoading ? <p className="text-sm text-zinc-500">Loading stages...</p> : null}
                {convertError ? <p className="text-sm text-rose-600">{convertError}</p> : null}
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Lead Count</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{leads.length}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Assigned Leads</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {leads.filter((lead) => Boolean(lead.assigned_producer_id)).length}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Potential Revenue</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{formatCurrency(0)}</CardContent>
        </Card>
      </div>
    </div>
  );
}
