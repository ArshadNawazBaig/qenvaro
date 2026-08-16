"use client";

import {
  ArrowLeft,
  ArrowRight,
  ImageIcon,
  LoaderCircle,
  Pencil,
  Star,
  Trash2,
  Upload,
} from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import {
  moveProductImageAction,
  removeProductImageAction,
  setPrimaryProductImageAction,
  updateProductImageAltAction,
  type ProductImageActionState,
} from "@/app/app/[tenantSlug]/products/[productId]/images/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  MAX_PRODUCT_IMAGES,
  MAX_PRODUCT_IMAGE_BYTES,
  type ProductImageItem,
} from "@/modules/product-images/schemas";

const idleState: ProductImageActionState = { status: "idle", message: "" };

function useActionNotice(state: ProductImageActionState) {
  React.useEffect(() => {
    if (state.status === "success") toast.success(state.message);
    else if (state.status === "error" || state.status === "conflict")
      toast.error(state.message);
  }, [state]);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function UploadImageDialog({
  tenantSlug,
  productId,
  disabled,
}: {
  tenantSlug: string;
  productId: string;
  disabled: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState("");
  const formRef = React.useRef<HTMLFormElement>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const formData = new FormData(event.currentTarget);
    const image = formData.get("image");
    if (!(image instanceof File) || image.size === 0) {
      setError("Choose an image to upload.");
      return;
    }
    if (image.size > MAX_PRODUCT_IMAGE_BYTES) {
      setError("Choose an image smaller than 10 MB.");
      return;
    }
    setPending(true);
    try {
      const response = await fetch(
        `/api/app/${encodeURIComponent(tenantSlug)}/products/${encodeURIComponent(productId)}/images`,
        { method: "POST", body: formData },
      );
      const result = (await response.json()) as {
        ok?: boolean;
        message?: string;
      };
      if (!response.ok)
        throw new Error(result.message ?? "The image could not be uploaded.");
      toast.success(result.message ?? "Product image uploaded.");
      formRef.current?.reset();
      setOpen(false);
      router.refresh();
    } catch (uploadError) {
      const message =
        uploadError instanceof Error
          ? uploadError.message
          : "The image could not be uploaded.";
      setError(message);
      toast.error(message);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={disabled}>
          <Upload /> Upload image
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle className="text-lg font-semibold">
          Upload product image
        </DialogTitle>
        <DialogDescription className="text-muted-foreground mt-1 text-sm">
          Add an optimized JPEG, PNG, WebP, or AVIF image. The original file
          name is not stored.
        </DialogDescription>
        <form ref={formRef} onSubmit={submit} className="mt-5 space-y-4">
          <div className="space-y-2">
            <label htmlFor="product-image-file" className="text-sm font-medium">
              Image
            </label>
            <Input
              id="product-image-file"
              name="image"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              required
              disabled={pending}
              className="h-auto py-2"
            />
            <p className="text-muted-foreground text-xs">Maximum 10 MB.</p>
          </div>
          <div className="space-y-2">
            <label htmlFor="product-image-alt" className="text-sm font-medium">
              Alternative text
            </label>
            <Input
              id="product-image-alt"
              name="altText"
              minLength={2}
              maxLength={160}
              placeholder="Front view of the navy Oxford shirt"
              required
              disabled={pending}
            />
            <p className="text-muted-foreground text-xs">
              Describe the image for customers who cannot see it.
            </p>
          </div>
          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? (
                <>
                  <LoaderCircle className="animate-spin" /> Uploading…
                </>
              ) : (
                <>
                  <Upload /> Upload image
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditAltDialog({
  tenantSlug,
  productId,
  image,
  disabled,
}: {
  tenantSlug: string;
  productId: string;
  image: ProductImageItem;
  disabled: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [state, action, pending] = React.useActionState(
    updateProductImageAltAction.bind(null, tenantSlug, productId, image.id),
    idleState,
  );
  useActionNotice(state);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          disabled={disabled}
          aria-label={`Edit alternative text for ${image.altText}`}
        >
          <Pencil />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle className="text-lg font-semibold">
          Edit alternative text
        </DialogTitle>
        <DialogDescription className="text-muted-foreground mt-1 text-sm">
          Keep the description concise and focused on what the image conveys.
        </DialogDescription>
        <form action={action} className="mt-5 space-y-4">
          <input type="hidden" name="expectedVersion" value={image.version} />
          <div className="space-y-2">
            <label htmlFor={`alt-${image.id}`} className="text-sm font-medium">
              Alternative text
            </label>
            <Input
              id={`alt-${image.id}`}
              name="altText"
              defaultValue={image.altText}
              minLength={2}
              maxLength={160}
              required
              disabled={pending}
            />
          </div>
          {state.status !== "idle" && state.status !== "success" && (
            <p role="alert" className="text-destructive text-sm">
              {state.message}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <LoaderCircle className="animate-spin" />} Save text
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ImageTile({
  tenantSlug,
  productId,
  image,
  index,
  imageCount,
  disabled,
}: {
  tenantSlug: string;
  productId: string;
  image: ProductImageItem;
  index: number;
  imageCount: number;
  disabled: boolean;
}) {
  const [primaryState, primaryAction, primaryPending] = React.useActionState(
    setPrimaryProductImageAction.bind(null, tenantSlug, productId, image.id),
    idleState,
  );
  const [moveState, moveAction, movePending] = React.useActionState(
    moveProductImageAction.bind(null, tenantSlug, productId, image.id),
    idleState,
  );
  const [removeState, removeAction, removePending] = React.useActionState(
    removeProductImageAction.bind(null, tenantSlug, productId, image.id),
    idleState,
  );
  useActionNotice(primaryState);
  useActionNotice(moveState);
  useActionNotice(removeState);
  const pending = primaryPending || movePending || removePending;

  return (
    <Card className="min-w-0">
      <div className="bg-muted relative aspect-[4/3] overflow-hidden">
        <Image
          src={image.url}
          alt={image.altText}
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 25vw"
          className="object-cover"
        />
        <div className="absolute top-3 left-3">
          {image.isPrimary && <Badge variant="success">Primary</Badge>}
        </div>
      </div>
      <CardContent className="space-y-4 p-4">
        <div className="min-w-0">
          <p className="line-clamp-2 min-h-10 text-sm font-medium">
            {image.altText}
          </p>
          <p className="text-muted-foreground mt-1 text-xs uppercase">
            {image.format} · {image.width}×{image.height} ·{" "}
            {formatBytes(image.bytes)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <form action={primaryAction}>
            <input type="hidden" name="expectedVersion" value={image.version} />
            <Button
              type="submit"
              variant={image.isPrimary ? "secondary" : "outline"}
              size="sm"
              disabled={disabled || pending || image.isPrimary}
            >
              <Star /> {image.isPrimary ? "Primary" : "Make primary"}
            </Button>
          </form>
          <div className="ml-auto flex items-center gap-1">
            <form action={moveAction}>
              <input
                type="hidden"
                name="expectedVersion"
                value={image.version}
              />
              <input type="hidden" name="direction" value="previous" />
              <Button
                type="submit"
                variant="ghost"
                size="icon"
                disabled={disabled || pending || index === 0}
                aria-label={`Move ${image.altText} earlier`}
              >
                <ArrowLeft />
              </Button>
            </form>
            <form action={moveAction}>
              <input
                type="hidden"
                name="expectedVersion"
                value={image.version}
              />
              <input type="hidden" name="direction" value="next" />
              <Button
                type="submit"
                variant="ghost"
                size="icon"
                disabled={disabled || pending || index === imageCount - 1}
                aria-label={`Move ${image.altText} later`}
              >
                <ArrowRight />
              </Button>
            </form>
            <EditAltDialog
              tenantSlug={tenantSlug}
              productId={productId}
              image={image}
              disabled={disabled || pending}
            />
            <form
              action={removeAction}
              onSubmit={(event) => {
                if (!window.confirm("Remove this product image?"))
                  event.preventDefault();
              }}
            >
              <input
                type="hidden"
                name="expectedVersion"
                value={image.version}
              />
              <Button
                type="submit"
                variant="ghost"
                size="icon"
                disabled={disabled || pending}
                aria-label={`Remove ${image.altText}`}
                className="text-destructive hover:text-destructive"
              >
                {removePending ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <Trash2 />
                )}
              </Button>
            </form>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function ProductImageManagement({
  tenantSlug,
  productId,
  images,
  canUpdate,
  isDemo,
  archived,
  uploadEnabled,
}: {
  tenantSlug: string;
  productId: string;
  images: ProductImageItem[];
  canUpdate: boolean;
  isDemo: boolean;
  archived: boolean;
  uploadEnabled: boolean;
}) {
  const readOnly = isDemo || !canUpdate || archived;
  const uploadDisabled =
    readOnly || !uploadEnabled || images.length >= MAX_PRODUCT_IMAGES;
  const storageMessage = isDemo
    ? "Demo products are read-only."
    : archived
      ? "Archived products retain their image history and cannot be changed."
      : !canUpdate
        ? "You have view-only product access."
        : !uploadEnabled
          ? "Connect Cloudinary server credentials to enable uploads."
          : images.length >= MAX_PRODUCT_IMAGES
            ? `This product has reached the ${MAX_PRODUCT_IMAGES}-image limit.`
            : `${images.length} of ${MAX_PRODUCT_IMAGES} images used.`;

  return (
    <Card aria-labelledby="product-images-title">
      <CardHeader>
        <CardTitle
          id="product-images-title"
          className="flex items-center gap-2"
        >
          <ImageIcon className="size-4" /> Product images
        </CardTitle>
        <CardDescription>
          Cloudinary-hosted media with accessible descriptions and a single
          catalog primary image.
        </CardDescription>
        <CardAction className="col-start-1 row-start-3 mt-3 justify-self-start sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:mt-0 sm:justify-self-end">
          <UploadImageDialog
            tenantSlug={tenantSlug}
            productId={productId}
            disabled={uploadDisabled}
          />
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-muted-foreground text-sm">{storageMessage}</p>
          <Badge variant={uploadEnabled ? "success" : "secondary"}>
            {uploadEnabled
              ? "Cloudinary connected"
              : "Cloudinary not connected"}
          </Badge>
        </div>
        {images.length === 0 ? (
          <div className="bg-muted/40 flex min-h-48 flex-col items-center justify-center rounded-xl border border-dashed p-6 text-center">
            <div className="bg-card text-muted-foreground flex size-11 items-center justify-center rounded-full border">
              <ImageIcon className="size-5" />
            </div>
            <p className="mt-4 text-sm font-semibold">No product images yet</p>
            <p className="text-muted-foreground mt-1 max-w-sm text-sm">
              Upload a clear product image. The first upload becomes the primary
              catalog image automatically.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {images.map((image, index) => (
              <ImageTile
                key={`${image.id}:${image.version}`}
                tenantSlug={tenantSlug}
                productId={productId}
                image={image}
                index={index}
                imageCount={images.length}
                disabled={readOnly}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
