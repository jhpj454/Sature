import { Badge } from "@/app/components/ui/badge";
import { InlineError } from "@/app/ams/_components/InlineError";
import { PageHeader } from "@/app/ams/_components/PageHeader";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Input } from "@/app/components/ui/input";
import { Select } from "@/app/components/ui/select";
import { Table, TableContainer } from "@/app/components/ui/table";
import { Tabs } from "@/app/components/ui/tabs";

export default function StyleguidePage() {
  return (
    <div className="space-y-6 p-4 md:p-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">Saturate Styleguide</h1>
        <p className="text-sm text-slate-400">
          Use these primitives for all new UI to keep shell, spacing, and controls consistent.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Page Header</CardTitle>
          <CardDescription>Standard heading + actions row for AMS pages.</CardDescription>
        </CardHeader>
        <CardContent>
          <PageHeader
            actions={<Button size="sm">Primary Action</Button>}
            description="Use this at the top of AMS pages for consistent layout."
            title="Example AMS Page"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Buttons</CardTitle>
          <CardDescription>Variants and sizes used across AMS/CRM/Marketing/Admin.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Button>Default</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button size="sm">Small</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Form Inputs</CardTitle>
          <CardDescription>Input/select spacing and typography baseline.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <Input placeholder="Account name" />
          <Select defaultValue="normal">
            <option value="low">low</option>
            <option value="normal">normal</option>
            <option value="high">high</option>
            <option value="urgent">urgent</option>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Badges and Tabs</CardTitle>
          <CardDescription>Status chips and tab treatment.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge>Open</Badge>
            <Badge variant="secondary">Normal</Badge>
            <Badge variant="outline">Urgent</Badge>
          </div>
          <Tabs
            active="overview"
            items={[
              { label: "Overview", href: "/styleguide", value: "overview" },
              { label: "Activity", href: "/styleguide?tab=activity", value: "activity" },
              { label: "Documents", href: "/styleguide?tab=documents", value: "documents" },
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Table</CardTitle>
          <CardDescription>Dense operational rows for CSR workflows.</CardDescription>
        </CardHeader>
        <CardContent>
          <TableContainer>
            <Table>
              <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Title</th>
                  <th className="px-3 py-2">Priority</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Due</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-slate-200/30">
                  <td className="px-3 py-2">Service Case</td>
                  <td className="px-3 py-2">Renewal review follow-up</td>
                  <td className="px-3 py-2">high</td>
                  <td className="px-3 py-2">open</td>
                  <td className="px-3 py-2">2026-03-12</td>
                </tr>
              </tbody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Inline Error</CardTitle>
          <CardDescription>Non-fatal API error pattern for AMS pages.</CardDescription>
        </CardHeader>
        <CardContent>
          <InlineError
            details="API request failed for /api/ams/carriers?page_size=100: 400"
            retryHref="/styleguide"
            title="Couldn't load carriers."
          />
        </CardContent>
      </Card>
    </div>
  );
}
