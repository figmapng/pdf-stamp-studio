import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileText,
  MoreVertical,
  PanelRight,
  Plus,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  AlertDialog,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Checkbox,
  DataTable,
  Dialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  IconButton,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Progress,
  RadioGroup,
  RadioGroupItem,
  Select,
  Sheet,
  Skeleton,
  Switch,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  useToast,
} from '../ui';
import {
  DetectionStatus,
  DetectionStatusBadge,
  FileUploader,
  PDFViewerToolbar,
  ProcessingQueueItem,
  SignaturePreview,
  StampPreview,
} from '../domain';

interface DemoRow {
  id: string;
  name: string;
  type: string;
  status: string;
}

const DEMO_ROWS: DemoRow[] = [
  { id: '1', name: 'contract-2026-01.pdf', type: 'DIGITAL_PDF', status: 'AUTO_READY' },
  { id: '2', name: 'protocol-scan-04.pdf', type: 'SCANNED_PDF', status: 'REVIEW_REQUIRED' },
  { id: '3', name: 'signed-act-09.pdf', type: 'MIXED_PDF', status: 'BLOCKED' },
];

export const DesignSystemShowcase: React.FC = () => {
  const { pushToast } = useToast();

  const [switchVal, setSwitchVal] = useState(true);
  const [radioVal, setRadioVal] = useState('ADAPTIVE');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [alertOpen, setAlertOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [toolbarPage, setToolbarPage] = useState(0);
  const [toolbarZoom, setToolbarZoom] = useState(1.0);
  const [toolbarCompare, setToolbarCompare] = useState(false);
  const [tableLoading, setTableLoading] = useState(false);

  const tokens = [
    { name: 'Primary', varName: '--color-primary', hex: '#4338CA', cls: 'bg-[var(--color-primary)] text-white' },
    { name: 'Secondary', varName: '--color-secondary', hex: '#1E293B', cls: 'bg-[var(--color-secondary)] text-white' },
    { name: 'Success', varName: '--color-success', hex: '#047857', cls: 'bg-[var(--color-success)] text-white' },
    { name: 'Warning', varName: '--color-warning', hex: '#B45309', cls: 'bg-[var(--color-warning)] text-white' },
    { name: 'Danger', varName: '--color-danger', hex: '#BE123C', cls: 'bg-[var(--color-danger)] text-white' },
    { name: 'Canvas', varName: '--color-bg-canvas', hex: '#F8FAFC', cls: 'bg-[var(--color-bg-canvas)] text-[var(--color-text-primary)] border border-[var(--color-border-default)]' },
    { name: 'Surface', varName: '--color-bg-surface', hex: '#FFFFFF', cls: 'bg-[var(--color-bg-surface)] text-[var(--color-text-primary)] border border-[var(--color-border-default)]' },
  ];

  return (
    <TooltipProvider>
      <section aria-labelledby="ds-heading" className="space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--color-border-subtle)] pb-4">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="primary">DESIGN_SYSTEM.md</Badge>
              <Badge variant="neutral">v1.0.0</Badge>
            </div>
            <h2 id="ds-heading" className="mt-2 text-2xl font-bold tracking-tight text-[var(--color-text-primary)]">
              PDF Stamp Studio — Design System Showcase
            </h2>
            <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
              Interactive reference of design tokens, Lucide icons, 23 UI primitives, and 7 domain components across default, hover, focus, active, disabled, loading, and error states.
            </p>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              pushToast({
                variant: 'success',
                title: 'Design System Ready',
                description: 'All tokens and 30 components follow DESIGN_SYSTEM.md.',
              })
            }
          >
            <Sparkles className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            Trigger Toast
          </Button>
        </div>

        {/* 1. Tokens & Typography */}
        <Card>
          <CardHeader>
            <div>
              <CardTitle>1. Design Tokens & Typography</CardTitle>
              <CardDescription>Semantic color palette, contrast-verified surfaces, and Lucide icon scale (strokeWidth 1.75).</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
              {tokens.map((tk) => (
                <div key={tk.name} className="space-y-1.5">
                  <div className={`flex h-14 items-end rounded-[var(--radius-md)] p-2 text-[11px] font-mono ${tk.cls}`}>
                    {tk.hex}
                  </div>
                  <div className="text-xs font-semibold text-[var(--color-text-primary)]">{tk.name}</div>
                  <div className="font-mono text-[10px] text-[var(--color-text-muted)]">{tk.varName}</div>
                </div>
              ))}
            </div>

            <div className="grid gap-4 border-t border-[var(--color-border-subtle)] pt-4 md:grid-cols-2">
              <div className="space-y-2">
                <p className="text-2xl font-bold tracking-tight">Display 24px / 700</p>
                <p className="text-xl font-bold">Heading H1 20px / 700</p>
                <p className="text-base font-semibold">Heading H2 16px / 600</p>
                <p className="text-sm text-[var(--color-text-secondary)]">Body 14px / 400 — High-legibility technical UI prose.</p>
                <p className="font-mono text-xs text-[var(--color-text-muted)] tabular-nums">Mono 12px — X: 142pt · Y: 618pt · 94.2%</p>
              </div>
              <div className="flex flex-wrap items-center gap-4 rounded-[var(--radius-md)] bg-[var(--color-bg-subtle)] p-4">
                <div className="flex items-center gap-2 text-xs font-medium">
                  <FileText className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                  <span>xs (14px)</span>
                </div>
                <div className="flex items-center gap-2 text-xs font-medium">
                  <ShieldCheck className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                  <span>sm (16px)</span>
                </div>
                <div className="flex items-center gap-2 text-xs font-medium">
                  <Settings className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
                  <span>md (20px)</span>
                </div>
                <div className="flex items-center gap-2 text-xs font-medium">
                  <Download className="h-8 w-8 text-[var(--color-primary)]" strokeWidth={1.75} aria-hidden="true" />
                  <span>lg (32px)</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 2. Buttons, IconButtons & Badges */}
        <Card>
          <CardHeader>
            <CardTitle>2. Button, IconButton & Badge States</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex flex-wrap items-center gap-2.5">
              <Button variant="primary">Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="success">Success</Button>
              <Button variant="destructive">Destructive</Button>
              <Button variant="primary" isLoading>Loading</Button>
              <Button variant="primary" disabled>Disabled</Button>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 border-t border-[var(--color-border-subtle)] pt-4">
              <Button size="sm">Size SM</Button>
              <Button size="md">Size MD</Button>
              <Button size="lg">Size LG</Button>
              <IconButton aria-label="Add item" icon={<Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />} />
              <IconButton variant="destructive" aria-label="Delete item" icon={<Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />} />
              <IconButton variant="primary" isLoading aria-label="Loading action" icon={<Plus className="h-4 w-4" aria-hidden="true" />} />
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-[var(--color-border-subtle)] pt-4">
              <Badge variant="neutral">Neutral</Badge>
              <Badge variant="primary">Primary</Badge>
              <Badge variant="success"><CheckCircle2 className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />AUTO_READY</Badge>
              <Badge variant="warning"><AlertTriangle className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />REVIEW_REQUIRED</Badge>
              <Badge variant="danger">BLOCKED</Badge>
            </div>
          </CardContent>
        </Card>

        {/* 3. Form Controls */}
        <Card>
          <CardHeader>
            <CardTitle>3. Form Controls (Input, Textarea, Select, Checkbox, RadioGroup, Switch)</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-6 md:grid-cols-2">
            <div className="space-y-4">
              <div className="space-y-1">
                <label htmlFor="sc-input-default" className="text-xs font-semibold">Default Input</label>
                <Input id="sc-input-default" placeholder="Enter signatory full name" />
              </div>
              <div className="space-y-1">
                <label htmlFor="sc-input-error" className="text-xs font-semibold text-[var(--color-danger)]">Error Input</label>
                <Input id="sc-input-error" hasError defaultValue="Invalid value" />
              </div>
              <div className="space-y-1">
                <label htmlFor="sc-input-disabled" className="text-xs font-semibold text-[var(--color-text-muted)]">Disabled Input</label>
                <Input id="sc-input-disabled" disabled defaultValue="Read-only state" />
              </div>
              <div className="space-y-1">
                <label htmlFor="sc-select" className="text-xs font-semibold">Select</label>
                <Select id="sc-select" defaultValue="PERSON_A">
                  <option value="PERSON_A">Person A</option>
                  <option value="PERSON_B">Person B</option>
                </Select>
              </div>
              <div className="space-y-1">
                <label htmlFor="sc-textarea" className="text-xs font-semibold">Textarea</label>
                <Textarea id="sc-textarea" rows={2} placeholder="Comma-separated variants..." />
              </div>
            </div>

            <div className="space-y-4">
              <RadioGroup legend="Placement Mode" name="sc-radio" value={radioVal} onValueChange={setRadioVal}>
                <RadioGroupItem value="ADAPTIVE" label="ADAPTIVE (Geometry-aware)" />
                <RadioGroupItem value="MANUAL" label="MANUAL (Per-document)" />
                <RadioGroupItem value="CUSTOM" label="CUSTOM (Explicit coordinates)" />
              </RadioGroup>

              <div className="space-y-2.5 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] p-4">
                <Checkbox defaultChecked label="Preserve PNG alpha transparency" />
                <Checkbox disabled label="Disabled checkbox option" />
                <div className="pt-1">
                  <Switch checked={switchVal} onCheckedChange={setSwitchVal} label="Enable OpenCV horizontal line detector" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 4. Overlays, Navigation & Feedback */}
        <Card>
          <CardHeader>
            <CardTitle>4. Dialog, AlertDialog, Sheet, DropdownMenu, Tooltip, Popover, Tabs, Progress & Skeleton</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex flex-wrap items-center gap-2.5">
              <Button variant="outline" onClick={() => setDialogOpen(true)}>Open Dialog</Button>
              <Button variant="destructive" onClick={() => setAlertOpen(true)}>Open AlertDialog</Button>
              <Button variant="outline" onClick={() => setSheetOpen(true)}>
                <PanelRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                Open Sheet
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">
                    <MoreVertical className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                    DropdownMenu
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onSelect={() => pushToast({ variant: 'info', title: 'Export JSON selected' })}>
                    Export JSON
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => pushToast({ variant: 'info', title: 'Export CSV selected' })}>
                    Export CSV
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => pushToast({ variant: 'warning', title: 'Cleared cache' })}>
                    Clear Session
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline">Open Popover</Button>
                </PopoverTrigger>
                <PopoverContent>
                  <p className="font-semibold text-[var(--color-text-primary)]">Calibration Threshold</p>
                  <p className="mt-1 text-[var(--color-text-secondary)]">
                    Heuristic scores are composite weights, not calibrated statistical probabilities.
                  </p>
                </PopoverContent>
              </Popover>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost">Hover / Focus Tooltip</Button>
                </TooltipTrigger>
                <TooltipContent>WCAG 1.4.13 dismissible tooltip</TooltipContent>
              </Tooltip>
            </div>

            <Tabs defaultValue="tab-1">
              <TabsList aria-label="Showcase tabs">
                <TabsTrigger value="tab-1">Progress & Skeleton</TabsTrigger>
                <TabsTrigger value="tab-2">EmptyState</TabsTrigger>
              </TabsList>
              <TabsContent value="tab-1" className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <Progress label="Determinate batch progress" value={68} max={100} />
                  <Progress label="Indeterminate worker scan" />
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton variant="text" className="w-3/4" />
                  <Skeleton variant="circle" className="h-10 w-10" />
                </div>
              </TabsContent>
              <TabsContent value="tab-2">
                <EmptyState
                  title="No documents queued"
                  description="Upload PDFs in Step 1 to begin local browser analysis."
                  action={<Button size="sm">Upload PDFs</Button>}
                />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* 5. Table & DataTable */}
        <Card>
          <CardHeader>
            <div>
              <CardTitle>5. Table & DataTable (with Loading & Search)</CardTitle>
            </div>
            <Button size="sm" variant="outline" onClick={() => setTableLoading((v) => !v)}>
              {tableLoading ? 'Show Rows' : 'Show Skeleton'}
            </Button>
          </CardHeader>
          <CardContent className="space-y-5">
            <DataTable
              caption="Showcase DataTable"
              rows={DEMO_ROWS}
              isLoading={tableLoading}
              searchPlaceholder="Search documents..."
              searchFilter={(r, q) => r.name.toLowerCase().includes(q)}
              getRowKey={(r) => r.id}
              columns={[
                { key: 'name', header: 'Document', sortValue: (r) => r.name, render: (r) => <span className="font-medium">{r.name}</span> },
                { key: 'type', header: 'Type', render: (r) => <span className="font-mono text-xs">{r.type}</span> },
                { key: 'status', header: 'Status', render: (r) => <DetectionStatusBadge status={r.status} /> },
              ]}
            />

            <Table>
              <TableCaption>Static Table primitive</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Token</TableHead>
                  <TableHead>Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell>Radius</TableCell>
                  <TableCell className="font-mono text-xs">6px / 8px / 12px</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* 6. Domain Components */}
        <Card>
          <CardHeader>
            <CardTitle>6. PDF Stamp Studio Domain Components</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <FileUploader
              accept=".pdf,application/pdf"
              multiple
              label="FileUploader — Drop PDF documents here"
              hint="Supports keyboard Enter/Space activation and drag-and-drop."
              buttonLabel="Select PDF files"
              onFilesSelected={(fl) => pushToast({ variant: 'info', title: `${fl.length} file(s) selected` })}
            />

            <PDFViewerToolbar
              pageIndex={toolbarPage}
              pageCount={5}
              zoom={toolbarZoom}
              compareOriginal={toolbarCompare}
              pageLabel="Page"
              ofPagesLabel="of"
              zoomInLabel="Zoom in"
              zoomOutLabel="Zoom out"
              compareOriginalLabel="Compare Original"
              compareStampedLabel="Show Overlays"
              onPrevPage={() => setToolbarPage((p) => Math.max(0, p - 1))}
              onNextPage={() => setToolbarPage((p) => Math.min(4, p + 1))}
              onZoomIn={() => setToolbarZoom((z) => Math.min(2.2, Number((z + 0.15).toFixed(2))))}
              onZoomOut={() => setToolbarZoom((z) => Math.max(0.6, Number((z - 0.15).toFixed(2))))}
              onToggleCompare={() => setToolbarCompare((v) => !v)}
            />

            <div className="grid gap-4 md:grid-cols-3">
              <SignaturePreview
                asset={null}
                alt="Signature preview"
                emptyLabel="No signature PNG loaded"
                transparentOkLabel="Transparent background"
                opaqueWarningLabel="No alpha channel"
                paddingLabel="Padding"
              />
              <StampPreview
                asset={null}
                alt="Stamp preview"
                emptyLabel="No stamp PNG loaded"
                transparentOkLabel="Transparent background"
                opaqueWarningLabel="No alpha channel"
                paddingLabel="Padding"
                ownerSummary="Owner: PERSON_A (1/1)"
              />
              <DetectionStatus
                label="Person A Anchor"
                anchor={{
                  personId: 'PERSON_A',
                  pageIndex: 10,
                  lineBounds: { x: 100, y: 600, width: 120, height: 1.5 },
                  placementBounds: { x: 105, y: 565, width: 110, height: 42 },
                  confidence: 0.91,
                  scores: { nameMatch: 1, roleMatch: 0.95, contextMatch: 0.8, lineMatch: 0.85, geometryMatch: 0.95 },
                  detectionMethod: 'DIGITAL_TEXT',
                  status: 'AUTO_READY',
                  evidence: [],
                  candidateCount: 1,
                  matchedNameText: 'А. Б. Серіков',
                }}
                scoreLabels={{ name: 'Name', role: 'Role', context: 'Context', line: 'Line' }}
              />
            </div>

            <ProcessingQueueItem
              file={{
                id: 'demo-q',
                fileName: 'protocol-almaty-04.pdf',
                originalFileName: 'protocol-almaty-04.pdf',
                fileSize: 420000,
                bytes: new Uint8Array(0),
                pageCount: 12,
                isValid: true,
                integrity: {
                  isEncrypted: false,
                  hasDigitalSignature: false,
                  hasInteractiveForms: false,
                  hasAnnotations: false,
                  hasJavaScriptOrActions: false,
                },
              }}
              openReviewLabel="Inspect"
              onOpenReview={() => pushToast({ variant: 'info', title: 'Opened Review Center' })}
            />
          </CardContent>
          <CardFooter>
            <span className="text-xs text-[var(--color-text-muted)]">
              All 30 standardized components verified in DESIGN_SYSTEM.md
            </span>
          </CardFooter>
        </Card>

        {/* Modals & Sheet */}
        <Dialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          title="Standard Dialog"
          description="Built on native <dialog> with showModal() and scroll containment."
          footer={<Button onClick={() => setDialogOpen(false)}>Close</Button>}
        >
          <p className="text-xs text-[var(--color-text-secondary)]">
            Escape key, backdrop containment, and focus restoration are managed natively by the browser.
          </p>
        </Dialog>

        <AlertDialog
          open={alertOpen}
          onOpenChange={setAlertOpen}
          title="Confirm Destructive Action"
          description="Cancel button receives initial autofocus to protect against accidental confirmation."
          cancelLabel="Cancel"
          confirmLabel="Confirm"
          destructive
          onConfirm={() => pushToast({ variant: 'warning', title: 'AlertDialog confirmed' })}
        />

        <Sheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          title="Inspector Drawer (Sheet)"
          description="Slide-over panel using native top-layer <dialog>."
        >
          <p className="text-xs text-[var(--color-text-secondary)]">
            Useful for mobile or secondary inspection workflows without losing page context.
          </p>
        </Sheet>
      </section>
    </TooltipProvider>
  );
};
