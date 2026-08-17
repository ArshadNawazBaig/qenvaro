"use client";

import {
  Archive,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  RefreshCw,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import {
  archiveTagAction,
  createTagAction,
  type TagActionState,
  updateTagAction,
} from "@/app/app/[tenantSlug]/products/tags/actions";
import { TagBadge } from "@/components/tags/tag-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { TagColor, TagListItem } from "@/modules/tags/schemas";

const initialState: TagActionState = { status: "idle", message: "" };
const colors: Array<{ value: TagColor; label: string }> = [
  { value: "slate", label: "Slate" },
  { value: "blue", label: "Blue" },
  { value: "emerald", label: "Emerald" },
  { value: "amber", label: "Amber" },
  { value: "violet", label: "Violet" },
  { value: "rose", label: "Rose" },
];

function ActionMessage({ state }: { state: TagActionState }) {
  if (!state.message || state.status === "success") return null;
  return (
    <p
      role="alert"
      className={
        state.status === "conflict"
          ? "bg-warning/20 text-foreground rounded-lg p-3 text-sm"
          : "bg-destructive/10 text-destructive rounded-lg p-3 text-sm"
      }
    >
      {state.message}
    </p>
  );
}

function TagFields({ tag }: { tag?: TagListItem }) {
  return (
    <>
      <label className="space-y-1.5 text-sm font-medium">
        Tag name
        <Input
          name="name"
          required
          minLength={2}
          maxLength={60}
          defaultValue={tag?.name}
          placeholder="e.g. Featured"
        />
      </label>
      <label className="space-y-1.5 text-sm font-medium">
        Color
        <select
          name="color"
          defaultValue={tag?.color ?? "blue"}
          className="border-input bg-card h-10 w-full rounded-lg border px-3 text-sm"
        >
          {colors.map((color) => (
            <option key={color.value} value={color.value}>
              {color.label}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1.5 text-sm font-medium">
        Description
        <Textarea
          name="description"
          maxLength={240}
          rows={3}
          defaultValue={tag?.description}
          placeholder="How this tag should be used"
        />
      </label>
    </>
  );
}

export function NewTagDialog({
  tenantSlug,
  disabled,
}: {
  tenantSlug: string;
  disabled: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const [state, action, pending] = React.useActionState(
    createTagAction.bind(null, tenantSlug),
    initialState,
  );
  React.useEffect(() => {
    if (state.status !== "success") return;
    toast.success(state.message);
    router.refresh();
    const timeout = window.setTimeout(() => setOpen(false), 0);
    return () => window.clearTimeout(timeout);
  }, [router, state]);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={disabled}>
          <Plus /> New tag
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle className="text-lg font-semibold">
          Create a tag
        </DialogTitle>
        <DialogDescription className="text-muted-foreground mt-1 text-sm">
          Add a reusable label for product assignments and catalog filters.
        </DialogDescription>
        <form action={action} className="mt-5 space-y-4">
          <TagFields />
          <ActionMessage state={state} />
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create tag"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TagActions({
  tenantSlug,
  tag,
  canUpdate,
  canArchive,
  isDemo,
}: {
  tenantSlug: string;
  tag: TagListItem;
  canUpdate: boolean;
  canArchive: boolean;
  isDemo: boolean;
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = React.useState(false);
  const [archiveOpen, setArchiveOpen] = React.useState(false);
  const [updateState, updateAction, updatePending] = React.useActionState(
    updateTagAction.bind(null, tenantSlug, tag.id),
    initialState,
  );
  const [archiveState, archiveAction, archivePending] = React.useActionState(
    archiveTagAction.bind(null, tenantSlug, tag.id),
    initialState,
  );
  React.useEffect(() => {
    if (updateState.status !== "success") return;
    toast.success(updateState.message);
    router.refresh();
    const timeout = window.setTimeout(() => setEditOpen(false), 0);
    return () => window.clearTimeout(timeout);
  }, [router, updateState]);
  React.useEffect(() => {
    if (archiveState.status !== "success") return;
    toast.success(archiveState.message);
    router.refresh();
    const timeout = window.setTimeout(() => setArchiveOpen(false), 0);
    return () => window.clearTimeout(timeout);
  }, [archiveState, router]);
  const archived = tag.status === "archived";
  const editDisabled = isDemo || !canUpdate || archived;
  const archiveDisabled =
    isDemo || !canArchive || archived || tag.activeProductCount > 0;

  return (
    <div className="flex justify-end gap-2">
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={editDisabled}
            aria-label={`Edit ${tag.name}`}
          >
            <Pencil /> Edit
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogTitle className="text-lg font-semibold">
            Edit {tag.name}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground mt-1 text-sm">
            Products keep their stable tag assignment when its display name or
            color changes.
          </DialogDescription>
          <form action={updateAction} className="mt-5 space-y-4">
            <input type="hidden" name="expectedVersion" value={tag.version} />
            <TagFields tag={tag} />
            <ActionMessage state={updateState} />
            <div className="flex justify-end gap-2">
              {updateState.status === "conflict" && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.refresh()}
                >
                  <RefreshCw /> Reload
                </Button>
              )}
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={updatePending}>
                {updatePending ? "Saving…" : "Save tag"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <DialogTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={archiveDisabled}
            aria-label={`Archive ${tag.name}`}
            title={
              tag.activeProductCount > 0
                ? "Remove this tag from active products first"
                : undefined
            }
          >
            <Archive className="text-destructive" /> Archive
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogTitle className="text-lg font-semibold">
            Archive {tag.name}?
          </DialogTitle>
          <DialogDescription className="text-muted-foreground mt-1 text-sm">
            Archived tags cannot be assigned to active products. Historical
            archived-product assignments remain intact.
          </DialogDescription>
          <form action={archiveAction} className="mt-6 space-y-4">
            <input type="hidden" name="expectedVersion" value={tag.version} />
            <ActionMessage state={archiveState} />
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button
                type="submit"
                variant="destructive"
                disabled={archivePending}
              >
                {archivePending ? "Archiving…" : "Confirm archive"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function TagManagement({
  tenantSlug,
  items,
  page,
  pageCount,
  total,
  canUpdate,
  canArchive,
  isDemo,
}: {
  tenantSlug: string;
  items: TagListItem[];
  page: number;
  pageCount: number;
  total: number;
  canUpdate: boolean;
  canArchive: boolean;
  isDemo: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  function goToPage(nextPage: number) {
    const next = new URLSearchParams(params.toString());
    if (nextPage <= 1) next.delete("page");
    else next.set("page", String(nextPage));
    router.push(`${pathname}?${next.toString()}`);
  }
  if (items.length === 0)
    return (
      <div className="text-muted-foreground flex min-h-56 flex-col items-center justify-center p-8 text-center">
        <p className="font-medium">No tags match these filters.</p>
        <p className="mt-1 text-sm">Clear a filter or create a new tag.</p>
      </div>
    );
  return (
    <>
      <div
        className="overflow-x-auto"
        tabIndex={0}
        role="region"
        aria-label="Tag table"
      >
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="bg-muted/35 text-muted-foreground border-b text-xs">
            <tr>
              <th className="h-11 px-4 font-medium">Tag</th>
              <th className="h-11 px-4 font-medium">Description</th>
              <th className="h-11 px-4 font-medium">Products</th>
              <th className="h-11 px-4 font-medium">Status</th>
              <th className="h-11 px-4 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((tag) => (
              <tr
                key={tag.id}
                className="hover:bg-muted/25 border-b last:border-0"
              >
                <td className="px-4 py-4">
                  <TagBadge name={tag.name} color={tag.color} />
                  <p className="text-muted-foreground mt-1 font-mono text-[11px]">
                    {tag.slug}
                  </p>
                </td>
                <td className="text-muted-foreground max-w-sm px-4 py-4 text-xs">
                  {tag.description || "No description"}
                </td>
                <td className="px-4 py-4">
                  <p className="font-medium">
                    {tag.activeProductCount.toLocaleString()} active
                  </p>
                  {tag.totalProductCount !== tag.activeProductCount && (
                    <p className="text-muted-foreground text-xs">
                      {tag.totalProductCount.toLocaleString()} total
                    </p>
                  )}
                </td>
                <td className="px-4 py-4">
                  <Badge
                    variant={tag.status === "active" ? "success" : "secondary"}
                    className="capitalize"
                  >
                    {tag.status}
                  </Badge>
                </td>
                <td className="px-4 py-4">
                  <TagActions
                    key={tag.version}
                    tenantSlug={tenantSlug}
                    tag={tag}
                    canUpdate={canUpdate}
                    canArchive={canArchive}
                    isDemo={isDemo}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center">
        <p className="text-muted-foreground text-xs">
          Showing {items.length} of {total} tags
        </p>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-muted-foreground px-2 text-xs">
            Page {page} of {pageCount}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            disabled={page <= 1}
            onClick={() => goToPage(page - 1)}
            aria-label="Previous tag page"
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            disabled={page >= pageCount}
            onClick={() => goToPage(page + 1)}
            aria-label="Next tag page"
          >
            <ChevronRight />
          </Button>
        </div>
      </div>
    </>
  );
}
